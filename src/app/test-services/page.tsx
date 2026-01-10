'use client';

import { useState } from 'react';
import '../admin/base.css';
import '../admin/admin.css';

interface TestResult {
  service: string;
  success: boolean;
  latency: string;
  source?: string;
  error?: string;
  data?: any;
  status?: any;
  cache_info?: any;
}

export default function TestServicesPage() {
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const services = [
    { id: 'news', name: 'News Service', description: 'Scrapes headlines and generates AI summary' },
    { id: 'weather', name: 'Weather Service', description: 'Fetches weather data and generates AI insights' },
    { id: 'calendar', name: 'Calendar Service', description: 'Fetches Google Calendar events' },
    { id: 'markets', name: 'Markets Service', description: 'Fetches real-time market data from Yahoo Finance' },
  ];

  const testService = async (serviceId: string, fresh: boolean = false) => {
    setTesting({ ...testing, [serviceId]: true });

    try {
      const url = `/api/test-service?service=${serviceId}${fresh ? '&fresh=true' : ''}`;
      const response = await fetch(url);
      const data = await response.json();

      setTestResults({
        ...testResults,
        [serviceId]: data
      });
    } catch (error) {
      setTestResults({
        ...testResults,
        [serviceId]: {
          service: serviceId,
          success: false,
          latency: '0ms',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    } finally {
      setTesting({ ...testing, [serviceId]: false });
    }
  };

  const getStatusColor = (result?: TestResult) => {
    if (!result) return 'gray';
    if (!result.success) return '#dc2626';
    if (result.source === 'cache' || result.source === 'stale_cache') return '#2563eb';
    return '#16a34a';
  };

  const getStatusText = (result?: TestResult) => {
    if (!result) return 'Not tested';
    if (!result.success) return `Failed: ${result.error}`;
    if (result.source === 'cache') return `Success (from cache)`;
    if (result.source === 'stale_cache') return `Success (stale cache)`;
    if (result.source === 'api') return `Success (fresh API call)`;
    return 'Success';
  };

  const renderData = (data: any, serviceId: string) => {
    if (!data) return null;

    // Special rendering for news service
    if (serviceId === 'news') {
      return (
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Summary:</strong>
            <div style={{
              background: '#f5f5f5',
              padding: '12px',
              borderRadius: '8px',
              marginTop: '8px',
              fontStyle: 'italic'
            }}>
              {data.summary || 'No summary generated'}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong>Headlines ({data.headlines?.length || 0}):</strong>
            <div style={{ marginTop: '8px' }}>
              {data.headlines?.map((h: any, i: number) => (
                <div key={i} style={{
                  padding: '8px',
                  borderLeft: '3px solid #e5e7eb',
                  marginBottom: '8px',
                  fontSize: '13px'
                }}>
                  <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}>
                    {h.source}
                  </div>
                  {h.title}
                </div>
              ))}
            </div>
          </div>

          {data._meta && (
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              <strong>Metadata:</strong>
              <div>Input tokens: {data._meta.input_tokens}</div>
              <div>Output tokens: {data._meta.output_tokens}</div>
              <div>Cost: ${data._meta.cost_usd.toFixed(5)}</div>
            </div>
          )}
        </div>
      );
    }

    // Special rendering for weather service - show AI insights
    if (serviceId === 'weather') {
      return (
        <div style={{ marginTop: '12px' }}>
          {data.daily_summary && (
            <div style={{ marginBottom: '12px' }}>
              <strong>AI Weather Summary:</strong>
              <div style={{
                background: '#f5f5f5',
                padding: '12px',
                borderRadius: '8px',
                marginTop: '8px',
                fontStyle: 'italic'
              }}>
                {data.daily_summary}
              </div>
            </div>
          )}

          {data._ai_meta && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
              <strong>AI Metadata:</strong>
              <div>Input tokens: {data._ai_meta.input_tokens}</div>
              <div>Output tokens: {data._ai_meta.output_tokens}</div>
              <div>Cost: ${data._ai_meta.cost_usd.toFixed(5)}</div>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <strong>Weather Data:</strong>
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              <div>Locations: {data.locations?.length || 0}</div>
              <div>Forecast days: {data.forecast?.length || 0}</div>
              <div>Hourly forecast entries: {data.hourlyForecast?.length || 0}</div>
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for markets service
    if (serviceId === 'markets') {
      return (
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Market Quotes ({data.quotes?.length || 0}):</strong>
            <div style={{ marginTop: '8px' }}>
              {data.quotes?.map((quote: any, i: number) => (
                <div key={i} style={{
                  padding: '12px',
                  borderLeft: `3px solid ${quote.change >= 0 ? '#16a34a' : '#dc2626'}`,
                  marginBottom: '8px',
                  fontSize: '13px',
                  background: '#f9fafb'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {quote.name} ({quote.symbol})
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px' }}>
                      {quote.currency === 'USD' ? '$' : ''}{quote.price.toLocaleString()}
                    </span>
                    <span style={{ color: quote.change >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                      {quote.change >= 0 ? '+' : ''}{quote.change} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.lastUpdated && (
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Last updated: {new Date(data.lastUpdated).toLocaleString()}
            </div>
          )}
        </div>
      );
    }

    // Default JSON rendering for other services
    return (
      <div style={{ marginTop: '12px' }}>
        <strong>Data:</strong>
        <pre style={{
          background: '#f5f5f5',
          padding: '12px',
          borderRadius: '8px',
          overflow: 'auto',
          maxHeight: '400px',
          fontSize: '11px',
          marginTop: '8px'
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="container">
      <h1>Test Services</h1>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Manually trigger and inspect individual services. Use "Test (Fresh)" to bypass cache.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {services.map(service => {
          const result = testResults[service.id];
          const isExpanded = expandedService === service.id;
          const isTesting = testing[service.id];

          return (
            <div key={service.id} className="card" style={{
              borderLeft: `4px solid ${getStatusColor(result)}`
            }}>
              <div style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 4px 0' }}>{service.name}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                  {service.description}
                </p>
              </div>

              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: result ? '12px' : 0
              }}>
                <button
                  className="btn"
                  onClick={() => testService(service.id, false)}
                  disabled={isTesting}
                >
                  {isTesting ? 'Testing...' : 'Test'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => testService(service.id, true)}
                  disabled={isTesting}
                >
                  Test (Fresh)
                </button>
                {result && (
                  <button
                    className="btn-secondary"
                    onClick={() => setExpandedService(isExpanded ? null : service.id)}
                  >
                    {isExpanded ? 'Hide Details' : 'Show Details'}
                  </button>
                )}
              </div>

              {result && (
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    padding: '8px',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    marginBottom: isExpanded ? '12px' : 0
                  }}>
                    <span style={{ color: getStatusColor(result) }}>
                      {getStatusText(result)}
                    </span>
                    <span style={{ color: '#6b7280' }}>
                      {result.latency}
                    </span>
                  </div>

                  {isExpanded && (
                    <div>
                      {result.cache_info && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                          <div>Cache TTL: {result.cache_info.ttl_minutes} minutes</div>
                          <div>Cache Key: {result.cache_info.cache_key}</div>
                        </div>
                      )}

                      {result.status && (
                        <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                          <strong>Status:</strong>
                          <div style={{
                            background: '#f5f5f5',
                            padding: '8px',
                            borderRadius: '4px',
                            marginTop: '4px'
                          }}>
                            <div>State: {result.status.state}</div>
                            <div>Enabled: {result.status.isEnabled ? 'Yes' : 'No'}</div>
                            {result.status.latency && <div>API Latency: {result.status.latency}ms</div>}
                            {result.status.error && <div style={{ color: '#dc2626' }}>Error: {result.status.error}</div>}
                          </div>
                        </div>
                      )}

                      {result.data && renderData(result.data, service.id)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '32px', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px 0' }}>API Usage</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          You can also test services via API:
        </p>
        <code style={{
          display: 'block',
          background: 'white',
          padding: '12px',
          borderRadius: '4px',
          marginTop: '8px',
          fontSize: '12px',
          border: '1px solid #e5e7eb'
        }}>
          GET /api/test-service?service=news&fresh=true
        </code>
      </div>
    </div>
  );
}
