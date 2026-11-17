// SQLite database using Node's built-in driver (no extra packages).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      friend_code TEXT NOT NULL UNIQUE,
      token_hash  TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per user per day. "day" is the phone's local date, YYYY-MM-DD.
    CREATE TABLE IF NOT EXISTS steps (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day     TEXT NOT NULL,
      steps   INTEGER NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    -- Friendships are stored both ways (A->B and B->A) so lookups are simple.
    CREATE TABLE IF NOT EXISTS friends (
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, friend_id)
    );
  `);

  // Added later: hash of the user's backup code (for restoring a profile on a new phone)
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('recovery_hash')) db.exec('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_recovery ON users(recovery_hash)');
  return db;
}

module.exports = { openDb };
