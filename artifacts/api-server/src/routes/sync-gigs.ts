import { Router } from "express";
import * as cheerio from "cheerio";
import { connectMongo } from "../lib/mongodb.js";
import { Gig } from "../models/Gig.js";
import { logger } from "../lib/logger.js";
import { beginSync, completeSync, failSync } from "../lib/syncStatus.js";
import { AiTimeoutError } from "../lib/aiErrors.js";
import { AiRateLimitError } from "../lib/aiErrors.js";
import { callGemini } from "../lib/gemini.js";
import { registerBackgroundTask } from "../lib/backgroundTask.js";

const router = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GEMINI_MODEL = "gemini-2.5-flash-lite";

async function enrichGig(
  title: string,
  company: string,
  description: string,
  aiUserId?: string,
): Promise<{
  taskType: string;
  payModel: string;
  estPayUSD: number | null;
  difficulty: string;
  legitScore: number;
  redFlags: string[];
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analyze this remote gig/job posting and return ONLY valid JSON, nothing else:

Title: ${title}
Company: ${company || "Unknown"}
Description: ${description.slice(0, 1500)}

Return this exact JSON shape:
{
  "taskType": "<one of: data-entry | annotation | writing | VA | transcription | admin | content-moderation | customer-support | research | other>",
  "payModel": "<one of: per-task | hourly | monthly | project>",
  "estPayUSD": <best numeric estimate per unit (hourly rate if hourly, monthly if monthly, task pay if per-task), or null if unknown>,
  "difficulty": "<easy or medium>",
  "legitScore": <0-100 legitimacy score. Penalize: upfront payment requests (-40), vague descriptions (-20), unrealistic pay (-15), no company info (-10), personal email only (-15). Reward: clear requirements, known company, reasonable pay range>,
  "redFlags": [<short string reasons, empty array if clean>]
}`;

  try {
    const resp = await callGemini(
      () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
            }),
            signal: AbortSignal.timeout(30000),
          },
        ),
      30_000,
      aiUserId,
    );

    if (resp.status === 429) return null;
    if (!resp.ok) return null;

    const data = (await resp.json()) as any;
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (error) {
    if (error instanceof AiRateLimitError || error instanceof AiTimeoutError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AiTimeoutError();
    }
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function upsertGig(data: {
  source: string;
  sourceGigId: string;
  title: string;
  company?: string;
  description?: string;
  applyUrl?: string;
  postedDate?: Date;
}): Promise<{ isNew: boolean }> {
  const result = await Gig.findOneAndUpdate(
    { source: data.source, sourceGigId: data.sourceGigId },
    {
      $set: {
        source: data.source,
        sourceGigId: data.sourceGigId,
        title: data.title,
        company: data.company,
        description: data.description,
        applyUrl: data.applyUrl,
        postedDate: data.postedDate,
      },
      $setOnInsert: {
        taskType: undefined,
        payModel: undefined,
        estPayUSD: undefined,
        difficulty: undefined,
        legitScore: undefined,
        redFlags: [],
        enrichedAt: undefined,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const isNew = result ? Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000 : false;
  return { isNew };
}

async function enrichPendingGigs(aiUserId?: string) {
  const pending = await Gig.find({ enrichedAt: { $exists: false } }).limit(30).lean();
  if (!pending.length) return;

  logger.info({ count: pending.length }, "Enriching gigs with Gemini");

  for (const gig of pending) {
    const enrichment = await enrichGig(
      gig.title,
      gig.company ?? "",
      gig.description ?? "",
      aiUserId,
    );

    if (enrichment) {
      await Gig.updateOne(
        { _id: gig._id },
        {
          $set: {
            taskType: enrichment.taskType,
            payModel: enrichment.payModel,
            estPayUSD: enrichment.estPayUSD,
            difficulty: enrichment.difficulty,
            legitScore: enrichment.legitScore,
            redFlags: enrichment.redFlags ?? [],
            enrichedAt: new Date(),
          },
        },
      );
    }

    await sleep(800);
  }
}

// ── RemoteOK ──────────────────────────────────────────────────────────────────
async function fetchRemoteOK(): Promise<number> {
  let count = 0;
  try {
    const resp = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "Mozilla/5.0 PKJobsBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return 0;

    const data = (await resp.json()) as any[];
    const jobs = data.slice(1).filter((j) => j?.id && j?.position);

    const GIG_TAGS = ["customer-support", "writing", "data-entry", "virtual-assistant", "transcription", "admin", "annotation", "content-moderation", "research", "copy", "qa", "testing", "marketing", "social-media", "seo", "entry", "non-tech", "operations"];

    for (const item of jobs) {
      const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
      const tagStr = tags.join(" ").toLowerCase();
      const titleLow = (item.position || "").toLowerCase();
      const isGig = GIG_TAGS.some((t) => tagStr.includes(t) || titleLow.includes(t));
      if (!isGig) continue;

      try {
        const description = stripHtml(item.description || "");
        const postedDate = item.epoch ? new Date(item.epoch * 1000) : new Date();
        await upsertGig({
          source: "remoteok",
          sourceGigId: String(item.id),
          title: item.position,
          company: item.company || undefined,
          description,
          applyUrl: item.apply_url || item.url || `https://remoteok.com/l/${item.id}`,
          postedDate,
        });
        count++;
      } catch {}
    }
  } catch (err) {
    logger.warn({ err }, "RemoteOK fetch failed");
  }
  return count;
}

