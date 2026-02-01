ALTER TABLE `tags` ADD `parentId` int;--> statement-breakpoint
ALTER TABLE `tags` ADD `color` varchar(7);--> statement-breakpoint
ALTER TABLE `tags` ADD `icon` varchar(50);--> statement-breakpoint
CREATE INDEX `tags_name_user_idx` ON `tags` (`name`,`userId`);--> statement-breakpoint
CREATE INDEX `tags_parent_id_idx` ON `tags` (`parentId`);