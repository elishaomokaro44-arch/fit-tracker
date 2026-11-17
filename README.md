# FitTrack

A fitness app for counting steps, working out BMI and daily calories, and competing with friends on a step leaderboard.

| Folder | What it is |
|---|---|
| [`fit-track/`](fit-track/README.md) | The phone app (Expo / React Native): Today (steps, water, streaks, badges, reminders), Activity (walk, run or cycle with a GPS route map and summary page), BMI (with weight log), Calories and Friends (leaderboard, weekly challenge, backup codes) tabs |
| [`server/`](server/README.md) | The API for friends and the leaderboard (Node.js, Express, SQLite, Docker) |

## Quick start

1. Start the server:
   ```bash
   cd server
   docker compose up -d --build
   ```
2. Start the app and scan the QR code with Expo Go (signed in to the same Expo account as the CLI):
   ```bash
   cd fit-track
   npm install
   npm start
   ```

## Tests

```bash
cd server && npm test
cd fit-track && npm test
```

GitHub Actions runs both test suites, builds the phone bundles and builds the Docker image on every push (see `.github/workflows/ci.yml`).
