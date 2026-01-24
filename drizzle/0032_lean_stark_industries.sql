CREATE TABLE `file_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileId` int,
	`activityType` enum('upload','view','edit','tag','share','delete','enrich','export') NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_idx` ON `file_activity_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `file_idx` ON `file_activity_logs` (`fileId`);--> statement-breakpoint
CREATE INDEX `activity_type_idx` ON `file_activity_logs` (`activityType`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `file_activity_logs` (`createdAt`);