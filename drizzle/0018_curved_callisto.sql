CREATE TABLE `user_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` varchar(50) NOT NULL,
	`description` text NOT NULL,
	`metadata` json,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_activity` ADD CONSTRAINT `user_activity_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;