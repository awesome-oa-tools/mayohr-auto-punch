module.exports = {
  apps: [{
    name: 'mayohr-morning-punch',
    script: 'bash',
    args: ['-c', 'sleep $(( RANDOM % 300 )); npx --yes --quite mayohr-auto-punch@latest'],
    cron_restart: '0 9 * * 1-5', // 週一到週五早上 9:00 執行
    autorestart: false, // 執行完就停止，不要重啟
    watch: false
  }, {
    name: 'mayohr-evening-punch',
    script: 'bash',
    args: ['-c', 'sleep $(( RANDOM % 300 )); npx --yes --quite mayohr-auto-punch@latest'],
    cron_restart: '5 18 * * 1-5', // 週一到週五下午 18:05 執行
    autorestart: false, // 執行完就停止，不要重啟
    watch: false
  }]
};