'use client';

import { useEffect } from 'react';
import type { DashboardData } from '@/lib/types';
import './TerminalMatrix.css';

interface TerminalMatrixProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function TerminalMatrix({
  data,
  battery_level,
  display_width,
  display_height,
}: TerminalMatrixProps) {
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
    uv_index,
    visibility,
    pressure,
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

  const formatDateTime = (date: string) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}:${seconds}`,
    };
  };

  const weatherIconMap: Record<string, string> = {
    sunny: '☀',
    clear: '☀',
    partly_cloudy: '⛅',
    cloudy: '☁',
    overcast: '☁',
    rain: '🌧',
    drizzle: '🌦',
    showers: '🌧',
    stormy: '⛈',
    thunder: '⛈',
    snow: '🌨',
    sleet: '🌨',
    fog: '🌫',
    mist: '🌫',
    haze: '🌫',
    wind: '💨',
    default: '☀',
  };

  const getWeatherIcon = (iconCode: string) => {
    if (!iconCode) return '■';
    const code = String(iconCode).toLowerCase();
    return weatherIconMap[code] || '■';
  };

  const temperatureSymbol = units?.temperature?.replace(/[A-Za-z]/g, '').trim() || '°';
  const dateTime = formatDateTime(date);

  // Pad text for terminal alignment
  const pad = (text: string, length: number, right = false) => {
    const str = String(text);
    if (right) return str.padStart(length, ' ');
    return str.padEnd(length, ' ');
  };

  return (
    <div className="terminal-container">
      <style>
        {`
          :root {
            --display-width: ${display_width}px;
            --display-height: ${display_height}px;
          }
        `}
      </style>

      {/* Terminal header */}
      <div className="terminal-header">
        <div className="terminal-status-line">
          <span>┌─ SYSTEM DASHBOARD ─────────────────────────────────────────────────┐</span>
        </div>
        <div className="terminal-status-line">
          <span>│ DATE: {dateTime.date} │ TIME: {dateTime.time} │ BAT: {battery_level !== null ? `${battery_level}%`.padStart(4) : ' N/A'} │</span>
        </div>
        <div className="terminal-status-line">
          <span>└────────────────────────────────────────────────────────────────────┘</span>
        </div>
      </div>

      {/* Main terminal display */}
      <div className="terminal-main">
        {/* Weather block */}
        <div className="terminal-block">
          <div className="terminal-block-header">
            ╔═══════════════════════ WEATHER ════════════════════════╗
          </div>
          <div className="terminal-block-content">
            <div className="terminal-weather-hero">
              <div className="terminal-weather-icon">{getWeatherIcon(weather_icon)}</div>
              <div className="terminal-weather-data">
                <div className="terminal-temp-huge">
                  {String(Math.round(current_temp)).padStart(3, ' ')}{temperatureSymbol}
                </div>
                <div className="terminal-weather-desc">{weather_description.toUpperCase()}</div>
                <div className="terminal-weather-feels">FEELS_LIKE: {Math.round(feels_like)}{temperatureSymbol}</div>
              </div>
              <div className="terminal-weather-stats">
                <div>HUMID: {String(humidity).padStart(3)}%</div>
                <div>WIND_: {String(wind?.speed?.toFixed(0) || '--').padStart(3)}{units?.wind_speed || ''}</div>
                <div>UV___: {String(Math.round(uv_index || 0)).padStart(3)}</div>
                <div>VISIBL: {String(Math.round(visibility || 0)).padStart(3)}km</div>
                <div>PRESS_: {String(Math.round(pressure || 0)).padStart(4)}mb</div>
              </div>
            </div>
          </div>
          <div className="terminal-block-footer">
            ╚════════════════════════════════════════════════════════╝
          </div>
        </div>

        {/* Multi-block layout */}
        <div className="terminal-grid">
          {/* Forecast block */}
          <div className="terminal-block">
            <div className="terminal-block-header">
              ┌─ 5DAY_FORECAST ─────────┐
            </div>
            <div className="terminal-block-content terminal-forecast">
              {forecast.slice(0, 5).map((day, i) => (
                <div key={i} className="terminal-forecast-row">
                  <span className="terminal-forecast-day">{day.day.slice(0, 3).toUpperCase()}</span>
                  <span className="terminal-forecast-icon">{getWeatherIcon(day.icon)}</span>
                  <span className="terminal-forecast-temp">
                    {String(Math.round(day.high)).padStart(3)}{temperatureSymbol}
                  </span>
                  <span className="terminal-forecast-bar">
                    {'█'.repeat(Math.floor(day.rain_chance / 10))}
                    {'░'.repeat(10 - Math.floor(day.rain_chance / 10))}
                  </span>
                </div>
              ))}
            </div>
            <div className="terminal-block-footer">
              └─────────────────────────┘
            </div>
          </div>

          {/* Markets block */}
          {markets && markets.quotes && markets.quotes.length > 0 && (
            <div className="terminal-block">
              <div className="terminal-block-header">
                ┌─ MARKET_DATA ───────────┐
              </div>
              <div className="terminal-block-content terminal-markets">
                {markets.quotes.slice(0, 5).map((quote, i) => (
                  <div key={i} className="terminal-market-row">
                    <span className="terminal-market-symbol">{pad(quote.symbol, 6)}</span>
                    <span className="terminal-market-price">{String(quote.price.toFixed(2)).padStart(8)}</span>
                    <span className={`terminal-market-change ${quote.change >= 0 ? 'positive' : 'negative'}`}>
                      {quote.change >= 0 ? '▲' : '▼'}{String(Math.abs(quote.changePercent).toFixed(1)).padStart(5)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="terminal-block-footer">
                └─────────────────────────┘
              </div>
            </div>
          )}
        </div>

        {/* Calendar block */}
        <div className="terminal-block">
          <div className="terminal-block-header">
            ┌─ SCHEDULE ─────────────────────────────────────────────┐
          </div>
          <div className="terminal-block-content terminal-calendar">
            {calendar_events && calendar_events.length > 0 ? (
              calendar_events.slice(0, 4).map((event, i) => (
                <div key={i} className="terminal-calendar-row">
                  <span className="terminal-event-time">[{event.time}]</span>
                  <span className="terminal-event-title">{event.title}</span>
                </div>
              ))
            ) : (
              <div className="terminal-empty">NO_SCHEDULED_EVENTS</div>
            )}
          </div>
          <div className="terminal-block-footer">
            └────────────────────────────────────────────────────────┘
          </div>
        </div>

        {/* News block */}
        <div className="terminal-block">
          <div className="terminal-block-header">
            ┌─ NEWS_FEED ────────────────────────────────────────────┐
          </div>
          <div className="terminal-block-content terminal-news">
            {news_summary || daily_summary || 'NO_NEWS_DATA_AVAILABLE'}
          </div>
          <div className="terminal-block-footer">
            └────────────────────────────────────────────────────────┘
          </div>
        </div>
      </div>

      {/* Terminal footer */}
      <div className="terminal-footer">
        <span>─────────────────────── SYSTEM_OK ─────────────────────</span>
      </div>
    </div>
  );
}
