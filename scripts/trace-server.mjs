import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.TRACE_PORT || 8787);
const outFile = process.env.TRACE_FILE || path.join(process.cwd(), 'logs', 'strategy-trace.jsonl');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const stream = fs.createWriteStream(outFile, { flags: 'a' });

function writeEvents(events) {
  let written = 0;
  const recvTs = Date.now();
  for (const ev of events) {
    stream.write(`${JSON.stringify({ recv_ts: recvTs, ...ev })}\n`);
    written += 1;
  }
  return written;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, file: outFile, port });
    return;
  }

  if (req.method === 'POST' && req.url === '/trace') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        sendJson(res, 413, { ok: false, error: 'payload too large' });
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw || '{}');
        const events = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.events) ? parsed.events : [parsed]);
        const written = writeEvents(events);
        sendJson(res, 200, { ok: true, written });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: String(err) });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[trace-server] listening on http://127.0.0.1:${port}`);
  console.log(`[trace-server] writing to ${outFile}`);
});

function shutdown() {
  server.close(() => {
    stream.end(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
