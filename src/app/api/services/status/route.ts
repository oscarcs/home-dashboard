import { getServiceStatuses } from '@/lib/dataBuilder';
import { getStateKey } from '@/lib/state';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const statuses = getServiceStatuses();
    const displaySync = getStateKey('last_display_sync', null);

    // Add LLM cost info if available
    const { LLMService } = await import('@/services/llmService');
    const llmService = new LLMService();
    const llmCostInfo = llmService.getCostInfo();

    return NextResponse.json({
      services: statuses,
      lastDisplaySync: displaySync,
      llmCost: llmCostInfo
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
