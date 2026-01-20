CREATE TABLE `smart_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(7),
	`icon` varchar(50),
	`rules` json NOT NULL,
	`cachedFileCount` int NOT NULL DEFAULT 0,
	`lastEvaluatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smart_collections_id` PRIMARY KEY(`id`)
);
