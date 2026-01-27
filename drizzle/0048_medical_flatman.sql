CREATE TABLE `share_access_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareLinkId` int NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`action` enum('view','download') NOT NULL,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_access_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileId` int,
	`videoId` int,
	`token` varchar(64) NOT NULL,
	`passwordHash` varchar(255),
	`expiresAt` timestamp,
	`allowDownload` boolean NOT NULL DEFAULT true,
	`maxViews` int,
	`viewCount` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastAccessedAt` timestamp,
	CONSTRAINT `share_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `share_links_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `share_access_log_share_link_id_idx` ON `share_access_log` (`shareLinkId`);--> statement-breakpoint
CREATE INDEX `share_access_log_accessed_at_idx` ON `share_access_log` (`accessedAt`);--> statement-breakpoint
CREATE INDEX `share_links_user_id_idx` ON `share_links` (`userId`);--> statement-breakpoint
CREATE INDEX `share_links_token_idx` ON `share_links` (`token`);--> statement-breakpoint
CREATE INDEX `share_links_file_id_idx` ON `share_links` (`fileId`);--> statement-breakpoint
CREATE INDEX `share_links_video_id_idx` ON `share_links` (`videoId`);