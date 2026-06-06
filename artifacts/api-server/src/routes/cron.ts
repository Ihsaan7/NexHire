import { Router } from "express";
import * as cheerio from "cheerio";
import { connectMongo } from "../lib/mongodb";
import { Job } from "../models/Job";
import { generateEmbedding } from "../lib/gemini";
import { logger } from "../lib/logger";

const router = Router();

const LINKEDIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Category mapping from job title ───────────────────────────────────────────
// Pakistani government & semi-government organizations
const GOV_ORGS = [
  "nadra", "ogdcl", "wapda", "pia ", "pakistan international", "hec ", "higher education commission",
  "fbr ", "federal board of revenue", "secp", "ptcl", "nha ", "national highway", "iesco", "pesco",
  "fesco", "lesco", "gepco", "mepco", "hesco", "qesco", "comsats", "nust", "pide", "nescom",
  "suparco", "pak army", "pak air force", "pak navy", "paf ", "paf-", "fpsc", "ppsc", "kppsc",
  "bpsc", "spsc", "ajkpsc", "gilgit", "nts ", "national testing", "pta ", "pemra", "pra ", "pra.",
  "nab ", "national accountability", "secp ", "nhsrc", "nhp", "agpr", "auditor general",
  "pakistan railways", "railway ", "sui northern", "sui southern", "sngpl", "ssgcl", "pso ",
  "pakistan state oil", "sme bank", "zarai taraqiati", "ztbl", "nrsp", "rsp ", "erra ", "ndma",
  "nhsrc", "ministry of", "federal government", "government of pakistan", "government of punjab",
  "government of sindh", "government of kpk", "government of balochistan", "district government",
  "capital development", "cda ", "municipal", "tehsil", "ppra", "pdwp", "planning commission",
  "economic affairs", "cabinet division", "establishment division", "commerce ministry",
  "water and power", "communication ministry", "state bank of pakistan", "sbp ", "sbp.",
  "habib bank", "national bank", "bank alfalah", "meezan bank", "ubi ", "united bank",
  "silkbank", "askari bank", "faysal bank", "bop ", "bank of punjab", "bank of khyber",
  "samba bank", "js bank", "mcb bank", "mcb ", "allied bank", "soneri bank", "summit bank",
  "first women bank", "sme bank", "pak oman", "industrial development",
];

function isGovOrg(company: string): boolean {
  const c = company.toLowerCase();
  return GOV_ORGS.some((o) => c.includes(o));
}

