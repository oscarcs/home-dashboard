# Home Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![Status](https://img.shields.io/badge/status-production-success)](https://github.com/oscarcs/home-dashboard)

A modern home dashboard built with Next.js that runs on a local network computer (Raspberry Pi, Mac Mini, or any always-on machine) and displays weather forecasts, calendar events, and AI-generated insights.

## Getting Started

This dashboard is built with **Next.js 16** using the App Router, React Server Components, and TypeScript. It's designed to run as a persistent service on an always-on computer within your local network.

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- An always-on computer on your local network

### 1. Install Dependencies
```bash
git clone https://github.com/oscarcs/home-dashboard.git
cd home-dashboard
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add your API keys (see API Keys section below).

### 3. Start the Server

**Development:**
```bash
npm run dev        # Start Next.js dev server with hot reload
```

**Production:**
```bash
npm run build      # Build for production
npm start          # Start production server
```

The server runs on **port 7272** by default.

### 4. Access the Dashboard

**Core routes:**
- Home: `/`
- Dashboard: `/dashboard`
- E-paper 1-bit PNG image: `/api/dashboard/image`
- Admin panel: `/admin`

**API endpoints (used for debugging and custom development):**
- Dashboard data JSON: `/api/dashboard`
- Services status: `/api/services/status`

## Production Deployment

### Ubuntu Server with systemd

Install Puppeteer dependencies:
```bash
sudo apt-get install -y ca-certificates fonts-liberation libasound2t64 \
  libatk-bridge2.0-0t64 libatk1.0-0t64 libcairo2 libcups2t64 libdbus-1-3 \
  libexpat1 libfontconfig1 libgbm1 libgcc-s1 libglib2.0-0t64 libgtk-3-0t64 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 xdg-utils
```

Create systemd service at `/etc/systemd/system/home-dashboard.service`:
```ini
[Unit]
Description=Home Dashboard
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/home-dashboard
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now home-dashboard
```

View logs: `sudo journalctl -u home-dashboard -f`

## API Keys & Provider Setup

### Google Weather API (Required)
Multi-location forecasts, hourly data, and astronomy information.

1. Sign up at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Weather API**
3. Get your API key
4. Add to `.env`: `GOOGLE_MAPS_API_KEY=your_key_here`

### Google Calendar (Optional)
Display upcoming calendar events.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API**
4. Create **OAuth 2.0 credentials** (Web application type)
5. Add authorized redirect URI: `/auth/google/callback`
6. Download client ID and secret
7. Add to `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:7272/api/auth/google/callback # If you change the port, you must update this
   ```
8. Visit `http://localhost:7272/admin` and click "Authenticate"

### LLM (Optional)
AI-generated insights, using Google Gemini by default (configured in `services/llmService.ts`).

