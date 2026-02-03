ALTER TABLE `enrichment_jobs` MODIFY COLUMN `processedFileIds` json;--> statement-breakpoint
ALTER TABLE `enrichment_jobs` MODIFY COLUMN `failedFileIds` json;