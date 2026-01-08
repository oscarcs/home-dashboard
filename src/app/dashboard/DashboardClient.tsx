'use client';

import { useEffect } from 'react';
import type { DashboardData } from '@/lib/types';
import './dashboard.css';

interface DashboardClientProps {
  data: DashboardData;
  battery_level: number | null;
  hasCustomFonts: boolean;
  display_width: number;
  display_height: number;
}

export default function DashboardClient({
  data,
  battery_level,
  hasCustomFonts,
  display_width,
  display_height,
}: DashboardClientProps) {
  const {
    date,
    current_temp,
    feels_like,
    weather_description,
    weather_icon,
    humidity,
    wind,
    locations,
    forecast,
    sun,
    moon,
    air_quality,
    uv_index,
    visibility,
    cloud_cover,
    calendar_events,
    daily_summary,
    temp_comparison,
    clothing_suggestion,
    units,
    hourlyForecast,
  } = data;

  useEffect(() => {
    // Load Phosphor Icons
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@phosphor-icons/web@2.0.3';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    // Draw forecast graph
    const drawForecast = () => {
      const container = document.getElementById('forecast-graph');
      const svg = document.getElementById('forecast-svg');
      const columns = container?.querySelectorAll('.forecast-column');

      if (!container || !svg || !columns || columns.length === 0) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      const topPadding = 24;
      const bottomPadding = 28;

      const temps = Array.from(columns).map(col =>
        parseInt((col as HTMLElement).dataset.temp || '0')
      );
      const maxTemp = Math.max(...temps);
      const minTemp = Math.min(...temps);
      const range = maxTemp - minTemp || 10;

      const columnWidth = width / columns.length;
      const graphHeight = height - bottomPadding;
      const availableHeight = graphHeight - topPadding;

      const points = temps.map((temp, i) => {
        const x = i * columnWidth + columnWidth / 2;
        const normalizedTemp = (temp - minTemp) / range;
        const y = topPadding + availableHeight * (1 - normalizedTemp);
        return { x, y, temp };
      });

      svg.setAttribute('width', width.toString());
      svg.setAttribute('height', height.toString());
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      let pathData = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const midX = (curr.x + next.x) / 2;
        pathData += ` C ${midX} ${curr.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
      }

      svg.innerHTML = '';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#000');
      path.setAttribute('stroke-width', '1');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      points.forEach((point, i) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', point.x.toString());
        circle.setAttribute('cy', point.y.toString());
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', '#000');
        svg.appendChild(circle);

        const column = columns[i] as HTMLElement;
        const tempLabel = column.querySelector('.forecast-temp-label') as HTMLElement;
        const iconClass = column.dataset.icon;
        const icon = tempLabel?.querySelector('.icon-sm');
        const tempValue = tempLabel?.querySelector('.temp-value');

        if (icon && iconClass) {
          icon.className = 'ph-bold icon-sm ' + iconClass;
        }
        if (tempValue) {
          tempValue.textContent = point.temp + temperatureSymbol;
        }
        if (tempLabel) {
          tempLabel.style.top = point.y - 18 + 'px';
        }
      });
    };

    setTimeout(drawForecast, 100);
    window.addEventListener('resize', drawForecast);

    return () => {
      window.removeEventListener('resize', drawForecast);
    };
  }, [forecast]);

  // Helper functions
  const formatDate = (date: string) => {
    const d = new Date(date);
    const days = ['Sun', 'Mon', 'Tues', 'Weds', 'Thurs', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const dayName = days[d.getDay()];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${dayName} ${month} ${day}${suffix}, ${year}`;
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')}${ampm}`;
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

  const isNighttime = () => {
    if (!sun?.sunrise || !sun?.sunset) return false;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const parseTime = (timeStr: string) => {
      const [time, period] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return new Date(`${today}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
    };

    const sunrise = parseTime(sun.sunrise);
    const sunset = parseTime(sun.sunset);

    return now < sunrise || now > sunset;
  };

  const getWeatherIcon = (iconCode: string, applyNighttime = true) => {
    if (!iconCode) return weatherIconMap.default;
    const code = String(iconCode).toLowerCase();

    if (applyNighttime && (code === 'sunny' || code === 'clear') && isNighttime()) {
      return 'ph-moon';
    }

    return weatherIconMap[code] || weatherIconMap.default;
  };

  const temperatureSymbol = (() => {
    if (units && units.temperature) {
      const rawUnit = String(units.temperature);
      const stripped = rawUnit.replace(/[A-Za-z]/g, '').trim();
      return stripped || '°';
    }
    return '°';
  })();

  const windSpeedUnit = units?.wind_speed || 'mph';
  const formatWindSpeed = (value: number | null | undefined) =>
    value === null || typeof value === 'undefined' || Number.isNaN(Number(value)) ? '--' : Number(value).toFixed(1);

  const getMoonPhaseSVG = (phase: string, direction: string, illumination: number | null) => {
    const size = 20;
    const center = size / 2;
    const outerRadius = size / 2;
    const innerRadius = outerRadius - 2;

    const num = Number(illumination);
    if (!Number.isFinite(num)) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display: block;"><circle cx="${center}" cy="${center}" r="${outerRadius}" fill="currentColor"/><circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white"/></svg>`;
    }

    const actualIllumination = num;
    const isWaxing = direction === 'waxing';
    const maskId = `moon-mask-${phase}-${direction}`;

    const f = Math.max(0, Math.min(1, actualIllumination / 100));
    const dx = 2 * innerRadius * f;
    const maskCx = isWaxing ? center - dx : center + dx;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display: block;">
      <defs>
        <mask id="${maskId}">
          <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white"/>
          <circle cx="${maskCx}" cy="${center}" r="${innerRadius}" fill="black"/>
        </mask>
      </defs>
      <circle cx="${center}" cy="${center}" r="${outerRadius}" fill="currentColor"/>
      <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white" mask="url(#${maskId})"/>
    </svg>`;
  };

  return (
    <>
      <style>
        {`
          :root {
            --display-width: ${display_width}px;
            --display-height: ${display_height}px;
          }
        `}
      </style>
      {!hasCustomFonts && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </>
      )}
      {hasCustomFonts && <link rel="stylesheet" href="/styles/fonts/fonts.css" />}

      <div className="system-info text-label-sm">
        {battery_level !== null && battery_level <= 10 && (
          <div className="battery-warning">Battery Low</div>
        )}
        <div>
          <i className="ph-bold ph-arrows-clockwise"></i>
          {formatTime(date)}
          {battery_level !== null && (
            <div className="battery" style={{ '--battery-level': battery_level / 100 } as any}></div>
          )}
        </div>
      </div>

      <div className="header">
        <div className="current-conditions">
          <div className="main-weather-icon">
            <i className={`ph ${getWeatherIcon(weather_icon)}`}></i>
          </div>
          <div className="big-temp">
            {Math.round(current_temp)}
            {temperatureSymbol}
          </div>
          <div className="text-sm">
            Feels like {Math.round(feels_like)}
            {temperatureSymbol}
          </div>
          <div className="text-sm flex items-center nowrap" style={{ marginTop: '8px', gap: '6px' }}>
            <i className="ph-bold ph-sun-horizon icon-sm"></i>
            <div>
              <i className="ph-bold ph-arrow-up icon-xs" style={{ marginRight: '1px' }}></i>
              {sun?.sunrise || 'N/A'}
            </div>
            <div>
              <i className="ph-bold ph-arrow-down icon-xs" style={{ marginRight: '1px' }}></i>
              {sun?.sunset || 'N/A'}
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm">
            {formatDate(date)}
            {temp_comparison && ` · ${temp_comparison}`}
          </div>
          <h1 className="weather-summary text-title" style={{ marginTop: '8px' }}>
            {daily_summary && daily_summary.trim().length > 0 ? daily_summary : weather_description}
          </h1>
          {clothing_suggestion && (
            <div className="clothing-pill text-sm">
              <i className="icon-sm ph-fill ph-t-shirt"></i>
              {clothing_suggestion}
            </div>
          )}
        </div>
      </div>

      <div className="main-weather">
        <div className="flex flex-col" style={{ textAlign: 'center' }}>
          <div className="text-label">{locations[0].name} Today</div>
          <div className="flex flex-col flex-1" style={{ justifyContent: 'center', gap: '12px', paddingTop: '4px' }}>
            <div className="text-lg flex" style={{ marginLeft: '-8px', gap: '2px', alignItems: 'baseline', justifyContent: 'center' }}>
              {Math.round(locations[0].high)}
              {temperatureSymbol}
              <div className="text-label-sm">High</div>
            </div>
            <div className="text-lg flex" style={{ gap: '7px', alignItems: 'end', justifyContent: 'center' }}>
              <div className="text-label-sm">Low</div>
              {Math.round(locations[0].low)}
              {temperatureSymbol}
            </div>
          </div>
        </div>

        <div>
          <div className="forecast-graph" id="forecast-graph">
            <svg id="forecast-svg" style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}></svg>
            {forecast.map((day, i) => (
              <div
                key={i}
                className="forecast-column"
                data-temp={Math.round(day.high)}
                data-icon={getWeatherIcon(day.icon, false)}
              >
                <div className="forecast-temp-label text-label">
                  <i className="ph-bold icon-sm"></i>
                  <span className="temp-value"></span>
                </div>
                <div className="text-label">{day.day.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col" style={{ justifyContent: 'space-between' }}>
          {/* Hourly Precipitation Graph */}
          <div className="flex flex-col h-full relative">
            <div className="text-label" style={{ marginBottom: '8px' }}>Chance of Rain (12h)</div>

            {/* Graph Area */}
            <div className="flex-1 relative flex items-end justify-between" style={{ gap: '2px', borderBottom: '1px solid #000' }}>
              {/* Grid lines */}
              {[25, 50, 75].map(tick => (
                <div
                  key={tick}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${tick}%`,
                    borderTop: '1px dotted #000',
                    opacity: 0.3,
                    zIndex: 0
                  }}
                ></div>
              ))}

              {/* Ensure we always render 12 columns to maintain spacing */}
              {Array.from({ length: 12 }).map((_, i) => {
                const hour = hourlyForecast[i];
                if (!hour) return <div key={i} className="flex-1"></div>;

                const height = Math.max(hour.rain_chance, 0);
                return (
                  <div key={i} className="flex flex-col items-center flex-1 z-10 h-full justify-end">
                    <div
                      style={{
                        width: '100%',
                        height: `${height}%`,
                        background: '#000',
                        borderRadius: '1px 1px 0 0',
                        maxWidth: '12px'
                      }}
                      title={`${hour.rain_chance}%`}
                    ></div>
                  </div>
                );
              })}
            </div>

            {/* Labels Row */}
            <div className="flex justify-between items-start" style={{ height: '20px', marginTop: '6px', gap: '2px' }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const hour = hourlyForecast[i];
                // Only label if we have data AND it's a 3rd hour
                if (!hour) return <div key={i} className="flex-1 min-w-0"></div>;

                const date = new Date(hour.time);
                const hourLabel = date.getHours();
                const ampm = hourLabel >= 12 ? 'pm' : 'am';
                const displayHour = hourLabel % 12 || 12;

                return (
                  <div key={i} className="flex-1 min-w-0 text-center" style={{ position: 'relative', overflow: 'visible' }}>
                    <div
                      className="text-label-sm"
                      style={{
                        fontSize: '10px',
                        opacity: i % 3 === 0 ? 1 : 0,
                        whiteSpace: 'nowrap',
                        // Center perfectly, but allow overflow
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)'
                      }}
                    >
                      {displayHour}{ampm}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <div>
          <div className="weather-stats">
            <div className="stat">
              <div className="flex-1">
                <div className="dot-leader">
                  <i className="ph-bold ph-sun icon-sm" style={{ marginRight: '6px' }}></i>
                  <span className="label">UV Index</span>
                  <span className="dots"></span>
                  <span className="value">{Math.round(uv_index || 0)}</span>
                </div>
                <div className="dot-leader">
                  <i className="ph-bold ph-eye icon-sm" style={{ marginRight: '6px' }}></i>
                  <span className="label">Visibility</span>
                  <span className="dots"></span>
                  <span className="value">{Math.round(visibility || 0)}km</span>
                </div>
                <div className="dot-leader">
                  <i className="ph-bold ph-cloud icon-sm" style={{ marginRight: '6px' }}></i>
                  <span className="label">Clouds</span>
                  <span className="dots"></span>
                  <span className="value">{Math.round(cloud_cover || 0)}%</span>
                </div>
              </div>
            </div>
            <div className="stat">
              <i className="icon ph-bold ph-drop-half-bottom"></i>
              {humidity}%
            </div>
            <div className="stat">
              <i className="icon ph-bold ph-wind"></i>
              {(() => {
                const windDisplay = formatWindSpeed(wind?.speed);
                return windDisplay === '--' ? windDisplay : `${windDisplay}${windSpeedUnit}`;
              })()}
            </div>
            <div className="stat">
              <div className="moon-icon" dangerouslySetInnerHTML={{ __html: getMoonPhaseSVG(moon.phase, moon.direction, moon.illumination) }} />
              <div className="text-label">
                {moon.phase.split('_').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
            <div className="stat">
              <i className="icon ph-bold ph-face-mask"></i>
              <div className="aqi-pill text-label">{air_quality.aqi}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: '16px' }}>
          {calendar_events && calendar_events.length > 0 ? (
            calendar_events.slice(0, 4).map((event, i) => (
              <div key={i} className="calendar-event text-sm">
                <strong>{event.title}</strong>
                <div>{event.time}</div>
              </div>
            ))
          ) : (
            <div className="calendar-empty">No upcoming events</div>
          )}
        </div>
      </div>
    </>
  );
}
