ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "serial_number" text;
--> statement-breakpoint
ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "location" text;
