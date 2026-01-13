const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const initSqlJs = require('sql.js');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/out')));
}

// Database
let db;
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'planner.db');

async function initDatabase() {
  const SQL = await initSqlJs();

  // Try to load existing database
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('Created new database');
    }
  } catch (error) {
    console.error('Error loading database:', error);
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      notified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vapid_keys (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL
    )
  `);

  // History records table
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      arrival_hour INTEGER NOT NULL,
      arrival_minute INTEGER NOT NULL,
      has_dinner INTEGER NOT NULL,
      has_laundry INTEGER NOT NULL,
      study_minutes INTEGER NOT NULL,
      total_free_time INTEGER NOT NULL,
      schedule_json TEXT NOT NULL,
      completed_tasks TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  saveDatabase();
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Generate or retrieve VAPID keys
function getVapidKeys() {
  const result = db.exec('SELECT * FROM vapid_keys WHERE id = 1');
  if (result.length > 0 && result[0].values.length > 0) {
    const row = result[0].values[0];
    return { publicKey: row[1], privateKey: row[2] };
  }

  const vapidKeys = webpush.generateVAPIDKeys();
  db.run('INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, ?, ?)',
    [vapidKeys.publicKey, vapidKeys.privateKey]);
  saveDatabase();

  return vapidKeys;
}

// API Routes
app.get('/api/vapid-public-key', (req, res) => {
  const vapidKeys = getVapidKeys();
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/subscribe', (req, res) => {
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  try {
    // Check if subscription exists
    const existing = db.exec('SELECT id FROM subscriptions WHERE endpoint = ?', [subscription.endpoint]);

    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update existing
      db.run('UPDATE subscriptions SET keys_p256dh = ?, keys_auth = ? WHERE endpoint = ?',
        [subscription.keys.p256dh, subscription.keys.auth, subscription.endpoint]);
    } else {
      // Insert new
      db.run('INSERT INTO subscriptions (endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?)',
        [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
    }

    saveDatabase();

    const result = db.exec('SELECT id FROM subscriptions WHERE endpoint = ?', [subscription.endpoint]);
    const subscriptionId = result[0].values[0][0];

    res.json({ success: true, subscriptionId });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;

  try {
    db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint]);
    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

app.post('/api/schedule-notification', (req, res) => {
  const { subscriptionEndpoint, eventId, eventLabel, scheduledTime } = req.body;

  if (!subscriptionEndpoint || !eventId || !eventLabel || !scheduledTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const subResult = db.exec('SELECT id FROM subscriptions WHERE endpoint = ?', [subscriptionEndpoint]);

    if (subResult.length === 0 || subResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscriptionId = subResult[0].values[0][0];

    // Remove existing notification for this event
    db.run('DELETE FROM scheduled_notifications WHERE subscription_id = ? AND event_id = ?',
      [subscriptionId, eventId]);

    // Add new notification
    db.run('INSERT INTO scheduled_notifications (subscription_id, event_id, event_label, scheduled_time) VALUES (?, ?, ?, ?)',
      [subscriptionId, eventId, eventLabel, scheduledTime]);

    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid()');
    const notificationId = result[0].values[0][0];

    res.json({ success: true, notificationId });
  } catch (error) {
    console.error('Schedule notification error:', error);
    res.status(500).json({ error: 'Failed to schedule notification' });
  }
});

app.post('/api/cancel-notification', (req, res) => {
  const { subscriptionEndpoint, eventId } = req.body;

  try {
    const subResult = db.exec('SELECT id FROM subscriptions WHERE endpoint = ?', [subscriptionEndpoint]);

    if (subResult.length === 0 || subResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscriptionId = subResult[0].values[0][0];

    db.run('DELETE FROM scheduled_notifications WHERE subscription_id = ? AND event_id = ?',
      [subscriptionId, eventId]);
    saveDatabase();

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel notification error:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

app.get('/api/scheduled-notifications', (req, res) => {
  const { endpoint } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  try {
    const subResult = db.exec('SELECT id FROM subscriptions WHERE endpoint = ?', [endpoint]);

    if (subResult.length === 0 || subResult[0].values.length === 0) {
      return res.json({ notifications: [] });
    }

    const subscriptionId = subResult[0].values[0][0];

    const result = db.exec(`
      SELECT event_id, event_label, scheduled_time
      FROM scheduled_notifications
      WHERE subscription_id = ? AND notified = 0
    `, [subscriptionId]);

    const notifications = result.length > 0 ? result[0].values.map(row => ({
      event_id: row[0],
      event_label: row[1],
      scheduled_time: row[2]
    })) : [];

    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Send push notification
async function sendPushNotification(subscription, payload) {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys_p256dh,
      auth: subscription.keys_auth
    }
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Push notification error:', error);
    if (error.statusCode === 410) {
      db.run('DELETE FROM subscriptions WHERE id = ?', [subscription.id]);
      saveDatabase();
    }
    return false;
  }
}

// Check and send scheduled notifications every minute
cron.schedule('* * * * *', async () => {
  if (!db) return;

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  console.log(`[${now.toISOString()}] Checking notifications for ${currentTime}`);

  const result = db.exec(`
    SELECT sn.id, sn.event_id, sn.event_label, s.id as sub_id, s.endpoint, s.keys_p256dh, s.keys_auth
    FROM scheduled_notifications sn
    JOIN subscriptions s ON sn.subscription_id = s.id
    WHERE sn.scheduled_time = ? AND sn.notified = 0
  `, [currentTime]);

  if (result.length === 0 || result[0].values.length === 0) return;

  const vapidKeys = getVapidKeys();
  webpush.setVapidDetails(
    'mailto:planner@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  for (const row of result[0].values) {
    const notification = {
      id: row[0],
      event_id: row[1],
      event_label: row[2],
      sub_id: row[3],
      endpoint: row[4],
      keys_p256dh: row[5],
      keys_auth: row[6]
    };

    const payload = {
      title: 'Weekday Planner',
      body: `${notification.event_label}の時間です`,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: notification.event_id,
      data: {
        eventId: notification.event_id,
        url: '/'
      }
    };

    const success = await sendPushNotification({
      id: notification.sub_id,
      endpoint: notification.endpoint,
      keys_p256dh: notification.keys_p256dh,
      keys_auth: notification.keys_auth
    }, payload);

    if (success) {
      db.run('UPDATE scheduled_notifications SET notified = 1 WHERE id = ?', [notification.id]);
      saveDatabase();
      console.log(`Sent notification for ${notification.event_label}`);
    }
  }

  // Clean up old notifications
  db.run(`DELETE FROM scheduled_notifications WHERE notified = 1 AND created_at < datetime('now', '-1 day')`);
  saveDatabase();
});

// ============ History API ============

// Save or update daily record
app.post('/api/records', (req, res) => {
  const { date, arrivalHour, arrivalMinute, hasDinner, hasLaundry, studyMinutes, totalFreeTime, schedule, completedTasks, notes } = req.body;

  if (!date || arrivalHour === undefined || arrivalMinute === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const existing = db.exec('SELECT id FROM daily_records WHERE date = ?', [date]);

    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run(`
        UPDATE daily_records
        SET arrival_hour = ?, arrival_minute = ?, has_dinner = ?, has_laundry = ?,
            study_minutes = ?, total_free_time = ?, schedule_json = ?,
            completed_tasks = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE date = ?
      `, [arrivalHour, arrivalMinute, hasDinner ? 1 : 0, hasLaundry ? 1 : 0,
          studyMinutes, totalFreeTime, JSON.stringify(schedule),
          JSON.stringify(completedTasks || []), notes || '', date]);
    } else {
      db.run(`
        INSERT INTO daily_records (date, arrival_hour, arrival_minute, has_dinner, has_laundry,
                                   study_minutes, total_free_time, schedule_json, completed_tasks, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [date, arrivalHour, arrivalMinute, hasDinner ? 1 : 0, hasLaundry ? 1 : 0,
          studyMinutes, totalFreeTime, JSON.stringify(schedule),
          JSON.stringify(completedTasks || []), notes || '']);
    }

    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    console.error('Save record error:', error);
    res.status(500).json({ error: 'Failed to save record' });
  }
});

