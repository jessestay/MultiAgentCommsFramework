module.exports = {
  apps: [{
    name: "linkedin-automation",
    script: "start_automation.py",
    interpreter: "python",
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    }
  }]
} 