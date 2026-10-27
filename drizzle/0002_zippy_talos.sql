ALTER TABLE `editorial_records` ADD `url_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `editorial_records` ADD CONSTRAINT `editorial_records_url_hash_unique` UNIQUE(`url_hash`);