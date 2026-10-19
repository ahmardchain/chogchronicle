import { chromium, devices } from 'playwright';
const b = await chromium.launch(); const U = 'http://localhost:5173';
const ctxA = await b.newContext({ viewport: { width: 1360, height: 900 } }), ctxB = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctxA.newPage(), q = await ctxB.newPage();
const errs = []; for (const x of [p, q]) { x.on('pageerror', e => errs.push(e.message)); x.on('console', m => m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text()) && errs.push(m.text())); }
for (const [n, u] of [['1-landing', '/'], ['2-my-chogs', '/my'], ['3-profile', '/chog/1']]) { await p.goto(U + u); await p.waitForTimeout(2200); await p.screenshot({ path: `shots/${n}.png`, fullPage: n !== '1-landing' }); }
await q.goto(U + '/chronicle'); await q.waitForTimeout(2000); // B opens feed BEFORE the action -> should see a fresh highlight
await p.goto(U + '/interact/1?target=42'); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /challenge/i }).click(); await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/4a-duel-clash.png' });
await p.locator('.story p').waitFor(); await p.waitForTimeout(900);
const text = (await p.locator('.story p').textContent()).replace('📜 ', '');
await p.screenshot({ path: 'shots/4b-duel-result.png', fullPage: true });
await q.waitForTimeout(5500);
const freshCount = await q.locator('.ev.fresh').count();
const seen = (await q.locator('.ev').first().textContent())?.includes(text.slice(0, 20));
await q.screenshot({ path: 'shots/5-chronicle.png', fullPage: true });
const m = await b.newContext({ ...devices['iPhone 13'] }); const mp = await m.newPage(); mp.on('pageerror', e => errs.push(e.message));
await mp.goto(U + '/'); await mp.waitForTimeout(2000); await mp.screenshot({ path: 'shots/6-mobile-landing.png', fullPage: true });
await mp.goto(U + '/interact/69?target=420'); await mp.waitForTimeout(1800); await mp.screenshot({ path: 'shots/7-mobile-interact.png', fullPage: true });
const rm = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 1200, height: 800 } }); const rp = await rm.newPage(); rp.on('pageerror', e => errs.push(e.message));
await rp.goto(U + '/interact/777?target=7'); await rp.waitForTimeout(1200); await rp.getByRole('button', { name: /befriend/i }).click(); await rp.locator('.story p').waitFor({ timeout: 5000 });
console.log(JSON.stringify({ result: text, seenByOtherBrowser: seen, freshHighlight: freshCount, reducedMotionOK: true, errors: errs }));
await b.close();
