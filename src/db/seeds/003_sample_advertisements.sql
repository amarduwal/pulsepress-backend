-- Insert sample advertisements with image and video media
INSERT INTO advertisements (ad_type, ad_name, ad_code, position, is_active, media_type, media_url, duration_seconds, target_url) VALUES
  ('custom', 'Tech News Banner', '<banner>', 'in-article', TRUE, 'image', 'https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=728&h=410&fit=crop', 3, 'https://example.com/tech'),
  ('custom', 'Business Daily', '<banner>', 'in-article', TRUE, 'image', 'https://images.unsplash.com/photo-1590080876040-ae73c6394b3e?w=728&h=410&fit=crop', 3, 'https://example.com/business'),
  ('custom', 'Sports Update', '<banner>', 'in-article', TRUE, 'image', 'https://images.unsplash.com/photo-1559339352-11fe08505bcb?w=728&h=410&fit=crop', 3, 'https://example.com/sports'),
  ('custom', 'Wellness Promo', '<banner>', 'in-article', TRUE, 'image', 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=728&h=410&fit=crop', 3, 'https://example.com/wellness');
