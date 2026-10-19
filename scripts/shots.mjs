import { chromium } from 'playwright';
const b = await chromium.launch(); const U = 'http://localhost:5173';
const ctxA = await b.newContext({ viewport: { width: 1360, height: 900 } }), ctxB = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctxA.newPage(), q = await ctxB.newPage();
const errs = []; for (const x of [p, q]) x.on('pageerror', e => errs.push(e.message));
for (const [n, u] of [['1-landing', '/'], ['2-my-chogs', '/my'], ['3-profile', '/chog/1']]) { await p.goto(U + u); await p.waitForTimeout(1800); await p.screenshot({ path: `shots/${n}.png`, fullPage: n !== '1-landing' }); }
await p.goto(U + '/interact/1?target=42'); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /Challenge/ }).click(); await p.locator('.result p').waitFor(); await p.waitForTimeout(700);
const text = await p.locator('.result p').textContent();
await p.screenshot({ path: 'shots/4-interact.png', fullPage: true });
// second, independent browser (no shared localStorage) must see the event in the shared world
await q.goto(U + '/chronicle'); await q.waitForTimeout(1800);
const seen = (await q.locator('.ev').first().textContent())?.includes(text.slice(0, 20));
await q.screenshot({ path: 'shots/5-chronicle.png', fullPage: true });
console.log(JSON.stringify({ result: text, seenByOtherBrowser: seen, errors: errs }));
await b.close();
