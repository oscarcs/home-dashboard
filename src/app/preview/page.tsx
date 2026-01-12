import { buildDashboardData } from '@/lib/dataBuilder';
import DashboardClient from '../dashboard/DashboardClient';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

export default async function PreviewPage({
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

    // Add battery param to image URL if present
    const imageUrl = batteryParam
        ? `/api/dashboard/image?battery=${batteryParam}`
        : '/api/dashboard/image';

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '20px',
            gap: '20px',
            fontFamily: 'sans-serif'
        }}>
            <div style={{
                display: 'flex',
                gap: '20px',
                flexWrap: 'wrap',
                justifyContent: 'center'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <div style={{
                        border: '1px solid #ccc',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        background: 'white'
                    }}>
                        <DashboardClient
                            data={data}
                            battery_level={battery_level}
                            hasCustomFonts={hasCustomFonts}
                            display_width={display_width}
                            display_height={display_height}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <div style={{
                        border: '1px solid #ccc',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        background: 'white',
                        width: display_width,
                        height: display_height,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        <img
                            src={imageUrl}
                            alt="Dashboard Rendered Image"
                            width={display_width}
                            height={display_height}
                            style={{ display: 'block' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
