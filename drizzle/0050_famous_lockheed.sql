ALTER TABLE `users` MODIFY COLUMN `subscriptionTier` enum('free','trial','pro') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `users` ADD `trialStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trialEndsAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trialUsed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `storageUsedBytes` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `videoCount` int DEFAULT 0 NOT NULL;