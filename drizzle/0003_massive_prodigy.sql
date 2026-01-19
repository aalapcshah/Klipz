CREATE TABLE `file_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`changeDescription` text,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`fileSize` int NOT NULL,
	`title` varchar(255),
	`description` text,
	`aiAnalysis` text,
	`ocrText` text,
	`detectedObjects` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_versions_id` PRIMARY KEY(`id`)
);
