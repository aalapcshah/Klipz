import cron from "node-cron";
import { checkAndResolveAlerts } from "./alertAutoResolution";
import { sendDailyDigests, sendWeeklyDigests } from "./emailDigest";
import { processBackgroundEnrichment } from "./backgroundEnrichment";
import { processScheduledAutoCaptioning } from "./scheduledAutoCaptioning";

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

  // Run background enrichment every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CronJobs] Running background enrichment");
    try {
      const result = await processBackgroundEnrichment();
      if (result.processed > 0 || result.failed > 0) {
        console.log(
          `[CronJobs] Enrichment complete: ${result.processed} processed, ${result.failed} failed`
        );
      }
    } catch (error) {
      console.error("[CronJobs] Error in background enrichment:", error);
    }
  });

  // Run scheduled auto-captioning every 6 hours (0:00, 6:00, 12:00, 18:00)
  cron.schedule("0 */6 * * *", async () => {
    console.log("[CronJobs] Running scheduled auto-captioning");
    try {
      const result = await processScheduledAutoCaptioning();
      if (result.processed > 0) {
        console.log(
          `[CronJobs] Auto-captioning complete: ${result.captioned} captioned, ${result.failed} failed, ${result.totalCaptions} total captions`
        );
      }
    } catch (error) {
      console.error("[CronJobs] Error in scheduled auto-captioning:", error);
    }
  });

  console.log("[CronJobs] All scheduled tasks initialized successfully");
  console.log("[CronJobs] - Alert auto-resolution: Every hour");
  console.log("[CronJobs] - Daily digests: 9:00 AM daily");
  console.log("[CronJobs] - Weekly digests: 9:00 AM Monday");
  console.log("[CronJobs] - Background enrichment: Every 5 minutes");
  console.log("[CronJobs] - Scheduled auto-captioning: Every 6 hours");
}
