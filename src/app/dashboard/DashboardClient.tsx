'use client';

import AvanttBriefing from './AvanttBriefing';
import type { DashboardData } from '@/lib/types';

interface DashboardClientProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function DashboardClient(props: DashboardClientProps) {
  return <AvanttBriefing {...props} />;
}
