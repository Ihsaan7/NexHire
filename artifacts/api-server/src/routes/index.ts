import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import jobsRouter from "./jobs";
import savedJobsRouter from "./savedJobs";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(jobsRouter);
router.use(savedJobsRouter);
router.use(cronRouter);

export default router;
