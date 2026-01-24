CREATE TABLE `keyboard_shortcuts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`key` varchar(50) NOT NULL,
	`modifiers` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `keyboard_shortcuts_id` PRIMARY KEY(`id`)
);
