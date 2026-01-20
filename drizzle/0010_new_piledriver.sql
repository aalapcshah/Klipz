CREATE TABLE `external_knowledge_graphs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('dbpedia','wikidata','schema_org','custom') NOT NULL,
	`endpoint` text,
	`apiKey` text,
	`enabled` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`ontologyUrl` text,
	`namespacePrefix` varchar(100),
	`lastUsedAt` timestamp,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_knowledge_graphs_id` PRIMARY KEY(`id`)
);