// Get record by date
app.get('/api/records/:date', (req, res) => {
  const { date } = req.params;

  try {
    const result = db.exec('SELECT * FROM daily_records WHERE date = ?', [date]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ record: null });
    }

    const row = result[0].values[0];
    const record = {
      id: row[0],
      date: row[1],
      arrivalHour: row[2],
      arrivalMinute: row[3],
      hasDinner: row[4] === 1,
      hasLaundry: row[5] === 1,
      studyMinutes: row[6],
      totalFreeTime: row[7],
      schedule: JSON.parse(row[8]),
      completedTasks: JSON.parse(row[9] || '[]'),
      notes: row[10] || '',
      createdAt: row[11],
      updatedAt: row[12]
    };

    res.json({ record });
  } catch (error) {
    console.error('Get record error:', error);
    res.status(500).json({ error: 'Failed to get record' });
  }
});

// Get records for a date range
app.get('/api/records', (req, res) => {
  const { startDate, endDate, limit } = req.query;

  try {
    let query = 'SELECT * FROM daily_records';
    const params = [];

    if (startDate && endDate) {
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' WHERE date >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' WHERE date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY date DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    }

    const result = db.exec(query, params);

    const records = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      date: row[1],
      arrivalHour: row[2],
      arrivalMinute: row[3],
      hasDinner: row[4] === 1,
      hasLaundry: row[5] === 1,
      studyMinutes: row[6],
      totalFreeTime: row[7],
      schedule: JSON.parse(row[8]),
      completedTasks: JSON.parse(row[9] || '[]'),
      notes: row[10] || '',
      createdAt: row[11],
      updatedAt: row[12]
    })) : [];

    res.json({ records });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Failed to get records' });
  }
});

