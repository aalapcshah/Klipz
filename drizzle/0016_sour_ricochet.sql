CREATE TABLE `enrichment_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 0,
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `enrichment_queue_id` PRIMARY KEY(`id`)
);
