'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Home,
  UtensilsCrossed,
  Bath,
  Shirt,
  BookOpen,
  Moon,
  Sparkles,
  Clock,
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  ChevronDown,
  Check,
  Loader2,
  Calendar,
  History,
  BarChart3,
  Save,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  scheduleNotification,
  cancelNotification,
  getScheduledNotifications,
  saveRecord,
  getRecord,
  getRecords,
  deleteRecord,
  getAnalytics,
  type DailyRecord,
  type Analytics,
} from '@/lib/notifications/api';
import {
  registerServiceWorker,
  subscribeToPush,
  getExistingSubscription,
} from '@/lib/notifications';

interface ScheduleEvent {
  id: string;
  time: number;
  duration: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'marker' | 'task' | 'free';
}

type TabType = 'today' | 'history' | 'analytics';

export default function WeekdayPlanner() {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [arrivalHour, setArrivalHour] = useState(19);
  const [arrivalMinute, setArrivalMinute] = useState(0);
  const [hasDinner, setHasDinner] = useState(true);
  const [hasLaundry, setHasLaundry] = useState(false);
  const [studyMinutes, setStudyMinutes] = useState(45);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [activeNotifications, setActiveNotifications] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToday, setSavedToday] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // History state
  const [historyRecords, setHistoryRecords] = useState<DailyRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DailyRecord | null>(null);

  // Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const todayFormatted = useMemo(() => {
    const d = new Date();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize service worker and check notification permission
  useEffect(() => {
    const init = async () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }

      const registration = await registerServiceWorker();
      if (registration) {
        setSwRegistration(registration);
        const subscription = await getExistingSubscription();
        if (subscription) {
          setPushSubscription(subscription);
          loadScheduledNotifications(subscription.endpoint);
        }
      }

      // Load today's record if exists
      try {
        const { record } = await getRecord(today);
        if (record) {
          setArrivalHour(record.arrivalHour);
          setArrivalMinute(record.arrivalMinute);
          setHasDinner(record.hasDinner);
          setHasLaundry(record.hasLaundry);
          setStudyMinutes(record.studyMinutes);
          setCompletedTasks(record.completedTasks || []);
          setNotes(record.notes || '');
          setSavedToday(true);
        }
      } catch (error) {
        console.error('Failed to load today record:', error);
      }
    };

    init();
  }, [today]);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab, analyticsDays]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const { records } = await getRecords({ limit: 30 });
      setHistoryRecords(records);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
    setIsLoading(false);
  };

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const { analytics: data } = await getAnalytics(analyticsDays);
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
    setIsLoading(false);
  };

  const loadScheduledNotifications = async (endpoint: string) => {
    try {
      const { notifications } = await getScheduledNotifications(endpoint);
      const notifMap: Record<string, string> = {};
      notifications.forEach((n) => {
        notifMap[n.event_id] = n.scheduled_time;
      });
      setActiveNotifications(notifMap);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;

    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted' && swRegistration) {
        const subscription = await subscribeToPush(swRegistration);
        if (subscription) {
          setPushSubscription(subscription);
        }
      }
    } catch (error) {
      console.error('Failed to request permission:', error);
    }
    setIsLoading(false);
  };

  const schedule = useMemo<ScheduleEvent[]>(() => {
    const events: ScheduleEvent[] = [];
    let currentTimeMinutes = arrivalHour * 60 + arrivalMinute;
    const bedTime = 23 * 60;

    events.push({
      id: 'arrival',
      time: currentTimeMinutes,
      duration: 0,
      label: '帰宅',
      icon: Home,
      type: 'marker',
    });

    if (hasDinner) {
      events.push({
        id: 'dinner',
        time: currentTimeMinutes,
        duration: 60,
        label: '夕食（調理・食事）',
        icon: UtensilsCrossed,
        type: 'task',
      });
      currentTimeMinutes += 60;
    }

    const idealBathStart = 21 * 60;
    const bathDuration = 60;

    let bathStart: number;
    if (currentTimeMinutes <= idealBathStart) {
      bathStart = idealBathStart;
    } else {
      bathStart = currentTimeMinutes;
    }

    if (bathStart > currentTimeMinutes) {
      const freeTime = bathStart - currentTimeMinutes;
      events.push({
        id: 'free1',
        time: currentTimeMinutes,
        duration: freeTime,
        label: '自由時間',
        icon: Sparkles,
        type: 'free',
      });
      currentTimeMinutes = bathStart;
    }

    events.push({
      id: 'bath',
      time: currentTimeMinutes,
      duration: bathDuration,
      label: 'お風呂',
      icon: Bath,
      type: 'task',
    });
    currentTimeMinutes += bathDuration;

    if (hasLaundry) {
      events.push({
        id: 'laundry',
        time: currentTimeMinutes,
        duration: 30,
        label: '洗濯',
        icon: Shirt,
        type: 'task',
      });
      currentTimeMinutes += 30;
    }

    events.push({
      id: 'study',
      time: currentTimeMinutes,
      duration: studyMinutes,
      label: '英語学習',
      icon: BookOpen,
      type: 'task',
    });
    currentTimeMinutes += studyMinutes;

    if (currentTimeMinutes < bedTime) {
      events.push({
        id: 'free2',
        time: currentTimeMinutes,
        duration: bedTime - currentTimeMinutes,
        label: '自由時間',
        icon: Sparkles,
        type: 'free',
      });
    }

    events.push({
      id: 'bed',
      time: bedTime,
      duration: 0,
      label: '就寝',
      icon: Moon,
      type: 'marker',
    });

    return events;
  }, [arrivalHour, arrivalMinute, hasDinner, hasLaundry, studyMinutes]);

  const totalFreeTime = useMemo(() => {
    return schedule.filter((e) => e.type === 'free').reduce((sum, e) => sum + e.duration, 0);
  }, [schedule]);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  const formatTimeHHMM = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const planName = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${arrivalHour}:${arrivalMinute.toString().padStart(2, '0')}帰宅`);
    parts.push(hasDinner ? '食事あり' : '食事なし');
    if (hasLaundry) parts.push('洗濯');
    return parts.join(' / ');
  }, [arrivalHour, arrivalMinute, hasDinner, hasLaundry]);

  const isOvertime = totalFreeTime < 0;

  const handleSaveRecord = async () => {
    setIsSaving(true);
    try {
      const scheduleData = schedule.map(e => ({
        id: e.id,
        time: e.time,
        duration: e.duration,
        label: e.label,
        type: e.type,
      }));

      await saveRecord({
        date: today,
        arrivalHour,
        arrivalMinute,
        hasDinner,
        hasLaundry,
        studyMinutes,
        totalFreeTime,
        schedule: scheduleData,
        completedTasks,
        notes,
      });
      setSavedToday(true);
    } catch (error) {
      console.error('Failed to save record:', error);
    }
    setIsSaving(false);
  };

  const handleToggleTaskComplete = (taskId: string) => {
    setCompletedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleDeleteRecord = async (date: string) => {
    if (!confirm('この記録を削除しますか？')) return;
    try {
      await deleteRecord(date);
      setHistoryRecords(prev => prev.filter(r => r.date !== date));
      if (selectedRecord?.date === date) {
        setSelectedRecord(null);
      }
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };

  const handleSetNotification = useCallback(
    async (event: ScheduleEvent) => {
      if (!pushSubscription) return;

      setIsLoading(true);
      try {
        const scheduledTime = formatTimeHHMM(event.time);
        await scheduleNotification(
          pushSubscription.endpoint,
          event.id,
          event.label,
          scheduledTime
        );
        setActiveNotifications((prev) => ({
          ...prev,
          [event.id]: scheduledTime,
        }));
      } catch (error) {
        console.error('Failed to schedule notification:', error);
      }
      setIsLoading(false);
    },
    [pushSubscription]
  );

  const handleCancelNotification = useCallback(
    async (eventId: string) => {
      if (!pushSubscription) return;

      setIsLoading(true);
      try {
        await cancelNotification(pushSubscription.endpoint, eventId);
        setActiveNotifications((prev) => {
          const newState = { ...prev };
          delete newState[eventId];
          return newState;
        });
      } catch (error) {
        console.error('Failed to cancel notification:', error);
      }
      setIsLoading(false);
    },
    [pushSubscription]
  );

  const hours = Array.from({ length: 8 }, (_, i) => i + 17);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const renderTodayTab = () => (
    <>
      {/* Date Display */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-xl rounded-2xl border border-indigo-400/20 p-4 mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <span className="text-lg font-medium text-white">{todayFormatted}</span>
          {savedToday && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              保存済み
            </span>
          )}
        </div>
      </div>

      {/* Notification Permission Banner */}
      {notificationPermission === 'default' && (
        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-amber-400" />
            <p className="text-amber-200 text-sm">
              通知を有効にすると、各タスクの開始時刻にリマインドできます
            </p>
          </div>
          <button
            onClick={requestNotificationPermission}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '有効にする'}
          </button>
        </div>
      )}

      {notificationPermission === 'denied' && (
        <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <BellOff className="w-5 h-5 text-red-400" />
          <p className="text-red-200 text-sm">
            通知がブロックされています。ブラウザの設定から許可してください。
          </p>
        </div>
      )}

      {/* Settings Panel */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
        <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-5">
          Settings
        </h2>

        {/* Arrival Time - Dropdown */}
        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-3">帰宅時間</label>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <select
                value={arrivalHour}
                onChange={(e) => setArrivalHour(Number(e.target.value))}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-400/50 cursor-pointer"
              >
                {hours.map((h) => (
                  <option key={h} value={h} className="bg-slate-800">
                    {h}時
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
            <span className="text-slate-500">:</span>
            <div className="relative flex-1">
              <select
                value={arrivalMinute}
                onChange={(e) => setArrivalMinute(Number(e.target.value))}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-400/50 cursor-pointer"
              >
                {minutes.map((m) => (
                  <option key={m} value={m} className="bg-slate-800">
                    {m.toString().padStart(2, '0')}分
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setHasDinner(!hasDinner)}
            className={`flex-1 py-4 px-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-3 ${
              hasDinner
                ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'
            }`}
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span>夕食あり</span>
          </button>
          <button
            onClick={() => setHasLaundry(!hasLaundry)}
            className={`flex-1 py-4 px-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-3 ${
              hasLaundry
                ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'
            }`}
          >
            <Shirt className="w-5 h-5" />
            <span>洗濯あり</span>
          </button>
        </div>

        {/* Study Time Slider */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-slate-400">英語学習時間</label>
            <span className="text-blue-400 font-semibold">{studyMinutes}分</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min="30"
              max="60"
              step="5"
              value={studyMinutes}
              onChange={(e) => setStudyMinutes(Number(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-blue-500
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:shadow-blue-500/50
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform
                [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>30分</span>
              <span>60分</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-blue-600/20 to-blue-400/10 backdrop-blur-xl rounded-2xl border border-blue-400/20 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-300/60 uppercase tracking-wider mb-1">Today's Plan</p>
            <p className="font-semibold text-white">{planName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-300/60 uppercase tracking-wider mb-1">Free Time</p>
            <p
              className={`text-3xl font-bold ${
                isOvertime
                  ? 'text-red-400'
                  : totalFreeTime >= 60
                    ? 'text-emerald-400'
                    : 'text-amber-400'
              }`}
            >
              {totalFreeTime}
              <span className="text-lg ml-1">min</span>
            </p>
          </div>
        </div>
        {isOvertime && (
          <div className="flex items-center gap-2 mt-4 p-3 bg-red-500/20 rounded-xl border border-red-400/30">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-300 text-sm">
              時間が足りません。学習時間を短くするか、条件を見直してください。
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider">
            Timeline
          </h2>
          {notificationPermission === 'granted' && pushSubscription && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-4 h-4" />
              <span>通知ON</span>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {schedule.map((event, index) => {
            const Icon = event.icon;
            const isLast = index === schedule.length - 1;
            const hasActiveNotification = !!activeNotifications[event.id];
            const isCompleted = completedTasks.includes(event.id);

            return (
              <div
                key={event.id}
                className={`relative flex items-center gap-4 p-4 rounded-xl transition-all duration-200 ${
                  isCompleted
                    ? 'bg-emerald-500/10 border border-emerald-400/30'
                    : event.type === 'free'
                      ? 'bg-emerald-500/10 border border-emerald-400/20'
                      : event.type === 'marker'
                        ? 'bg-white/5 border border-white/10'
                        : 'bg-blue-500/10 border border-blue-400/20'
                }`}
              >
                {/* Completion checkbox for tasks */}
                {event.type === 'task' && (
                  <button
                    onClick={() => handleToggleTaskComplete(event.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isCompleted
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-500 hover:border-blue-400'
                    }`}
                  >
                    {isCompleted && <Check className="w-4 h-4 text-white" />}
                  </button>
                )}

                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-500/20'
                      : event.type === 'free'
                        ? 'bg-emerald-500/20'
                        : event.type === 'marker'
                          ? 'bg-white/10'
                          : 'bg-blue-500/20'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isCompleted
                        ? 'text-emerald-400'
                        : event.type === 'free'
                          ? 'text-emerald-400'
                          : event.type === 'marker'
                            ? 'text-slate-400'
                            : 'text-blue-400'
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${isCompleted ? 'text-emerald-300 line-through' : 'text-white'}`}>
                    {event.label}
                  </p>
                  <p className="text-sm text-slate-400">
                    {event.duration > 0
                      ? `${formatTime(event.time)} → ${formatTime(event.time + event.duration)}`
                      : formatTime(event.time)}
                  </p>
                </div>

                {/* Duration Badge */}
                {event.duration > 0 && (
                  <div
                    className={`px-3 py-1 rounded-lg text-sm font-medium flex-shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : event.type === 'free'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {event.duration}分
                  </div>
                )}

                {/* Notification Button */}
                {notificationPermission === 'granted' &&
                  pushSubscription &&
                  event.type !== 'free' && (
                    <button
                      onClick={() =>
                        hasActiveNotification
                          ? handleCancelNotification(event.id)
                          : handleSetNotification(event)
                      }
                      disabled={isLoading}
                      className={`p-2 rounded-lg transition-all flex-shrink-0 disabled:opacity-50 ${
                        hasActiveNotification
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                      }`}
                      title={hasActiveNotification ? '通知をキャンセル' : '通知をセット'}
                    >
                      {hasActiveNotification ? (
                        <BellRing className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </button>
                  )}

                {/* Connector */}
                {!isLast && (
                  <div className="absolute -bottom-3 left-9 w-px h-3 bg-white/10" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
        <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-3">
          メモ
        </h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="今日のメモを入力..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400/50 resize-none h-24"
        />
      </div>

      {/* Save Button */}
      <button
        onClick={handleSaveRecord}
        disabled={isSaving}
        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-xl font-medium text-white transition-colors flex items-center justify-center gap-2"
      >
        {isSaving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Save className="w-5 h-5" />
        )}
        {savedToday ? '記録を更新' : '今日の記録を保存'}
      </button>

      {/* Active Notifications Summary */}
      {Object.keys(activeNotifications).length > 0 && (
        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-400/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="w-4 h-4 text-amber-400" />
            <p className="text-amber-300 text-sm font-medium">セット中の通知</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(activeNotifications).map(([id, scheduledTime]) => {
              const event = schedule.find((e) => e.id === id);
              return (
                <span
                  key={id}
                  className="px-3 py-1 bg-amber-500/20 rounded-full text-xs text-amber-200"
                >
                  {event?.label} - {scheduledTime}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 mt-6 text-slate-500 text-sm">
        <Moon className="w-4 h-4" />
        <span>就寝時間 23:00 固定</span>
      </div>
    </>
  );

  const renderHistoryTab = () => (
    <>
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
        <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-5">
          過去の記録
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : historyRecords.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>まだ記録がありません</p>
            <p className="text-sm mt-1">今日のタブで記録を保存しましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyRecords.map((record) => {
              const d = new Date(record.date);
              const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
              const dateStr = `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
              const completionRate = record.schedule
                ? Math.round(
                    (record.completedTasks.filter(t => record.schedule.some(s => s.id === t && s.type === 'task')).length /
                      record.schedule.filter(s => s.type === 'task').length) * 100
                  ) || 0
                : 0;

              return (
                <div
                  key={record.date}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedRecord?.date === record.date
                      ? 'bg-blue-500/20 border-blue-400/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => setSelectedRecord(selectedRecord?.date === record.date ? null : record)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{dateStr}</p>
                      <p className="text-sm text-slate-400">
                        {record.arrivalHour}:{record.arrivalMinute.toString().padStart(2, '0')}帰宅
                        {record.hasDinner && ' / 食事あり'}
                        {record.hasLaundry && ' / 洗濯'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-slate-500">自由時間</p>
                        <p className={`font-bold ${
                          record.totalFreeTime >= 60 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {record.totalFreeTime}分
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">達成率</p>
                        <p className={`font-bold ${
                          completionRate >= 80 ? 'text-emerald-400' : completionRate >= 50 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {completionRate}%
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecord(record.date);
                        }}
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {selectedRecord?.date === record.date && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">学習時間</p>
                          <p className="text-blue-400 font-medium">{record.studyMinutes}分</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">完了タスク</p>
                          <p className="text-emerald-400 font-medium">{record.completedTasks.length}件</p>
                        </div>
                      </div>
                      {record.notes && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">メモ</p>
                          <p className="text-slate-300 text-sm">{record.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const renderAnalyticsTab = () => (
    <>
      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {[7, 14, 30].map((days) => (
          <button
            key={days}
            onClick={() => setAnalyticsDays(days)}
            className={`flex-1 py-3 rounded-xl font-medium transition-all ${
              analyticsDays === days
                ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'
            }`}
          >
            {days}日間
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : !analytics || analytics.totalDays === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="text-center py-12 text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>データがありません</p>
            <p className="text-sm mt-1">記録を保存すると分析が表示されます</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <p className="text-xs text-slate-500 mb-1">平均自由時間</p>
              <p className={`text-2xl font-bold ${
                analytics.avgFreeTime >= 60 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {analytics.avgFreeTime}<span className="text-sm ml-1">分</span>
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <p className="text-xs text-slate-500 mb-1">平均学習時間</p>
              <p className="text-2xl font-bold text-blue-400">
                {analytics.avgStudyTime}<span className="text-sm ml-1">分</span>
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <p className="text-xs text-slate-500 mb-1">平均帰宅時間</p>
              <p className="text-2xl font-bold text-purple-400">
                {analytics.avgArrivalTime}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <p className="text-xs text-slate-500 mb-1">記録日数</p>
              <p className="text-2xl font-bold text-indigo-400">
                {analytics.totalDays}<span className="text-sm ml-1">日</span>
              </p>
            </div>
          </div>

          {/* Activity rates */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-4">
              活動割合
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">夕食を作った日</span>
                  <span className="text-white font-medium">{analytics.dinnerRate}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${analytics.dinnerRate}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">洗濯をした日</span>
                  <span className="text-white font-medium">{analytics.laundryRate}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all"
                    style={{ width: `${analytics.laundryRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Free time trend */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-4">
              自由時間の推移
            </h3>
            <div className="flex items-end gap-1 h-32">
              {analytics.dailyFreeTime.slice(-14).map((day, i) => {
                const maxFreeTime = Math.max(...analytics.dailyFreeTime.map(d => d.freeTime), 120);
                const height = Math.max((day.freeTime / maxFreeTime) * 100, 5);
                const d = new Date(day.date);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t transition-all ${
                        day.freeTime >= 60 ? 'bg-emerald-500' : day.freeTime >= 30 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.freeTime}分`}
                    />
                    <span className="text-[10px] text-slate-500">{d.getDate()}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>
                {analytics.dailyFreeTime.length > 0 &&
                  new Date(analytics.dailyFreeTime[Math.max(0, analytics.dailyFreeTime.length - 14)].date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
              <span>
                {analytics.dailyFreeTime.length > 0 &&
                  new Date(analytics.dailyFreeTime[analytics.dailyFreeTime.length - 1].date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Task completion stats */}
          {Object.keys(analytics.taskCompletionStats).length > 0 && (
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <h3 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-4">
                タスク完了回数
              </h3>
              <div className="space-y-3">
                {Object.entries(analytics.taskCompletionStats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([task, count]) => (
                    <div key={task} className="flex items-center justify-between">
                      <span className="text-slate-300">{task}</span>
                      <span className="text-emerald-400 font-medium">{count}回</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Weekday Planner</h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">現在時刻</p>
              <p className="text-blue-400 font-mono text-lg">
                {currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'today'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calendar className="w-4 h-4" />
            今日
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'history'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <History className="w-4 h-4" />
            履歴
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            分析
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'today' && renderTodayTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}
      </div>
    </div>
  );
}
