// TEST-ONLY geometry matrix: runs the crop-pan drag across canvas aspect ratios
// and source orientations, checking direction, magnitude and clamping hold.
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CASES = [
  { name: 'ar9x16-landscape', ar: '9:16', video: '', drag: [150, 0] },
  { name: 'ar1x1-landscape', ar: '1:1', video: '', drag: [150, 0] },
  { name: 'ar16x9-landscape', ar: '16:9', video: '', drag: [150, 0] },
  { name: 'ar9x16-portrait', ar: '9:16', video: 'portrait', drag: [0, 150] },
  { name: 'ar1x1-portrait', ar: '1:1', video: 'portrait', drag: [0, 150] },
  // Overshoot clamp: drag far past the edge, focus must clamp at 0 or 1.
  { name: 'ar9x16-clamp', ar: '9:16', video: '', drag: [2000, 0] },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const results = [];
  for (const c of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const url = `http://localhost:5199/harness-preview.html?ar=${c.ar}${c.video ? '&video=' + c.video : ''}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('video', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1200));
    const box = await (await page.$('video')).boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const before = await page.evaluate(() => document.querySelector('video').style.objectPosition);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(cx + (c.drag[0] * i) / steps, cy + (c.drag[1] * i) / steps, { steps: 1 });
      await new Promise((r) => setTimeout(r, 25));
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 400));
    const after = await page.evaluate(() => ({
      objectPosition: document.querySelector('video').style.objectPosition,
      last: window.__cropCalls.length ? window.__cropCalls[window.__cropCalls.length - 1].crop : null,
      calls: window.__cropCalls.length,
      commits: window.__commits,
    }));
    await page.screenshot({ path: `/downloads/vireo-drag-proof/geo-${c.name}.png` });
    results.push({ case: c.name, videoBox: { w: box.width, h: box.height }, before, after, errs });
    await page.close();
  }
  fs.writeFileSync('/downloads/vireo-drag-proof/geometry.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('DRIVER FAIL:', e.message);
  process.exit(1);
});
