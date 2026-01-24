CREATE TABLE `recently_viewed_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileId` int NOT NULL,
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recently_viewed_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_file_idx` UNIQUE(`userId`,`fileId`)
);
