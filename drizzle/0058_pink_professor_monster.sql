ALTER TABLE `collection_files` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `sortOrder` int DEFAULT 0 NOT NULL;