CREATE TABLE `annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoId` int NOT NULL,
	`fileId` int NOT NULL,
	`startTime` float NOT NULL,
	`endTime` float NOT NULL,
	`position` enum('left','right','center') NOT NULL DEFAULT 'right',
	`keyword` varchar(255),
	`confidence` float,
	`source` enum('auto','manual') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fileTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fileTags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`fileSize` int NOT NULL,
	`title` varchar(255),
	`description` text,
	`voiceRecordingUrl` text,
	`voiceTranscript` text,
	`aiAnalysis` text,
	`ocrText` text,
	`detectedObjects` json,
	`enrichmentStatus` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`enrichedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeGraphEdges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceFileId` int NOT NULL,
	`targetFileId` int NOT NULL,
	`relationshipType` enum('semantic','temporal','hierarchical') NOT NULL,
	`strength` float NOT NULL,
	`sharedTags` json,
	`sharedKeywords` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeGraphEdges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`source` enum('manual','ai','voice') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(255) NOT NULL,
	`duration` int NOT NULL,
	`title` varchar(255),
	`description` text,
	`transcript` text,
	`exportStatus` enum('draft','processing','completed','failed') NOT NULL DEFAULT 'draft',
	`exportedUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
