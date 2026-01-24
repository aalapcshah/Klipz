CREATE TABLE `activity_notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enableUploadNotifications` boolean NOT NULL DEFAULT true,
	`enableViewNotifications` boolean NOT NULL DEFAULT false,
	`enableEditNotifications` boolean NOT NULL DEFAULT true,
	`enableTagNotifications` boolean NOT NULL DEFAULT true,
	`enableShareNotifications` boolean NOT NULL DEFAULT true,
	`enableDeleteNotifications` boolean NOT NULL DEFAULT true,
	`enableEnrichNotifications` boolean NOT NULL DEFAULT true,
	`enableExportNotifications` boolean NOT NULL DEFAULT true,
	`quietHoursStart` varchar(5),
	`quietHoursEnd` varchar(5),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activity_notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_notification_preferences_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `activity_notif_user_idx` UNIQUE(`userId`)
);
