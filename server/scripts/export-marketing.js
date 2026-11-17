// Prints a CSV of users who agreed to marketing emails, for importing into an email tool
// (Mailchimp, Brevo, AWS SES, ...). Only opted-in users are included.
//
//   npm run export-emails > subscribers.csv
//   docker compose exec api node scripts/export-marketing.js > subscribers.csv
const path = require('node:path');
const { openDb } = require('../src/db');

const db = openDb(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'fittrack.db'));
const rows = db
  .prepare(
    `SELECT name, email, age, sex, marketing_opt_in_at AS opted_in_at
     FROM users WHERE marketing_opt_in = 1 AND email IS NOT NULL ORDER BY marketing_opt_in_at`
  )
  .all();

const csv = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
console.log('name,email,age,sex,opted_in_at');
for (const r of rows) console.log([r.name, r.email, r.age, r.sex, r.opted_in_at].map(csv).join(','));
console.error(`${rows.length} subscriber(s)`);
