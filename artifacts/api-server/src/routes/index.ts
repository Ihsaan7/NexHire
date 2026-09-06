import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import jobsRouter from "./jobs";
import savedJobsRouter from "./savedJobs";
import cronRouter from "./cron";
import gigsRouter from "./gigs";
import syncGigsRouter from "./sync-gigs";
import practiceRouter from "./practice";
import syncStatusRouter from "./sync-status";

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
