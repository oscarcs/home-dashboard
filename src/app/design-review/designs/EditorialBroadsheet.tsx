'use client';

import { useEffect } from 'react';
import type { DashboardData } from '@/lib/types';
import './EditorialBroadsheet.css';

interface EditorialBroadsheetProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function EditorialBroadsheet({
  data,
  battery_level,
  display_width,
  display_height,
}: EditorialBroadsheetProps) {
  const {
    date,
    current_temp,
    feels_like,
    weather_description,
    weather_icon,
    humidity,
    wind,
    forecast,
    calendar_events,
    daily_summary,
    units,
    markets,
    news_summary,
    sun,
    moon,
    uv_index,
  } = data;

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@phosphor-icons/web@2.0.3';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const formatDate = (date: string) => {
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      full: `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      day: days[d.getDay()],
      month: months[d.getMonth()],
      date: d.getDate(),
      year: d.getFullYear(),
    };
  };

  const weatherIconMap: Record<string, string> = {
    sunny: 'ph-sun',
    clear: 'ph-sun',
    partly_cloudy: 'ph-cloud-sun',
    cloudy: 'ph-cloud',
    overcast: 'ph-cloud',
    rain: 'ph-cloud-rain',
    drizzle: 'ph-cloud-rain',
    showers: 'ph-cloud-rain',
    stormy: 'ph-cloud-lightning',
    thunder: 'ph-cloud-lightning',
    snow: 'ph-cloud-snow',
    sleet: 'ph-cloud-snow',
    fog: 'ph-cloud-fog',
    mist: 'ph-cloud-fog',
    haze: 'ph-cloud-fog',
    wind: 'ph-wind',
    default: 'ph-sun',
  };

  const getWeatherIcon = (iconCode: string) => {
    if (!iconCode) return weatherIconMap.default;
    const code = String(iconCode).toLowerCase();
    return weatherIconMap[code] || weatherIconMap.default;
  };

  const temperatureSymbol = units?.temperature?.replace(/[A-Za-z]/g, '').trim() || '°';
  const dateInfo = formatDate(date);

  return (
    <div className="editorial-container">
      <style>
        {`
          :root {
            --display-width: ${display_width}px;
            --display-height: ${display_height}px;
          }
        `}
      </style>

      {/* Newspaper masthead */}
      <div className="editorial-masthead">
        <div className="editorial-masthead-line"></div>
        <div className="editorial-nameplate">THE DAILY FORECAST</div>
        <div className="editorial-date-line">{dateInfo.full}</div>
        <div className="editorial-masthead-line"></div>
      </div>

      {/* Main headline section */}
      <div className="editorial-headline-section">
        <div className="editorial-lead-story">
          <div className="editorial-weather-graphic">
            <i className={`ph-bold ${getWeatherIcon(weather_icon)}`}></i>
            <div className="editorial-temp-display">
              <span className="editorial-temp-large">{Math.round(current_temp)}</span>
              <span className="editorial-temp-symbol">{temperatureSymbol}</span>
            </div>
          </div>
          <div className="editorial-lead-content">
            <div className="editorial-headline">{weather_description}</div>
            <div className="editorial-subhead">{daily_summary}</div>
            <div className="editorial-byline">
              Feels like {Math.round(feels_like)}{temperatureSymbol} · Humidity {humidity}% · Wind {wind?.speed?.toFixed(0) || '--'}{units?.wind_speed || ''}
            </div>
          </div>
        </div>
      </div>

      {/* Multi-column layout */}
      <div className="editorial-columns">
        {/* Column 1: Extended Forecast */}
        <div className="editorial-column">
          <div className="editorial-section-head">Extended Outlook</div>
          <div className="editorial-forecast-list">
            {forecast.slice(0, 5).map((day, i) => (
              <div key={i} className="editorial-forecast-item">
                <div className="editorial-forecast-day">{day.day}</div>
                <i className={`ph-bold ${getWeatherIcon(day.icon)}`}></i>
                <div className="editorial-forecast-temps">
                  <span className="editorial-high">{Math.round(day.high)}{temperatureSymbol}</span>
                  <span className="editorial-divider">/</span>
                  <span className="editorial-low">{Math.round(day.low)}{temperatureSymbol}</span>
                </div>
                <div className="editorial-forecast-precip">{day.rain_chance}%</div>
              </div>
            ))}
          </div>

          {/* Weather details box */}
          <div className="editorial-box">
            <div className="editorial-box-head">Conditions</div>
            <div className="editorial-detail-grid">
              <div className="editorial-detail">
                <span className="editorial-detail-label">UV Index</span>
                <span className="editorial-detail-value">{Math.round(uv_index || 0)}</span>
              </div>
              <div className="editorial-detail">
                <span className="editorial-detail-label">Moon</span>
                <span className="editorial-detail-value">{moon?.phase?.replace(/_/g, ' ') || 'N/A'}</span>
              </div>
              <div className="editorial-detail">
                <span className="editorial-detail-label">Sunrise</span>
                <span className="editorial-detail-value">{sun?.sunrise || 'N/A'}</span>
              </div>
              <div className="editorial-detail">
                <span className="editorial-detail-label">Sunset</span>
                <span className="editorial-detail-value">{sun?.sunset || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Markets & Calendar */}
        <div className="editorial-column">
          {/* Markets section */}
          {markets && markets.quotes && markets.quotes.length > 0 && (
            <>
              <div className="editorial-section-head">Market Watch</div>
              <div className="editorial-markets-table">
                {markets.quotes.slice(0, 5).map((quote, i) => (
                  <div key={i} className="editorial-market-row">
                    <div className="editorial-market-symbol">{quote.symbol}</div>
                    <div className="editorial-market-price">{quote.price.toFixed(2)}</div>
                    <div className={`editorial-market-change ${quote.change >= 0 ? 'positive' : 'negative'}`}>
                      {quote.change >= 0 ? '▲' : '▼'} {Math.abs(quote.changePercent).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Calendar section */}
          <div className="editorial-section-head" style={{ marginTop: '12px' }}>Today's Schedule</div>
          <div className="editorial-calendar">
            {calendar_events && calendar_events.length > 0 ? (
              calendar_events.slice(0, 6).map((event, i) => (
                <div key={i} className="editorial-calendar-item">
                  <div className="editorial-event-time">{event.time}</div>
                  <div className="editorial-event-title">{event.title}</div>
                </div>
              ))
            ) : (
              <div className="editorial-no-events">No scheduled events</div>
            )}
          </div>
        </div>

        {/* Column 3: News Brief */}
        <div className="editorial-column">
          <div className="editorial-section-head">News Brief</div>
          <div className="editorial-news-body">
            {news_summary || 'No news available at this time.'}
          </div>

          {/* System status box */}
          {battery_level !== null && (
            <div className="editorial-box" style={{ marginTop: 'auto' }}>
              <div className="editorial-box-head">System Status</div>
              <div className="editorial-system-info">
                <div>Battery: {battery_level}%</div>
                <div>Updated: {new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer rule */}
      <div className="editorial-footer-rule"></div>
    </div>
  );
}