function mapTitleToCategory(title: string, tags: string[] = [], company = ""): { sector: string; category: string } {
  // Government org detection by company name takes priority
  if (isGovOrg(company)) {
    const t2 = title.toLowerCase();
    // Classify the role type within government
    if (t2.includes("software") || t2.includes("developer") || t2.includes("it ") || t2.includes("data") || t2.includes("tech") || t2.includes("digital") || t2.includes("ict") || t2.includes("network") || t2.includes("cyber") || t2.includes("system")) return { sector: "Government", category: "Government — IT & Tech" };
    if (t2.includes("finance") || t2.includes("account") || t2.includes("audit") || t2.includes("treasury")) return { sector: "Government", category: "Government — Finance" };
    if (t2.includes("engineer") || t2.includes("technical")) return { sector: "Government", category: "Government — Engineering" };
    if (t2.includes("manager") || t2.includes("officer") || t2.includes("director") || t2.includes("secretary")) return { sector: "Government", category: "Government — Administration" };
    return { sector: "Government", category: "Government / Public Sector" };
  }

  const t = (title + " " + tags.join(" ")).toLowerCase();
  if (t.includes("software") || t.includes("developer") || t.includes("programmer") || t.includes("coding") || t.includes("backend") || t.includes("frontend") || t.includes("full stack") || t.includes("fullstack") || t.includes("react") || t.includes("node") || t.includes("python") || t.includes("java ") || t.includes(".net")) return { sector: "Technology", category: "Software Development" };
  if (t.includes("devops") || t.includes("sysadmin") || t.includes("infrastructure") || t.includes("cloud") || t.includes("aws") || t.includes("azure") || t.includes("kubernetes") || t.includes("docker")) return { sector: "Technology", category: "DevOps & Cloud" };
  if (t.includes("data analyst") || t.includes("data scientist") || t.includes("machine learning") || t.includes("ai ") || t.includes("artificial intelligence") || t.includes("data engineer") || t.includes("business intelligence") || t.includes("bi ")) return { sector: "Technology", category: "Data & AI" };
  if (t.includes("product manager") || t.includes("product owner") || t.includes("scrum") || t.includes("agile")) return { sector: "Technology", category: "Product Management" };
  if (t.includes("ux ") || t.includes("ui ") || t.includes("designer") || t.includes("graphic") || t.includes("visual design")) return { sector: "Technology", category: "Design & UX" };
  if (t.includes("network") || t.includes("cyber") || t.includes("security") || t.includes("it support") || t.includes("it manager") || t.includes("system admin") || t.includes("helpdesk") || t.includes("hardware")) return { sector: "Technology", category: "IT & Networking" };
  if (t.includes("government") || t.includes("govt") || t.includes("ppsc") || t.includes("fpsc") || t.includes("nts") || t.includes("civil servant") || t.includes("patwari") || t.includes("tehsildar") || t.includes("bps-") || t.includes("bs-") || t.includes("federal") || t.includes("provincial") || t.includes("district") || t.includes("municipal") || t.includes("police") || t.includes("army") || t.includes("navy") || t.includes("air force") || t.includes("military") || t.includes("public sector")) return { sector: "Government", category: "Government / Public Sector" };
  if (t.includes("bank") || t.includes("finance") || t.includes("accountant") || t.includes("accounting") || t.includes("audit") || t.includes("tax") || t.includes("treasury") || t.includes("investment") || t.includes("credit") || t.includes("loan") || t.includes("insurance")) return { sector: "Finance", category: "Finance & Banking" };
  if (t.includes("marketing") || t.includes("digital marketing") || t.includes("seo") || t.includes("social media") || t.includes("content creator") || t.includes("brand")) return { sector: "Marketing", category: "Marketing & Digital" };
  if (t.includes("sales") || t.includes("business development") || t.includes("account executive") || t.includes("bdm")) return { sector: "Business", category: "Sales & Business Dev" };
  if (t.includes("hr ") || t.includes("human resource") || t.includes("recruiter") || t.includes("talent") || t.includes("payroll")) return { sector: "Human Resources", category: "HR & Recruitment" };
  if (t.includes("teacher") || t.includes("lecturer") || t.includes("professor") || t.includes("education") || t.includes("school") || t.includes("university") || t.includes("tutor") || t.includes("academic")) return { sector: "Education", category: "Education & Teaching" };
  if (t.includes("doctor") || t.includes("nurse") || t.includes("medical") || t.includes("health") || t.includes("hospital") || t.includes("pharmacy") || t.includes("clinical") || t.includes("dental")) return { sector: "Healthcare", category: "Healthcare & Medical" };
  if (t.includes("engineer") && (t.includes("civil") || t.includes("mechanical") || t.includes("electrical") || t.includes("structural") || t.includes("chemical") || t.includes("petroleum"))) return { sector: "Engineering", category: "Engineering" };
  if (t.includes("content") || t.includes("writer") || t.includes("journalist") || t.includes("editor") || t.includes("copywriter") || t.includes("media")) return { sector: "Media", category: "Writing & Content" };
  if (t.includes("customer service") || t.includes("customer support") || t.includes("call center") || t.includes("bpo") || t.includes("helpline")) return { sector: "Services", category: "Customer Support / BPO" };
  if (t.includes("logistic") || t.includes("supply chain") || t.includes("warehouse") || t.includes("procurement") || t.includes("import") || t.includes("export")) return { sector: "Operations", category: "Logistics & Supply Chain" };
  if (t.includes("legal") || t.includes("lawyer") || t.includes("advocate") || t.includes("compliance") || t.includes("law ")) return { sector: "Legal", category: "Legal & Compliance" };
  if (t.includes("architect") || t.includes("construction") || t.includes("project engineer")) return { sector: "Engineering", category: "Construction & Architecture" };
  return { sector: "General", category: "Other" };
}

