CREATE TABLE IF NOT EXISTS "mileage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"date" text NOT NULL,
	"description" text,
	"miles" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"amount" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
