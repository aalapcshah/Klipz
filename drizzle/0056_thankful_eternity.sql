ALTER TABLE `enrichment_jobs` MODIFY COLUMN `status` enum('pending','processing','completed','failed','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `enrichment_jobs` MODIFY COLUMN `totalFiles` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `enrichment_jobs` DROP COLUMN `updatedAt`;