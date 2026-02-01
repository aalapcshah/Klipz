CREATE TABLE `knowledge_graph_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enableWikidataEnrichment` boolean NOT NULL DEFAULT true,
	`enableLLMSuggestions` boolean NOT NULL DEFAULT true,
	`enableAutoTagging` boolean NOT NULL DEFAULT false,
	`suggestionConfidenceThreshold` float NOT NULL DEFAULT 0.5,
	`maxSuggestionsPerTag` int NOT NULL DEFAULT 10,
	`preferredLanguage` varchar(5) NOT NULL DEFAULT 'en',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_graph_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_graph_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `tag_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`parentId` int,
	`color` varchar(7) DEFAULT '#3b82f6',
	`icon` varchar(50),
	`sortOrder` int NOT NULL DEFAULT 0,
	`wikidataId` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tag_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tag_category_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tagName` varchar(255) NOT NULL,
	`categoryId` int NOT NULL,
	`confidence` float NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tag_category_mappings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tag_embeddings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tagName` varchar(255) NOT NULL,
	`wikidataId` varchar(20),
	`wikidataLabel` varchar(255),
	`wikidataDescription` text,
	`embedding` json,
	`embeddingModel` varchar(100),
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tag_embeddings_id` PRIMARY KEY(`id`),
	CONSTRAINT `tag_embeddings_tagName_unique` UNIQUE(`tagName`)
);
--> statement-breakpoint
CREATE TABLE `tag_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceTag` varchar(255) NOT NULL,
	`targetTag` varchar(255) NOT NULL,
	`relationshipType` enum('parent','child','related','synonym') NOT NULL,
	`confidence` float NOT NULL DEFAULT 0.5,
	`source` enum('wikidata','llm','user','auto') NOT NULL DEFAULT 'auto',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tag_relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `knowledge_graph_settings_user_id_idx` ON `knowledge_graph_settings` (`userId`);--> statement-breakpoint
CREATE INDEX `tag_categories_name_idx` ON `tag_categories` (`name`);--> statement-breakpoint
CREATE INDEX `tag_categories_parent_id_idx` ON `tag_categories` (`parentId`);--> statement-breakpoint
CREATE INDEX `tag_category_mappings_tag_name_idx` ON `tag_category_mappings` (`tagName`);--> statement-breakpoint
CREATE INDEX `tag_category_mappings_category_id_idx` ON `tag_category_mappings` (`categoryId`);--> statement-breakpoint
CREATE INDEX `tag_category_mappings_unique_idx` ON `tag_category_mappings` (`tagName`,`categoryId`);--> statement-breakpoint
CREATE INDEX `tag_embeddings_tag_name_idx` ON `tag_embeddings` (`tagName`);--> statement-breakpoint
CREATE INDEX `tag_embeddings_wikidata_id_idx` ON `tag_embeddings` (`wikidataId`);--> statement-breakpoint
CREATE INDEX `tag_relationships_source_tag_idx` ON `tag_relationships` (`sourceTag`);--> statement-breakpoint
CREATE INDEX `tag_relationships_target_tag_idx` ON `tag_relationships` (`targetTag`);--> statement-breakpoint
CREATE INDEX `tag_relationships_type_idx` ON `tag_relationships` (`relationshipType`);