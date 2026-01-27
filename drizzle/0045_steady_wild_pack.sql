CREATE TABLE `upload_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileId` int,
	`filename` varchar(255) NOT NULL,
	`fileSize` int NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`uploadType` enum('video','file') NOT NULL,
	`status` enum('completed','failed','cancelled') NOT NULL,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`durationSeconds` int,
	`averageSpeed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `upload_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `upload_history_user_id_idx` ON `upload_history` (`userId`);--> statement-breakpoint
CREATE INDEX `upload_history_status_idx` ON `upload_history` (`status`);--> statement-breakpoint
CREATE INDEX `upload_history_completed_at_idx` ON `upload_history` (`completedAt`);