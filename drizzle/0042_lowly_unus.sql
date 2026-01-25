CREATE TABLE `cloud_storage_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('google_drive','dropbox') NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`expiresAt` timestamp,
	`email` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cloud_storage_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_storage_tokens_user_id_idx` ON `cloud_storage_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `cloud_storage_tokens_provider_idx` ON `cloud_storage_tokens` (`provider`);--> statement-breakpoint
CREATE INDEX `cloud_storage_tokens_unique_idx` ON `cloud_storage_tokens` (`userId`,`provider`);