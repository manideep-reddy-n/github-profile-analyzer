# GitHub Profile Analyzer API

A production-ready REST API that fetches public GitHub user profiles, computes rich insights from their repository activity, and persists everything in a MySQL database.

---

## Features

| Feature | Details |
|---|---|
| **Profile Analysis** | Fetches user data + all public repos from the GitHub API |
| **Rich Insights** | Stars, forks, followers, language breakdown, top repos, activity history |
| **MySQL Persistence** | Normalized schema across 5 tables with foreign-key constraints |
| **Snapshot History** | Every re-analysis appends a new stats snapshot so you can track growth over time |
| **Comparison Endpoint** | Side-by-side comparison of up to 5 analyzed profiles |
| **Global Summary** | Aggregate stats + top languages across all stored profiles |
| **Rate Limiting** | Configurable per-window request cap on all `/api/*` routes |
| **Security** | Helmet headers, CORS, input validation on usernames |
| **Tests** | Jest + Supertest integration tests with full mock layer |

---

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MySQL 8+
- **External API:** GitHub REST API v3

---

## Prerequisites

- Node.js ≥ 18
- MySQL 8+ (running locally or in Docker)
- (Optional) GitHub Personal Access Token — raises rate limit from 60 → 5,000 req/hr

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/manideep-reddy-n/github-profile-analyzer.git
cd github-profile-analyzer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=github_analyzer

# GitHub – get one at https://github.com/settings/tokens
# Unauthenticated: 60 req/hr  |  With token: 5,000 req/hr
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Rate limiting (optional)
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX=100
```

### 4. Run database migrations

```bash
npm run migrate
```

This creates the `github_analyzer` database and all 5 tables automatically.

### 5. Start the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000`.

---

## Docker Quick-Start (MySQL only)

```bash
docker run -d \
  --name mysql-gh \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=github_analyzer \
  -p 3306:3306 \
  mysql:8
```

Then set `DB_PASSWORD=secret` in your `.env` and run migrations.

---

## API Reference

### Base URL

```
http://localhost:3000/api
```

---

### Health Check

```
GET /health
```

**Response**
```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

---

### Analyze a Profile

Fetches fresh data from GitHub, computes insights, and stores/updates everything in the DB.

```
POST /api/profiles/analyze/:username
```

**Example**
```bash
curl -X POST http://localhost:3000/api/profiles/analyze/torvalds
```

**Response** `200 OK`
```json
{
  "success": true,
  "message": "Profile \"torvalds\" analyzed and stored successfully",
  "data": {
    "profile": { "username": "torvalds", "name": "Linus Torvalds", ... },
    "stats": { "public_repos": 6, "followers": 220000, "total_stars": 185000, ... },
    "languages": [{ "language": "C", "repo_count": 4, "percentage": 66.67 }],
    "topRepos": [{ "repo_name": "linux", "stars": 183000, ... }],
    "history": [...]
  }
}
```

---

### List All Profiles

```
GET /api/profiles
```

**Query Parameters**

| Param | Default | Options |
|---|---|---|
| `page` | `1` | integer |
| `limit` | `20` | integer (max 100) |
| `sortBy` | `analyzed_at` | `analyzed_at`, `username`, `followers`, `public_repos`, `total_stars` |
| `order` | `DESC` | `ASC`, `DESC` |

**Example**
```bash
curl "http://localhost:3000/api/profiles?sortBy=total_stars&order=DESC&limit=10"
```

**Response** `200 OK`
```json
{
  "success": true,
  "data": [ { "username": "torvalds", "total_stars": 185000, ... } ],
  "pagination": { "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
}
```

---

### Get a Single Profile

```
GET /api/profiles/:username
```

**Example**
```bash
curl http://localhost:3000/api/profiles/torvalds
```

Returns full profile with stats, language breakdown, top 5 repos, and snapshot history.

---

### Delete a Profile

```
DELETE /api/profiles/:username
```

Removes the profile and all related data (stats, languages, repos) from the database.

---

### Compare Profiles

```
GET /api/profiles/compare?users=user1,user2,user3
```

Side-by-side comparison of up to 5 already-analyzed profiles.

**Example**
```bash
curl "http://localhost:3000/api/profiles/compare?users=torvalds,gvanrossum"
```

---

### Global Summary

```
GET /api/profiles/stats/summary
```

Aggregate statistics and rankings across all stored profiles.

**Response includes:**
- Total profiles, followers, repos, stars
- Top 10 programming languages (by repo count)
- Top 5 profiles by total stars

---

## Database Schema

```
profiles           – Core profile fields from GitHub
profile_stats      – Per-analysis snapshots (followers, stars, repos, etc.)
profile_languages  – Language breakdown per profile
top_repositories   – Top 5 repos per profile by stars
analysis_logs      – Audit log for every analyze request
```

---

## Running Tests

```bash
npm test
```

Tests use Jest + Supertest. The GitHub API and database are fully mocked — no live connections required.

```bash
# With coverage report
npm test -- --coverage
```

---

## Project Structure

```
github-profile-analyzer/
├── src/
│   ├── config/
│   │   ├── database.js        # MySQL connection pool
│   │   └── migrate.js         # Table creation script
│   ├── controllers/
│   │   └── profileController.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── models/
│   │   └── profileModel.js    # All DB queries
│   ├── routes/
│   │   └── profileRoutes.js
│   ├── services/
│   │   └── githubService.js   # GitHub API + insight computation
│   ├── utils/
│   │   └── logger.js
│   ├── app.js                 # Express setup
│   └── index.js               # Server entry point
├── tests/
│   └── profile.test.js
├── .env.example
├── .gitignore
├── jest.config.js
└── package.json
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | Environment |
| `DB_HOST` | Yes | `localhost` | MySQL host |
| `DB_PORT` | No | `3306` | MySQL port |
| `DB_USER` | Yes | – | MySQL user |
| `DB_PASSWORD` | Yes | – | MySQL password |
| `DB_NAME` | No | `github_analyzer` | Database name |
| `GITHUB_TOKEN` | Recommended | – | GitHub PAT for higher rate limits |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
