ALTER TABLE `record_versions` ADD CONSTRAINT `record_version_unique` UNIQUE(`record_id`,`version`);--> statement-breakpoint
CREATE INDEX `intake_target` ON `correction_intakes` (`entity_id`);