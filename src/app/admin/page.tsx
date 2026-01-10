'use client';

import { useEffect, useState } from 'react';
import './base.css';
import './admin.css';

interface CalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
  selected: boolean;
}

interface ServiceInfo {
  state?: string;
  isEnabled?: boolean;
  name?: string;
  latency?: number;
  fetchedAt?: number;
  error?: string;
  cacheTTL: number;
}

interface DisplaySync {
  timestamp: number;
  status: string;
  imageSize?: number | null;
  latency?: number;
  error?: string | null;
}

interface AICostInfo {
  last_call: {
    total_tokens: number;
    cost_usd: number;
    prompt?: string;
  };
  projections: {
    monthly_cost_usd: number;
  };
}

export default function AdminPage() {
  const [calAuthed, setCalAuthed] = useState<boolean | null>(null);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [services, setServices] = useState<Record<string, ServiceInfo>>({});
  const [displaySync, setDisplaySync] = useState<DisplaySync | null>(null);
  const [aiCost, setAICost] = useState<AICostInfo | null>(null);
  const [promptDialog, setPromptDialog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCalendarAuth();
    loadServices();
    const interval = setInterval(loadServices, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchJSON = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Request failed: ' + res.statusText);
    return await res.json();
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const checkCalendarAuth = async () => {
    try {
      const status = await fetchJSON('/api/auth/status');
      setCalAuthed(status.authed);
      if (status.authed) {
        loadCalendars();
      }
    } catch (e) {
      setCalAuthed(false);
    }
  };

  const loadCalendars = async () => {
    try {
      const data = await fetchJSON('/api/admin/calendars');
      setCalendars(data.items);
    } catch (e) {
      console.error('Error loading calendars:', e);
    }
  };

  const saveCalendarSelection = async () => {
    const selected = calendars.filter((c) => c.selected).map((c) => c.id);
    try {
      await fetch('/api/admin/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_calendar_ids: selected }),
      });
    } catch (e) {
      console.error('Failed to save calendar selection:', e);
    }
  };

  const loadServices = async () => {
    try {
      const data = await fetchJSON('/api/services/status');
      setServices(data.services);
      setDisplaySync(data.lastDisplaySync);
      setAICost(data.aiCost);
      setLoading(false);
    } catch (e) {
      console.error('Error loading services:', e);
      setLoading(false);
    }
  };

  const renderServiceStatus = (state: string = 'unknown') => {
    const statusClass =
      state === 'healthy' ? 'status-healthy' :
      state === 'degraded' ? 'status-degraded' :
      state === 'pending' ? 'status-pending' :
      state === 'disabled' ? 'status-disabled' : 'status-unhealthy';
    const statusIcon =
      state === 'healthy' ? '●' :
      state === 'degraded' ? '◐' :
      state === 'pending' ? '○' :
      state === 'disabled' ? '⊘' : '○';
    return <span className={`service-status ${statusClass}`}>{statusIcon}</span>;
  };

  return (
    <div className="container">
      <h1>Dashboard Admin</h1>
      <div className="admin-grid">
        <div className="admin-main">
          <div className="card">
            <h2>Google Calendar events</h2>
            <div id="cal-auth-status" className="auth-status">
              {calAuthed === null ? (
                <span className="loading">Checking authentication...</span>
              ) : calAuthed ? (
                <>
                  <a href="/api/auth/google/signout" className="btn-secondary">
                    Sign out
                  </a>
                  <button className="btn-secondary" onClick={loadCalendars}>
                    ↻ Refresh calendars
                  </button>
                </>
              ) : (
                <a href="/api/auth/google" className="btn-secondary">
                  Authenticate
                </a>
              )}
            </div>
            <div id="cal-content">
              {calendars.length > 0 && (
                <>
                  <p style={{ marginBottom: '4px' }}>
                    <strong>Select which calendars to display events from</strong>
                  </p>
                  {calendars.map((c) => (
                    <div key={c.id} className="calendar-item">
                      <input
                        type="checkbox"
                        value={c.id}
                        checked={c.selected}
                        onChange={(e) => {
                          const updated = calendars.map((cal) =>
                            cal.id === c.id ? { ...cal, selected: e.target.checked } : cal
                          );
                          setCalendars(updated);
                          saveCalendarSelection();
                        }}
                      />
                      <span className="calendar-name">{c.summary}</span>
                      {c.primary && <span className="calendar-primary">(primary)</span>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="admin-sidebar">
          <div id="services-content">
            {loading ? (
              <div className="loading">Loading services...</div>
            ) : (
              <>
                {displaySync && (
                  <div className="service-item">
                    <div className="service-header">
                      {renderServiceStatus(displaySync.status === 'success' ? 'healthy' : 'unhealthy')}
                      <span className="service-name">E-Paper Display</span>
                    </div>
                    {displaySync.latency && <div className="service-detail">Latency: {displaySync.latency}ms</div>}
                    <div className="service-detail">
                      Last sync {formatTimeAgo(displaySync.timestamp)}
                      {displaySync.imageSize && ` • ${Math.round(displaySync.imageSize / 1024)}KB PNG`}
                    </div>
                    {displaySync.error && (
                      <div className="service-detail" style={{ color: '#dc2626' }}>
                        Error: {displaySync.error}
                      </div>
                    )}
                  </div>
                )}
                {Object.entries(services).map(([name, info]) => {
                  const state = info.state || 'unknown';
                  const isEnabled = info.isEnabled !== false;
                  const displayName = info.name || name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

                  return (
                    <div key={name} className="service-item">
                      <div className="service-header">
                        {renderServiceStatus(state)}
                        <span className="service-name">{displayName}</span>
                        <div className="service-cache">↻ {info.cacheTTL / 60000} min</div>
                      </div>
                      {(!isEnabled || state === 'disabled') && (
                        <div className="service-detail">Disabled (Set credentials in .env)</div>
                      )}
                      {state === 'pending' && (
                        <div className="service-detail">Configured (waiting for first sync)</div>
                      )}
                      {info.latency && <div className="service-detail">Latency: {info.latency}ms</div>}
                      {info.fetchedAt && (
                        <div className="service-detail">
                          Last fetch: {formatTimeAgo(info.fetchedAt)}
                        </div>
                      )}
                      {info.error && <div className="service-detail service-error">Error: {info.error}</div>}
                      {name === 'weather' && aiCost && (
                        <div className="service-detail">
                          <span
                            style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                            onClick={() => setPromptDialog(aiCost.last_call.prompt || '')}
                          >
                            AI: {aiCost.last_call.total_tokens} tokens
                          </span>
                          . Cost: ${aiCost.last_call.cost_usd.toFixed(4)}, est. $
                          {aiCost.projections.monthly_cost_usd.toFixed(2)}/mo
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {promptDialog !== null && (
        <dialog open style={{ padding: '20px', borderRadius: '8px', border: '1px solid #ccc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>AI Prompt</h3>
            <button className="btn" onClick={() => setPromptDialog(null)}>
              Close
            </button>
          </div>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '16px',
              borderRadius: '8px',
              overflow: 'auto',
              maxHeight: '60vh',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.5',
            }}
          >
            {promptDialog}
          </pre>
        </dialog>
      )}
    </div>
  );
}
