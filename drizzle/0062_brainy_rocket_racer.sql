CREATE TABLE `visual_caption_file_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visualCaptionId` int NOT NULL,
	`videoFileId` int NOT NULL,
	`suggestedFileId` int NOT NULL,
	`userId` int NOT NULL,
	`timestamp` float NOT NULL,
	`captionText` text NOT NULL,
	`matchedEntities` json,
	`relevanceScore` float NOT NULL,
	`matchReasoning` text,
	`status` enum('active','dismissed','accepted') NOT NULL DEFAULT 'active',
	`userFeedback` enum('helpful','not_helpful','irrelevant'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visual_caption_file_matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visual_captions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`captions` json,
	`intervalSeconds` int NOT NULL DEFAULT 5,
	`totalFramesAnalyzed` int NOT NULL DEFAULT 0,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visual_captions_id` PRIMARY KEY(`id`)
);
