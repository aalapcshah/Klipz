CREATE TABLE `file_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoFileId` int NOT NULL,
	`suggestedFileId` int NOT NULL,
	`userId` int NOT NULL,
	`startTime` float NOT NULL,
	`endTime` float NOT NULL,
	`transcriptExcerpt` text NOT NULL,
	`matchedKeywords` json,
	`relevanceScore` float NOT NULL,
	`matchType` enum('keyword','semantic','entity','topic') NOT NULL,
	`userFeedback` enum('helpful','not_helpful','irrelevant'),
	`feedbackAt` timestamp,
	`status` enum('active','dismissed','accepted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`fullText` text NOT NULL,
	`wordTimestamps` json,
	`segments` json,
	`language` varchar(10),
	`confidence` int,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_transcripts_id` PRIMARY KEY(`id`)
);
