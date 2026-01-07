#!/usr/bin/env node
/**
 * Test individual services - shows actual output
 * Usage: npm run test:service <service-name>
 * Services: weather, ambient, calendar, llm
 */

import dotenv from 'dotenv';
import type { Logger } from '../lib/types.js';

dotenv.config();

type ServiceName = 'weather' | 'ambient' | 'calendar' | 'llm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClass = any;

interface ServiceMap {
  [key: string]: () => Promise<ServiceClass>;
}

const services: ServiceMap = {
  weather: async () => (await import('../services/weatherService.js')).WeatherService,
  ambient: async () => (await import('../services/ambientService.js')).AmbientService,
  calendar: async () => (await import('../services/calendarService.js')).CalendarService,
  llm: async () => (await import('../services/llmService.js')).LLMService,
};

const logger: Logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

async function test(): Promise<void> {
  const serviceName = process.argv[2] as ServiceName | undefined;

  if (!serviceName) {
    console.error('Usage: node scripts/test-service.js <service-name>');
    console.error('Available services:', Object.keys(services).join(', '));
    process.exit(1);
  }

  if (!services[serviceName]) {
    console.error(`Unknown service: ${serviceName}`);
    console.error('Available services:', Object.keys(services).join(', '));
    process.exit(1);
  }

  console.log(`\n=== Testing ${serviceName} Service ===\n`);

  const ServiceClass = await services[serviceName]();
  const service = new ServiceClass();

  console.log('Enabled:', service.isEnabled());
  console.log('\nFetching data...\n');

  try {
    const data = await service.getData({}, logger);
    console.log('Result:', JSON.stringify(data, null, 2));
    console.log('\n✅ Success\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('\n❌ Error:', errorMessage);
    if (errorStack) console.error(errorStack);
    process.exit(1);
  }
}

test();
