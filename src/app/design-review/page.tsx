import { buildDashboardData } from '@/lib/dataBuilder';
import ReviewInterface from './ReviewInterface';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

export default async function DesignReviewPage({
    searchParams,
}: {
    searchParams: Promise<{ battery?: string; design?: string }>;
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

    // Check if custom fonts exist (reusing existing logic)
    const customFontsPath = path.join(process.cwd(), 'views/styles/fonts/fonts.css');
    const hasCustomFonts = fs.existsSync(customFontsPath);

    // Display dimensions from env
    const display_width = parseInt(process.env.DISPLAY_WIDTH || '800', 10);
    const display_height = parseInt(process.env.DISPLAY_HEIGHT || '480', 10);

    return (
        <ReviewInterface
            data={data}
            battery_level={battery_level}
            hasCustomFonts={hasCustomFonts}
            display_width={display_width}
            display_height={display_height}
            initialDesign={params.design}
        />
    );
}
