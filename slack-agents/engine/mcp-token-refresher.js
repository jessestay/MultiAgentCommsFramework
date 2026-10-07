#!/usr/bin/env node
// mcp-token-refresher.js — Proactively refresh Canva/Buffer OAuth tokens before they expire.
// Runs via cron every 30 min. If a token expires within 15 min, refresh it using the refresh_token.
// This prevents the "re-auth every hour" problem Jesse reported Oct 5, 2026.
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const AUTH_DIR = path.join(process.env.HOME || '/home/hatch', '.mcp-auth', 'mcp-remote-v1');
const REFRESH_BUFFER_MS = 15 * 60 * 1000; // Refresh if expiring within 15 min

// Map server hash -> token endpoint(s). tokenUrls is a fallback list: each is tried in order.
// (root-caused 2026-10-07: Buffer's hash was missing here, so its token expired 2026-10-05
//  and never refreshed; scopes identify 80231cc2e2c48a2ad3af48bba960953f as Buffer.
//  auth.buffer.com is the issuer from Buffer's own dynamic client registration;
//  login.buffer.com is Buffer's documented OAuth token host.)
const SERVERS = {
  '67a2071180bfcf76a3985779a9a38813': { name: 'canva', tokenUrls: ['https://mcp.canva.com/token'] },
  '80231cc2e2c48a2ad3af48bba960953f': { name: 'buffer', tokenUrls: ['https://auth.buffer.com/oauth2/token', 'https://login.buffer.com/oauth2/token'] },
};

async function refreshToken(serverHash, refreshToken, tokenUrls, clientId) {
  // Try each token endpoint in order; use the first that returns 200.
  let lastErr;
  for (const tokenUrl of tokenUrls) {
    try {
      return await postTokenRefresh(serverHash, refreshToken, tokenUrl, clientId);
    } catch (e) {
      console.log(`[refresher] ${serverHash}: ${tokenUrl} -> ${e.message}`);
      lastErr = e;
    }
  }
  throw lastErr;
}

function postTokenRefresh(serverHash, refreshToken, tokenUrl, clientId) {
  return new Promise((resolve, reject) => {
    const url = new URL(tokenUrl);
    const postData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${data.slice(0, 100)}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log(`[refresher] Checking tokens at ${new Date().toISOString()}`);
  
  const files = fs.readdirSync(AUTH_DIR).filter(f => f.endsWith('_tokens.json'));
  let refreshed = 0;
  
  for (const file of files) {
    const serverHash = file.replace('_tokens.json', '');
    const server = SERVERS[serverHash];
    if (!server) {
      console.log(`[refresher] Unknown server ${serverHash}, skipping`);
      continue;
    }
    
    const tokenPath = path.join(AUTH_DIR, file);
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    const expiresAt = tokens.expires_at || 0;
    const now = Date.now();
    const msUntilExpiry = expiresAt - now;
    
    if (msUntilExpiry > REFRESH_BUFFER_MS) {
      console.log(`[refresher] ${server.name}: OK (${Math.round(msUntilExpiry/60000)} min left)`);
      continue;
    }
    
    if (!tokens.refresh_token) {
      console.log(`[refresher] ${server.name}: EXPIRING but no refresh token!`);
      continue;
    }
    
    console.log(`[refresher] ${server.name}: Refreshing (expires in ${Math.round(msUntilExpiry/60000)} min)...`);
    try {
      // Read client_id from client_info file
      const clientInfoPath = path.join(AUTH_DIR, `${serverHash}_client_info.json`);
      let clientId = '';
      try {
        const clientInfo = JSON.parse(fs.readFileSync(clientInfoPath, 'utf8'));
        clientId = clientInfo.client_id || '';
      } catch (e) {
        console.log(`[refresher] ${server.name}: No client_info found`);
      }
      const newTokens = await refreshToken(serverHash, tokens.refresh_token, server.tokenUrls, clientId);
      const updated = {
        ...tokens,
        access_token: newTokens.access_token,
        expires_in: newTokens.expires_in,
        expires_at: Date.now() + (newTokens.expires_in * 1000),
        ...(newTokens.refresh_token ? { refresh_token: newTokens.refresh_token } : {}),
      };
      fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));
      console.log(`[refresher] ${server.name}: Refreshed successfully`);
      refreshed++;
    } catch (e) {
      console.log(`[refresher] ${server.name}: Refresh FAILED: ${e.message}`);
    }
  }
  
  console.log(`[refresher] Done. Refreshed ${refreshed} token(s).`);
}

main().catch(e => {
  console.error('[refresher] Fatal:', e.message);
  process.exit(1);
});
