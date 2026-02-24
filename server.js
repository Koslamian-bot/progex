const express = require('express');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }

  return oAuth2Client;
}

function buildReminderConfig(event) {
  const reminderMinutes = Number.isFinite(event.reminderMinutes) ? event.reminderMinutes : 30;
  return {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: reminderMinutes },
      { method: 'email', minutes: reminderMinutes }
    ]
  };
}

app.post('/api/calendar/sync', async (req, res) => {
  const { events = [] } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'No scheduled events provided.' });
  }

  const authClient = createOAuthClient();

  if (!authClient) {
    return res.status(200).json({
      mode: 'dry-run',
      message: 'Google credentials are not set. Returning payload only.',
      events
    });
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const insertedEvents = [];

    for (const event of events) {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: event.title,
          description: event.description,
          start: { dateTime: event.start, timeZone: event.timeZone || 'UTC' },
          end: { dateTime: event.end, timeZone: event.timeZone || 'UTC' },
          reminders: buildReminderConfig(event),
          colorId: '10'
        }
      });

      insertedEvents.push({
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary
      });
    }

    return res.status(200).json({ mode: 'live', insertedEvents });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to sync with Google Calendar.',
      details: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`GoalDay app running on http://localhost:${PORT}`);
});
