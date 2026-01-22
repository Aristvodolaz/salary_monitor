// PM2 конфигурация для Frontend (CommonJS формат)
module.exports = {
  apps: [
    {
      name: 'salary-monitor-frontend',
      script: 'node_modules/.bin/vite',
      args: '--host 0.0.0.0 --port 3017',
      cwd: '/home/admin-lc/salary_monitor/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      watch: false,
    },
  ],
};
