# GoalDay Planner

A lightweight web app that:

1. Accepts your daily report (wake/sleep window + busy slots).
2. Analyses your day to find free time.
3. Splits a large goal into focused sessions.
4. Pushes personalized reminders into Google Calendar.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Google Calendar integration

Create a `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_CALENDAR_ID=primary
PORT=3000
```

If credentials are not configured, the app runs in **dry-run mode** and still shows generated tasks without creating calendar events.

## Input format for busy slots

Use one busy block per line:

```text
09:00-10:00 | Standup
11:30-12:30 | Workout
14:00-15:30 | Deep work
```