// ── Jobicy ────────────────────────────────────────────────────────────────────
async function fetchJobicy(): Promise<number> {
  const tags = ["data-entry", "virtual-assistant", "content-writing", "customer-support", "transcription", "research", "administrative"];
  let count = 0;

  for (const tag of tags) {
    try {
      const resp = await fetch(
        `https://jobicy.com/api/v2/remote-jobs?count=25&tag=${tag}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!resp.ok) { await sleep(800); continue; }

      const data = (await resp.json()) as { data?: any[] };
      const jobs = data.data ?? [];

      for (const item of jobs) {
        if (!item.id || !item.jobTitle) continue;
        try {
          const description = stripHtml(item.jobExcerpt || "");
          const postedDate = item.pubDate ? new Date(item.pubDate) : new Date();
          await upsertGig({
            source: "jobicy",
            sourceGigId: String(item.id),
            title: item.jobTitle,
            company: item.companyName || undefined,
            description,
            applyUrl: item.url,
            postedDate,
          });
          count++;
        } catch {}
      }
    } catch (err) {
      logger.warn({ err, tag }, "Jobicy tag fetch failed");
    }
    await sleep(600);
  }
  return count;
}

// ── Remotive (non-tech categories) ───────────────────────────────────────────
async function fetchRemotiveGigs(): Promise<number> {
  const categories = ["customer-support", "writing", "marketing"];
  let count = 0;

  for (const cat of categories) {
    try {
      const resp = await fetch(`https://remotive.com/api/remote-jobs?category=${cat}&limit=50`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) { await sleep(600); continue; }

      const data = (await resp.json()) as { jobs?: any[] };
      const jobs = data.jobs ?? [];

      for (const item of jobs) {
        if (!item.id || !item.title) continue;
        try {
          const description = stripHtml(item.description || "");
          const postedDate = new Date(item.publication_date);
          await upsertGig({
            source: "remotive-gig",
            sourceGigId: String(item.id),
            title: item.title,
            company: item.company_name || undefined,
            description: description.slice(0, 2000),
            applyUrl: item.url,
            postedDate,
          });
          count++;
        } catch {}
      }
    } catch (err) {
      logger.warn({ err, cat }, "Remotive gig category failed");
    }
    await sleep(800);
  }
  return count;
}

// ── We Work Remotely RSS (customer-support + writing) ─────────────────────────
async function fetchWWRGigs(): Promise<number> {
  const feeds = [
    "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
    "https://weworkremotely.com/categories/remote-writing-editing-jobs.rss",
  ];
  let count = 0;

  for (const feedUrl of feeds) {
    try {
      const resp = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      $("item").each((_i, el) => {
        try {
          const title = $(el).find("title").first().text().replace(/<!\[CDATA\[|\]\]>/g, "").trim();
          const link = $(el).find("url, link").first().text().trim() || $(el).find("link").text().trim();
          const desc = $(el).find("description").text().replace(/<!\[CDATA\[|\]\]>/g, "").trim();
          const pubDate = $(el).find("pubDate").text().trim();
          const guid = $(el).find("guid").text().trim() || link;

          if (!title || !guid) return;

          upsertGig({
            source: "weworkremotely",
            sourceGigId: guid.split("/").pop() || guid,
            title,
            company: undefined,
            description: stripHtml(desc).slice(0, 2000),
            applyUrl: link || undefined,
            postedDate: pubDate ? new Date(pubDate) : new Date(),
          });
          count++;
        } catch {}
      });
    } catch (err) {
      logger.warn({ err, feedUrl }, "WWR RSS fetch failed");
    }
    await sleep(400);
  }
  return count;
}

// Exported so gigs.ts can call it from the auth-protected trigger endpoint
export async function runGigSync(aiUserId?: string): Promise<{ total: number }> {
  await connectMongo();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const pruned = await Gig.deleteMany({ createdAt: { $lt: cutoff } });
  logger.info({ pruned: pruned.deletedCount }, "Old gigs pruned");

  const [rok, jobicy, remotive, wwr] = await Promise.all([
    fetchRemoteOK(),
    fetchJobicy(),
    fetchRemotiveGigs(),
    fetchWWRGigs(),
  ]);

  logger.info({ remoteok: rok, jobicy, remotive, wwr }, "Gig sources fetched");

  await enrichPendingGigs(aiUserId);

  const total = await Gig.countDocuments();
  logger.info({ total }, "Gig sync complete");
  return { total };
}

// POST /api/cron/sync-gigs
router.post("/cron/sync-gigs", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const syncToken = await beginSync("gigs");
  if (!syncToken) {
    res.status(202).json({ message: "Sync already in progress. Check back shortly." });
    return;
  }

  res.status(202).json({ message: "Gig sync started in background." });

  registerBackgroundTask((async () => {
    try {
      const { total } = await runGigSync();
      await completeSync("gigs", syncToken, `Gig sync completed. ${total} gigs are available.`);
    } catch (err) {
      await failSync("gigs", syncToken, "Gig sync failed. Try again.");
      logger.error({ err }, "sync-gigs background error");
    }
  })());
});

export default router;
