import { getServiceStatuses } from '@/lib/dataBuilder';
import { getStateKey } from '@/lib/state';
import { WeatherService } from '@/services/weatherService';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const statuses = getServiceStatuses();
    const displaySync = getStateKey('last_display_sync', null);

    // Add AI cost info from weather service if available
    const weatherService = new WeatherService();
    const aiCostInfo = weatherService.getAICostInfo();

    return NextResponse.json({
      services: statuses,
      lastDisplaySync: displaySync,
      aiCost: aiCostInfo
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
