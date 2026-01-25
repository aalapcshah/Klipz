CREATE TABLE `scheduled_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`frequency` enum('daily','weekly','monthly') NOT NULL,
	`dayOfWeek` int,
	`dayOfMonth` int,
	`timeOfDay` varchar(5) NOT NULL,
	`startDate` timestamp,
	`endDate` timestamp,
	`userId` int,
	`activityType` varchar(50),
	`recipients` text NOT NULL,
	`format` enum('csv','excel') NOT NULL DEFAULT 'excel',
	`enabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scheduled_reports_created_by_idx` ON `scheduled_reports` (`createdBy`);--> statement-breakpoint
CREATE INDEX `scheduled_reports_next_run_idx` ON `scheduled_reports` (`nextRunAt`);