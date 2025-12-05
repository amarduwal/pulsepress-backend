-- Tested and reliable RSS feeds with full content and images

-- Clear existing sources (optional)
-- TRUNCATE news_sources CASCADE;

-- ============================================
-- TECHNOLOGY SOURCES (Best for full content + images)
-- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('TechCrunch', 'https://techcrunch.com/feed/', 'rss', TRUE, 30),
--   ('The Verge', 'https://www.theverge.com/rss/index.xml', 'rss', TRUE, 30),
--   ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'rss', TRUE, 30),
--   ('Wired', 'https://www.wired.com/feed/rss', 'rss', TRUE, 30),
--   ('Engadget', 'https://www.engadget.com/rss.xml', 'rss', TRUE, 30),
--   ('Hacker News', 'https://hnrss.org/frontpage', 'rss', TRUE, 60),
--   ('MIT Technology Review', 'https://www.technologyreview.com/feed/', 'rss', TRUE, 60);

-- -- ============================================
-- -- NEWS & WORLD
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('BBC News', 'http://feeds.bbci.co.uk/news/rss.xml', 'rss', TRUE, 20),
--   ('BBC World', 'http://feeds.bbci.co.uk/news/world/rss.xml', 'rss', TRUE, 20),
--   ('Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss', TRUE, 30),
--   ('The Guardian', 'https://www.theguardian.com/world/rss', 'rss', TRUE, 30),
--   ('NPR News', 'https://feeds.npr.org/1001/rss.xml', 'rss', TRUE, 30),
--   ('Reuters World', 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', 'rss', TRUE, 20);

-- -- ============================================
-- -- BUSINESS & FINANCE
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('BBC Business', 'http://feeds.bbci.co.uk/news/business/rss.xml', 'rss', TRUE, 30),
--   ('Financial Times', 'https://www.ft.com/?format=rss', 'rss', TRUE, 30),
--   ('Business Insider', 'https://www.businessinsider.com/rss', 'rss', TRUE, 30),
--   ('Forbes', 'https://www.forbes.com/real-time/feed2/', 'rss', TRUE, 30),
--   ('The Economist', 'https://www.economist.com/rss', 'rss', TRUE, 60);

-- -- ============================================
-- -- SCIENCE
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Science Daily', 'https://www.sciencedaily.com/rss/all.xml', 'rss', TRUE, 60),
--   ('Phys.org', 'https://phys.org/rss-feed/', 'rss', TRUE, 60),
--   ('NASA Breaking News', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', 'rss', TRUE, 60),
--   ('Space.com', 'https://www.space.com/feeds/all', 'rss', TRUE, 60),
--   ('Scientific American', 'https://www.scientificamerican.com/feed/', 'rss', TRUE, 60);

-- -- ============================================
-- -- SPORTS
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('ESPN Top', 'https://www.espn.com/espn/rss/news', 'rss', TRUE, 30),
--   ('BBC Sport', 'http://feeds.bbci.co.uk/sport/rss.xml', 'rss', TRUE, 30),
--   ('Sky Sports', 'https://www.skysports.com/rss/12040', 'rss', TRUE, 30),
--   ('CBS Sports', 'https://www.cbssports.com/rss/headlines/', 'rss', TRUE, 30);

-- -- ============================================
-- -- ENTERTAINMENT
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Variety', 'https://variety.com/feed/', 'rss', TRUE, 60),
--   ('The Hollywood Reporter', 'https://www.hollywoodreporter.com/feed/', 'rss', TRUE, 60),
--   ('Entertainment Weekly', 'https://ew.com/feed/', 'rss', TRUE, 60),
--   ('Deadline', 'https://deadline.com/feed/', 'rss', TRUE, 60),
--   ('Rolling Stone', 'https://www.rollingstone.com/feed/', 'rss', TRUE, 60);

-- -- ============================================
-- -- HEALTH
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Medical News Today', 'https://www.medicalnewstoday.com/rss', 'rss', TRUE, 60),
--   ('Healthline', 'https://www.healthline.com/rss', 'rss', TRUE, 60),
--   ('WebMD', 'https://www.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC', 'rss', TRUE, 60),
--   ('BBC Health', 'http://feeds.bbci.co.uk/news/health/rss.xml', 'rss', TRUE, 60);

-- -- ============================================
-- -- POLITICS
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Politico', 'https://www.politico.com/rss/politics08.xml', 'rss', TRUE, 30),
--   ('The Hill', 'https://thehill.com/feed/', 'rss', TRUE, 30),
--   ('BBC Politics', 'http://feeds.bbci.co.uk/news/politics/rss.xml', 'rss', TRUE, 30),
--   ('NPR Politics', 'https://feeds.npr.org/1014/rss.xml', 'rss', TRUE, 30);

-- -- ============================================
-- -- LIFESTYLE
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Vogue', 'https://www.vogue.com/feed/rss', 'rss', TRUE, 60),
--   ('GQ', 'https://www.gq.com/feed/rss', 'rss', TRUE, 60),
--   ('Bon Appétit', 'https://www.bonappetit.com/feed/rss', 'rss', TRUE, 60),
--   ('Travel + Leisure', 'https://www.travelandleisure.com/rss', 'rss', TRUE, 60);

-- -- ============================================
-- -- GENERAL NEWS AGGREGATORS
-- -- ============================================

-- INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
--   ('Google News', 'https://news.google.com/rss', 'rss', TRUE, 20),
--   ('Yahoo News', 'https://www.yahoo.com/news/rss', 'rss', TRUE, 30),
--   ('HuffPost', 'https://www.huffpost.com/section/front-page/feed', 'rss', TRUE, 30),
--   ('Medium', 'https://medium.com/feed/tag/news', 'rss', TRUE, 60);




-- src/db/seeds/003_seed_news_sources.sql
-- RSS feeds categorized by content availability
-- Type: 'rss-full' = Full content in RSS, 'rss-scrape' = Need scraping

-- Clear existing sources
DELETE FROM news_sources;

-- ============================================
-- FULL CONTENT RSS FEEDS (No scraping needed)
-- ============================================

INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
  -- Technology (Full content)
  ('TechCrunch', 'https://techcrunch.com/feed/', 'rss-full', TRUE, 30),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'rss-full', TRUE, 30),
  ('Hacker News', 'https://hnrss.org/frontpage', 'rss-full', TRUE, 60),

  -- News (Full content)
  ('The Guardian - Full', 'https://www.theguardian.com/world/rss', 'rss-full', TRUE, 20),
  ('NPR News', 'https://feeds.npr.org/1001/rss.xml', 'rss-full', TRUE, 30),

  -- Science (Full content)
  ('NASA', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', 'rss-full', TRUE, 60),
  ('Phys.org', 'https://phys.org/rss-feed/', 'rss-full', TRUE, 60),

  -- Politics (Full content)
  ('NPR Politics', 'https://feeds.npr.org/1014/rss.xml', 'rss-full', TRUE, 30),

  -- General (Full content)
  ('Medium - News', 'https://medium.com/feed/tag/news', 'rss-full', TRUE, 60),
  ('Medium - Tech', 'https://medium.com/feed/tag/technology', 'rss-full', TRUE, 60);

-- ============================================
-- SNIPPET RSS FEEDS (Require scraping)
-- ============================================

INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
  -- Technology (Snippets - need scraping)
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'rss-scrape', TRUE, 30),
  ('Wired', 'https://www.wired.com/feed/rss', 'rss-scrape', TRUE, 30),
  ('Engadget', 'https://www.engadget.com/rss.xml', 'rss-scrape', TRUE, 30),

  -- News (Snippets - need scraping)
  ('BBC News', 'http://feeds.bbci.co.uk/news/rss.xml', 'rss-scrape', TRUE, 20),
  ('BBC World', 'http://feeds.bbci.co.uk/news/world/rss.xml', 'rss-scrape', TRUE, 20),
  ('Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss-scrape', TRUE, 30),

  -- Business (Snippets - need scraping)
  ('BBC Business', 'http://feeds.bbci.co.uk/news/business/rss.xml', 'rss-scrape', TRUE, 30),
  ('Forbes', 'https://www.forbes.com/real-time/feed2/', 'rss-scrape', TRUE, 30),

  -- Sports (Snippets - need scraping)
  ('ESPN', 'https://www.espn.com/espn/rss/news', 'rss-scrape', TRUE, 30),
  ('BBC Sport', 'http://feeds.bbci.co.uk/sport/rss.xml', 'rss-scrape', TRUE, 30),

  -- Entertainment (Snippets - need scraping)
  ('Variety', 'https://variety.com/feed/', 'rss-scrape', TRUE, 60),
  ('Hollywood Reporter', 'https://www.hollywoodreporter.com/feed/', 'rss-scrape', TRUE, 60),

  -- Politics (Snippets - need scraping)
  ('Politico', 'https://www.politico.com/rss/politics08.xml', 'rss-scrape', TRUE, 30),
  ('The Hill', 'https://thehill.com/feed/', 'rss-scrape', TRUE, 30),
  ('BBC Politics', 'http://feeds.bbci.co.uk/news/politics/rss.xml', 'rss-scrape', TRUE, 30);

-- ============================================
-- ALTERNATIVE FULL-TEXT SOURCES
-- ============================================

-- Reddit RSS (Full content in comments)
INSERT INTO news_sources (name, base_url, type, is_active, fetch_interval_minutes) VALUES
  ('Reddit - World News', 'https://www.reddit.com/r/worldnews/.rss', 'rss-full', TRUE, 30),
  ('Reddit - Technology', 'https://www.reddit.com/r/technology/.rss', 'rss-full', TRUE, 30),
  ('Reddit - Science', 'https://www.reddit.com/r/science/.rss', 'rss-full', TRUE, 60);
