import { listCalendars } from '@/services/calendarService';
import { readAuthFile, writeAuthFile } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const items = await listCalendars(baseUrl, console);
    const auth = readAuthFile();
    const googleAuth = auth.google as { selectedCalendars?: string[] } | undefined;
    const selected = new Set(googleAuth?.selectedCalendars || []);
    return NextResponse.json({
      items: items.map(c => ({ ...c, selected: selected.has(c.id) }))
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const selected = Array.isArray(body.selected_calendar_ids) ? body.selected_calendar_ids : [];

    const auth = readAuthFile();
    if (!auth.google) {
      auth.google = {};
    }
    (auth.google as { selectedCalendars?: string[] }).selectedCalendars = selected;
    writeAuthFile(auth);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
