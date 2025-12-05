-- Insert default categories
INSERT INTO categories (name, slug, description, icon, color, sort_order) VALUES
  ('Top Stories', 'top', 'Breaking news and top stories', 'Flame', '#dc2626', 1),
  ('Politics', 'politics', 'Political news and analysis', 'Landmark', '#7c3aed', 2),
  ('World', 'world', 'International news', 'Globe', '#2563eb', 3),
  ('Business', 'business', 'Business and finance news', 'TrendingUp', '#059669', 4),
  ('Technology', 'technology', 'Tech news and innovation', 'Cpu', '#0891b2', 5),
  ('Sports', 'sports', 'Sports news and updates', 'Trophy', '#ea580c', 6),
  ('Entertainment', 'entertainment', 'Entertainment and celebrity news', 'Film', '#db2777', 7),
  ('Science', 'science', 'Science and research', 'Microscope', '#8b5cf6', 8),
  ('Health', 'health', 'Health and wellness', 'Heart', '#ec4899', 9),
  ('Lifestyle', 'lifestyle', 'Lifestyle and culture', 'Coffee', '#f59e0b', 10),
  ('Opinion', 'opinion', 'Opinion pieces and editorials', 'MessageSquare', '#6366f1', 11),
  ('Local', 'local', 'Local news', 'MapPin', '#14b8a6', 12);

-- Insert admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role, email_verified) VALUES
  ('admin', 'admin@pulsepress.com', '$2a$12$F4ATohYkCkT2.Es..tBwsu4Hk7cCzRctfUvLdFXkyOI1lH5a7faTC', 'admin', TRUE)
  ('user', 'user@pulsepress.com', '$2a$12$M2FpN81uFK6McTHzUR6CsubKdhZJ3yRq4pT5xyct9yq9CqKesclCi', 'user', TRUE);
