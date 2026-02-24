const planDateInput = document.getElementById('planDate');
const goalDeadlineInput = document.getElementById('goalDeadline');
const analysisOutput = document.getElementById('analysisOutput');
const tasksList = document.getElementById('tasksList');
const syncBtn = document.getElementById('syncBtn');

const today = new Date().toISOString().slice(0, 10);
planDateInput.value = today;
goalDeadlineInput.value = today;

let generatedEvents = [];

function parseMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function toDateISO(date, minutes) {
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(minutes);
  return d.toISOString();
}

function parseBusySlots(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [timeRange, label = 'Busy'] = line.split('|').map((part) => part.trim());
      const [start, end] = timeRange.split('-').map((part) => part.trim());
      return {
        title: label,
        startMin: parseMinutes(start),
        endMin: parseMinutes(end)
      };
    })
    .filter((slot) => Number.isFinite(slot.startMin) && Number.isFinite(slot.endMin) && slot.endMin > slot.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

function getFreeSlots(dayStart, dayEnd, busySlots) {
  const freeSlots = [];
  let cursor = dayStart;

  for (const slot of busySlots) {
    if (slot.startMin > cursor) {
      freeSlots.push({ startMin: cursor, endMin: Math.min(slot.startMin, dayEnd) });
    }
    cursor = Math.max(cursor, slot.endMin);
    if (cursor >= dayEnd) break;
  }

  if (cursor < dayEnd) {
    freeSlots.push({ startMin: cursor, endMin: dayEnd });
  }

  return freeSlots.filter((slot) => slot.endMin - slot.startMin >= 15);
}

function splitGoalIntoSessions(totalHours, sessionLength, freeSlots, metadata) {
  let remainingMinutes = totalHours * 60;
  const sessions = [];
  let index = 1;

  for (const slot of freeSlots) {
    let slotCursor = slot.startMin;
    while (remainingMinutes > 0 && slotCursor + 15 <= slot.endMin) {
      const duration = Math.min(sessionLength, remainingMinutes, slot.endMin - slotCursor);
      if (duration < 15) break;
      const sessionStart = slotCursor;
      const sessionEnd = slotCursor + duration;
      sessions.push({
        title: `${metadata.goalTitle} — Session ${index}`,
        description: `Auto-planned from day report. Goal deadline: ${metadata.deadline}.`,
        start: toDateISO(metadata.date, sessionStart),
        end: toDateISO(metadata.date, sessionEnd),
        reminderMinutes: 30,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      remainingMinutes -= duration;
      slotCursor = sessionEnd;
      index += 1;
    }

    if (remainingMinutes <= 0) break;
  }

  return { sessions, remainingMinutes };
}

function renderTasks(tasks) {
  tasksList.innerHTML = '';

  if (tasks.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No tasks could fit your available time. Adjust your day report or session length.';
    tasksList.appendChild(item);
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement('li');
    const start = new Date(task.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const end = new Date(task.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.textContent = `${task.title}: ${start} - ${end}`;
    tasksList.appendChild(item);
  });
}

document.getElementById('analyseBtn').addEventListener('click', () => {
  const wakeTime = document.getElementById('wakeTime').value;
  const sleepTime = document.getElementById('sleepTime').value;
  const goalTitle = document.getElementById('goalTitle').value.trim();
  const goalDeadline = goalDeadlineInput.value;
  const goalHours = Number(document.getElementById('goalHours').value);
  const sessionLength = Number(document.getElementById('sessionLength').value);
  const dayDate = planDateInput.value;
  const busySlotsRaw = document.getElementById('busySlots').value;

  if (!wakeTime || !sleepTime || !goalTitle || !goalDeadline || !goalHours || !sessionLength || !dayDate) {
    analysisOutput.textContent = 'Please complete all fields.';
    return;
  }

  const dayStart = parseMinutes(wakeTime);
  const dayEnd = parseMinutes(sleepTime);
  const busySlots = parseBusySlots(busySlotsRaw);
  const freeSlots = getFreeSlots(dayStart, dayEnd, busySlots);

  const { sessions, remainingMinutes } = splitGoalIntoSessions(goalHours, sessionLength, freeSlots, {
    goalTitle,
    deadline: goalDeadline,
    date: dayDate
  });

  generatedEvents = sessions;
  syncBtn.disabled = sessions.length === 0;

  const freeMinutes = freeSlots.reduce((sum, slot) => sum + (slot.endMin - slot.startMin), 0);
  const report = [
    `Busy blocks captured: ${busySlots.length}`,
    `Free slots discovered: ${freeSlots.length}`,
    `Total free time: ${(freeMinutes / 60).toFixed(1)} hours`,
    `Goal effort requested: ${goalHours} hours`,
    `Goal effort scheduled: ${((goalHours * 60 - remainingMinutes) / 60).toFixed(1)} hours`,
    remainingMinutes > 0
      ? `⚠️ Still unscheduled: ${(remainingMinutes / 60).toFixed(1)} hours. Consider extending your day range or reducing session length.`
      : '✅ Full goal workload scheduled for today.'
  ];

  analysisOutput.textContent = report.join('\n');
  renderTasks(sessions);
});

syncBtn.addEventListener('click', async () => {
  if (!generatedEvents.length) return;

  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';

  try {
    const response = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: generatedEvents })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.details || result.error || 'Failed to sync events.');
    }

    if (result.mode === 'dry-run') {
      analysisOutput.textContent += '\n\nGoogle Calendar credentials are missing, so this was a dry run.';
    } else {
      analysisOutput.textContent += `\n\n✅ Synced ${result.insertedEvents.length} reminders to Google Calendar.`;
    }
  } catch (error) {
    analysisOutput.textContent += `\n\n❌ Sync failed: ${error.message}`;
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Send reminders to Google Calendar';
  }
});
