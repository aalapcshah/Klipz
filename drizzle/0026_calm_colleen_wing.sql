CREATE TABLE `annotation_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`annotationId` int NOT NULL,
	`annotationType` enum('voice','visual') NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annotation_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `annotation_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`annotationId` int NOT NULL,
	`annotationType` enum('voice','visual') NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`parentCommentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annotation_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `annotation_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`style` json NOT NULL,
	`thumbnailUrl` text,
	`thumbnailKey` varchar(512),
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annotation_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `annotation_history` DROP COLUMN `newState`;--> statement-breakpoint
ALTER TABLE `annotation_history` DROP COLUMN `changeDescription`;