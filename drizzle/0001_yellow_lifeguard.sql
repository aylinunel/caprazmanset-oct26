CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_id` varchar(100) NOT NULL,
	`action` varchar(50) NOT NULL,
	`actor_id` int,
	`reason` text NOT NULL,
	`before_status` varchar(30),
	`after_status` varchar(30),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `correction_intakes` (
	`id` varchar(40) NOT NULL,
	`entity_id` varchar(100) NOT NULL,
	`entity_kind` varchar(20) NOT NULL,
	`claim` text NOT NULL,
	`message` text NOT NULL,
	`evidence_url` varchar(2048),
	`status` enum('submitted','triaged','closed') NOT NULL DEFAULT 'submitted',
	`consent_version` varchar(20) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `correction_intakes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dataset_manifests` (
	`id` varchar(100) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`supporting_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dataset_manifests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `editorial_records` (
	`id` varchar(100) NOT NULL,
	`kind` enum('article','event','source','bias','analysis') NOT NULL,
	`source_slug` varchar(100),
	`title` varchar(1000) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`verification_status` enum('provided','verified','demo','needs_review') NOT NULL DEFAULT 'needs_review',
	`provenance_note` text NOT NULL,
	`methodology` text NOT NULL,
	`editorial_disclosure` text NOT NULL,
	`evidence_url` varchar(2048),
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `editorial_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_tokens` (
	`id` varchar(40) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`actor_id` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `record_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`record_id` varchar(100) NOT NULL,
	`version` int NOT NULL,
	`snapshot` json NOT NULL,
	`actor_id` int,
	`reason` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `record_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `public_kind_status` ON `editorial_records` (`kind`,`status`);--> statement-breakpoint
CREATE INDEX `source_records` ON `editorial_records` (`source_slug`);