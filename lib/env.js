const fs = require('node:fs');
const path = require('node:path');

function loadLocalEnvironment() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadLocalEnvironment();

const PORT = Number(process.env.APP_PORT || 8000);
const HOST = process.env.APP_HOST || '0.0.0.0';
const STATIC_DIRECTORY = path.join(__dirname, '..', 'web', 'dist');
// Fora de web/dist de propósito — `vite build` apaga e recria dist a cada build, o que destruiria
// planta baixa já enviada se ela morasse lá dentro.
const UPLOADS_DIRECTORY = path.join(__dirname, '..', 'uploads', 'floorplans');
fs.mkdirSync(UPLOADS_DIRECTORY, { recursive: true });
// .mjs: sem isso o navegador recusa carregar o web worker do maplibre-gl (mapa da Fase 4) como
// módulo ES — Content-Type errado (octet-stream) trava o worker num "pending" silencioso.
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

module.exports = { loadLocalEnvironment, PORT, HOST, STATIC_DIRECTORY, UPLOADS_DIRECTORY, MIME_TYPES };
