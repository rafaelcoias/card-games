// Renders the link-preview images (WhatsApp, Instagram, iMessage, X…) with the real card sprite and fonts:
//   src/app/opengraph-image.jpg (1200×630) and src/app/apple-icon.png (180×180).
// Next picks both up through its file-based metadata conventions. Re-run after brand changes:
//   pnpm --filter @cardroom/web og:render
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sprite = readFileSync(resolve(here, '../../../packages/ui/cards/sprite.svg'), 'utf8');
const appDir = resolve(here, '../src/app');

const HAND = ['10H', 'JK1', 'AS', 'KD', '7C'];
const CARD_W = 168;
const CARD_H = (CARD_W * 350) / 250;

const fanned = HAND.map((id, i) => {
  const t = i / (HAND.length - 1) - 0.5;
  const transform = `translate(${t * 210}px, ${t * t * 70}px) rotate(${t * 44}deg)`;
  return `<svg class="card" style="transform:${transform}" viewBox="0 0 250 350"><use href="#card-${id}"/></svg>`;
}).join('');

const head = `
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@600&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { background: #0c1410; }
  .felt {
    background:
      radial-gradient(ellipse 80% 75% at 50% 45%, transparent 50%, rgb(0 0 0 / 0.5) 100%),
      radial-gradient(ellipse 55% 55% at 50% 38%, rgb(255 255 255 / 0.07), transparent 70%), #1e5631;
  }
</style>`;

const ogHtml = `<!doctype html><html><head>${head}<style>
  .frame { width: 1200px; height: 630px; display: flex; flex-direction: column; align-items: center; position: relative; overflow: hidden; }
  .hand { position: relative; width: ${CARD_W}px; height: ${CARD_H}px; margin-top: 104px; }
  .card { position: absolute; inset: 0; width: ${CARD_W}px; height: ${CARD_H}px; transform-origin: 50% 140%;
          filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.28)) drop-shadow(0 14px 22px rgb(0 0 0 / 0.35)); }
  .title { margin-top: 70px; font: 600 64px/1.05 'Fraunces', serif; letter-spacing: -0.02em; color: #f4efe3; text-align: center;
           text-shadow: 0 2px 16px rgb(0 0 0 / 0.35); }
  .title span { color: rgb(244 239 227 / 0.62); }
  .eyebrow { margin-top: 22px; font: 600 20px/1 'Inter', sans-serif; letter-spacing: 0.2em; text-transform: uppercase; color: #e8c170; }
</style></head><body>${sprite}
  <div class="frame felt">
    <div class="hand">${fanned}</div>
    <div class="title">A mesa está posta. <span>Só faltas tu.</span></div>
    <div class="eyebrow">Cards · Mexicana online com amigos</div>
  </div>
</body></html>`;

// Same mark as public/icon.svg, full-bleed: iOS applies its own rounded mask.
const iconHtml = `<!doctype html><html><head>${head}</head><body>
  <svg width="180" height="180" viewBox="0 0 64 64" style="display:block">
    <rect width="64" height="64" fill="#1E5631"/>
    <rect x="17" y="10" width="30" height="42" rx="4" fill="#fff" transform="rotate(-8 32 31)"/>
    <path d="M32 22c-3 5-9 8-9 13a5 5 0 0 0 8 4l-2 6h6l-2-6a5 5 0 0 0 8-4c0-5-6-8-9-13z" fill="#1A1A1A" transform="rotate(-8 32 31)"/>
  </svg>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(ogHtml, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(appDir, 'opengraph-image.jpg'), type: 'jpeg', quality: 86 });

  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(iconHtml);
  await page.screenshot({ path: resolve(appDir, 'apple-icon.png'), type: 'png' });
} finally {
  await browser.close();
}
console.log('Wrote src/app/opengraph-image.jpg and src/app/apple-icon.png');
