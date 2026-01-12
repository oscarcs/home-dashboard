'use client';

import { useState } from 'react';
import type { DashboardData } from '@/lib/types';
import OriginalDashboard from '../dashboard/DashboardClient';
import AvanttBriefing from './designs/AvanttBriefing';

interface ReviewInterfaceProps {
    data: DashboardData;
    battery_level: number | null;
    hasCustomFonts: boolean;
    display_width: number;
    display_height: number;
    initialDesign?: string;
}

const DESIGNS = [
    { id: 'original', name: 'Original', component: OriginalDashboard },
    { id: 'avantt', name: 'AvanttBriefing', component: AvanttBriefing },
];

export default function ReviewInterface(props: ReviewInterfaceProps) {
    const [currentDesignId, setCurrentDesignId] = useState(props.initialDesign || 'original');

    const CurrentComponent = DESIGNS.find(d => d.id === currentDesignId)?.component || OriginalDashboard;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f0f0f0' }}>
            {/* Review Toolbar */}
            <div style={{
                padding: '12px 24px',
                backgroundColor: '#333',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #444'
            }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 500 }}>Dashboard Design Review</h2>

                <div style={{ display: 'flex', gap: '12px' }}>
                    {DESIGNS.map(design => (
                        <button
                            key={design.id}
                            onClick={() => setCurrentDesignId(design.id)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: currentDesignId === design.id ? '#3b82f6' : '#555',
                                color: 'white',
                                fontWeight: currentDesignId === design.id ? 600 : 400,
                                transition: 'background-color 0.2s'
                            }}
                        >
                            {design.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px',
                overflow: 'auto'
            }}>
                <div style={{
                    width: `${props.display_width}px`,
                    height: `${props.display_height}px`,
                    backgroundColor: 'white',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid #ddd'
                }}>
                    <CurrentComponent {...props} />
                </div>
            </div>
        </div>
    );
}
