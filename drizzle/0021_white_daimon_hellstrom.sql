CREATE TABLE `voice_annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`audioUrl` text NOT NULL,
	`audioKey` varchar(512) NOT NULL,
	`duration` int NOT NULL,
	`videoTimestamp` int NOT NULL,
	`transcript` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `files` ADD `lastAccessedAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `qualityScore` int DEFAULT 0;