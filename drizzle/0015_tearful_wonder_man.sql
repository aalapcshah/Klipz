CREATE TABLE `image_annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`annotationData` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `image_annotations_id` PRIMARY KEY(`id`)
);
