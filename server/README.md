# FitTrack API

A small Node.js + Express server that stores FitTrack profiles, friendships and daily step totals in SQLite (Node's built-in driver, so no database server is needed).

## Run it

With Docker (recommended):

```bash
docker compose up -d --build
```

The database is kept in the `fittrack-data` Docker volume, so it survives restarts and rebuilds. `docker compose down -v` deletes it.

Without Docker (Node 24+):

```bash
npm install
npm start
```

The API listens on port **4000**. Check it with `curl localhost:4000/health`.

Run the tests with `npm test`.

## Settings (environment variables)

| Variable  | Default               | Meaning                |
|-----------|-----------------------|------------------------|
| `PORT`    | `4000`                | Port to listen on      |
| `DB_FILE` | `data/fittrack.db`    | SQLite database file   |
| `TRUST_PROXY` | unset | Set to `1` behind a reverse proxy so rate limits see real client IPs |

## How accounts work

- **Sign up** with name, email, password, age, sex, height and weight. Passwords are hashed with scrypt (never stored or sent back). Emails are stored lower-case and must be unique.
- **Log in** on any number of phones; each gets its own session, so logging in on a new phone doesn't sign out the old one. Logging out ends only that phone's session.
- **Profiles from before accounts** (leaderboard name + friend code only) are upgraded in place when that phone signs up, keeping the friend code and friends.
- **Forgot password:** enter the email, the backup code and a new password. This signs out every phone.
- **Progress sync:** the app keeps a copy of its data (steps, water, weight log, activities with routes, badges, settings) in `user_data`. Phones download it, combine it with their own data, and upload the result.
- **Marketing emails are opt-in.** The consent time is stored in `marketing_opt_in_at` and cleared when someone opts out in the app.
- Sign-up, log-in and password-reset attempts are rate limited per IP address.
- Deleting an account removes the user, their sessions, friendships, steps and synced data.

## Exporting the email list

Only users who opted in are included:

```bash
docker compose exec api node scripts/export-marketing.js > subscribers.csv
```

(or `npm run export-emails > subscribers.csv` when running without Docker). The CSV has name, email, age, sex and the opt-in time, ready to import into an email tool such as Mailchimp, Brevo or AWS SES. Every email you send must include an unsubscribe link, and people who unsubscribe there should also be opted out in FitTrack.

## Endpoints

All except sign-up, log-in, password reset and restore need `Authorization: Bearer <token>`.

| Method | Path                | Body / query                                   |
|--------|---------------------|------------------------------------------------|
| POST   | `/api/auth/signup`  | `{ name, email, password, age, sex, heightCm, weightKg, marketingOptIn }` → `{ user, token }` |
| POST   | `/api/auth/login`   | `{ email, password }` → `{ user, token }` |
| POST   | `/api/auth/logout`  | Ends this phone's session |
| POST   | `/api/auth/reset`   | `{ email, backupCode, newPassword }` → `{ user, token }` |
| GET    | `/api/sync`         | → `{ data, updatedAt }` |
| PUT    | `/api/sync`         | `{ data: { ... } }` (up to 3 MB) |
| POST   | `/api/users`        | Older name-only sign-up, kept for compatibility |
| GET    | `/api/me`           |                                                |
| PATCH  | `/api/me`           | Any of `name, age, sex, heightCm, weightKg, marketingOptIn` |
| DELETE | `/api/me`           | Deletes the profile, its steps and friendships |
| PUT    | `/api/steps`        | `{ "days": { "2026-11-17": 4500 } }` (≤31 days) |
| POST   | `/api/friends`      | `{ "code": "K7P2QX" }`                         |
| DELETE | `/api/friends/:id`  |                                                |
| POST   | `/api/me/backup-code` | Creates or replaces the backup code → `{ backupCode }` |
| POST   | `/api/recover`      | `{ "code": "XXXX-XXXX-XXXX" }` → `{ user, token }` (no token needed) |
| GET    | `/api/leaderboard`  | `?period=today|week|thisweek&day=YYYY-MM-DD` (`week` = last 7 days, `thisweek` = Monday to `day`) |

`day` is the phone's local date, so people in different time zones each get their own "today".

## Putting it online (so friends can use it)

While testing, the app talks to the server on your computer over Wi-Fi. For friends elsewhere, the server has to be on the internet with **HTTPS**:

1. Run the container on a host such as AWS (Lightsail or an EC2 instance with Docker), Render or Fly.io.
2. Put HTTPS in front of it, e.g. Caddy or an AWS load balancer with a certificate.
3. Back up the database volume (it's one SQLite file).
4. Build the app with `EXPO_PUBLIC_API_URL=https://your-domain` (see the app README).

Before a public launch, consider adding rate limiting to sign-up and adding friends too (backup-code restore is already limited).
