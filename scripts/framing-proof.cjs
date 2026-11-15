// TEST-ONLY driver: pixel-verifies the screencast correction controls in the
// real FramingWorkspacePanel and click-exercises one control (background toggle).
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 1100, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:5199/harness-framing.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: '/downloads/vireo-framing-proof/panel-initial.png' });

  // Click the "Black bars" background option (currently Blurred fill active)
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => x.textContent.trim() === 'Black bars');
    if (!b) return false;
    b.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 400));
  const calls = await page.evaluate(() => window.__screencastCalls);

  // Click "Center crop cam" to clear the facecam box... note: facecam not yet set.
  // Click "Use detected region" instead.
  const clicked2 = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => x.textContent.trim() === 'Use detected region');
    if (!b) return false;
    b.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 400));
  const calls2 = await page.evaluate(() => window.__screencastCalls);
  await page.screenshot({ path: '/downloads/vireo-framing-proof/panel-after-clicks.png' });

  console.log(JSON.stringify({ clicked, clicked2, calls, calls2, logs: logs.slice(0, 10) }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
