require('dotenv').config();
const { pool } = require('./database');

const CREATE_DB = `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'github_analyzer'}\``;

const CREATE_PROFILES_TABLE = `
  CREATE TABLE IF NOT EXISTS profiles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    name            VARCHAR(255),
    bio             TEXT,
    location        VARCHAR(255),
    company         VARCHAR(255),
    blog            VARCHAR(500),
    email           VARCHAR(255),
    twitter_handle  VARCHAR(100),
    avatar_url      VARCHAR(500),
    github_url      VARCHAR(500),
    account_type    ENUM('User', 'Organization') DEFAULT 'User',
    is_hireable     BOOLEAN DEFAULT FALSE,
    created_at_gh   DATETIME,
    updated_at_gh   DATETIME,
    analyzed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`;

const CREATE_STATS_TABLE = `
  CREATE TABLE IF NOT EXISTS profile_stats (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    profile_id              INT NOT NULL,
    public_repos            INT DEFAULT 0,
    public_gists            INT DEFAULT 0,
    followers               INT DEFAULT 0,
    following               INT DEFAULT 0,
    total_stars             INT DEFAULT 0,
    total_forks             INT DEFAULT 0,
    total_watchers          INT DEFAULT 0,
    total_open_issues       INT DEFAULT 0,
    original_repos          INT DEFAULT 0,
    forked_repos            INT DEFAULT 0,
    avg_stars_per_repo      DECIMAL(10, 2) DEFAULT 0.00,
    most_used_language      VARCHAR(100),
    snapshot_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    INDEX idx_profile_id (profile_id)
  )
`;

const CREATE_LANGUAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS profile_languages (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    profile_id    INT NOT NULL,
    language      VARCHAR(100) NOT NULL,
    repo_count    INT DEFAULT 0,
    percentage    DECIMAL(5, 2) DEFAULT 0.00,
    snapshot_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    INDEX idx_profile_language (profile_id, language)
  )
`;

const CREATE_TOP_REPOS_TABLE = `
  CREATE TABLE IF NOT EXISTS top_repositories (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    profile_id    INT NOT NULL,
    repo_name     VARCHAR(255) NOT NULL,
    description   TEXT,
    language      VARCHAR(100),
    stars         INT DEFAULT 0,
    forks         INT DEFAULT 0,
    watchers      INT DEFAULT 0,
    open_issues   INT DEFAULT 0,
    is_fork       BOOLEAN DEFAULT FALSE,
    repo_url      VARCHAR(500),
    created_at_gh DATETIME,
    pushed_at     DATETIME,
    snapshot_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    INDEX idx_profile_id (profile_id)
  )
`;

const CREATE_ANALYSIS_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS analysis_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(100) NOT NULL,
    status        ENUM('success', 'failed') NOT NULL,
    message       TEXT,
    ip_address    VARCHAR(50),
    triggered_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username)
  )
`;

async function migrate() {
  let connection;
  try {
    // Create a temporary connection without DB to create the database
    const mysql = require('mysql2/promise');
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    await tempConn.query(CREATE_DB);
    console.log(`✅ Database "${process.env.DB_NAME || 'github_analyzer'}" ensured`);
    await tempConn.end();

    connection = await pool.getConnection();

    await connection.query(CREATE_PROFILES_TABLE);
    console.log('✅ Table: profiles');

    await connection.query(CREATE_STATS_TABLE);
    console.log('✅ Table: profile_stats');

    await connection.query(CREATE_LANGUAGES_TABLE);
    console.log('✅ Table: profile_languages');

    await connection.query(CREATE_TOP_REPOS_TABLE);
    console.log('✅ Table: top_repositories');

    await connection.query(CREATE_ANALYSIS_LOGS_TABLE);
    console.log('✅ Table: analysis_logs');

    console.log('\n🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

migrate();
