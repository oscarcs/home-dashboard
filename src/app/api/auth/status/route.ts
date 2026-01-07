import { isAuthed } from '@/services/calendarService';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const authed = isAuthed();
    return NextResponse.json({ authed });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ authed: false, error: errorMessage }, { status: 500 });
  }
}
