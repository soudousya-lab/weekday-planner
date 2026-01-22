'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronDown,
  Check,
  Calendar,
  MapPin,
} from 'lucide-react';

interface ScheduleEvent {
  id: string;
  time: number;
  duration: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'marker' | 'task' | 'free';
}

export default function WeekdayPlanner() {
  const [arrivalHour, setArrivalHour] = useState(19);
  const [arrivalMinute, setArrivalMinute] = useState(0);
  const [hasDinner, setHasDinner] = useState(true);
  const [hasLaundry, setHasLaundry] = useState(false);
  const [studyMinutes, setStudyMinutes] = useState(45);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Set current time as arrival time
  const handleSetCurrentTime = () => {
    const now = new Date();
    setArrivalHour(now.getHours());
    // Round to nearest 10 minutes
    const roundedMinute = Math.round(now.getMinutes() / 10) * 10;
    setArrivalMinute(roundedMinute >= 60 ? 50 : roundedMinute);
  };

  const schedule = useMemo<ScheduleEvent[]>(() => {
    const events: ScheduleEvent[] = [];
    let currentTimeMinutes = arrivalHour * 60 + arrivalMinute;
    const bedTime = 23 * 60;
    const bathDuration = 60;
    const laundryDuration = hasLaundry ? 30 : 0;

    events.push({
      id: 'arrival',
      time: currentTimeMinutes,
      duration: 0,
      label: '帰宅',
      icon: Home,
      type: 'marker',
    });

    // Calculate dinner start time (18:30 or later)
    const dinnerEarliestStart = 18 * 60 + 30; // 18:30
    const dinnerStart = hasDinner ? Math.max(currentTimeMinutes, dinnerEarliestStart) : currentTimeMinutes;
    const dinnerEnd = hasDinner ? dinnerStart + 60 : currentTimeMinutes;

    // Bath starts right after dinner
    const bathStart = dinnerEnd;
    const bathEnd = bathStart + bathDuration;
    const laundryEnd = bathEnd + laundryDuration;

    // Calculate available time slots for study
    const timeBeforeDinner = dinnerStart - currentTimeMinutes;
    const timeAfterBathLaundry = bedTime - laundryEnd;

    // Distribute study time across available slots
    let remainingStudy = studyMinutes;
    let studyBeforeDinner = 0;
    let studyAfterBath = 0;

    // First, allocate to after bath (preferred)
    if (timeAfterBathLaundry > 0 && remainingStudy > 0) {
      studyAfterBath = Math.min(remainingStudy, timeAfterBathLaundry);
      remainingStudy -= studyAfterBath;
    }

    // Then, allocate remaining to before dinner
    if (timeBeforeDinner > 0 && remainingStudy > 0) {
      studyBeforeDinner = Math.min(remainingStudy, timeBeforeDinner);
      remainingStudy -= studyBeforeDinner;
    }

    // Calculate free time
    const freeTimeBeforeDinner = timeBeforeDinner - studyBeforeDinner;
    const freeTimeAfterBath = timeAfterBathLaundry - studyAfterBath;

    const hasMultipleStudySessions = studyBeforeDinner > 0 && studyAfterBath > 0;

    // Schedule: Study before dinner (if any)
    if (studyBeforeDinner > 0) {
      events.push({
        id: 'study1',
        time: currentTimeMinutes,
        duration: studyBeforeDinner,
        label: hasMultipleStudySessions ? '英語学習①' : '英語学習',
        icon: BookOpen,
        type: 'task',
      });
      currentTimeMinutes += studyBeforeDinner;
    }

    // Free time before dinner (if any)
    if (freeTimeBeforeDinner > 0) {
      events.push({
        id: 'free1',
        time: currentTimeMinutes,
        duration: freeTimeBeforeDinner,
        label: '自由時間',
        icon: Sparkles,
        type: 'free',
      });
      currentTimeMinutes += freeTimeBeforeDinner;
    }

    // Dinner
    if (hasDinner) {
      events.push({
        id: 'dinner',
        time: dinnerStart,
        duration: 60,
        label: '夕食（調理・食事）',
        icon: UtensilsCrossed,
        type: 'task',
      });
      currentTimeMinutes = dinnerEnd;
    }

    // Bath (after dinner)
    events.push({
      id: 'bath',
      time: currentTimeMinutes,
      duration: bathDuration,
      label: 'お風呂',
      icon: Bath,
      type: 'task',
    });
    currentTimeMinutes += bathDuration;

    // Laundry
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

    // Study after bath (if any)
    if (studyAfterBath > 0) {
      events.push({
        id: 'study2',
        time: currentTimeMinutes,
        duration: studyAfterBath,
        label: hasMultipleStudySessions ? '英語学習②' : '英語学習',
        icon: BookOpen,
        type: 'task',
      });
      currentTimeMinutes += studyAfterBath;
    }

    // Free time after study
    if (freeTimeAfterBath > 0) {
      events.push({
        id: 'free2',
        time: currentTimeMinutes,
        duration: freeTimeAfterBath,
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

  const planName = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${arrivalHour}:${arrivalMinute.toString().padStart(2, '0')}帰宅`);
    parts.push(hasDinner ? '食事あり' : '食事なし');
    if (hasLaundry) parts.push('洗濯');
    return parts.join(' / ');
  }, [arrivalHour, arrivalMinute, hasDinner, hasLaundry]);

  const isOvertime = totalFreeTime < 0;

  const handleToggleTaskComplete = (taskId: string) => {
    setCompletedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  // Minutes in 10-minute intervals: 0, 10, 20, 30, 40, 50
  const minutes = Array.from({ length: 6 }, (_, i) => i * 10);

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

        {/* Date Display */}
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-xl rounded-2xl border border-indigo-400/20 p-4 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <span className="text-lg font-medium text-white">{todayFormatted}</span>
          </div>
        </div>

        {/* Settings Panel */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
          <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-5">
            Settings
          </h2>

          {/* Arrival Time - Dropdown */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-slate-400">帰宅時間</label>
              <button
                onClick={handleSetCurrentTime}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-sm font-medium transition-colors"
              >
                <MapPin className="w-4 h-4" />
                現在時刻を取得
              </button>
            </div>
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
          <h2 className="text-sm font-medium text-blue-300/80 uppercase tracking-wider mb-5">
            Timeline
          </h2>
          <div className="space-y-3">
            {schedule.map((event, index) => {
              const Icon = event.icon;
              const isLast = index === schedule.length - 1;
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

                  {/* Connector */}
                  {!isLast && (
                    <div className="absolute -bottom-3 left-9 w-px h-3 bg-white/10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-6 text-slate-500 text-sm">
          <Moon className="w-4 h-4" />
          <span>就寝時間 23:00 固定</span>
        </div>
      </div>
    </div>
  );
}
