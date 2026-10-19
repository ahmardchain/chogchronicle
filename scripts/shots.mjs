import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
const U='http://localhost:5173';
for (const [n,u] of [['1-landing','/'],['2-my-chogs','/my'],['3-profile','/chog/1'],['5-chronicle','/chronicle']]) { await p.goto(U+u); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/${n}.png`, fullPage: n!=='1-landing' }); }
await p.goto(U+'/interact/1?target=42'); await p.waitForTimeout(1000);
await p.getByRole('button',{name:/Challenge/}).click(); await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/4-interact.png', fullPage: true });
console.log('result:', await p.locator('.result p').textContent(), 'errors:', errs);
await b.close();
