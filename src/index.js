require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');

const PORT = parseInt(process.env.PORT) || 3000;

async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌ Cannot start server: database connection failed');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 GitHub Profile Analyzer running on http://localhost:${PORT}`);
    console.log(`   Health check → GET http://localhost:${PORT}/health`);
    console.log(`   Analyze user → POST http://localhost:${PORT}/api/profiles/analyze/:username`);
    console.log(`   List profiles → GET http://localhost:${PORT}/api/profiles\n`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down…`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
