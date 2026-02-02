CREATE TABLE `resumable_upload_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`chunkSize` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`checksum` varchar(64),
	`status` enum('pending','uploaded','verified','failed') NOT NULL DEFAULT 'pending',
	`uploadedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resumable_upload_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `resumable_upload_chunks_unique_idx` UNIQUE(`sessionId`,`chunkIndex`)
);
--> statement-breakpoint
CREATE TABLE `resumable_upload_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileSize` bigint NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`uploadType` enum('video','file') NOT NULL,
	`uploadedBytes` bigint NOT NULL DEFAULT 0,
	`chunkSize` int NOT NULL DEFAULT 5242880,
	`totalChunks` int NOT NULL,
	`uploadedChunks` int NOT NULL DEFAULT 0,
	`chunkStoragePrefix` varchar(512) NOT NULL,
	`finalFileKey` varchar(512),
	`finalFileUrl` text,
	`metadata` json,
	`status` enum('active','paused','completed','failed','expired') NOT NULL DEFAULT 'active',
	`errorMessage` text,
	`expiresAt` timestamp NOT NULL,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `resumable_upload_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `resumable_upload_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
DROP INDEX `tags_parent_id_idx` ON `tags`;--> statement-breakpoint
ALTER TABLE `tags` ADD `parent_id` int;--> statement-breakpoint
CREATE INDEX `resumable_upload_chunks_session_id_idx` ON `resumable_upload_chunks` (`sessionId`);--> statement-breakpoint
CREATE INDEX `resumable_upload_chunks_chunk_index_idx` ON `resumable_upload_chunks` (`chunkIndex`);--> statement-breakpoint
CREATE INDEX `resumable_upload_sessions_user_id_idx` ON `resumable_upload_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `resumable_upload_sessions_token_idx` ON `resumable_upload_sessions` (`sessionToken`);--> statement-breakpoint
CREATE INDEX `resumable_upload_sessions_status_idx` ON `resumable_upload_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `resumable_upload_sessions_expires_at_idx` ON `resumable_upload_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `tags_parent_id_idx` ON `tags` (`parent_id`);--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `parentId`;