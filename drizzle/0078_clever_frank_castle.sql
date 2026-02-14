CREATE TABLE `video_timeline_thumbnails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`timestamp` float NOT NULL,
	`thumbnailUrl` text NOT NULL,
	`thumbnailKey` varchar(512) NOT NULL,
	`width` int DEFAULT 320,
	`height` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_timeline_thumbnails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vtl_file_id_idx` ON `video_timeline_thumbnails` (`fileId`);--> statement-breakpoint
CREATE INDEX `vtl_file_timestamp_idx` ON `video_timeline_thumbnails` (`fileId`,`timestamp`);