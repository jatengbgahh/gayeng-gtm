const http = require('http');
const https = require('https');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3001;
const HEALTH_URL = `http://localhost:${PORT}/api/health`;
const CHECK_INTERVAL = 45000; // Check every 45 seconds
const MAX_FAILURES = 2; // Trigger auto-restart after 2 consecutive timeouts

let backendFailures = 0;
let cloudflaredFailures = 0;
let isRestartingCloudflared = false;

console.log(`[Watchdog System] Monitoring Backend (${HEALTH_URL}) & Cloudflare Network status...`);

function checkAll() {
  // 1. Check Local Backend Health
  const req = http.get(HEALTH_URL, { timeout: 5000 }, (res) => {
    if (res.statusCode === 200) {
      if (backendFailures > 0) console.log(`[Watchdog] Backend recovered!`);
      backendFailures = 0;
    } else {
      handleBackendFailure(`HTTP Status ${res.statusCode}`);
    }
  });

  req.on('timeout', () => {
    req.destroy();
    handleBackendFailure('Request Timeout (5s)');
  });

  req.on('error', (err) => {
    handleBackendFailure(`Network Error: ${err.message}`);
  });

  // 2. Check External Network / Cloudflare Edge Health
  if (!isRestartingCloudflared) {
    const extReq = https.get('https://1.1.1.1', { timeout: 6000 }, (res) => {
      if (res.statusCode === 200 || res.statusCode === 301) {
        if (cloudflaredFailures > 0) console.log(`[Watchdog] Cloudflare connection normal.`);
        cloudflaredFailures = 0;
      } else {
        handleCloudflaredFailure(`HTTP Status ${res.statusCode}`);
      }
    });

    extReq.on('timeout', () => {
      extReq.destroy();
      handleCloudflaredFailure('Connection Timeout to Cloudflare (6s)');
    });

    extReq.on('error', (err) => {
      handleCloudflaredFailure(`Network Timeout/Error: ${err.message}`);
    });
  }
}

function handleBackendFailure(reason) {
  backendFailures++;
  console.warn(`[Watchdog Backend Warning] ${reason} (${backendFailures}/${MAX_FAILURES})`);
  
  if (backendFailures >= MAX_FAILURES) {
    backendFailures = 0;
    console.error(`[Watchdog Alert] Backend non-responsive. Triggering PM2 restart...`);
    exec('pm2 restart gtm-backend', (err, stdout) => {
      if (err) console.error(`[Watchdog Error] PM2 restart failed: ${err.message}`);
      else console.log(`[Watchdog Success] Backend restarted.`);
    });
  }
}

function handleCloudflaredFailure(reason) {
  cloudflaredFailures++;
  console.warn(`[Watchdog Cloudflared Warning] ${reason} (${cloudflaredFailures}/${MAX_FAILURES})`);
  
  if (cloudflaredFailures >= MAX_FAILURES && !isRestartingCloudflared) {
    cloudflaredFailures = 0;
    isRestartingCloudflared = true;
    
    console.error(`[Watchdog Auto-Healer] Cloudflare Tunnel timed out! Executing automatic restart: net stop cloudflared -> net start cloudflared`);
    
    // Step 1: Stop cloudflared service
    exec('net stop cloudflared', (stopErr, stopStdout) => {
      console.log(`[Watchdog Auto-Healer] Stopping cloudflared...`);
      
      // Step 2: Wait 4 seconds, then start cloudflared service again
      setTimeout(() => {
        exec('net start cloudflared', (startErr, startStdout) => {
          if (startErr) {
            console.warn(`[Watchdog Auto-Healer] 'net start' warning, fallback to 'sc start'...`);
            exec('sc start cloudflared');
          }
          console.log(`[Watchdog Auto-Healer] ✅ cloudflared service restarted successfully!`);
          
          // Reset lock after 10 seconds to allow network stabilization
          setTimeout(() => {
            isRestartingCloudflared = false;
          }, 10000);
        });
      }, 4000);
    });
  }
}

// Initial check on launch
checkAll();

// Periodic interval check
setInterval(checkAll, CHECK_INTERVAL);
