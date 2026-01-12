'use client';

import type { DashboardData } from '@/lib/types';
import './AvanttBriefing.css';
import {
  SunIcon,
  CloudSunIcon,
  CloudIcon,
  CloudRainIcon,
  SnowflakeIcon,
  LightningIcon,
  ArrowClockwiseIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CaretUpIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';

interface AvanttBriefingProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function AvanttBriefing({
  data,
  display_width,
  display_height,
}: AvanttBriefingProps) {
  const {
    date,
    current_temp,
    feels_like,
    weather_description,
    weather_icon,
    forecast,
    hourlyForecast,
    sun,
    daily_summary,
    news_summary,
    news_headlines,
    markets,
    units,
  } = data;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  };

  const to24Hour = (timeStr: string) => {
    if (!timeStr) return '--';
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return timeStr;
    let hours = parseInt(match[1]);
    const minutes = match[2];
    const period = match[3]?.toLowerCase();
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  };

  const tempSymbol = units?.temperature?.replace(/[A-Za-z]/g, '').trim() || '°';

  // Get next 12 hours of precipitation data
  const precipitationData = hourlyForecast.slice(0, 12);

  // Calculate temperature range for forecast graph
  const forecastTemps = forecast.slice(0, 5).flatMap(d => [d.high, d.low]);
  const minTemp = Math.min(...forecastTemps);
  const maxTemp = Math.max(...forecastTemps);
  const tempRange = maxTemp - minTemp || 1;

  const getWeatherIcon = (icon: string) => {
    const iconLower = icon.toLowerCase();
    const props = { size: "1em", weight: "fill" as const };

    if (iconLower.includes('sunny') || iconLower.includes('clear')) return <SunIcon {...props} />;
    if (iconLower.includes('partly')) return <CloudSunIcon {...props} />;
    if (iconLower.includes('cloud')) return <CloudIcon {...props} />;
    if (iconLower.includes('rain')) return <CloudRainIcon {...props} />;
    if (iconLower.includes('snow')) return <SnowflakeIcon {...props} />;
    if (iconLower.includes('thunder') || iconLower.includes('storm')) return <LightningIcon {...props} />;
    return <SunIcon {...props} />;
  };

  const getFriendlyMarketName = (symbol: string) => {
    const mapping: Record<string, string> = {
      '^GSPC': 'S&P 500',
      '^DJI': 'Dow J.',
      '^IXIC': 'Nasdaq',
      'CL=F': 'Crude',
      'GC=F': 'Gold',
      'BTC-USD': 'Bitcoin',
      'ETH-USD': 'Ethereum',
    };
    return mapping[symbol] || symbol;
  };

  const getShortSourceName = (source: string) => {
    const lower = source.toLowerCase();
    if (lower.includes('abc')) return 'ABC';
    if (lower.includes('rnz')) return 'RNZ';
    if (lower.includes('bbc')) return 'BBC';
    if (lower.includes('cnn')) return 'CNN';
    if (lower.includes('reuters')) return 'REU';
    if (lower.includes('guardian')) return 'GDN';
    if (lower.includes('nyt') || lower.includes('new york times')) return 'NYT';
    if (lower.includes('ap') || lower.includes('associated press')) return 'AP';
    return source.slice(0, 3).toUpperCase();
  };

  const getDiverseHeadlines = () => {
    if (!news_headlines || news_headlines.length === 0) return [];
    const seenSources = new Set<string>();
    const diverse: typeof news_headlines = [];
    // First pass: get one from each unique source
    for (const headline of news_headlines) {
      if (!seenSources.has(headline.source)) {
        diverse.push(headline);
        seenSources.add(headline.source);
        if (diverse.length >= 4) break;
      }
    }
    // Second pass: fill remaining slots if needed
    if (diverse.length < 4) {
      for (const headline of news_headlines) {
        if (!diverse.includes(headline)) {
          diverse.push(headline);
          if (diverse.length >= 4) break;
        }
      }
    }
    return diverse;
  };

  const formatRefreshTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="ab-container">
      <link rel="stylesheet" href="/styles/fonts/fonts.css" />
      <style>{`
        :root { 
          --display-width: ${display_width}px; 
          --display-height: ${display_height}px; 
        }
        body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Refresh time indicator */}
      <div className="ab-refresh-time">
        <ArrowClockwiseIcon size="1em" weight="bold" />
        <span>{formatRefreshTime(date)}</span>
      </div>

      {/* Wrapper with padding to keep dividers away from edges */}
      <div className="ab-wrapper">
        {/* Header Section - Top 1/3 */}
        <div className="ab-header">
          {/* Left Column - Date & Sun */}
          <div className="ab-header-left">
            <div className="ab-hero-text">{formatDate(date)}</div>
            <div className="ab-sun-times">
              <span className="ab-sun-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUpIcon size="1em" weight="bold" /> {to24Hour(sun?.sunrise)}
              </span>
              <span className="ab-sun-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowDownIcon size="1em" weight="bold" /> {to24Hour(sun?.sunset)}
              </span>
            </div>
          </div>

          {/* Middle Column - 5-day Forecast Graph */}
          <div className="ab-header-middle">
            <div className="ab-forecast-graph">
              {forecast.slice(0, 5).map((day, i) => {
                const highPct = ((day.high - minTemp) / tempRange) * 100;
                const lowPct = ((day.low - minTemp) / tempRange) * 100;

                return (
                  <div key={i} className="ab-forecast-day">
                    <div className="ab-weather-icon">{getWeatherIcon(day.icon)}</div>
                    <div className="ab-temp-high">{Math.round(day.high)}</div>
                    <div className="ab-temp-bar-container">
                      <div
                        className="ab-temp-bar"
                        style={{
                          bottom: `${lowPct}%`,
                          height: `${highPct - lowPct}%`
                        }}
                      ></div>
                    </div>
                    <div className="ab-temp-low">{Math.round(day.low)}</div>
                    <div className="ab-forecast-label">{day.day.charAt(0)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column - Current Status */}
          <div className="ab-header-right">
            <div className="ab-current">
              <span className="ab-current-icon">{getWeatherIcon(weather_icon)}</span>
              <span className="ab-hero-text">{Math.round(current_temp)}{tempSymbol}</span>
            </div>
            <div className="ab-current-details">
              {weather_description}, feels like {Math.round(feels_like)}{tempSymbol}
            </div>
          </div>
        </div>

        <div className="ab-divider"></div>

        {/* Briefing Section - Middle */}
        <div className="ab-briefing">
          <div className="ab-forecast-summary">{daily_summary || 'No forecast available.'}</div>

          <div className="ab-divider"></div>

          <div className="ab-news">
            <div className="ab-news-item ab-news-header">
              {news_summary && <span className="ab-news-main">{news_summary}</span>}
            </div>
            {news_headlines && news_headlines.length > 0 ? (
              getDiverseHeadlines().map((headline, i) => (
                <div key={i} className="ab-news-item">
                  <span className="ab-news-source">{getShortSourceName(headline.source)}</span>
                  {headline.title}
                </div>
              ))
            ) : (
              <div className="ab-news-item">No news available</div>
            )}
          </div>
        </div>

        <div className="ab-divider"></div>

        {/* Footer Section - Bottom */}
        <div className="ab-footer">
          {/* Left Column - Markets */}
          <div className="ab-footer-left">
            {markets && markets.quotes && markets.quotes.length > 0 ? (
              markets.quotes.map((quote, i) => (
                <div key={i} className="ab-market-item">
                  <div className="ab-market-arrow">
                    {quote.change >= 0 ?
                      <CaretUpIcon size="1em" weight="fill" /> :
                      <CaretDownIcon size="1em" weight="fill" />
                    }
                  </div>
                  <div className="ab-market-label">{getFriendlyMarketName(quote.symbol)}</div>
                  <div className="ab-market-change">
                    {quote.changePercent > 0 ? '+' : ''}{quote.changePercent.toFixed(1)}%
                  </div>
                </div>
              ))
            ) : (
              <div className="ab-no-markets">No market data available</div>
            )}
          </div>

          {/* Right Column - Precipitation */}
          <div className="ab-footer-right">
            <div className="ab-precip-header">Chance of rain (12h)</div>
            <div className="ab-precip-chart">
              <div className="ab-precip-grid">
                <div className="ab-precip-line" style={{ bottom: '25%' }}></div>
                <div className="ab-precip-line" style={{ bottom: '50%' }}></div>
                <div className="ab-precip-line" style={{ bottom: '75%' }}></div>
              </div>
              <div className="ab-precip-bars">
                {precipitationData.map((hour, i) => {
                  const d = new Date(hour.time);
                  const hourLabel = d.getHours();
                  const shouldShowLabel = i % 3 === 0;

                  return (
                    <div key={i} className="ab-precip-bar-container">
                      <div
                        className="ab-precip-bar"
                        style={{ height: `${hour.rain_chance}%` }}
                      ></div>
                      {shouldShowLabel && (
                        <div className="ab-precip-label">
                          {hourLabel.toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
