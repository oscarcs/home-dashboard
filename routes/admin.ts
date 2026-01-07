import express, { Request, Response, Router } from 'express';
import { getBaseUrl, readAuthFile, writeAuthFile, deleteAuthSection } from '../lib/utils.js';
import { buildAuthUrl, handleOAuthCallback, isAuthed, listCalendars } from '../services/calendarService.js';
import { getServiceStatuses } from '../lib/dataBuilder.js';
import { getStateKey } from '../lib/state.js';

const router: Router = express.Router();

// ===== Admin Panel =====

/**
 * GET /admin - Admin panel UI
 */
router.get('/admin', (_req: Request, res: Response): void => {
  res.render('admin');
});

/**
 * GET /api/services/status - Service status for admin panel
 */
router.get('/api/services/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const statuses = getServiceStatuses();
    const displaySync = getStateKey('last_display_sync', null);

    // Add LLM cost info if available
    const { LLMService } = await import('../services/llmService.js');
    const llmService = new LLMService();
    const llmCostInfo = llmService.getCostInfo();

    res.status(200).json({
      services: statuses,
      lastDisplaySync: displaySync,
      llmCost: llmCostInfo
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /auth/status - Check if Google Calendar is authenticated
 */
router.get('/auth/status', (_req: Request, res: Response): void => {
  try {
    const authed = isAuthed();
    res.status(200).json({ authed });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ authed: false, error: errorMessage });
  }
});

/**
 * GET /auth/google - Start Google OAuth flow
 */
router.get('/auth/google', (req: Request, res: Response): void => {
  try {
    const url = buildAuthUrl(getBaseUrl(req));
    res.redirect(url);
  } catch (e) {
    console.error('Failed to start Google OAuth:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to start Google OAuth', details: errorMessage });
  }
});

/**
 * GET /auth/google/callback - Google OAuth callback
 */
router.get('/auth/google/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing code param' });
      return;
    }
    await handleOAuthCallback(getBaseUrl(req), code);
    res.redirect('/admin');
  } catch (e) {
    console.error('OAuth callback error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'OAuth callback failed', details: errorMessage });
  }
});

/**
 * GET /auth/google/signout - Sign out of Google Calendar
 */
router.get('/auth/google/signout', (_req: Request, res: Response): void => {
  try {
    deleteAuthSection('google');
    res.redirect('/admin');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /admin/calendars - List available calendars
 */
router.get('/admin/calendars', async (req: Request, res: Response): Promise<void> => {
  try {
    const items = await listCalendars(getBaseUrl(req), console);
    const auth = readAuthFile();
    const googleAuth = auth.google as { selectedCalendars?: string[] } | undefined;
    const selected = new Set(googleAuth?.selectedCalendars || []);
    res.status(200).json({
      items: items.map(c => ({ ...c, selected: selected.has(c.id) }))
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /admin/calendars - Save selected calendars
 */
router.post('/admin/calendars', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const selected = Array.isArray(body.selected_calendar_ids) ? body.selected_calendar_ids : [];

    const auth = readAuthFile();
    if (!auth.google) {
      auth.google = {};
    }
    (auth.google as { selectedCalendars?: string[] }).selectedCalendars = selected;
    writeAuthFile(auth);

    res.status(200).json({ ok: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
