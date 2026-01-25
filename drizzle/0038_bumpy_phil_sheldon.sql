CREATE TABLE `saved_cohort_comparisons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`cohort1Name` varchar(255) NOT NULL,
	`cohort1StartDate` timestamp NOT NULL,
	`cohort1EndDate` timestamp NOT NULL,
	`cohort2Name` varchar(255) NOT NULL,
	`cohort2StartDate` timestamp NOT NULL,
	`cohort2EndDate` timestamp NOT NULL,
	`results` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_cohort_comparisons_id` PRIMARY KEY(`id`)
);
