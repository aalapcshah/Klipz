ALTER TABLE `videos` ADD `hlsUrl` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `hlsKey` varchar(512);--> statement-breakpoint
ALTER TABLE `videos` ADD `hlsStatus` enum('none','pending','processing','completed','failed') DEFAULT 'none';