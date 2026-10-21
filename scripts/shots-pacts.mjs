// Screenshots of Pacts + Square. U=http://localhost:8787 node scripts/shots-pacts.mjs
import { chromium } from 'playwright';
const U = process.env.U || 'http://localhost:8787'; const b = await chromium.launch();
const errs = []; const mk = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
const A = await mk(), B = await mk();
const post = (p, body) => fetch(U + '/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
await post('/action', { tokenId: 69, target: 420, action: 'befriend', demo: true, demoSession: 'shots-seed-aaaa' });
await post('/pact/propose', { tokenId: 1, partner: 42, stake: 25, demo: true, demoSession: 'shots-seed-aaaa' }).catch(() => {});
await A.goto(U + '/pacts'); await A.waitForTimeout(1500);
const c69 = A.locator('.forge .picker button', { hasText: '#69' }); if (await c69.count()) await c69.first().click();
await A.waitForTimeout(2500); await A.screenshot({ path: 'shots/8-pacts.png', fullPage: true });
await B.goto(U + '/square'); await B.waitForTimeout(2000);
await A.goto(U + '/interact/69?target=420'); await A.waitForTimeout(1500); await A.getByRole('button', { name: /befriend/i }).click(); await A.locator('.story p').waitFor({ timeout: 8000 });
await A.goto(U + '/square'); await B.waitForTimeout(4000);
const w = B.locator('.sq', { hasText: /420|Chog/ }).filter({ has: B.getByRole('button', { name: /witness/i }) }).first(); await w.getByRole('button', { name: /witness/i }).click();
await B.waitForTimeout(4000); await B.screenshot({ path: 'shots/9-square-witness.png' });
console.log(JSON.stringify({ witnessedChips: await B.locator('.wchip').count(), errors: errs })); await b.close();
