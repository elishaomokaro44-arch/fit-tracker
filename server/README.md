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

- No passwords. Joining creates a profile and returns a long random token that the phone keeps. The server only stores a SHA-256 hash of it.
- Users can create a **backup code** (12 characters, shown once; only its hash is stored). Entering it on a new phone restores the profile, friend code and friends, and signs the old phone out. Making a new code replaces the old one. Restore attempts are limited to 10 per 15 minutes per IP address.
- Each profile gets a 6-character friend code. Adding a code makes the two people friends both ways straight away.
- Friends see each other's daily step totals. People who aren't friends see nothing.

## Endpoints

All except sign-up need `Authorization: Bearer <token>`.

| Method | Path                | Body / query                                   |
|--------|---------------------|------------------------------------------------|
| POST   | `/api/users`        | `{ "name": "Osaru" }` → `{ user, token }`      |
| GET    | `/api/me`           |                                                |
| PATCH  | `/api/me`           | `{ "name": "New name" }`                       |
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
