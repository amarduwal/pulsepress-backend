# PulsePress Backend

Modern news aggregation portal backend built with Node.js, Express, PostgreSQL, Redis, and BullMQ.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Article Management**: Full CRUD with categories, tags, and metadata
- **Content Ingestion**: RSS parsing, web scraping, and deduplication
- **AI Processing**: Summarization, rewriting, and classification using Hugging Face
- **Comments System**: Nested comments with moderation
- **Bookmarks**: Save articles for later
- **Search**: Full-text search with PostgreSQL
- **Analytics**: Comprehensive dashboard analytics
- **Background Jobs**: BullMQ for async processing
- **Caching**: Redis for performance

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **Database**: PostgreSQL with raw SQL (no ORM)
- **Cache**: Redis
- **Jobs**: BullMQ
- **AI**: Hugging Face Inference API
- **Validation**: Zod
- **Security**: Helmet, bcrypt, JWT

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

\`\`\`bash

# Install dependencies

npm install

# Copy environment file

cp .env.example .env

# Edit .env with your configuration

\`\`\`

### Database Setup

\`\`\`bash

# Run migrations

npm run migrate
\`\`\`

### Development

\`\`\`bash

# Start development server

npm run dev
\`\`\`

### Production

\`\`\`bash

# Build

npm run build

# Start production server

npm start
\`\`\`

## API Documentation

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/refresh` - Refresh access token

### Articles

- `GET /api/v1/articles` - List articles
- `GET /api/v1/articles/:slug` - Get article by slug
- `POST /api/v1/articles` - Create article (editor+)
- `PUT /api/v1/articles/:id` - Update article (editor+)
- `DELETE /api/v1/articles/:id` - Delete article (editor+)

### Categories

- `GET /api/v1/categories` - List categories
- `POST /api/v1/categories` - Create category (admin)
- `PUT /api/v1/categories/:id` - Update category (admin)
- `DELETE /api/v1/categories/:id` - Delete category (admin)

### Comments

- `GET /api/v1/comments/articles/:id/comments` - Get article comments
- `POST /api/v1/comments/articles/:id/comments` - Create comment
- `PUT /api/v1/comments/:id` - Update comment
- `DELETE /api/v1/comments/:id` - Delete comment
- `POST /api/v1/comments/:id/approve` - Approve comment (moderator+)

### Search

- `GET /api/v1/search?q=query` - Search articles
- `GET /api/v1/search/suggestions?q=query` - Get search suggestions

### Analytics

- `GET /api/v1/analytics/overview` - Dashboard overview (moderator+)
- `GET /api/v1/analytics/top-articles` - Top articles (moderator+)
- `GET /api/v1/analytics/traffic` - Traffic stats (moderator+)

## Useful Curl

# Check dashboard

curl http://localhost:5000/api/v1/monitor/dashboard | jq

# Check Redis status

curl http://localhost:5000/api/v1/monitor/redis-status | jq

# Check Redis keys

curl http://localhost:5000/api/v1/monitor/redis-keys | jq

# Clear all jobs from queues

curl -X POST http://localhost:5000/api/v1/test/clear-all-jobs

# Or manually clear Redis

redis-cli FLUSHDB

## Architecture

\`\`\`
server/
├── src/
│ ├── config/ # Configuration
│ ├── db/ # Database client and migrations
│ ├── handlers/ # Request handlers
│ ├── jobs/ # Background jobs and workers
│ ├── lib/ # Utilities (logger, redis, etc)
│ ├── middleware/ # Express middleware
│ ├── routes/ # Route definitions
│ ├── services/ # Business logic
│ │ ├── ai/ # AI services
│ │ └── ingestion/ # Content ingestion
│ └── index.ts # App entry point
├── .env.example
├── package.json
└── tsconfig.json
\`\`\`

## Environment Variables

See `.env.example` for all available configuration options.

## License

MIT
