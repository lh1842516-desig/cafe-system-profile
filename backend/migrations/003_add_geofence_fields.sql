-- =============================================================================
-- Migration 003: Add Geofencing Columns to cafe_settings Table
-- Adds latitude, longitude, allowed_radius, and enable_geofence columns
-- =============================================================================

ALTER TABLE cafe_settings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) DEFAULT 33.3152;
ALTER TABLE cafe_settings ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) DEFAULT 44.3661;
ALTER TABLE cafe_settings ADD COLUMN IF NOT EXISTS allowed_radius INTEGER DEFAULT 100;
ALTER TABLE cafe_settings ADD COLUMN IF NOT EXISTS enable_geofence BOOLEAN DEFAULT false;
