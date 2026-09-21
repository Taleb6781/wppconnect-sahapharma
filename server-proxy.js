const http = require('http');

const PUBLIC_PORT = parseInt(process.env.PUBLIC_PORT || process.env.PORT || '3000', 10);
const TARGET_PORT = parseInt(process.env.WHATSAPP_API_PORT || '3001', 10);
const API_KEY = process.env.WHATSAPP_API_KEY || 'THISISMYSECURETOKEN';

// Helper to make internal requests to WAHA
function internalFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TARGET_PORT,
      path,
      method: options.method || 'GET',
      headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Ensure WAHA session is ready
async function ensureSessionReady() {
  try {
    const res = await internalFetch('/api/sessions/default');
    if (res.status === 200) {
      const data = JSON.parse(res.body.toString('utf8'));
      if (data.status === 'WORKING' || data.status === 'SCAN_QR_CODE' || data.status === 'STARTING') {
        return data;
      }
    }
    // If STOPPED or FAILED, restart
    await internalFetch('/api/sessions/default/stop', { method: 'POST' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await internalFetch('/api/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ name: 'default' })
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    const res2 = await internalFetch('/api/sessions/default');
    return JSON.parse(res2.body.toString('utf8'));
  } catch (e) {
    return { status: 'STARTING', error: e.message };
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url ? req.url.split('?')[0] : '';

  // 1. Public ping / healthz routes (plain text "ok")
  if (req.method === 'GET' && (urlPath === '/ping' || urlPath === '/healthz')) {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': 2,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end('ok');
  }

  // 2. Public QR status check
  if (req.method === 'GET' && urlPath === '/qr/status') {
    try {
      const sess = await ensureSessionReady();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(sess));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 3. Public QR raw image (image/png)
  if (req.method === 'GET' && urlPath === '/qr/raw') {
    try {
      await ensureSessionReady();
      const qrRes = await internalFetch('/api/default/auth/qr');
      if (qrRes.status === 200 && qrRes.headers['content-type']?.includes('image')) {
        res.writeHead(200, {
          'Content-Type': qrRes.headers['content-type'],
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(qrRes.body);
      }
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('QR not ready yet');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end(e.message);
    }
  }

  // 4. Public interactive QR webpage
  if (req.method === 'GET' && (urlPath === '/qr' || urlPath === '/qr/')) {
    try {
      const sess = await ensureSessionReady();

      if (sess.status === 'WORKING') {
        const phone = sess.me?.id ? sess.me.id.split('@')[0] : '+222 2665 7711';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp Connecté</title>
<style>
body{background:#0a120e;color:#fff;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#122019;border:2px solid #25D366;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);max-width:380px}
h2{color:#25D366;margin:0 0 12px;font-size:24px}p{color:#9eb5a8;margin:6px 0;font-size:15px}b{color:#fff}
</style></head><body>
<div class="box">
  <h2>✅ WhatsApp est connecté !</h2>
  <p>Numéro actif : <b>${phone}</b></p>
  <p>Statut : <b style="color:#25D366">WORKING (Prêt pour OTP)</b></p>
</div></body></html>`);
      }

      // Fetch QR image
      let qrImgTag = '<div style="color:#fbbf24;padding:40px 0;font-weight:600">Génération du code QR en cours...</div>';
      const qrRes = await internalFetch('/api/default/auth/qr');
      if (qrRes.status === 200 && qrRes.headers['content-type']?.includes('image')) {
        const b64 = qrRes.body.toString('base64');
        const mime = qrRes.headers['content-type'];
        qrImgTag = `<div style="background:#fff;padding:12px;border-radius:18px;display:inline-block;margin-bottom:14px;box-shadow:0 8px 24px rgba(0,0,0,0.3)">
          <img src="data:${mime};base64,${b64}" width="260" height="260" style="display:block" />
        </div>`;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>SahaPharma — Scanner WhatsApp QR</title>
<style>
body{background:#09120e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
.card{background:#122019;border:1.5px solid rgba(37,211,102,0.35);border-radius:24px;padding:32px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);max-width:360px;width:100%}
h2{color:#25D366;margin:0 0 10px;font-size:22px;font-weight:800}
.guide{background:rgba(37,211,102,0.1);border-radius:12px;padding:10px 12px;color:#d1fae5;font-size:13px;font-weight:600;margin-bottom:18px;line-height:1.4}
.timer{color:#fbbf24;font-size:14px;font-weight:700;margin-bottom:8px}
.note{color:#6b8577;font-size:12px;margin:0}
</style></head><body>
<div class="card">
  <h2>📱 SahaPharma WhatsApp</h2>
  <div class="guide">WhatsApp &rarr; Menu (&vellip;) &rarr; Appareils connectés &rarr; Connecter un appareil</div>
  <div id="qr-container">${qrImgTag}</div>
  <div class="timer">Actualisation automatique dans <span id="sec">25</span>s</div>
  <p class="note">La page détecte automatiquement la connexion.</p>
</div>
<script>
let t = 25;
const secElem = document.getElementById('sec');
setInterval(() => {
  t--;
  if (secElem) secElem.textContent = t > 0 ? t : '...';
  if (t <= 0) location.reload();
}, 1000);

// Poll connection status every 3 seconds
setInterval(async () => {
  try {
    const r = await fetch('/qr/status');
    const d = await r.json();
    if (d.status === 'WORKING') {
      location.reload();
    }
  } catch(e){}
}, 3000);
</script></body></html>`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Erreur: ' + e.message);
    }
  }

  // 5. Proxy all other requests to WAHA backend on TARGET_PORT
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${TARGET_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('WAHA backend starting or unavailable, please retry shortly.');
    }
  });

  req.pipe(proxyReq);
});

// Handle WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  const proxySocket = http.request({
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${TARGET_PORT}`
    }
  });

  proxySocket.on('upgrade', (proxyRes, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) socket.write(`${key}: ${v}\r\n`);
      } else if (value !== undefined) {
        socket.write(`${key}: ${value}\r\n`);
      }
    }
    socket.write('\r\n');

    if (upstreamHead && upstreamHead.length) socket.write(upstreamHead);
    if (head && head.length) upstreamSocket.write(head);

    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  proxySocket.on('error', (err) => {
    console.error('[WebSocket Proxy Error]:', err.message);
    socket.destroy();
  });

  proxySocket.end();
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`[Proxy Server] Listening on 0.0.0.0:${PUBLIC_PORT} -> forwarding to 127.0.0.1:${TARGET_PORT}`);
});
