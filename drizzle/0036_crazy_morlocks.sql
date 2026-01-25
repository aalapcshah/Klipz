CREATE TABLE `engagement_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`metricType` enum('dau','wau','mau','retention_day1','retention_day7','retention_day30') NOT NULL,
	`thresholdType` enum('below','above') NOT NULL,
	`thresholdValue` int NOT NULL,
	`notifyEmails` text NOT NULL,
	`checkFrequency` enum('hourly','daily','weekly') NOT NULL DEFAULT 'daily',
	`enabled` boolean NOT NULL DEFAULT true,
	`lastCheckedAt` timestamp,
	`lastTriggeredAt` timestamp,
	`lastValue` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engagement_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `engagement_alerts_created_by_idx` ON `engagement_alerts` (`createdBy`);--> statement-breakpoint
CREATE INDEX `engagement_alerts_enabled_idx` ON `engagement_alerts` (`enabled`);