function mapRemotiveCategory(category: string): { sector: string; category: string } {
  const c = category.toLowerCase();
  if (c.includes("software") || c.includes("developer") || c.includes("engineer")) return { sector: "Technology", category: "Software Development" };
  if (c.includes("devops") || c.includes("sysadmin") || c.includes("infrastructure") || c.includes("cloud")) return { sector: "Technology", category: "DevOps & Cloud" };
  if (c.includes("data") || c.includes("analytics") || c.includes("machine learning") || c.includes("ai") || c.includes("artificial")) return { sector: "Technology", category: "Data & AI" };
  if (c.includes("product")) return { sector: "Technology", category: "Product Management" };
  if (c.includes("design") || c.includes("ux") || c.includes("ui")) return { sector: "Technology", category: "Design & UX" };
  if (c.includes("marketing") || c.includes("growth") || c.includes("seo")) return { sector: "Marketing", category: "Marketing & Digital" };
  if (c.includes("sales") || c.includes("business")) return { sector: "Business", category: "Sales & Business Dev" };
  if (c.includes("finance") || c.includes("legal") || c.includes("account")) return { sector: "Finance", category: "Finance & Banking" };
  if (c.includes("hr") || c.includes("recruit") || c.includes("people")) return { sector: "Human Resources", category: "HR & Recruitment" };
  if (c.includes("customer") || c.includes("support") || c.includes("service")) return { sector: "Services", category: "Customer Support / BPO" };
  if (c.includes("writ") || c.includes("content") || c.includes("editor")) return { sector: "Media", category: "Writing & Content" };
  if (c.includes("project") || c.includes("manager") || c.includes("management")) return { sector: "Business", category: "Project Management" };
  return { sector: "Technology", category: "Technology" };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── LinkedIn Pakistan jobs via public guest API ───────────────────────────────
interface LinkedInJob {
  linkedInId: string;
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  postedDate: Date;
  jobType: string;
  description: string;
}

async function fetchLinkedInPakistanJobs(): Promise<LinkedInJob[]> {
  const jobs: LinkedInJob[] = [];
  const seenIds = new Set<string>();

  // Keywords covering: tech, government (ISB), banking, marketing, education, healthcare, engineering
  const searches: { keywords: string; location?: string; pages: number }[] = [
    // ── Technology (Pakistan-wide) ──────────────────────────────────────────
    { keywords: "software engineer", pages: 2 },
    { keywords: "web developer", pages: 2 },
    { keywords: "data analyst", pages: 2 },
    { keywords: "IT manager", pages: 1 },
    { keywords: "DevOps cloud", pages: 1 },
    // ── Islamabad Government — major public corps & ministries ─────────────
    { keywords: "NADRA", location: "Islamabad", pages: 2 },
    { keywords: "OGDCL", location: "Pakistan", pages: 2 },
    { keywords: "WAPDA", location: "Pakistan", pages: 2 },
    { keywords: "PIA Pakistan International Airlines", location: "Pakistan", pages: 2 },
    { keywords: "HEC Higher Education Commission", location: "Islamabad", pages: 2 },
    { keywords: "State Bank of Pakistan", location: "Pakistan", pages: 2 },
    { keywords: "FBR Federal Board of Revenue", location: "Islamabad", pages: 2 },
    { keywords: "SECP Securities Exchange Commission", location: "Islamabad", pages: 1 },
    { keywords: "PTCL Pakistan Telecom", location: "Pakistan", pages: 2 },
    { keywords: "NHA National Highway Authority", location: "Pakistan", pages: 1 },
    { keywords: "IESCO PESCO FESCO LESCO GEPCO", location: "Pakistan", pages: 1 },
    { keywords: "COMSATS university", location: "Islamabad", pages: 1 },
    { keywords: "NUST university jobs", location: "Islamabad", pages: 1 },
    { keywords: "PIDE Pakistan Institute", location: "Islamabad", pages: 1 },
    { keywords: "NESCOM SUPARCO", location: "Pakistan", pages: 1 },
    { keywords: "PAF Pakistan Air Force civilian", location: "Pakistan", pages: 1 },
    { keywords: "ministry secretary Pakistan", location: "Islamabad", pages: 2 },
    { keywords: "district government Islamabad", location: "Islamabad", pages: 1 },
    { keywords: "Capital Development Authority CDA", location: "Islamabad", pages: 1 },
    { keywords: "PPSC provincial public service", location: "Pakistan", pages: 2 },
    { keywords: "FPSC federal public service", location: "Pakistan", pages: 2 },
    { keywords: "government officer Pakistan", location: "Pakistan", pages: 2 },
    { keywords: "Pakistan Railways", location: "Pakistan", pages: 1 },
    // ── Finance / Banking ──────────────────────────────────────────────────
    { keywords: "bank jobs Pakistan", pages: 2 },
    { keywords: "accountant finance", pages: 1 },
    // ── Marketing / Sales / HR ─────────────────────────────────────────────
    { keywords: "digital marketing", pages: 1 },
    { keywords: "sales manager Pakistan", pages: 1 },
    { keywords: "human resources", pages: 1 },
    // ── Education / Healthcare ─────────────────────────────────────────────
    { keywords: "teacher lecturer Pakistan", pages: 1 },
    { keywords: "medical doctor nurse Pakistan", pages: 1 },
    // ── Engineering ────────────────────────────────────────────────────────
    { keywords: "civil engineer Pakistan", pages: 1 },
    { keywords: "electrical mechanical engineer", pages: 1 },
    // ── Customer support / BPO ─────────────────────────────────────────────
    { keywords: "call center BPO", pages: 1 },
  ];

  for (const search of searches) {
    const loc = encodeURIComponent(search.location ?? "Pakistan");
    for (let page = 0; page < search.pages; page++) {
      const start = page * 25;
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(search.keywords)}&location=${loc}&start=${start}`;

      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": LINKEDIN_UA, "Accept-Language": "en-US,en;q=0.9" },
        });

        if (!resp.ok) {
          logger.warn({ status: resp.status, keywords: search.keywords }, "LinkedIn search failed");
          break;
        }

        const html = await resp.text();
        const $ = cheerio.load(html);

        $(".base-search-card, .job-search-card").each((_i, el) => {
          try {
            const urn = $(el).attr("data-entity-urn") || "";
            const linkedInId = urn.split(":").pop() || "";
            if (!linkedInId || seenIds.has(linkedInId)) return;
            seenIds.add(linkedInId);

            const title = $(el).find(".base-search-card__title").text().trim();
            const company = $(el).find(".base-search-card__subtitle").text().trim();
            const location = $(el).find(".job-search-card__location").text().trim();
            const dateAttr = $(el).find("time").attr("datetime") || "";
            const href = $(el).find("a.base-card__full-link, a[data-tracking-control-name='public_jobs_jserp-result_search-card']").attr("href") || "";

            if (!title || !linkedInId) return;

            const postedDate = dateAttr ? new Date(dateAttr) : new Date();
            // Build a descriptive text for embedding
            const description = `${title} at ${company}. Location: ${location}. Keywords: ${search.keywords}.`;

            jobs.push({
              linkedInId,
              title,
              company: company || "Unknown Company",
              location: location || "Pakistan",
              applyUrl: href || `https://www.linkedin.com/jobs/view/${linkedInId}`,
              postedDate,
              jobType: "full-time",
              description,
            });
          } catch (_) { /* skip malformed card */ }
        });

        // Small delay between pages
        await sleep(600);
      } catch (err) {
        logger.warn({ err, keywords: search.keywords, page }, "LinkedIn fetch error");
      }
    }

    // Delay between keyword searches
    await sleep(1200);
  }

  logger.info({ count: jobs.length }, "LinkedIn Pakistan jobs fetched");
  return jobs;
}

