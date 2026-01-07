import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PM2AppConfig {
  name: string;
  script: string;
  cwd: string;
  instances: number;
  autorestart: boolean;
  watch: boolean;
  max_memory_restart: string;
  time: boolean;
  error_file: string;
  out_file: string;
  log_date_format: string;
}

interface PM2Config {
  apps: PM2AppConfig[];
}

const config: PM2Config = {
  apps: [{
    name: 'weather-dashboard',
    script: './server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    time: true,
    error_file: '~/.pm2/logs/weather-dashboard-error.log',
    out_file: '~/.pm2/logs/weather-dashboard-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};

export default config;
