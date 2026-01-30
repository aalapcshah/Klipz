CREATE TABLE `video_effect_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`settings` json NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_effect_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_effect_presets_user_id_idx` ON `video_effect_presets` (`userId`);