// Delete record
app.delete('/api/records/:date', (req, res) => {
  const { date } = req.params;

  try {
    db.run('DELETE FROM daily_records WHERE date = ?', [date]);
    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Analytics API
app.get('/api/analytics', (req, res) => {
  const { days = 30 } = req.query;

  try {
    const result = db.exec(`
      SELECT * FROM daily_records
      WHERE date >= date('now', '-${parseInt(days)} days')
      ORDER BY date ASC
    `);

    const records = result.length > 0 ? result[0].values.map(row => ({
      date: row[1],
      arrivalHour: row[2],
      arrivalMinute: row[3],
      hasDinner: row[4] === 1,
      hasLaundry: row[5] === 1,
      studyMinutes: row[6],
      totalFreeTime: row[7],
      completedTasks: JSON.parse(row[9] || '[]')
    })) : [];

    // Calculate analytics
    const totalDays = records.length;
    const avgFreeTime = totalDays > 0
      ? Math.round(records.reduce((sum, r) => sum + r.totalFreeTime, 0) / totalDays)
      : 0;
    const avgStudyTime = totalDays > 0
      ? Math.round(records.reduce((sum, r) => sum + r.studyMinutes, 0) / totalDays)
      : 0;
    const dinnerDays = records.filter(r => r.hasDinner).length;
    const laundryDays = records.filter(r => r.hasLaundry).length;

    // Task completion stats
    const allCompletedTasks = records.flatMap(r => r.completedTasks);
    const taskCounts = {};
    allCompletedTasks.forEach(task => {
      taskCounts[task] = (taskCounts[task] || 0) + 1;
    });

    // Average arrival time
    const avgArrivalMinutes = totalDays > 0
      ? Math.round(records.reduce((sum, r) => sum + r.arrivalHour * 60 + r.arrivalMinute, 0) / totalDays)
      : 19 * 60;
    const avgArrivalHour = Math.floor(avgArrivalMinutes / 60);
    const avgArrivalMinute = avgArrivalMinutes % 60;

    // Free time trend (weekly)
    const weeklyData = [];
    for (let i = 0; i < records.length; i += 7) {
      const weekRecords = records.slice(i, i + 7);
      if (weekRecords.length > 0) {
        weeklyData.push({
          startDate: weekRecords[0].date,
          avgFreeTime: Math.round(weekRecords.reduce((sum, r) => sum + r.totalFreeTime, 0) / weekRecords.length),
          avgStudyTime: Math.round(weekRecords.reduce((sum, r) => sum + r.studyMinutes, 0) / weekRecords.length)
        });
      }
    }

    res.json({
      analytics: {
        totalDays,
        avgFreeTime,
        avgStudyTime,
        avgArrivalTime: `${avgArrivalHour}:${avgArrivalMinute.toString().padStart(2, '0')}`,
        dinnerRate: totalDays > 0 ? Math.round(dinnerDays / totalDays * 100) : 0,
        laundryRate: totalDays > 0 ? Math.round(laundryDays / totalDays * 100) : 0,
        taskCompletionStats: taskCounts,
        weeklyTrend: weeklyData,
        dailyFreeTime: records.map(r => ({ date: r.date, freeTime: r.totalFreeTime })),
        dailyStudyTime: records.map(r => ({ date: r.date, studyTime: r.studyMinutes }))
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client in production - catch-all for SPA
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../client/out/index.html'));
  });
}

// Start server
initDatabase().then(() => {
  const vapidKeys = getVapidKeys();
  webpush.setVapidDetails(
    'mailto:planner@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('VAPID Public Key:', vapidKeys.publicKey);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, saving database...');
  if (db) {
    saveDatabase();
    db.close();
  }
  process.exit(0);
});
