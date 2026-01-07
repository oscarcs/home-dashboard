import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { BaseService } from '../lib/BaseService.js';
import { AUTH_PATH } from '../lib/paths.js';
import type { Logger, CalendarEvent } from '../lib/types.js';

// ============================================================================
// Google Calendar API Types
// ============================================================================

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

interface GoogleAuthData {
  tokens: GoogleTokens;
  selectedCalendars?: string[];
}

interface AuthFileData {
  google?: GoogleAuthData;
  [key: string]: unknown;
}

interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

// ============================================================================
// Calendar Service Types
// ============================================================================

interface CalendarServiceConfig {
  baseUrl: string;
  timezone?: string;
}

interface ProcessedEvent {
  title: string;
  start: string;
  startDate: Date;
}

interface CalendarApiData {
  events: ProcessedEvent[];
  timezone: string;
}

// ============================================================================
// Calendar Service Class
// ============================================================================

/**
 * Calendar Service (Google Calendar) - OPTIONAL
 * Provides upcoming calendar events
 */
class CalendarService extends BaseService<CalendarEvent[], CalendarServiceConfig> {
  constructor(cacheTTLMinutes: number = 30) {
    super({
      name: 'Calendar',
      cacheKey: 'calendar',
      cacheTTL: cacheTTLMinutes * 60 * 1000,
      retryAttempts: 2,
      retryCooldown: 1000,
    });
  }

  isEnabled(): boolean {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const auth = this.loadTokens();
    const hasTokens = auth.google?.tokens != null;
    return !!(clientId && clientSecret && hasTokens);
  }

  loadTokens(): AuthFileData {
    try {
      if (fs.existsSync(AUTH_PATH)) {
        const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8')) as AuthFileData;
        return auth;
      }
    } catch (_) {
      // Ignore errors
    }
    return {};
  }

  getOAuthClient(baseUrl: string): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`;

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getAuthorizedClient(baseUrl: string): OAuth2Client | null {
    const oauth2Client = this.getOAuthClient(baseUrl);
    const auth = this.loadTokens();
    const tokens = auth.google?.tokens;
    if (!tokens) return null;

    oauth2Client.setCredentials(tokens);
    oauth2Client.on('tokens', (newTokens: Credentials) => {
      const merged: GoogleTokens = { ...(tokens || {}), ...newTokens };
      this.saveTokens(merged);
    });

    return oauth2Client;
  }

  saveTokens(tokens: GoogleTokens | Credentials): void {
    try {
      const auth: AuthFileData = fs.existsSync(AUTH_PATH)
        ? JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'))
        : {};
      auth.google = auth.google || {} as GoogleAuthData;
      auth.google.tokens = tokens as GoogleTokens;
      fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn('Failed to save Google tokens:', errorMessage);
    }
  }

  async fetchData(config: CalendarServiceConfig, logger: Logger): Promise<CalendarApiData> {
    const authClient = this.getAuthorizedClient(config.baseUrl);
    if (!authClient) throw new Error('Google not authenticated');

    // Read selected calendars from auth.json
    const authData = this.loadTokens();
    const calendarIds = authData.google?.selectedCalendars || [];
    const timezone = config.timezone || 'America/Los_Angeles';

    if (calendarIds.length === 0) {
      throw new Error('No calendars selected');
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const events: ProcessedEvent[] = [];
    for (const calId of calendarIds) {
      try {
        const res = await calendar.events.list({
          calendarId: calId,
          timeMin,
          timeMax,
          maxResults: 10,
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: timezone,
        });

        const items = res.data.items || [];
        for (const ev of items) {
          // Skip all-day events
          if (ev.start && ev.start.date && !ev.start.dateTime) continue;

          const start = ev.start?.dateTime || ev.start?.date;
          if (!start) continue;

          const startDate = new Date(start);

          // Only include events within next 7 days
          const diffMs = startDate.getTime() - now.getTime();
          const days = diffMs / (1000 * 60 * 60 * 24);
          if (days < 0 || days > 7) continue;

          events.push({
            title: ev.summary || 'Untitled',
            start,
            startDate,
          });
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        logger.warn?.(`[Calendar] Failed to fetch events for ${calId}: ${errorMessage}`);
      }
    }

    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return { events: events.slice(0, 2), timezone };
  }

  mapToDashboard(apiData: CalendarApiData, _config: CalendarServiceConfig): CalendarEvent[] {
    const now = new Date();
    const timezone = apiData.timezone || 'America/Los_Angeles';

    return apiData.events.map(ev => ({
      title: ev.title,
      time: this.formatRelativeTime(ev.start, now, timezone),
    }));
  }

  formatRelativeTime(dateStr: string, now: Date, _tz: string): string {
    const target = new Date(dateStr);
    const sameDay = target.toLocaleDateString('en-US', { timeZone: _tz }) === now.toLocaleDateString('en-US', { timeZone: _tz });

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = target.toLocaleDateString('en-US', { timeZone: _tz }) === tomorrow.toLocaleDateString('en-US', { timeZone: _tz });

    const timeStr = target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: _tz }).toLowerCase();

    if (sameDay) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;

    const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days at ${timeStr}`;

    const weekday = target.toLocaleDateString('en-US', { weekday: 'long', timeZone: _tz });
    return `${weekday} at ${timeStr}`;
  }
}

// ============================================================================
// OAuth Helper Functions for server.js
// ============================================================================

const service = new CalendarService();

function buildAuthUrl(baseUrl: string): string {
  const oauth2Client = service.getOAuthClient(baseUrl);
  const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
}

async function handleOAuthCallback(baseUrl: string, code: string): Promise<Credentials> {
  const oauth2Client = service.getOAuthClient(baseUrl);
  const { tokens } = await oauth2Client.getToken(code);
  service.saveTokens(tokens);
  return tokens;
}

function isAuthed(): boolean {
  const auth = service.loadTokens();
  const tokens = auth.google?.tokens;
  return !!(tokens && (tokens.refresh_token || tokens.access_token));
}

async function listCalendars(baseUrl: string, _logger: Logger = console): Promise<GoogleCalendarItem[]> {
  const auth = service.getAuthorizedClient(baseUrl);
  if (!auth) throw new Error('Google not authenticated');
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list({ maxResults: 250 });
  const items = res.data.items || [];
  return items.map(it => ({ id: it.id!, summary: it.summary!, primary: !!it.primary }));
}

export {
  CalendarService,
  buildAuthUrl,
  handleOAuthCallback,
  isAuthed,
  listCalendars,
};
