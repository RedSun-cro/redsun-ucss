// Usporedba izgleda: puni CSS (rs_ucss=off) vs samo iskorišteni CSS (rs_ucss=1, puni CSS blokiran)
// node verify.js <path> <out.normal.json> <out.guest.json>  -> ispisuje JSON {ok, results}
const { chromium, devices } = require('playwright'); const fs = require('fs'); const { PNG } = require('pngjs'); const pixelmatch = require('pixelmatch');
const [path, nf, gf] = process.argv.slice(2);
const BASE = 'https://www.redsun.hr';
async function realPage(page, url) {
	for (let i = 0; i < 6; i++) {
		const ok = await page.evaluate(() => !/one moment/i.test(document.title) && !!document.querySelector('.et-l--header') && !!document.querySelector('#et-main-area, .et-l--body, .et_builder_inner_content')).catch(() => false);
		if (ok) return true;
		process.stderr.write('zaštita/nepotpuna stranica, čekam i ponavljam (' + (i + 1) + ')\n');
		await page.waitForTimeout(10000 + i * 5000);
		await page.goto(url.replace(/(g|cmp)=\d+/, '$1=' + Date.now()), { waitUntil: 'load', timeout: 90000 }).catch(() => {});
	}
	throw new Error('stranica se ne učitava ispravno');
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CONSENT = { name: 'cookieyes-consent', value: 'consentid:dGVzdHRlc3R0ZXN0dGVzdA,consent:no,action:yes,necessary:yes,functional:no,analytics:no,performance:no,advertisement:no', domain: '.redsun.hr', path: '/' };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = path.replace(/[^a-z0-9]+/gi, '_') || 'home';
fs.mkdirSync('vshots', { recursive: true });

async function run(br, variant, vp, mode, blockRe, withMenu) {
	const ctx = await br.newContext(vp.m ? { ...devices['Pixel 7'], deviceScaleFactor: 1, reducedMotion: 'reduce' } : { viewport: { width: vp.w, height: 900 }, userAgent: UA, reducedMotion: 'reduce' });
	await ctx.addCookies([CONSENT]);
	const p = await ctx.newPage();
	await p.route(/googletagmanager|clarity\.ms|facebook|google-analytics/, r => r.abort());
	if (variant === 'guest') await p.route(/guest\.vary\.php/, r => r.abort());
	if (mode === '1') await p.route(blockRe, r => r.abort());
	let html = ''; p.on('response', async r => { if (r.request().resourceType() === 'document') { try { html = await r.text(); } catch (e) {} } });
	await p.goto(BASE + path + '?rs_ucss=' + mode + '&cmp=' + Date.now(), { waitUntil: 'load', timeout: 90000 });
	if (variant === 'normal') { for (let i = 0; i < 20; i++) { const ck = await ctx.cookies(); if (ck.some(c => c.name === '_lscache_vary')) break; await p.waitForTimeout(500); } await p.waitForTimeout(1500); await p.goto(BASE + path + '?rs_ucss=' + mode + '&cmp=' + Date.now(), { waitUntil: 'load', timeout: 90000 }); }
	await realPage(p, BASE + path + '?rs_ucss=' + mode + '&cmp=' + Date.now());
	await p.waitForTimeout(1500); await p.keyboard.press('Shift'); await p.waitForTimeout(2500);
	const h0 = await p.evaluate(() => document.documentElement.scrollHeight);
	for (let y = 0; y < h0; y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(70); }
	await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
	const info = await p.evaluate(() => {
		const els = [...document.body.querySelectorAll('*')];
		const abs = e => { let x = 0, y = 0, c = e; while (c) { x += c.offsetLeft; y += c.offsetTop; c = c.offsetParent; } return [x, y]; };
		const sig = els.map(e => (e.offsetParent || getComputedStyle(e).position === 'fixed') ? abs(e).concat([e.offsetWidth, e.offsetHeight]).join(',') : 'x');
		return { h: document.documentElement.scrollHeight, n: els.length, sig, label: els.map(e => (e.tagName + '.' + (typeof e.className === 'string' ? e.className : '')).slice(0, 70)), disp: els.map(e => getComputedStyle(e).display), txt: els.map(e => e.children.length ? '' : (e.textContent || '').trim().slice(0, 25)) };
	});
	const shot = PNG.sync.read(await p.screenshot({ fullPage: true }));
	let menu = null;
	if (withMenu) {
		const btn = await p.$(vp.m ? '.et_pb_icon_0_tb_header' : 'header .et-menu > li >> nth=0');
		if (btn) { try { if (vp.m) await btn.click(); else await btn.hover(); await p.waitForTimeout(1500); menu = PNG.sync.read(await p.screenshot()); } catch (e) {} }
	}
	// stanje UCSS-a iz DOM-a (zaštita hostinga ponekad zamijeni prvi odgovor, pa HTML odgovora nije pouzdan)
	const dom = await p.evaluate(() => { let c = ''; for (const n of document.childNodes) if (n.nodeType === 8 && /rs-ucss/.test(n.nodeValue)) c = n.nodeValue; if (!c) { const w = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT); while (w.nextNode()) if (/rs-ucss/.test(w.currentNode.nodeValue)) c = w.currentNode.nodeValue; } return { c, rsu: !!document.querySelector('link[id$="-rsu"], #rs-ucss-critical') }; }).catch(() => ({ c: '', rsu: false }));
	const comment = (html.match(/<!-- rs-ucss[^>]*-->/) || [''])[0] || (dom.c ? '<!--' + dom.c + '-->' : (dom.rsu ? '<!-- rs-ucss: 0 -->' : ''));
	await ctx.close();
	return { info, shot, menu, comment };
}
function pdiff(A, B, name) {
	if (!A || !B) return null;
	const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
	const cr = i => { const o = new PNG({ width: w, height: h }); PNG.bitblt(i, o, 0, 0, w, h, 0, 0); return o; };
	const D = new PNG({ width: w, height: h });
	const n = pixelmatch(cr(A).data, cr(B).data, D.data, w, h, { threshold: 0.15 });
	if (n) fs.writeFileSync(`vshots/${name}.png`, PNG.sync.write(D));
	return +(100 * n / (w * h)).toFixed(3);
}
(async () => {
	const br = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
	const results = []; let ok = true;
	for (const [variant, f] of [['guest', gf], ['normal', nf]].filter(x => !process.env.ONLY_V || x[0] === process.env.ONLY_V)) {
		const d = JSON.parse(fs.readFileSync(f, 'utf8'));
		const files = new Set(); for (const l of Object.values(d.links)) { files.add(l.file); if (l.hrefAlt) files.add(l.hrefAlt.split('?')[0].split('/').pop()); }
		const blockRe = new RegExp('(' + [...files].map(esc).join('|') + ')');
		for (const vp of [{ n: 'm412', m: 1 }, { n: 'd1440', w: 1440 }].filter(x => !process.env.ONLY_VP || x.n === process.env.ONLY_VP)) {
			const A = await run(br, variant, vp, 'off', blockRe, true);
			const B = await run(br, variant, vp, '1', blockRe, true);
			const diffIdx = (X, Y) => { const out = []; if (X.info.n !== Y.info.n) return null; for (let i = 0; i < X.info.n; i++) { if (X.info.sig[i] !== Y.info.sig[i]) { const a = X.info.sig[i].split(',').map(Number), b = Y.info.sig[i].split(',').map(Number); if (a.length !== b.length || a.some((x, k) => Math.abs(x - b[k]) > 1)) out.push(i); } } return out; };
			if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify({ A: A.info, B: B.info }));
			let dAB = diffIdx(A, B);
			const r = { variant, vp: vp.n, applied: /rs-ucss: \d/.test(B.comment) && !/preskočeno/.test(B.comment), skipped: B.comment.includes('preskočeno') ? B.comment : '', hA: A.info.h, hB: B.info.h, elements: A.info.n, px: pdiff(A.shot, B.shot, `${slug}_${variant}_${vp.n}`), menuPx: pdiff(A.menu, B.menu, `${slug}_${variant}_${vp.n}_menu`) };
			let C = null;
			const needNoise = dAB === null || dAB.length > 0 || (r.px !== null && r.px > 1.5) || (r.menuPx !== null && r.menuPx > 0.5);
			if (needNoise) {
				// šum (animacije, nasumični elementi, lijeno učitavanje): isti puni CSS još jednom
				C = await run(br, variant, vp, 'off', blockRe, true);
				r.noise = pdiff(A.shot, C.shot, `${slug}_${variant}_${vp.n}_noise`); r.menuNoise = pdiff(A.menu, C.menu, `${slug}_${variant}_${vp.n}_menunoise`);
				const dAC = diffIdx(A, C); if (dAB && dAC) { const noisy = new Set(dAC); r.noisyEls = dAC.length; dAB = dAB.filter(i => !noisy.has(i)); }
			}
			const mism = dAB === null ? -1 : dAB.length;
			r.layoutDiff = mism; r.ex = (dAB || []).slice(0, 5).map(i => A.info.label[i] + ' ' + A.info.sig[i] + ' -> ' + B.info.sig[i]);
			const layoutOk = r.applied && Math.abs(r.hA - r.hB) <= 2 && mism >= 0 && mism <= Math.max(3, A.info.n * 0.003);
			const pxOk = r.px === null || r.px <= 1.5 || (r.noise != null && r.px <= r.noise + 1.5);
			const menuOk = r.menuPx === null || r.menuPx <= 0.5 || (r.menuNoise != null && r.menuPx <= r.menuNoise + 0.5);
			r.ok = layoutOk && pxOk && menuOk;
			if (!r.ok) ok = false;
			results.push(r);
		}
	}
	await br.close();
	console.log(JSON.stringify({ path, ok, results }));
})().catch(e => { console.log(JSON.stringify({ path, ok: false, error: e.message.slice(0, 300) })); process.exit(0); });
