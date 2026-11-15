// TEST-ONLY driver: exercises the real PreviewCanvas crop-pan drag in headless
// Chrome against the local vite harness and captures pixel + callback proof.
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:5199/harness-preview.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('video', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));

  const box = await (await page.$('video')).boundingBox();
  if (!box) throw new Error('no video box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await page.evaluate(() => ({
    cropCalls: window.__cropCalls.length,
    objectPosition: document.querySelector('video').style.objectPosition,
  }));
  await page.screenshot({ path: '/downloads/vireo-drag-proof/before.png' });

  // 1) Real drag: press on the video, move right 150px in steps, release.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + i * 15, cy, { steps: 1 });
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const afterDrag = await page.evaluate(() => ({
    cropCalls: window.__cropCalls.slice(),
    commits: window.__commits,
    playToggles: window.__playToggles,
    objectPosition: document.querySelector('video').style.objectPosition,
  }));
  await page.screenshot({ path: '/downloads/vireo-drag-proof/after-drag-right.png' });

  // 2) Click without movement: must NOT fire a crop update; must toggle play.
  const callsBeforeClick = afterDrag.cropCalls.length;
  await page.mouse.click(cx, cy);
  await new Promise((r) => setTimeout(r, 300));
  const afterClick = await page.evaluate(() => ({
    cropCalls: window.__cropCalls.length,
    playToggles: window.__playToggles,
  }));

  // 3) Drag left 150px: focus must move back the other way.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx - i * 15, cy, { steps: 1 });
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const afterLeft = await page.evaluate(() => ({
    cropCalls: window.__cropCalls.slice(),
    objectPosition: document.querySelector('video').style.objectPosition,
  }));
  await page.screenshot({ path: '/downloads/vireo-drag-proof/after-drag-left.png' });

  const result = { videoBox: box, before, afterDrag, afterClick, callsBeforeClick, afterLeft, logs: logs.slice(0, 30) };
  require('fs').writeFileSync('/downloads/vireo-drag-proof/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('DRIVER FAIL:', e.message);
  process.exit(1);
});
