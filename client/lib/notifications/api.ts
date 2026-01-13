const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function getVapidPublicKey(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/vapid-public-key`);
  const data = await response.json();
  return data.publicKey;
}

export async function subscribeToNotifications(subscription: PushSubscription): Promise<{ success: boolean; subscriptionId?: number }> {
  const response = await fetch(`${API_BASE}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });
  return response.json();
}

export async function unsubscribeFromNotifications(endpoint: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/api/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  return response.json();
}

export async function scheduleNotification(
  subscriptionEndpoint: string,
  eventId: string,
  eventLabel: string,
  scheduledTime: string
): Promise<{ success: boolean; notificationId?: number }> {
  const response = await fetch(`${API_BASE}/api/schedule-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscriptionEndpoint,
      eventId,
      eventLabel,
      scheduledTime,
    }),
  });
  return response.json();
}

export async function cancelNotification(
  subscriptionEndpoint: string,
  eventId: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/api/cancel-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscriptionEndpoint,
      eventId,
    }),
  });
  return response.json();
}

export async function getScheduledNotifications(
  endpoint: string
): Promise<{ notifications: Array<{ event_id: string; event_label: string; scheduled_time: string }> }> {
  const response = await fetch(
    `${API_BASE}/api/scheduled-notifications?endpoint=${encodeURIComponent(endpoint)}`
  );
  return response.json();
}

// Convert base64 URL-safe string to Uint8Array
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============ History API ============

export interface DailyRecord {
  id?: number;
  date: string;
  arrivalHour: number;
  arrivalMinute: number;
  hasDinner: boolean;
  hasLaundry: boolean;
  studyMinutes: number;
  totalFreeTime: number;
  schedule: ScheduleEvent[];
  completedTasks: string[];
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleEvent {
  id: string;
  time: number;
  duration: number;
  label: string;
  type: 'marker' | 'task' | 'free';
}

export interface Analytics {
  totalDays: number;
  avgFreeTime: number;
  avgStudyTime: number;
  avgArrivalTime: string;
  dinnerRate: number;
  laundryRate: number;
  taskCompletionStats: Record<string, number>;
  weeklyTrend: Array<{ startDate: string; avgFreeTime: number; avgStudyTime: number }>;
  dailyFreeTime: Array<{ date: string; freeTime: number }>;
  dailyStudyTime: Array<{ date: string; studyTime: number }>;
}

export async function saveRecord(record: Omit<DailyRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/api/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  return response.json();
}

export async function getRecord(date: string): Promise<{ record: DailyRecord | null }> {
  const response = await fetch(`${API_BASE}/api/records/${date}`);
  return response.json();
}

export async function getRecords(options?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{ records: DailyRecord[] }> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append('startDate', options.startDate);
  if (options?.endDate) params.append('endDate', options.endDate);
  if (options?.limit) params.append('limit', options.limit.toString());

  const response = await fetch(`${API_BASE}/api/records?${params.toString()}`);
  return response.json();
}

export async function deleteRecord(date: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/api/records/${date}`, {
    method: 'DELETE',
  });
  return response.json();
}

export async function getAnalytics(days: number = 30): Promise<{ analytics: Analytics }> {
  const response = await fetch(`${API_BASE}/api/analytics?days=${days}`);
  return response.json();
}
