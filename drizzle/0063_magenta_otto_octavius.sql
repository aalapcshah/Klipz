ALTER TABLE `files` ADD `compressionStatus` enum('none','pending','processing','completed','failed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `compressedSize` int;--> statement-breakpoint
ALTER TABLE `files` ADD `originalFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `files` ADD `originalUrl` text;