CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`status` text NOT NULL,
	`measurements_added` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_time` ON `attempts` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `capability_samples` (
	`id` integer PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor` text NOT NULL,
	`namespace` text NOT NULL,
	`property` text NOT NULL,
	`instance` text NOT NULL,
	`value_json` text NOT NULL,
	`observed_at` text,
	`fetched_at` text NOT NULL,
	`uncertainty_ms` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capability_sample` ON `capability_samples` (`monitor_id`,`namespace`,`property`,`instance`,`observed_at`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`observed_at` text,
	`fetched_at` text NOT NULL,
	`quality` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_sample` ON `measurements` (`monitor_id`,`metric`,`observed_at`);--> statement-breakpoint
CREATE INDEX `metric_time` ON `measurements` (`metric`,`observed_at`);--> statement-breakpoint
CREATE TABLE `state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
