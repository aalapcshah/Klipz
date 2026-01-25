import cron from "node-cron";
import { checkAndResolveAlerts } from "./alertAutoResolution";
import { sendDailyDigests, sendWeeklyDigests } from "./emailDigest";

/**
 * Initialize all cron jobs for automated monitoring and notifications
 */
export function initializeCronJobs() {
  console.log("[CronJobs] Initializing scheduled tasks...");

  // Run alert auto-resolution every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[CronJobs] Running hourly alert auto-resolution check");
    try {
      const result = await checkAndResolveAlerts();
      console.log(
        `[CronJobs] Alert check complete: ${result.resolved} resolved, ${result.errors.length} errors`
      );
    } catch (error) {
      console.error("[CronJobs] Error in alert auto-resolution:", error);
    }
  });

  // Send daily digests at 9 AM every day
  cron.schedule("0 9 * * *", async () => {
    console.log("[CronJobs] Running daily digest send");
    try {
      const sent = await sendDailyDigests();
      console.log(
        `[CronJobs] Daily digests sent: ${sent} users notified`
      );
    } catch (error) {
      console.error("[CronJobs] Error sending daily digests:", error);
    }
  });

  // Send weekly digests at 9 AM every Monday
  cron.schedule("0 9 * * 1", async () => {
    console.log("[CronJobs] Running weekly digest send");
    try {
      const sent = await sendWeeklyDigests();
      console.log(
        `[CronJobs] Weekly digests sent: ${sent} users notified`
      );
    } catch (error) {
      console.error("[CronJobs] Error sending weekly digests:", error);
    }
  });

  console.log("[CronJobs] All scheduled tasks initialized successfully");
  console.log("[CronJobs] - Alert auto-resolution: Every hour");
  console.log("[CronJobs] - Daily digests: 9:00 AM daily");
  console.log("[CronJobs] - Weekly digests: 9:00 AM Monday");
}
