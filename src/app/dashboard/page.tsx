import { buildDashboardData } from '@/lib/dataBuilder';
import DashboardClient from './DashboardClient';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ battery?: string }>;
}) {
  const params = await searchParams;
  const headersList = await headers();

  // Mock request object for buildDashboardData
  const mockRequest = {
    headers: Object.fromEntries(headersList.entries()),
    query: params,
  } as any;

  const data = await buildDashboardData(mockRequest, console);

  // Parse battery level from query param (0-100) if provided
  const batteryParam = params.battery;
  const battery_level = batteryParam !== undefined
    ? (isNaN(parseInt(batteryParam)) ? null : parseInt(batteryParam))
    : null;

  // Check if custom fonts exist
  const customFontsPath = path.join(process.cwd(), 'public/styles/fonts/fonts.css');
  const hasCustomFonts = fs.existsSync(customFontsPath);

  // Display dimensions from env
  const display_width = parseInt(process.env.DISPLAY_WIDTH || '800', 10);
  const display_height = parseInt(process.env.DISPLAY_HEIGHT || '480', 10);

  return (
    <DashboardClient
      data={data}
      battery_level={battery_level}
      hasCustomFonts={hasCustomFonts}
      display_width={display_width}
      display_height={display_height}
    />
  );
}
