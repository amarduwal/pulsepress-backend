-- Insert sample advertisements with image and video media
INSERT INTO advertisements (ad_type, ad_name, ad_code, position, is_active, media_type, media_url, duration_seconds, target_url) VALUES
  ('custom', 'Tech News Banner', '<banner>', 'sidebar', TRUE, 'image', 'https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=728&h=410&fit=crop', 3, 'https://pulsepress-pearl.vercel.app/tech'),
  ('custom', 'Business Daily', '<banner>', 'sidebar', TRUE, 'image', 'https://images.unsplash.com/photo-1590080876040-ae73c6394b3e?w=728&h=410&fit=crop', 3, 'https://pulsepress-pearl.vercel.app/business'),
  ('custom', 'Sports Update', '<banner>', 'sidebar', TRUE, 'image', 'https://images.unsplash.com/photo-1559339352-11fe08505bcb?w=728&h=410&fit=crop', 3, 'https://pulsepress-pearl.vercel.app/sports'),
  ('custom', 'Wellness Promo', '<banner>', 'in-feed', TRUE, 'image', 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=728&h=410&fit=crop', 3, 'https://pulsepress-pearl.vercel.app/wellness');


-- Insert sample in-article advertisement placements
INSERT INTO advertisements (ad_name, ad_type, ad_code, position, media_type, media_url, target_url, is_active, created_at, updated_at)
VALUES
  ('Premium Health Product', 'custom', '<banner>', 'in-article-top', 'image', '/placeholder.svg?height=400&width=800', 'https://pulsepress-pearl.vercel.app/', true, NOW(), NOW()),
  ('Tech Solution Ad', 'custom', '<banner>', 'in-article-middle', 'image', '/placeholder.svg?height=400&width=800', 'https://pulsepress-pearl.vercel.app/', true, NOW(), NOW()),
  ('Service Promotion', 'custom', '<banner>', 'in-article-bottom', 'video', '/animate.mp4', 'https://pulsepress-pearl.vercel.app/', true, NOW(), NOW()),
  ('AdSense Slot Top', 'adsense', '<banner>', 'in-article-middle', NULL, NULL, NULL, true, NOW(), NOW()),
  ('AdSense Slot Middle', 'adsense', '<banner>', 'in-article-middle', NULL, NULL, NULL, true, NOW(), NOW()),
  ('Adsterra Slot', 'adsterra', '<banner>', 'in-article-middle', NULL, NULL, NULL, true, NOW(), NOW())
ON CONFLICT DO NOTHING;
