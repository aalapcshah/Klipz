CREATE TABLE `generated_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduledReportId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`format` enum('csv','excel') NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` int,
	`recordCount` int,
	`startDate` timestamp,
	`endDate` timestamp,
	`userId` int,
	`activityType` varchar(100),
	`generatedBy` int NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generated_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `generated_reports_scheduled_report_id_idx` ON `generated_reports` (`scheduledReportId`);--> statement-breakpoint
CREATE INDEX `generated_reports_generated_by_idx` ON `generated_reports` (`generatedBy`);--> statement-breakpoint
CREATE INDEX `generated_reports_generated_at_idx` ON `generated_reports` (`generatedAt`);