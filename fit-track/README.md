# FitTrack

A simple Expo (React Native) fitness app with five tabs (Today, Walk, BMI, Calories, Friends):

- **Today**: steps (motion sensor or added by hand) with a daily goal and the last 7 days, plus:
  - **Water**: tap to add glasses (250 ml each) towards a daily goal.
  - **Streaks and badges**: days in a row hitting your step goal, and 11 badges to unlock. Badges stay earned even if you change a goal later.
  - **Evening reminder**: a notification at 6–9 pm if you're short of your step goal.
- **Activity**: choose 🚶 Walk, 🏃 Run or 🚴 Cycle and press Start. A map draws your route live, with distance, time and pace (speed in km/h for cycling). Pause and resume, then Finish to open a summary page with total distance, time taken and calories burned, plus average pace and speed. Past activities are listed with their routes. Routes stay on your phone and are never sent to the server.
- **BMI**: height and weight in metric (default) or imperial, with the BMI category and a healthy weight range. Includes a **weight log** with a chart; your latest logged weight is used for BMI and calories.
- **Calories**: BMR and TDEE using the Mifflin-St Jeor formula, plus daily targets to lose, maintain or gain weight.
- **Friends**: join with a display name, share your friend code, add friends by their code, and compare steps on a leaderboard (today or the last 7 days) with a group total.
  - **Weekly group challenge**: a shared step goal for you and your friends (25k–200k, Monday to Sunday) with a progress bar.
  - **Backup code**: create one so you can restore your profile, friend code and friends on a new phone.

**Look and feel:** a sporty design with an orange-to-pink gradient, progress rings (daily steps, each day of the week, water, the group challenge) and rounded cards. Tap the 🌓 button in the top-right corner to choose **Auto** (follows your phone), **Light** or **Dark**.

Steps, goal and body measurements are saved on the phone (AsyncStorage). The Friends tab needs the FitTrack server in [`../server`](../server/README.md); only your daily step totals and display name are sent to it.

## Open it on your phone

1. Start the server (needed only for the Friends tab). In the `server` folder:
   ```bash
   docker compose up -d --build
   ```
2. Install **Expo Go** from the Play Store (Android) or App Store (iPhone).
3. Connect your phone and computer to the **same Wi-Fi**.
4. In this folder run:
   ```bash
   npm start
   ```
5. Scan the QR code in the terminal: on Android with Expo Go's scanner, on iPhone with the Camera app.
6. When asked, allow **Physical activity** (Android) or **Motion & Fitness** (iPhone) so steps can be counted.

The app finds the server automatically: it uses port 4000 on the same computer that's running `npm start`. If your computer's firewall asks, allow incoming connections for Docker/Node.

If the QR code won't connect (some networks block it), run `npx expo start --tunnel` instead. In tunnel mode the app can't find the server by itself, so also set its address, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start --tunnel` (use your computer's Wi-Fi IP address).

Once the server is online (see the server README), start the app with `EXPO_PUBLIC_API_URL=https://your-domain npm start` so friends anywhere can use it.

To preview in a browser on your computer: `npm run web` (the step sensor isn't available there, so use manual entry).

## How reminders work

Reminders are local notifications, scheduled on the phone (no server needed). A scheduled notification can't check your steps at the moment it fires, so today's reminder says exactly how many steps you're short and is cancelled once you hit your goal. The next six evenings get a general "have you hit your goal?" reminder. Every time the app opens or your steps change, they're rebuilt with fresh numbers. Reminders don't work in the browser version.

## How activity tracking works

- Uses GPS, so it works best outdoors. Keep FitTrack open during the activity; the screen stays on during tracking.
- Tracking with the screen locked or the app in the background isn't supported in Expo Go. It would need a full app build with background location.
- Readings with poor accuracy, tiny jiggles while standing still, and impossible jumps (over about 43 km/h on foot, or 90 km/h on a bike) are ignored, so the distance doesn't drift.
- Calories are estimates: walking about 0.75 kcal and running about 1.0 kcal per kg of body weight per km; cycling uses your average speed and time (MET values from 4 for an easy ride to 12 for racing pace).
- The map shows on phones only. On the web version (for testing on a computer) you see a simple drawing of the route instead.

## How step counting works

- **iPhone**: reads the step count iOS already records, so it includes steps taken while the app was closed (up to 7 days back).
- **Android**: counts steps only **while the app is open**. Expo's pedometer can't read past steps on Android; that would need Google Health Connect.
- If there's no sensor or you refuse permission, the app says so and you add steps by hand.

## Files

- `App.js`: tab layout
- `src/screens/`: Steps, BMI, Calories and Friends screens
- `src/api.js`: talks to the FitTrack server; steps upload automatically a couple of seconds after they change
- `src/ui.js`: the theme (light and dark colours), progress ring and shared buttons, cards and inputs
- `src/calc.js`: all the formulas (BMI, Mifflin-St Jeor, step distance)
- `src/geo.js`: route maths (GPS distance, filtering, pace, walk calories)
- `src/achievements.js`: streaks, badges, weekly challenge and weight-chart maths
- `src/reminders.js`: evening step reminders
- `src/components/`: the map, Today-tab cards and weight log
- `src/components/RouteMap.js`: the map (`RouteMap.web.js` is the browser version)
- `src/storage.js`: saving to the phone
- `tests/`: formula and route-maths tests, run with `npm test`
