CREATE TABLE `enrichment_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','processing','completed','cancelled','failed') NOT NULL DEFAULT 'pending',
	`totalFiles` int NOT NULL,
	`completedFiles` int NOT NULL DEFAULT 0,
	`failedFiles` int NOT NULL DEFAULT 0,
	`currentFileId` int,
	`fileIds` json NOT NULL,
	`processedFileIds` json DEFAULT ('[]'),
	`failedFileIds` json DEFAULT ('[]'),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrichment_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `enrichment_jobs_user_id_idx` ON `enrichment_jobs` (`userId`);--> statement-breakpoint
CREATE INDEX `enrichment_jobs_status_idx` ON `enrichment_jobs` (`status`);