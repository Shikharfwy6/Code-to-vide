import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.dirname(fileURLToPath(import.meta.url));
const stillsOnly = process.argv.includes('--stills');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };

// Static server on a free port so the font loads over http://
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--font-render-hinting=none', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exitCode = 1; });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction('window.READY === true', { timeout: 30000 });

const grab = async (t) => {
  const url = await page.evaluate((t) => {
    window.renderFrame(t);
    return document.getElementById('c').toDataURL('image/png');
  }, t);
  return Buffer.from(url.split(',')[1], 'base64');
};

if (stillsOnly) {
  fs.rmSync('stills', { recursive: true, force: true });
  fs.mkdirSync('stills', { recursive: true });
  const cards = await page.evaluate(() => window.CARDS);
  for (const c of cards) {
    const t = c.start + 0.5 + c.hold / 2; // middle of the hold
    fs.writeFileSync(`stills/card${c.i + 1}.png`, await grab(t));
  }
  console.log(`wrote ${cards.length} stills to stills/`);
} else {
  const duration = await page.evaluate(() => window.DURATION);
  const fps = await page.evaluate(() => window.FPS);
  const n = Math.ceil(duration * fps);
  fs.rmSync('frames', { recursive: true, force: true });
  fs.mkdirSync('frames', { recursive: true });
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(`frames/f${String(i).padStart(5, '0')}.png`, await grab(i / fps));
    if (i % 60 === 0) console.log(`frame ${i}/${n}`);
  }
  console.log(`wrote ${n} frames (${duration.toFixed(2)} s)`);
}
await browser.close();
server.close();
