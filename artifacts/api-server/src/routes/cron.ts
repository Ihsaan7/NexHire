import { Router } from "express";
import { connectMongo } from "../lib/mongodb";
import { Job } from "../models/Job";
import { generateEmbedding } from "../lib/gemini";
import { logger } from "../lib/logger";

const router = Router();

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

function mapRemotiveCategory(category: string): { sector: string; category: string } {
  const c = category.toLowerCase();
  if (c.includes("software") || c.includes("developer") || c.includes("engineer")) return { sector: "Technology", category: "Software Development" };
  if (c.includes("devops") || c.includes("sysadmin") || c.includes("infrastructure") || c.includes("cloud")) return { sector: "Technology", category: "DevOps & Cloud" };
  if (c.includes("data") || c.includes("analytics") || c.includes("machine learning") || c.includes("ai") || c.includes("artificial")) return { sector: "Technology", category: "Data & AI" };
  if (c.includes("product")) return { sector: "Technology", category: "Product Management" };
  if (c.includes("design") || c.includes("ux") || c.includes("ui")) return { sector: "Technology", category: "Design & UX" };
  if (c.includes("marketing") || c.includes("growth") || c.includes("seo")) return { sector: "Marketing", category: "Marketing" };
  if (c.includes("sales") || c.includes("business")) return { sector: "Business", category: "Sales & Business" };
  if (c.includes("finance") || c.includes("legal") || c.includes("account")) return { sector: "Finance", category: "Finance & Legal" };
  if (c.includes("hr") || c.includes("recruit") || c.includes("people")) return { sector: "Human Resources", category: "HR & Recruitment" };
  if (c.includes("customer") || c.includes("support") || c.includes("service")) return { sector: "Services", category: "Customer Support" };
  if (c.includes("writ") || c.includes("content") || c.includes("editor")) return { sector: "Media", category: "Writing & Content" };
  if (c.includes("project") || c.includes("manager") || c.includes("management")) return { sector: "Business", category: "Project Management" };
  return { sector: "Technology", category: "Technology" };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// POST /api/cron/sync-jobs
router.post("/cron/sync-adzuna", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await connectMongo();

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // ── Remotive: remote tech jobs ─────────────────────────────────────────
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
        const data = await resp.json() as { jobs: RemotiveJob[] };
        const jobs = data.jobs ?? [];

        for (const item of jobs) {
          try {
            const { sector, category } = mapRemotiveCategory(item.category);
            const description = stripHtml(item.description);
            const postedDate = new Date(item.publication_date);

            let embedding: number[] | undefined;
            try {
              embedding = await generateEmbedding(
                `${item.title} ${item.company_name} ${description}`.slice(0, 8000),
              );
            } catch (embErr) {
              logger.warn({ embErr, jobId: item.id }, "Embedding failed");
            }

            const result = await Job.findOneAndUpdate(
              { source: "remotive", sourceJobId: String(item.id) },
              {
                $set: {
                  source: "remotive",
                  sourceJobId: String(item.id),
                  title: item.title,
                  company: item.company_name,
                  location: item.candidate_required_location || "Remote",
                  sector,
                  category,
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
            logger.error({ jobErr, jobId: item.id }, "Job upsert error");
            errors++;
          }
        }

        // Respect Gemini rate limits between category batches
        await new Promise((r) => setTimeout(r, 1000));
      } catch (catErr) {
        logger.error({ catErr, cat }, "Remotive category error");
        errors++;
      }
    }

    // ── Arbeitnow: additional remote tech jobs ─────────────────────────────
    for (let page = 1; page <= 3; page++) {
      try {
        const url = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          logger.warn({ page, status: resp.status }, "Arbeitnow fetch failed");
          break;
        }
        const data = await resp.json() as { data: ArbeitnowJob[] };
        const jobs = (data.data ?? []).filter((j) => j.remote);

        for (const item of jobs) {
          try {
            const description = stripHtml(item.description);
            const postedDate = new Date(item.created_at * 1000);

            let embedding: number[] | undefined;
            try {
              embedding = await generateEmbedding(
                `${item.title} ${item.company_name} ${description}`.slice(0, 8000),
              );
            } catch (embErr) {
              logger.warn({ embErr, jobId: item.slug }, "Embedding failed");
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
                  sector: "Technology",
                  category: item.tags?.[0] ?? "General",
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
            logger.error({ jobErr, jobId: item.slug }, "Job upsert error");
            errors++;
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      } catch (pageErr) {
        logger.error({ pageErr, page }, "Arbeitnow page error");
        errors++;
      }
    }

    // Delete jobs older than 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const deleteResult = await Job.deleteMany({ createdAt: { $lt: sixtyDaysAgo } });
    const deleted = deleteResult.deletedCount ?? 0;

    logger.info({ inserted, updated, deleted, errors }, "Job sync complete");
    res.json({ inserted, updated, deleted, errors, message: `Sync complete: ${inserted} new, ${updated} updated, ${deleted} deleted` });
  } catch (err) {
    logger.error({ err }, "syncJobs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
