'use client';

import dynamic from 'next/dynamic';

const WeekdayPlanner = dynamic(() => import('@/components/WeekdayPlanner'), {
  ssr: false,
});

export default function Home() {
  return <WeekdayPlanner />;
}
