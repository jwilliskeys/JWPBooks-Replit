-- Migration: Self-Scheduler support
-- Run: npx drizzle-kit push  (or apply manually in Neon console)

-- Add address fields to existing booking_requests table
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS street_address    TEXT,
  ADD COLUMN IF NOT EXISTS address_lat       TEXT,
  ADD COLUMN IF NOT EXISTS address_lng       TEXT,
  ADD COLUMN IF NOT EXISTS service_requested TEXT;

-- Create scheduler_settings table (one row per owner user)
CREATE TABLE IF NOT EXISTS scheduler_settings (
  user_id                       TEXT PRIMARY KEY,
  show_service_cost             BOOLEAN NOT NULL DEFAULT FALSE,
  show_service_duration         BOOLEAN NOT NULL DEFAULT TRUE,
  completion_redirect_url       TEXT,
  service_area_lat              TEXT,
  service_area_lng              TEXT,
  service_area_radius_miles     TEXT NOT NULL DEFAULT '40',
  service_area_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  welcome_message               TEXT,
  reservation_complete_message  TEXT,
  outside_service_area_message  TEXT,
  privacy_policy_url            TEXT,
  terms_of_service_url          TEXT,
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);
