-- Update position column to support granular in-article positions
ALTER TABLE advertisements
DROP CONSTRAINT advertisements_position_check;

ALTER TABLE advertisements
ADD CONSTRAINT advertisements_position_check
CHECK (position IN ('header', 'sidebar', 'in-feed', 'in-article-top', 'in-article-middle', 'in-article-bottom', 'footer'));
