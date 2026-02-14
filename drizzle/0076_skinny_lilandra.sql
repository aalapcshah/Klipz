ALTER TABLE `resumable_upload_sessions` ADD `assemblyProgress` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `resumable_upload_sessions` ADD `assemblyTotalChunks` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `resumable_upload_sessions` ADD `assemblyPhase` enum('idle','downloading','uploading','generating_thumbnail','complete','failed') DEFAULT 'idle';--> statement-breakpoint
ALTER TABLE `resumable_upload_sessions` ADD `assemblyStartedAt` timestamp;