1. Sign up at [Google AI Studio](https://aistudio.google.com/)
2. Generate a new API key
3. Add to `.env`: `GEMINI_API_KEY=your_api_key`

## Technology Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** CSS + Tailwind CSS (utility classes)
- **UI Icons:** Phosphor Icons
- **Image Processing:** Puppeteer + Sharp (for e-paper generation)
- **APIs:** Google Weather, Google Calendar, Google Gemini

## Admin Panel

Visit `http://localhost:7272/admin` to:

- **Authenticate with Google Calendar** - One-click OAuth flow
- **Monitor service status** - See which APIs are working

OAuth tokens are stored in `data/auth.json` and persist across restarts.

## Developing

This project is built with **Next.js 16**. Each service (weather, calendar, etc.) is implemented as a separate TypeScript class that builds to a single data object sent to the dashboard.

### Development Commands

```bash
# Development
npm run dev        # Start Next.js dev server with hot reload
npm run build      # Build for production
npm start          # Start production server
npm run typecheck  # Type check TypeScript
```

### Project Structure

```
src/
  app/                    # Next.js App Router
    api/                  # API routes (serverless functions)
      admin/
      auth/
      dashboard/
      services/
    admin/                # Admin panel page
    dashboard/            # Dashboard page
    layout.tsx            # Root layout
    page.tsx              # Home page
  components/             # Reusable React components

lib/                      # Shared utilities
  BaseService.ts          # Base class for all services
  dataBuilder.ts          # Data aggregation logic
  state.ts                # State management
  types.ts                # TypeScript types
  utils.ts                # Helper functions
  weatherUtils.ts         # Weather-specific utilities

services/                 # Data services
  weatherService.ts       # Google Weather API (required)
  calendarService.ts      # Google Calendar (optional)
  llmService.ts           # Gemini AI insights (optional)

public/                   # Static assets
  styles/                 # CSS files
  assets/                 # Images, fonts
```

### Service Architecture

All data services extend `BaseService` (`lib/BaseService.ts`) which provides:
- Automatic caching with configurable TTL
- Exponential backoff retry logic
- Stale cache fallback on API failures
- Status tracking
- TypeScript type safety

### Adding a New Service

1. **Create service file:** Extend `BaseService` in `services/`
2. **Implement required methods:** `fetchData()` and `isEnabled()`
3. **Add type definitions:** Update `lib/types.ts`
4. **Integrate data:** Add service call in `lib/dataBuilder.ts`
5. **Update UI:** Modify React components to display the data

### Modifying the Dashboard UI

**React/TypeScript changes:**
1. Edit `src/app/dashboard/page.tsx` (Server Component)
2. Edit `src/app/dashboard/DashboardClient.tsx` (Client Component)
3. Edit styles in component CSS files
4. Visit `http://localhost:7272/dashboard` to preview
5. Check `http://localhost:7272/api/dashboard/image` for e-paper output

**Hot reload is enabled** - changes appear immediately in the browser.

### Development Resources

- **`NEXT_MIGRATION.md`** - Migration guide from Express to Next.js
- **`lib/state.ts`** - Centralized state management (caches in `data/state.json`)
- **`lib/dataBuilder.ts`** - Data aggregation logic
- **`src/app/api/`** - API route handlers (Next.js serverless functions)

## Arduino Setup (E-Paper Display)
This sketch supports Seeed XIAO ESP32 microcontrollers and reTerminal E Series with 7.5" e-Paper displays. It may require modifications for other hardware.

### Arduino Code Location
`arduino/epaper-client/epaper-client.ino`

The sketch fetches the dashboard image from the server every 10 minutes and displays it on the e-paper screen. Battery monitoring is automatically enabled for ESP32-S3 devices (reTerminal E Series).

**Important:** Your server should have a **fixed local IP address** or **local hostname** to ensure the e-paper display can reliably connect to it. If your server's IP changes (due to DHCP), the display won't be able to fetch the dashboard. You can either:
- Set a static IP in your router's DHCP settings for the server's MAC address
- Use a local hostname (e.g., `raspberrypi.local`) if your network supports mDNS/Bonjour

### Flashing Instructions

**1. Install Arduino IDE**
- Download from [arduino.cc/en/software](https://www.arduino.cc/en/software)

**2. Add ESP32 Board Support**
- Open Arduino IDE
- Go to **File → Preferences**
- Add to "Additional Boards Manager URLs":
  ```
  https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  ```
- Go to **Tools → Board → Boards Manager**
- Search for "esp32" and install **esp32 by Espressif Systems**

**3. Open the sketch**
- Open the sketch `arduino/epaper-client/` in Arduino IDE (includes `driver.h` and `partial-refresh.h`)

**4. Configure WiFi and Server**
Edit the Arduino sketch and replace the placeholder values at the top of the file:
```cpp
// Replace these template values:
const char* WIFI_SSID = "{{WIFI_NAME}}";        // Your WiFi network name
const char* WIFI_PASSWORD = "{{WIFI_PASSWORD}}"; // Your WiFi password
const char* SERVER_IP = "{{SERVER_IP}}";         // Your server's local IP or name (e.g., "192.168.1.100" or "server-name.local")
const int SERVER_PORT = 7272;         // Your server port (default: 7272)
```

**Example:**
```cpp
const char* WIFI_SSID = "MyHomeNetwork";
const char* WIFI_PASSWORD = "mypassword123";
const char* SERVER_IP = "192.168.1.50";
const int SERVER_PORT = 7272;
```

**5. Configure Board Settings**
- **Board:** Tools → Board → ESP32 Arduino → Select your board:
  - **XIAO_ESP32C3** for XIAO ESP32-C3
  - **XIAO_ESP32S3** for XIAO ESP32-S3 or reTerminal E1002
- **Port:** Tools → Port → (select the USB COM port of your connected device)

**6. Upload the Sketch**
- Connect XIAO ESP32-C3 via USB-C
- Click the **Upload** button (→) in Arduino IDE
- Wait for "Done uploading" message

**7. Monitor Serial Output (Optional)**
- Tools → Serial Monitor (115200 baud)
- Watch for connection status and image refresh logs

### Troubleshooting Arduino Upload

**Board not detected:**
- Try a different USB cable (must support data transfer)
- Hold the BOOT button while connecting USB
- Check Device Manager (Windows) or `ls /dev/tty.*` (macOS)

**Upload fails:**
- Lower upload speed: Tools → Upload Speed → 115200
- Press RESET button after clicking upload
- See Arduino forum or Seeed Wiki for ESP32-C3 specific issues
