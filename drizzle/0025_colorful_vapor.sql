CREATE TABLE `annotation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`annotationId` int NOT NULL,
	`annotationType` enum('voice','visual') NOT NULL,
	`userId` int NOT NULL,
	`changeType` enum('created','edited','deleted') NOT NULL,
	`previousState` json,
	`newState` json,
	`changeDescription` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `annotation_history_id` PRIMARY KEY(`id`)
);
