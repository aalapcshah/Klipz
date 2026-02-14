CREATE TABLE `match_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`minConfidenceThreshold` float NOT NULL DEFAULT 0.3,
	`autoMatchOnTranscription` boolean NOT NULL DEFAULT true,
	`autoMatchOnCaptioning` boolean NOT NULL DEFAULT true,
	`notifyOnMatchComplete` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `match_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `match_settings_user_id_idx` ON `match_settings` (`userId`);