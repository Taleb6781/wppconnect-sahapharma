const http = require('http');

const PUBLIC_PORT = parseInt(process.env.PUBLIC_PORT || process.env.PORT || '3000', 10);
const TARGET_PORT = parseInt(process.env.WHATSAPP_API_PORT || '3001', 10);

const server = http.createServer((req, res) => {
  const urlPath = req.url ? req.url.split('?')[0] : '';

  // 1. Public ping / healthz routes (no auth, no HTML, plain text "ok")
  if (req.method === 'GET' && (urlPath === '/ping' || urlPath === '/healthz')) {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': 2,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end('ok');
  }

  // 2. Proxy all other requests to WAHA backend on TARGET_PORT
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

// Handle WebSocket upgrade if requested
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
