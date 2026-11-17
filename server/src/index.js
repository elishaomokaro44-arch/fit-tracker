const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 4000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'fittrack.db');

const db = openDb(DB_FILE);
const server = createApp(db).listen(PORT, '0.0.0.0', () => {
  console.log(`FitTrack API listening on port ${PORT} (database: ${DB_FILE})`);
});

// Close cleanly when Docker stops the container
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
