import { buildAuthUrl } from '@/services/calendarService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = buildAuthUrl(baseUrl);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error('Failed to start Google OAuth:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to start Google OAuth', details: errorMessage },
      { status: 500 }
    );
  }
}
