import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import profileRouter from "./profile.js";
import jobsRouter from "./jobs.js";
import savedJobsRouter from "./savedJobs.js";
import cronRouter from "./cron.js";
import gigsRouter from "./gigs.js";
import syncGigsRouter from "./sync-gigs.js";
import practiceRouter from "./practice.js";
import syncStatusRouter from "./sync-status.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(jobsRouter);
router.use(savedJobsRouter);
router.use(cronRouter);
router.use(gigsRouter);
router.use(syncGigsRouter);
router.use(practiceRouter);
router.use(syncStatusRouter);

export default router;
