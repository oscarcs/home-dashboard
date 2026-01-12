# Home Dashboard - Claude Guide

Dashboard for e-ink displays (800x480, 1-bit BW).

## Commands
- `npm run dev`: Start dev server
- `npm run build`: Production build
- `npm start`: Start production server
- `npm run typecheck`: Run TypeScript checks

Assume during development that the dev server is already running and accessible at `http://localhost:7272`. The user will review changes themselves and let you know if they are happy with them.

## Project Structure
- `src/app/dashboard`: Main UI (React/Server Components)
- `src/app/api/dashboard/image`: Puppeteer/Sharp image generation
- `services/`: Data fetchers extension from `BaseService`
- `lib/`: Data aggregation and core types
- `arduino/`: E-ink client code (ESP32)

## Conventions
- **UI Constraints**: High-contrast, black and white only. Avoid gradients/transparency.
- **Icons**: Use Phosphor Icons (`phosphor-react`).
- **Styling**: Tailwind CSS + standard CSS.
- **Data Flow**: `services/` -> `lib/dataBuilder.ts` -> Dashboard UI -> Image API.
- **Service Pattern**: Extend `BaseService.ts` for caching and error handling.
- **State**: Persistent state stored in `data/state.json`.
- **Environment**: API keys in `.env` (Google Weather/Calendar, Gemini).

## E-Ink Restrictions
- **Resolution**: 800x480 (standard 7.5").
- **Color**: 1-bit depth (Perfect black or white only).
- **Refresh**: Low frequency (hours). Focus on static information.
