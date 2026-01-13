const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://wwxtkfditekjjcrhydsl.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3eHRrZmRpdGVrampjcmh5ZHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMDQyODEsImV4cCI6MjA4Mzg4MDI4MX0.d-ehZ4BaX8u3XIrqWemoPv28Qy73Or1Wp-u9sL_qv8w';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files in production with correct MIME types
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/out'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
    }
  }));
}

// Generate or retrieve VAPID keys
async function getVapidKeys() {
  const { data, error } = await supabase
    .from('vapid_keys')
    .select('*')
    .eq('id', 1)
    .single();

  if (data) {
    return { publicKey: data.public_key, privateKey: data.private_key };
  }

  // Generate new keys
  const vapidKeys = webpush.generateVAPIDKeys();
  await supabase
    .from('vapid_keys')
    .insert({ id: 1, public_key: vapidKeys.publicKey, private_key: vapidKeys.privateKey });

  return vapidKeys;
}

// API Routes
app.get('/api/vapid-public-key', async (req, res) => {
  try {
    const vapidKeys = await getVapidKeys();
    res.json({ publicKey: vapidKeys.publicKey });
  } catch (error) {
    console.error('Get VAPID key error:', error);
    res.status(500).json({ error: 'Failed to get VAPID key' });
  }
});

