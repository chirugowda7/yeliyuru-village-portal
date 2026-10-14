/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - BACKEND SERVER & DATABASE API
 * Built with Node.js & SQLite (node:sqlite)
 * Serves website + REST API on http://localhost:8000
 * =============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./db');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        if (!body.trim()) return resolve({});
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ===========================================================================
  // REST API ROUTER
  // ===========================================================================

  // 1. Health & Database Status
  if (pathname === '/api/status' && method === 'GET') {
    try {
      const stats = db.getDatabaseStats();
      return sendJson(res, 200, {
        status: 'online',
        timestamp: new Date().toISOString(),
        database: stats
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 2. GET Active Village Data (Hydration for frontend)
  if (pathname === '/api/data' && method === 'GET') {
    try {
      const data = db.getActiveVillageData();
      return sendJson(res, 200, { success: true, data });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 3. POST / Update Village Data (From Admin Panel)
  if (pathname === '/api/data' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = db.updateVillageData(body);
      return sendJson(res, 200, { success: true, message: 'Village data saved to SQLite database successfully', result });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // 4. GET Citizen Messages (For Admin Panel)
  if (pathname === '/api/messages' && method === 'GET') {
    try {
      const messages = db.getMessages();
      return sendJson(res, 200, { success: true, count: messages.length, messages });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 5. POST Citizen Message (From Contact Form)
  if ((pathname === '/api/contact' || pathname === '/api/messages') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.name || !body.contact || !body.message) {
        return sendJson(res, 400, { error: 'Name, contact, and message are required.' });
      }
      const result = db.saveMessage(body);
      return sendJson(res, 201, {
        success: true,
        message: 'Message saved to database successfully',
        id: result.id
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 6. Mark Message As Read
  if (pathname.startsWith('/api/messages/') && pathname.endsWith('/read') && method === 'POST') {
    try {
      const parts = pathname.split('/');
      const id = parts[3];
      db.markMessageRead(id);
      return sendJson(res, 200, { success: true });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 7. Reset Data to data.js defaults
  if (pathname === '/api/reset-data' && method === 'POST') {
    try {
      const defaultData = db.loadDefaultDataFromDisk();
      db.updateVillageData(defaultData);
      return sendJson(res, 200, { success: true, message: 'Database reset to default data.js dataset' });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ===========================================================================
  // STATIC FILE SERVER
  // ===========================================================================
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure path stays within project folder
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 handler
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found | Yeliyuru Portal</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 4rem;">
          <h1>404 - Page Not Found</h1>
          <p>Requested path: <code>${pathname}</code></p>
          <a href="/" style="color: #059669; font-weight: bold;">← Return to Yeliyuru Portal</a>
        </body>
        </html>
      `);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, must-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[OK] Yeliyuru Village Portal Server & Database Ready!`);
  console.log(`[Web] Public Website:  http://localhost:${PORT}`);
  console.log(`[Admin] Admin Panel:   http://localhost:${PORT}/admin.html`);
  console.log(`[DB] Database Status:  http://localhost:${PORT}/api/status`);
  console.log(`[File] Database File:  ${path.join(__dirname, 'yeliyuru.db')}`);
  console.log(`=======================================================`);
});
