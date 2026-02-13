import { test } from 'playwright/test';

test('font check', async ({ page }) => {
  const events = [];
  page.on('requestfailed', req => {
    if (req.url().includes('clash-display')) events.push({ type:'failed', url:req.url(), err:req.failure()?.errorText });
  });
  page.on('response', res => {
    if (res.url().includes('clash-display')) {
      const h = res.headers();
      events.push({ type:'response', url:res.url(), status:res.status(), acao:h['access-control-allow-origin'] || null });
    }
  });

  await page.goto('http://127.0.0.1:4173/index.html');
  await page.waitForTimeout(1200);

  const info = await page.evaluate(async () => {
    const host = document.getElementById('bulut-container');
    const shadow = host?.shadowRoot;
    const mount = shadow?.getElementById('bulut-shadow-mount');
    const popup = shadow?.querySelector('.bulut-popup');
    await document.fonts.ready;
    return {
      fontCheck: document.fonts.check('16px "Clash Display"'),
      mountFont: mount ? getComputedStyle(mount).fontFamily : null,
      popupFont: popup ? getComputedStyle(popup).fontFamily : null,
      fonts: Array.from(document.fonts).map(f => ({ family: f.family, status: f.status, weight: f.weight })).filter(f => /Clash|Display/i.test(f.family)),
    };
  });

  console.log('INFO', JSON.stringify(info));
  console.log('EVENTS', JSON.stringify(events));
});
