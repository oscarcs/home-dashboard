import { handleOAuthCallback } from '@/services/calendarService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'Missing code param' }, { status: 400 });
    }
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    await handleOAuthCallback(baseUrl, code);
    return NextResponse.redirect(new URL('/admin', request.url));
  } catch (e) {
    console.error('OAuth callback error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: 'OAuth callback failed', details: errorMessage },
      { status: 500 }
    );
  }
}
