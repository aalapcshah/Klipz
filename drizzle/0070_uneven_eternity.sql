CREATE TABLE `team_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`invitedBy` int NOT NULL,
	`role` enum('member','admin') NOT NULL DEFAULT 'member',
	`token` varchar(64) NOT NULL,
	`status` enum('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	CONSTRAINT `team_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerId` int NOT NULL,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`maxSeats` int NOT NULL DEFAULT 5,
	`storageGB` int NOT NULL DEFAULT 200,
	`storageUsedBytes` bigint NOT NULL DEFAULT 0,
	`status` enum('active','suspended','canceled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `subscriptionTier` enum('free','trial','pro','team') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;--> statement-breakpoint
CREATE INDEX `team_invites_team_id_idx` ON `team_invites` (`teamId`);--> statement-breakpoint
CREATE INDEX `team_invites_email_idx` ON `team_invites` (`email`);--> statement-breakpoint
CREATE INDEX `team_invites_token_idx` ON `team_invites` (`token`);--> statement-breakpoint
CREATE INDEX `teams_owner_id_idx` ON `teams` (`ownerId`);