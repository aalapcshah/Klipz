ALTER TABLE `videos` ADD `transcodedUrl` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `transcodedKey` varchar(512);--> statement-breakpoint
ALTER TABLE `videos` ADD `transcodeStatus` enum('pending','processing','completed','failed') DEFAULT 'pending';