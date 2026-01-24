CREATE TABLE `user_onboarding` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tutorialCompleted` boolean NOT NULL DEFAULT false,
	`tutorialSkipped` boolean NOT NULL DEFAULT false,
	`uploadFileCompleted` boolean NOT NULL DEFAULT false,
	`createAnnotationCompleted` boolean NOT NULL DEFAULT false,
	`useTemplateCompleted` boolean NOT NULL DEFAULT false,
	`addCommentCompleted` boolean NOT NULL DEFAULT false,
	`approveAnnotationCompleted` boolean NOT NULL DEFAULT false,
	`useKeyboardShortcutCompleted` boolean NOT NULL DEFAULT false,
	`tutorialStartedAt` timestamp,
	`tutorialCompletedAt` timestamp,
	`lastStepCompletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_onboarding_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_onboarding_userId_unique` UNIQUE(`userId`)
);
