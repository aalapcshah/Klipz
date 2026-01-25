CREATE TABLE `dashboard_layout_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`layout` enum('monitoring','analytics','balanced') NOT NULL DEFAULT 'balanced',
	`widgetVisibility` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_layout_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `dashboard_layout_preferences_user_id_idx` ON `dashboard_layout_preferences` (`userId`);