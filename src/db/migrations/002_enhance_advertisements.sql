-- Add media type and URL fields to advertisements table for storing image/video ads
ALTER TABLE advertisements
ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) CHECK (media_type IN ('image', 'video')),
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS target_url TEXT;

-- Create index for getting random active ads
CREATE INDEX IF NOT EXISTS idx_advertisements_active_media ON advertisements(is_active, media_type);