app.post('/api/subscribe', async (req, res) => {
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  try {
    // Check if subscription exists
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('endpoint', subscription.endpoint)
      .single();

    if (existing) {
      // Update existing
      await supabase
        .from('subscriptions')
        .update({ keys_p256dh: subscription.keys.p256dh, keys_auth: subscription.keys.auth })
        .eq('endpoint', subscription.endpoint);
      res.json({ success: true, subscriptionId: existing.id });
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          endpoint: subscription.endpoint,
          keys_p256dh: subscription.keys.p256dh,
          keys_auth: subscription.keys.auth
        })
        .select('id')
        .single();

      if (error) throw error;
      res.json({ success: true, subscriptionId: data.id });
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/api/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;

  try {
    await supabase.from('subscriptions').delete().eq('endpoint', endpoint);
    res.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

app.post('/api/schedule-notification', async (req, res) => {
  const { subscriptionEndpoint, eventId, eventLabel, scheduledTime } = req.body;

  if (!subscriptionEndpoint || !eventId || !eventLabel || !scheduledTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('endpoint', subscriptionEndpoint)
      .single();

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Remove existing notification for this event
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('subscription_id', sub.id)
      .eq('event_id', eventId);

    // Add new notification
    const { data, error } = await supabase
      .from('scheduled_notifications')
      .insert({
        subscription_id: sub.id,
        event_id: eventId,
        event_label: eventLabel,
        scheduled_time: scheduledTime
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, notificationId: data.id });
  } catch (error) {
    console.error('Schedule notification error:', error);
    res.status(500).json({ error: 'Failed to schedule notification' });
  }
});

app.post('/api/cancel-notification', async (req, res) => {
  const { subscriptionEndpoint, eventId } = req.body;

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('endpoint', subscriptionEndpoint)
      .single();

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('subscription_id', sub.id)
      .eq('event_id', eventId);

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel notification error:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

app.get('/api/scheduled-notifications', async (req, res) => {
  const { endpoint } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .single();

    if (!sub) {
      return res.json({ notifications: [] });
    }

    const { data: notifications } = await supabase
      .from('scheduled_notifications')
      .select('event_id, event_label, scheduled_time')
      .eq('subscription_id', sub.id)
      .eq('notified', false);

    res.json({
      notifications: (notifications || []).map(n => ({
        event_id: n.event_id,
        event_label: n.event_label,
        scheduled_time: n.scheduled_time
      }))
    });
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
      await supabase.from('subscriptions').delete().eq('id', subscription.id);
    }
    return false;
  }
}

// Check and send scheduled notifications every minute
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  console.log(`[${now.toISOString()}] Checking notifications for ${currentTime}`);

  try {
    const { data: notifications } = await supabase
      .from('scheduled_notifications')
      .select(`
        id, event_id, event_label,
        subscriptions (id, endpoint, keys_p256dh, keys_auth)
      `)
      .eq('scheduled_time', currentTime)
      .eq('notified', false);

    if (!notifications || notifications.length === 0) return;

    const vapidKeys = await getVapidKeys();
    webpush.setVapidDetails(
      'mailto:planner@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );

    for (const notification of notifications) {
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

      const success = await sendPushNotification(notification.subscriptions, payload);

      if (success) {
        await supabase
          .from('scheduled_notifications')
          .update({ notified: true })
          .eq('id', notification.id);
        console.log(`Sent notification for ${notification.event_label}`);
      }
    }

    // Clean up old notifications
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('notified', true)
      .lt('created_at', yesterday);
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

// ============ History API ============

// Save or update daily record
app.post('/api/records', async (req, res) => {
  const { date, arrivalHour, arrivalMinute, hasDinner, hasLaundry, studyMinutes, totalFreeTime, schedule, completedTasks, notes } = req.body;

  if (!date || arrivalHour === undefined || arrivalMinute === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data: existing } = await supabase
      .from('daily_records')
      .select('id')
      .eq('date', date)
      .single();

    if (existing) {
      await supabase
        .from('daily_records')
        .update({
          arrival_hour: arrivalHour,
          arrival_minute: arrivalMinute,
          has_dinner: hasDinner,
          has_laundry: hasLaundry,
          study_minutes: studyMinutes,
          total_free_time: totalFreeTime,
          schedule_json: schedule,
          completed_tasks: completedTasks || [],
          notes: notes || '',
          updated_at: new Date().toISOString()
        })
        .eq('date', date);
    } else {
      await supabase
        .from('daily_records')
        .insert({
          date,
          arrival_hour: arrivalHour,
          arrival_minute: arrivalMinute,
          has_dinner: hasDinner,
          has_laundry: hasLaundry,
          study_minutes: studyMinutes,
          total_free_time: totalFreeTime,
          schedule_json: schedule,
          completed_tasks: completedTasks || [],
          notes: notes || ''
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save record error:', error);
    res.status(500).json({ error: 'Failed to save record' });
  }
});

// Get record by date
app.get('/api/records/:date', async (req, res) => {
  const { date } = req.params;

  try {
    const { data, error } = await supabase
      .from('daily_records')
      .select('*')
      .eq('date', date)
      .single();

    if (!data) {
      return res.json({ record: null });
    }

    res.json({
      record: {
        id: data.id,
        date: data.date,
        arrivalHour: data.arrival_hour,
        arrivalMinute: data.arrival_minute,
        hasDinner: data.has_dinner,
        hasLaundry: data.has_laundry,
        studyMinutes: data.study_minutes,
        totalFreeTime: data.total_free_time,
        schedule: data.schedule_json,
        completedTasks: data.completed_tasks || [],
        notes: data.notes || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }
    });
  } catch (error) {
    console.error('Get record error:', error);
    res.status(500).json({ error: 'Failed to get record' });
  }
});

// Get records for a date range
app.get('/api/records', async (req, res) => {
  const { startDate, endDate, limit } = req.query;

  try {
    let query = supabase.from('daily_records').select('*').order('date', { ascending: false });

    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    } else if (startDate) {
      query = query.gte('date', startDate);
    } else if (endDate) {
      query = query.lte('date', endDate);
    }

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const { data, error } = await query;

    const records = (data || []).map(row => ({
      id: row.id,
      date: row.date,
      arrivalHour: row.arrival_hour,
      arrivalMinute: row.arrival_minute,
      hasDinner: row.has_dinner,
      hasLaundry: row.has_laundry,
      studyMinutes: row.study_minutes,
      totalFreeTime: row.total_free_time,
      schedule: row.schedule_json,
      completedTasks: row.completed_tasks || [],
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ records });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Failed to get records' });
  }
});

// Delete record
app.delete('/api/records/:date', async (req, res) => {
  const { date } = req.params;

  try {
    await supabase.from('daily_records').delete().eq('date', date);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Analytics API
app.get('/api/analytics', async (req, res) => {
  const { days = 30 } = req.query;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data } = await supabase
      .from('daily_records')
      .select('*')
      .gte('date', startDateStr)
      .order('date', { ascending: true });

    const records = (data || []).map(row => ({
      date: row.date,
      arrivalHour: row.arrival_hour,
      arrivalMinute: row.arrival_minute,
      hasDinner: row.has_dinner,
      hasLaundry: row.has_laundry,
      studyMinutes: row.study_minutes,
      totalFreeTime: row.total_free_time,
      completedTasks: row.completed_tasks || []
    }));

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
async function startServer() {
  try {
    const vapidKeys = await getVapidKeys();
    webpush.setVapidDetails(
      'mailto:planner@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    console.log('VAPID Public Key:', vapidKeys.publicKey);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