// POST /api/cron/sync-adzuna  (kept same URL for backward compat)
router.post("/cron/sync-adzuna", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Respond immediately — sync runs in the background
  res.status(202).json({ message: "Sync started in background. Check logs for progress." });

  // Run async without blocking response
  (async () => {
  try {
    await connectMongo();

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // ── 1. LinkedIn: Pakistani local + government + private jobs ──────────────
    const linkedInJobs = await fetchLinkedInPakistanJobs();

    for (const item of linkedInJobs) {
      try {
        const { sector, category } = mapTitleToCategory(item.title, [], item.company);

        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(
            `${item.title} ${item.company} ${item.description}`.slice(0, 8000),
          );
        } catch (embErr) {
          logger.warn({ embErr: (embErr as any)?.message, jobId: item.linkedInId }, "Embedding failed");
        }

        const result = await Job.findOneAndUpdate(
          { source: "linkedin", sourceJobId: item.linkedInId },
          {
            $set: {
              source: "linkedin",
              sourceJobId: item.linkedInId,
              title: item.title,
              company: item.company,
              location: item.location,
              sector,
              category,
              description: item.description,
              jobType: item.jobType,
              postedDate: item.postedDate,
              applyUrl: item.applyUrl,
              applicationSteps: [
                "Click 'Apply Now' — the job opens on LinkedIn",
                "Log in or create a free LinkedIn account",
                "Upload your CV and complete the application form",
                "Add a short cover note tailored to the role",
                "Submit and track your application in LinkedIn's 'My Jobs' tab",
              ],
              ...(embedding ? { embedding } : {}),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        if (result) {
          const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
          if (isNew) inserted++;
          else updated++;
        }
      } catch (jobErr) {
        logger.error({ jobErr, jobId: item.linkedInId }, "LinkedIn job upsert error");
        errors++;
      }
    }

    // ── 2. Remotive: international remote tech jobs ───────────────────────────
    const remotiveCategories = [
      "software-dev",
      "engineering",
      "devops-sysadmin",
      "data",
      "product-management",
      "design",
    ];

    for (const cat of remotiveCategories) {
      try {
        const url = `https://remotive.com/api/remote-jobs?category=${cat}&limit=50`;
        const resp = await fetch(url);
        if (!resp.ok) {
          logger.warn({ cat, status: resp.status }, "Remotive fetch failed");
          continue;
        }
        const data = (await resp.json()) as { jobs: any[] };
        const jobs = data.jobs ?? [];

        for (const item of jobs) {
          try {
            const { sector, category: mappedCat } = mapRemotiveCategory(item.category);
            const description = stripHtml(item.description);
            const postedDate = new Date(item.publication_date);

            let embedding: number[] | undefined;
            try {
              embedding = await generateEmbedding(
                `${item.title} ${item.company_name} ${description}`.slice(0, 8000),
              );
            } catch (embErr) {
              logger.warn({ embErr: (embErr as any)?.message, jobId: item.id }, "Embedding failed");
            }

            const result = await Job.findOneAndUpdate(
              { source: "remotive", sourceJobId: String(item.id) },
              {
                $set: {
                  source: "remotive",
                  sourceJobId: String(item.id),
                  title: item.title,
                  company: item.company_name,
                  location: item.candidate_required_location || "Remote / Worldwide",
                  sector,
                  category: mappedCat,
                  description,
                  jobType: item.job_type === "full_time" ? "full-time" : item.job_type,
                  salaryRange: item.salary || undefined,
                  postedDate,
                  applyUrl: item.url,
                  applicationSteps: [
                    `Visit the job posting at: ${item.url}`,
                    "Read the full job description and requirements carefully",
                    "Prepare your CV tailored to the role's requirements",
                    "Submit your application through the link above",
                  ],
                  ...(embedding ? { embedding } : {}),
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            if (result) {
              const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
              if (isNew) inserted++;
              else updated++;
            }
          } catch (jobErr) {
            logger.error({ jobErr, jobId: item.id }, "Remotive job upsert error");
            errors++;
          }
        }

        await sleep(1000);
      } catch (catErr) {
        logger.error({ catErr, cat }, "Remotive category error");
        errors++;
      }
    }

    // ── 3. Arbeitnow: additional international remote jobs ────────────────────
    for (let page = 1; page <= 3; page++) {
      try {
        const url = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          logger.warn({ page, status: resp.status }, "Arbeitnow fetch failed");
          break;
        }
        const data = (await resp.json()) as { data: any[] };
        const jobs = (data.data ?? []).filter((j: any) => j.remote);

        for (const item of jobs) {
          try {
            const description = stripHtml(item.description);
            const postedDate = new Date(item.created_at * 1000);
            const { sector, category } = mapTitleToCategory(item.title, item.tags ?? [], item.company_name ?? "");

            let embedding: number[] | undefined;
            try {
              embedding = await generateEmbedding(
                `${item.title} ${item.company_name} ${description}`.slice(0, 8000),
              );
            } catch (embErr) {
              logger.warn({ embErr: (embErr as any)?.message, jobId: item.slug }, "Embedding failed");
            }

            const result = await Job.findOneAndUpdate(
              { source: "arbeitnow", sourceJobId: item.slug },
              {
                $set: {
                  source: "arbeitnow",
                  sourceJobId: item.slug,
                  title: item.title,
                  company: item.company_name,
                  location: item.location || "Remote",
                  sector,
                  category,
                  description,
                  jobType: item.job_types?.[0] ?? "full-time",
                  postedDate,
                  applyUrl: item.url,
                  applicationSteps: [
                    `Visit the job posting at: ${item.url}`,
                    "Read the full job description and requirements carefully",
                    "Prepare your CV tailored to the role's requirements",
                    "Submit your application through the link above",
                  ],
                  ...(embedding ? { embedding } : {}),
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            if (result) {
              const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
              if (isNew) inserted++;
              else updated++;
            }
          } catch (jobErr) {
            logger.error({ jobErr, jobId: item.slug }, "Arbeitnow job upsert error");
            errors++;
          }
        }

        await sleep(1000);
      } catch (pageErr) {
        logger.error({ pageErr, page }, "Arbeitnow page error");
        errors++;
      }
    }

    // ── Prune jobs older than 60 days ─────────────────────────────────────────
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const deleteResult = await Job.deleteMany({ createdAt: { $lt: sixtyDaysAgo } });
    const deleted = deleteResult.deletedCount ?? 0;

    logger.info({ inserted, updated, deleted, errors }, "Job sync complete");
  } catch (err) {
    logger.error({ err }, "syncJobs background error");
  }
  })();
});

export default router;
