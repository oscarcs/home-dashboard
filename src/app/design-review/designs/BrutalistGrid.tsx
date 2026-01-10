'use client';

import { useEffect } from 'react';
import type { DashboardData } from '@/lib/types';
import './BrutalistGrid.css';

interface BrutalistGridProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function BrutalistGrid({
  data,
  battery_level,
  display_width,
  display_height,
}: BrutalistGridProps) {
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
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      day: days[d.getDay()],
      date: d.getDate(),
      month: months[d.getMonth()],
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
    <div className="brutalist-container">
      <style>
        {`
          :root {
            --display-width: ${display_width}px;
            --display-height: ${display_height}px;
          }
        `}
      </style>

      {/* Masthead with angular geometric design */}
      <div className="brutalist-masthead">
        <div className="brutalist-date-block">
          <div className="brutalist-date-large">{dateInfo.date}</div>
          <div className="brutalist-date-meta">
            <div>{dateInfo.month}</div>
            <div className="brutalist-slash">/</div>
            <div>{dateInfo.year}</div>
          </div>
        </div>

        <div className="brutalist-title-block">
          <div className="brutalist-day">{dateInfo.day}</div>
          <div className="brutalist-condition">{weather_description.toUpperCase()}</div>
        </div>

        <div className="brutalist-temp-hero">
          <i className={`ph-bold ${getWeatherIcon(weather_icon)}`}></i>
          <div className="brutalist-temp-massive">{Math.round(current_temp)}</div>
          <div className="brutalist-temp-unit">{temperatureSymbol}</div>
        </div>
      </div>

      {/* Main grid layout */}
      <div className="brutalist-main-grid">
        {/* Left column: Calendar & Markets */}
        <div className="brutalist-left-column">
          {/* Calendar section */}
          <div className="brutalist-section">
            <div className="brutalist-section-header">
              <i className="ph-bold ph-calendar-blank"></i>
              <span>SCHEDULE</span>
            </div>
            <div className="brutalist-events">
              {calendar_events && calendar_events.length > 0 ? (
                calendar_events.slice(0, 5).map((event, i) => (
                  <div key={i} className="brutalist-event">
                    <div className="brutalist-event-time">{event.time}</div>
                    <div className="brutalist-event-title">{event.title}</div>
                  </div>
                ))
              ) : (
                <div className="brutalist-empty">NO EVENTS</div>
              )}
            </div>
          </div>

          {/* Markets section */}
          {markets && markets.quotes && markets.quotes.length > 0 && (
            <div className="brutalist-section">
              <div className="brutalist-section-header">
                <i className="ph-bold ph-trend-up"></i>
                <span>MARKETS</span>
              </div>
              <div className="brutalist-markets">
                {markets.quotes.slice(0, 4).map((quote, i) => (
                  <div key={i} className="brutalist-market-row">
                    <div className="brutalist-market-symbol">{quote.symbol}</div>
                    <div className="brutalist-market-price">{quote.price.toFixed(2)}</div>
                    <div className={`brutalist-market-change ${quote.change >= 0 ? 'positive' : 'negative'}`}>
                      {quote.change >= 0 ? '+' : ''}{quote.changePercent.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center column: Weather forecast */}
        <div className="brutalist-center-column">
          <div className="brutalist-section">
            <div className="brutalist-section-header">
              <i className="ph-bold ph-chart-line"></i>
              <span>5-DAY OUTLOOK</span>
            </div>
            <div className="brutalist-forecast">
              {forecast.slice(0, 5).map((day, i) => (
                <div key={i} className="brutalist-forecast-day">
                  <div className="brutalist-forecast-label">{day.day.toUpperCase().slice(0, 3)}</div>
                  <i className={`ph-bold ${getWeatherIcon(day.icon)}`}></i>
                  <div className="brutalist-forecast-temp">{Math.round(day.high)}{temperatureSymbol}</div>
                  <div className="brutalist-forecast-rain">
                    <div className="brutalist-rain-bar" style={{ height: `${day.rain_chance}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="brutalist-stats-grid">
            <div className="brutalist-stat-card">
              <div className="brutalist-stat-label">FEELS</div>
              <div className="brutalist-stat-value">{Math.round(feels_like)}{temperatureSymbol}</div>
            </div>
            <div className="brutalist-stat-card">
              <div className="brutalist-stat-label">HUMID</div>
              <div className="brutalist-stat-value">{humidity}%</div>
            </div>
            <div className="brutalist-stat-card">
              <div className="brutalist-stat-label">WIND</div>
              <div className="brutalist-stat-value">{wind?.speed?.toFixed(0) || '--'}</div>
            </div>
          </div>
        </div>

        {/* Right column: News */}
        <div className="brutalist-right-column">
          <div className="brutalist-section brutalist-news-section">
            <div className="brutalist-section-header">
              <i className="ph-bold ph-newspaper"></i>
              <span>NEWS BRIEF</span>
            </div>
            <div className="brutalist-news-content">
              {news_summary || daily_summary || 'No news available'}
            </div>
          </div>
        </div>
      </div>

      {/* Footer system info */}
      {battery_level !== null && (
        <div className="brutalist-system-bar">
          <span>PWR: {battery_level}%</span>
          <span className="brutalist-system-separator">|</span>
          <span>SYNC: {new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
    </div>
  );
}
