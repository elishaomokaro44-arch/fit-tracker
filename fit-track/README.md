# FitTrack

A simple Expo (React Native) fitness app with four tabs:

- **Steps**: counts steps with the phone's motion sensor, lets you add steps by hand, sets a daily goal, and shows the last 7 days.
- **BMI**: height and weight in metric (default) or imperial, with the BMI category and a healthy weight range.
- **Calories**: BMR and TDEE using the Mifflin-St Jeor formula, plus daily targets to lose, maintain or gain weight.
- **Friends**: join with a display name, share your friend code, add friends by their code, and compare steps on a leaderboard (today or the last 7 days) with a group total.

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

## How step counting works

- **iPhone**: reads the step count iOS already records, so it includes steps taken while the app was closed (up to 7 days back).
- **Android**: counts steps only **while the app is open**. Expo's pedometer can't read past steps on Android; that would need Google Health Connect.
- If there's no sensor or you refuse permission, the app says so and you add steps by hand.

## Files

- `App.js`: tab layout
- `src/screens/`: Steps, BMI, Calories and Friends screens
- `src/api.js`: talks to the FitTrack server; steps upload automatically a couple of seconds after they change
- `src/calc.js`: all the formulas (BMI, Mifflin-St Jeor, step distance)
- `src/storage.js`: saving to the phone
- `tests/calc.test.mjs`: formula tests, run with `npm test`
