CREATE TABLE `video_tag_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_tag_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(7) DEFAULT '#3b82f6',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_tag_assignments_video_id_idx` ON `video_tag_assignments` (`videoId`);--> statement-breakpoint
CREATE INDEX `video_tag_assignments_tag_id_idx` ON `video_tag_assignments` (`tagId`);--> statement-breakpoint
CREATE INDEX `video_tag_assignments_unique_idx` ON `video_tag_assignments` (`videoId`,`tagId`);--> statement-breakpoint
CREATE INDEX `video_tags_user_id_idx` ON `video_tags` (`userId`);--> statement-breakpoint
CREATE INDEX `video_tags_user_name_idx` ON `video_tags` (`userId`,`name`);