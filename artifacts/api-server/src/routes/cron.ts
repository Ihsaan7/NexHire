import { Router } from "express";
import { connectMongo } from "../lib/mongodb";
import { Job } from "../models/Job";
import { generateEmbedding } from "../lib/gemini";
import { mapAdzunaCategory } from "../lib/taxonomy";
import { logger } from "../lib/logger";

const router = Router();

interface AdzunaJob {
  id: string;
  title: string;
  company?: { display_name: string };
  location?: { display_name: string };
  description: string;
  category?: { tag: string; label: string };
  contract_type?: string;
  salary_min?: number;
  salary_max?: number;
  created: string;
  redirect_url: string;
}

function buildApplicationSteps(job: AdzunaJob): string[] {
  return [
    `Visit the job posting at: ${job.redirect_url}`,
    "Read the full job description and requirements carefully",
    "Prepare your CV tailored to the role's requirements",
    "Write a targeted cover letter highlighting your relevant experience",
    "Submit your application through the employer's portal or via the link above",
    "Note the application deadline and follow up if you don't hear back within 2 weeks",
  ];
}

// POST /api/cron/sync-adzuna
router.post("/cron/sync-adzuna", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    res.status(500).json({ error: "Adzuna credentials not configured" });
    return;
  }

  try {
    await connectMongo();

    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.adzuna.com/v1/api/jobs/pk/search/${page}?app_id=${appId}&app_key=${appKey}&results_per_page=50&what=&where=pakistan&content-type=application/json`;

      let data: { results: AdzunaJob[]; count: number };
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          logger.warn({ page, status: resp.status }, "Adzuna page fetch failed");
          break;
        }
        data = await resp.json() as { results: AdzunaJob[]; count: number };
      } catch (fetchErr) {
        logger.error({ fetchErr, page }, "Adzuna fetch error");
        errors++;
        break;
      }

      if (!data.results?.length) break;

      for (const item of data.results) {
        try {
          const { sector, category } = mapAdzunaCategory(
            item.category?.tag ?? "",
          );

          const postedDate = new Date(item.created);

          // Only ingest 2026+ jobs
          if (postedDate < new Date("2026-01-01")) continue;

          const textForEmbedding = `${item.title} ${item.description}`.slice(
            0,
            8000,
          );

          let embedding: number[] | undefined;
          try {
            embedding = await generateEmbedding(textForEmbedding);
          } catch (embErr) {
            logger.warn({ embErr, jobId: item.id }, "Embedding generation failed");
          }

          const salaryRange =
            item.salary_min && item.salary_max
              ? `PKR ${item.salary_min.toLocaleString()} - ${item.salary_max.toLocaleString()}`
              : undefined;

          const result = await Job.findOneAndUpdate(
            { source: "adzuna", sourceJobId: item.id },
            {
              $set: {
                source: "adzuna",
                sourceJobId: item.id,
                title: item.title,
                company: item.company?.display_name,
                location: item.location?.display_name,
                sector,
                category,
                description: item.description,
                jobType: item.contract_type,
                salaryRange,
                postedDate,
                applyUrl: item.redirect_url,
                applicationSteps: buildApplicationSteps(item),
                ...(embedding ? { embedding } : {}),
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );

          if (result) {
            const wasNew = result.createdAt.getTime() === result.updatedAt.getTime();
            if (wasNew) inserted++;
            else updated++;
          }
        } catch (jobErr) {
          logger.error({ jobErr, jobId: item.id }, "Job upsert error");
          errors++;
        }
      }

      // Respect Gemini free tier rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    // Delete expired jobs (deadline passed or older than 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const deleteResult = await Job.deleteMany({
      $or: [
        { deadline: { $lt: new Date() } },
        { createdAt: { $lt: sixtyDaysAgo } },
      ],
    });

    const deleted = deleteResult.deletedCount ?? 0;

    logger.info({ inserted, updated, deleted, errors }, "Adzuna sync complete");

    res.json({
      inserted,
      updated,
      deleted,
      errors,
      message: `Sync complete: ${inserted} new, ${updated} updated, ${deleted} deleted`,
    });
  } catch (err) {
    logger.error({ err }, "syncAdzuna error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
