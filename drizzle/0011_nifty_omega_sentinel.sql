ALTER TABLE `users` ADD `subscriptionTier` enum('free','premium','enterprise') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `knowledgeGraphUsageCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `knowledgeGraphUsageLimit` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionExpiresAt` timestamp;