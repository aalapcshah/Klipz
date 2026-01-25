CREATE TABLE `alert_notification_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertId` int NOT NULL,
	`triggeredAt` timestamp NOT NULL,
	`metricValue` float NOT NULL,
	`thresholdValue` float NOT NULL,
	`status` enum('triggered','resolved','acknowledged') NOT NULL DEFAULT 'triggered',
	`resolvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_notification_log_id` PRIMARY KEY(`id`)
);
