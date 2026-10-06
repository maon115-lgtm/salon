CREATE TABLE `business_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`listed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
