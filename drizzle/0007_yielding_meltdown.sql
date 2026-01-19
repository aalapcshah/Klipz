CREATE TABLE `metadata_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255),
	`description` text,
	`fileType` varchar(100),
	`usageCount` int NOT NULL DEFAULT 1,
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `metadata_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metadata_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`titlePattern` varchar(255),
	`descriptionPattern` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metadata_templates_id` PRIMARY KEY(`id`)
);
