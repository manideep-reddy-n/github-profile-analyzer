const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

function getSslConfig() {
  if (process.env.DB_SSL !== 'true' && process.env.DB_SSL_MODE !== 'REQUIRED') {
    return false;
  }

  const sslOptions = { rejectUnauthorized: true };

  try {
    if (process.env.DB_SSL_CA && process.env.DB_SSL_CA.includes('BEGIN CERTIFICATE')) {
      sslOptions.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
    } else if (process.env.DB_SSL_CA_PATH) {
      sslOptions.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8');
    }
    return sslOptions;
  } catch (err) {
    console.warn('⚠️ Could not load DB SSL CA, falling back to non-verifying TLS:', err.message);
    return { rejectUnauthorized: false };
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: getSslConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    return false;
  }
}

module.exports = { pool, testConnection };
