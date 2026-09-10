const fs = require('node:fs');
const path = require('node:path');
const { STATIC_DIRECTORY, MIME_TYPES } = require('./env');

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extraHeaders });
  response.end(JSON.stringify(body));
}

function parseCookies(request) {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(';').map((pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return null;
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
  }).filter(Boolean));
}

function sendCsv(response, filename, content) {
  response.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Allow-Origin': '*',
  });
  response.end(content);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) request.destroy(); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Corpo JSON inválido.')); } });
    request.on('error', reject);
  });
}

function serveStatic(requestPath, response) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/(?:static\/)?/, '');
  const filePath = path.resolve(STATIC_DIRECTORY, relativePath);
  if (!filePath.startsWith(`${STATIC_DIRECTORY}${path.sep}`)) return sendJson(response, 403, { detail: 'Acesso negado.' });
  fs.readFile(filePath, (error, file) => {
    if (error) return sendJson(response, 404, { detail: 'Arquivo não encontrado.' });
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(file);
  });
}

module.exports = { sendJson, sendCsv, readJson, serveStatic, parseCookies };
