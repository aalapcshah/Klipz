CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`emailOnApproval` boolean NOT NULL DEFAULT true,
	`emailOnComment` boolean NOT NULL DEFAULT true,
	`emailOnApprovalRequest` boolean NOT NULL DEFAULT true,
	`inAppOnApproval` boolean NOT NULL DEFAULT true,
	`inAppOnComment` boolean NOT NULL DEFAULT true,
	`inAppOnApprovalRequest` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('approval_approved','approval_rejected','comment_reply','approval_requested') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`annotationId` int,
	`annotationType` enum('voice','visual'),
	`relatedUserId` int,
	`relatedUserName` varchar(255),
	`read` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
