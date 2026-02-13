CREATE TABLE `team_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`actorId` int NOT NULL,
	`actorName` varchar(255),
	`type` enum('member_joined','member_left','member_removed','invite_sent','invite_accepted','invite_revoked','file_uploaded','annotation_created','team_created','team_name_updated') NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `team_activities_team_id_idx` ON `team_activities` (`teamId`);--> statement-breakpoint
CREATE INDEX `team_activities_created_at_idx` ON `team_activities` (`createdAt`);