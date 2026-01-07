module.exports = {
  apps: [{
    name: 'weather-dashboard',
    script: './dist/server.js',
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
