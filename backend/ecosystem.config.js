// PM2 конфигурация для production
module.exports = {
  apps: [
    {
      name: 'salary-monitor-backend',
      script: './dist/main.js',
      instances: 2,  // Количество инстансов (CPU cores)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
    },
  ],
};
