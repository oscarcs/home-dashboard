import { buildDashboardData } from '@/lib/dataBuilder';
import type { DashboardData } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const data: DashboardData = await buildDashboardData(request as any, console);
    // Remove internal service statuses from public API response
    const { _serviceStatuses, ...publicData } = data;
    return NextResponse.json(publicData);
  } catch (error) {
    console.error('Error generating dashboard data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to generate dashboard data',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
