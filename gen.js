// RedSun – generator vlastitog UCSS-a.
// Upotreba: node gen.js /putanja/ [izlaz.json]
// Za svaku vanjsku CSS datoteku stranice napravi podskup pravila koja se stvarno koriste
// (na 375/768/1280/1920 px, nakon skrolanja i interakcija), uz "stanja" (hover, open, active...)
// tretirana kao neobavezna, da ne nestanu stilovi koje dodaje JavaScript.
const { chromium, devices } = require('playwright');
const postcss = require('postcss');
const sp = require('postcss-selector-parser');
const crypto = require('crypto');
const fs = require('fs');

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

const path = process.argv[2] || '/';
const variant = process.argv[3] || 'normal';
const outFile = process.argv[4] || ('out/' + (path.replace(/[^a-z0-9]+/gi, '_') || 'home') + '.' + variant + '.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

// Klase/stanja koja dodaje JS ili interakcija – u testu se uklanjaju (pravilo se zadržava ako ostatak selektora postoji).
const STATE_CLASS = /^(opened|closed|open|show|shown|visible|hidden|active|current|selected|focus|focused|hover|hovered|checked|disabled|loading|loaded|entered|litespeed-loaded|lazyloaded|is-.+|has-.+|et-animated.*|et_animated|et-waypoint.*|et_had_animation|et_pb_animation_.*|et_pb_sticky.*|et_pb_sticky_module|swiper-slide-(active|next|prev|visible|duplicate.*)|swiper-.*-(active|disabled|lock|hidden|bullet-active)|swiper-initialized|swiper-horizontal|swiper-backface-hidden|swiper-pointer-events|cky-modal-open|cky-hide|cky-consent-bar-expand|cky-revisit-hide|.*-active|.*-open|.*--open|.*-opened|.*-visible|.*-hidden|.*-expanded|.*-collapsed|.*-show|.*-hide|.*-sticky|.*-fixed|.*-scrolled|.*-loaded|.*-ready|mfp-.*|select2-.*-(open|focus|active)|et_pb_toggle_open|et_pb_toggle_close|current-menu-.*|current_page_.*|et-hover|et-touch-hover|et-show-dropdown|et-hover-.*|et_mobile_menu_open|et-fixed-header|et-header-.*)$/;
const DYN_PSEUDO = new Set([':hover', ':focus', ':focus-visible', ':focus-within', ':active', ':visited', ':link', ':checked', ':disabled', ':enabled', ':target', ':placeholder-shown', ':indeterminate', ':valid', ':invalid', ':required', ':optional', ':read-only', ':read-write', ':default', ':empty', ':autofill', ':-webkit-autofill', ':fullscreen', ':modal', ':popover-open', ':open', ':user-invalid', ':user-valid', ':any-link', ':playing', ':paused']);
const DYN_ATTR = /^(aria-expanded|aria-hidden|aria-selected|aria-current|aria-pressed|aria-checked|open|hidden|data-.*|style|class)$/;

function testSelector(sel) {
	try {
		let out = sp(root => {
			root.walk(n => {
				if (n.type === 'pseudo') {
					const v = n.value.toLowerCase();
					if (v.startsWith('::') || v === ':before' || v === ':after' || v === ':first-letter' || v === ':first-line' || v.startsWith(':-webkit') || v.startsWith(':-moz') || v.startsWith(':-ms') || DYN_PSEUDO.has(v)) { n.remove(); return; }
					if (v === ':not' || v === ':has') { n.remove(); return; } // nema smisla zahtijevati
				}
				if (n.type === 'class' && STATE_CLASS.test(n.value)) n.remove();
				if (n.type === 'attribute' && DYN_ATTR.test(n.attribute)) n.remove();
			});
			// prazni dijelovi -> *
			root.walk(n => {
				if (n.type === 'selector') {
					const parts = [];
					let cur = [];
					n.nodes.forEach(c => { if (c.type === 'combinator') { parts.push(cur); cur = []; } else cur.push(c); });
					parts.push(cur);
				}
			});
		}).processSync(sel);
		out = out.replace(/(^|[\s>+~])(?=[\s>+~]|$)/g, '$1*').replace(/\s+/g, ' ').trim();
		out = out.replace(/^[>+~]\s*/, '').replace(/\s*[>+~]\s*$/, '');
		if (!out) return '*';
		return out;
	} catch (e) { return null; } // ne znamo – zadrži
}

async function interact(page, vw) {
	await page.mouse.move(30, 30); await page.mouse.move(200, 220);
	await page.waitForTimeout(1500);
	// polako do dna i natrag (waypointi, lazy bg, animacije, plutajući elementi)
	const h = await page.evaluate(() => document.documentElement.scrollHeight);
	for (let y = 0; y < h; y += Math.round(page.viewportSize().height * 0.7)) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(160); }
	await page.waitForTimeout(800);
	await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
	await page.evaluate(async () => {
		const sleep = t => new Promise(r => setTimeout(r, t));
		const clickAll = async (sel, max = 8, wait = 250) => { const els = [...document.querySelectorAll(sel)].slice(0, max); for (const e of els) { try { e.click(); } catch (x) {} await sleep(wait); } };
		// akordeoni / toggle
		await clickAll('.et_pb_toggle_title, .et_pb_accordion .et_pb_toggle_close .et_pb_toggle_title', 12, 300);
		// karuseli
		await clickAll('.swiper-button-next, .dica-next, .grw-next, .rpi-gt, .slick-next', 6, 400);
		// odabir jezika
		await clickAll('.rs-lang__cur, .rs-lang-dd__btn', 2, 300);
		// CookieYes postavke
		const cs = document.querySelector('.cky-btn-customize'); if (cs) { cs.click(); await sleep(500); await clickAll('.cky-accordion-btn', 6, 200); }
	});
	await page.waitForTimeout(600);
	if (vw < 981) {
		// mobilni izbornik
		const sels = ['.et_pb_icon_0_tb_header', '.mobile_menu_bar', '.et_pb_menu__icon', '.rs-hamburger', '.et_mobile_nav_menu .mobile_nav', 'button[aria-label*="izbornik" i]', 'button[aria-label*="menu" i]'];
		for (const s of sels) { const el = await page.$(s); if (el) { try { await el.click({ timeout: 1500 }); await page.waitForTimeout(700); break; } catch (e) {} } }
		await page.evaluate(async () => { for (const t of [...document.querySelectorAll('.et_mobile_menu .menu-item-has-children > a, .et_mobile_menu .rs-sub-toggle, .menu-item-has-children > .rs-sub-toggle')].slice(0, 6)) { try { t.click(); } catch (e) {} await new Promise(r => setTimeout(r, 250)); } });
	} else {
		// desktop: hover glavnih stavki izbornika (mega izbornik)
		const items = await page.$$('header .et-menu > li, header .et_pb_menu__menu > nav > ul > li, header nav > ul > li');
		for (const it of items.slice(0, 10)) { try { await it.hover({ timeout: 1000 }); await page.waitForTimeout(350); } catch (e) {} }
	}
	await page.waitForTimeout(500);
}

(async () => {
	const br = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
	const vps = [
		{ name: 'm375', width: 375, height: 812, mobile: true },
		{ name: 't768', width: 768, height: 1024, mobile: true },
		{ name: 'd1280', width: 1280, height: 800 },
		{ name: 'd1920', width: 1920, height: 1080 },
	];
	const links = {}; // id -> {href}
	const htmlClasses = new Set();
	const htmlTags = new Set();
	const htmls = {};
	const matched = new Set();
	const aboveFold = new Set();
	let allTests = null; // map test->[rule refs]

	const cssText = {};
	const rulesByLink = {};

	for (const vp of vps) {
		const ctx = await br.newContext(vp.mobile ? { viewport: { width: vp.width, height: vp.height }, userAgent: devices['Pixel 7'].userAgent, isMobile: vp.width < 768, hasTouch: true } : { viewport: { width: vp.width, height: vp.height }, userAgent: UA });
		const page = await ctx.newPage();
		await page.route(/googletagmanager|clarity\.ms|facebook|google-analytics/, r => r.abort());
		if (variant === 'guest') await page.route(/guest\.vary\.php/, r => r.abort());
		let docHtml = '';
		page.on('response', async r => { if (r.request().resourceType() === 'document' && r.url().startsWith(BASE)) { try { docHtml = await r.text(); } catch (e) {} } });
		const url = BASE + path + (path.includes('?') ? '&' : '?') + 'rs_ucss=off&g=' + Date.now();
		await page.goto(url, { waitUntil: 'load', timeout: 90000 });
		await realPage(page, url);
		if (variant === 'normal') {
			// LiteSpeed guest mode: prvo posjetiteljska verzija (postavlja vary kolačić), zatim ponovno otvaranje = prava verzija
			for (let i = 0; i < 20; i++) { const ck = await ctx.cookies(); if (ck.some(c => c.name === '_lscache_vary')) break; await page.waitForTimeout(500); }
			await page.waitForTimeout(1500);
			await page.goto(url.replace(/g=\d+/, 'g=' + Date.now()), { waitUntil: 'load', timeout: 90000 });
			await realPage(page, url);
		}
		await page.waitForTimeout(1200);
		htmls[vp.name] = docHtml;
		// klase iz HTML-a (potpis)
		for (const m of docHtml.matchAll(/\sclass=(["'])(.*?)\1/gs)) m[2].split(/\s+/).forEach(c => c && htmlClasses.add(c));
		for (const m of docHtml.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)[\s>\/]/g)) htmlTags.add(m[1].toLowerCase());
		// vanjske CSS datoteke koje treba podijeliti
		const found = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet][href], link[rel=preload][as=style][href]')].filter(l => !l.hasAttribute('data-no-optimize') && l.media !== 'print' && /\/litespeed\/css\/|\.css/.test(l.href)).map(l => ({ id: l.id || '', href: l.href })));
		for (const f of found) {
			if (!docHtml.includes(f.href.split('?')[0].split('/').pop())) continue; // samo datoteke iz HTML-a ove verzije
			const key = f.id || ('f:' + f.href.split('?')[0].split('/').pop());
			if (!links[key]) links[key] = { id: f.id, href: f.href };
			else if (links[key].href !== f.href) links[key].hrefAlt = f.href;
		}
		// preuzmi i parsiraj CSS (jednom)
		for (const k of Object.keys(links)) {
			if (cssText[k] !== undefined) continue;
			for (let a = 0; a < 5; a++) {
				cssText[k] = await page.evaluate(async u => { try { const r = await fetch(u, { credentials: 'omit', cache: 'no-store' }); const t = r.ok ? await r.text() : ''; return /^\s*<(!doctype|html)/i.test(t) ? '' : t; } catch (e) { return ''; } }, links[k].href);
				if (cssText[k].trim()) break;
				await page.waitForTimeout(4000 * (a + 1));
			}
			if (!cssText[k].trim()) throw new Error('CSS se ne može preuzeti: ' + links[k].href);
			const rootNode = postcss.parse(cssText[k]);
			const list = [];
			rootNode.walkRules(r => {
				if (r.parent && r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
				const sels = r.selectors.map(s => ({ s, t: testSelector(s) }));
				list.push({ rule: r, sels });
			});
			rulesByLink[k] = { root: rootNode, list };
		}
		const tests = new Set();
		for (const k of Object.keys(rulesByLink)) for (const it of rulesByLink[k].list) for (const s of it.sels) if (s.t) tests.add(s.t);
		const testArr = [...tests].filter(t => !matched.has(t));
		const check = async () => {
			const res = await page.evaluate(arr => { const ok = []; for (const t of arr) { try { if (t === '*' || document.querySelector(t)) ok.push(t); } catch (e) { ok.push(t); } } return ok; }, testArr.filter(t => !matched.has(t)));
			res.forEach(t => matched.add(t));
		};
		if (process.env.DBG) process.stderr.write('DBG ' + vp.name + ' ' + JSON.stringify(await page.evaluate(() => [document.title, document.querySelectorAll('*').length, location.href, document.styleSheets.length])) + ' links ' + Object.keys(links).length + ' tests ' + testArr.length + '\n');
		await check();
		// iznad pregiba (kritični CSS) – samo stanje nakon učitavanja, bez interakcija
		const af = await page.evaluate(arr => { const vh = innerHeight, ok = []; const base = new Set(['*', 'html', 'body', ':root']); for (const t of arr) { try { if (base.has(t)) { ok.push(t); continue; } const els = document.querySelectorAll(t); let hit = false; for (let i = 0; i < els.length && i < 60; i++) { const e = els[i]; if (e === document.documentElement || e === document.body) { hit = true; break; } const r = e.getBoundingClientRect(); if (r.bottom > -2 && r.top < vh + 2 && (r.width > 0 || r.height > 0)) { hit = true; break; } const cs = getComputedStyle(e); if (cs.position === 'fixed' || cs.position === 'sticky') { hit = true; break; } } if (hit) ok.push(t); } catch (e) { ok.push(t); } } return ok; }, [...matched]);
		af.forEach(t => aboveFold.add(t));
		await interact(page, vp.width);
		await check();
		await ctx.close();
		process.stderr.write(vp.name + ' matched ' + matched.size + '/' + tests.size + '\n');
	}

	// gradnja podskupa
	const minify = root => {
		root.walk(n => {
			if (n.type === 'comment') { n.remove(); return; }
			if (n.type === 'rule') { n.selector = n.selectors.map(x => x.trim().replace(/\s+/g, ' ')).join(','); n.raws = { before: '', between: '', after: '', semicolon: false }; }
			else if (n.type === 'atrule') { n.raws = { before: '', between: '', afterName: ' ', after: '', semicolon: false, params: undefined }; n.params = n.params.replace(/\s+/g, ' ').trim(); }
			else if (n.type === 'decl') { n.raws = { before: '', between: ':' }; n.value = n.value.replace(/\s+/g, ' ').trim(); }
		});
		root.raws = { after: '', semicolon: false };
		return root.toString();
	};
	const build = (k, pred) => {
		const root = postcss.parse(cssText[k]);
		root.walkRules(r => {
			if (r.parent && r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
			const keep = r.selectors.filter(sel => { const t = testSelector(sel); return t === null || pred(t); });
			if (keep.length === 0) r.remove(); else if (keep.length !== r.selectors.length) r.selectors = keep;
		});
		let changed = true;
		while (changed) { changed = false; root.walkAtRules(a => { if (/^(media|supports|container|layer|document)$/i.test(a.name) && (!a.nodes || a.nodes.length === 0)) { a.remove(); changed = true; } }); }
		return root;
	};
	const pruneAt = (root, usedText) => {
		root.walkAtRules(a => {
			if (/keyframes$/i.test(a.name)) { const n = a.params.trim(); const re = new RegExp('animation(-name)?\\s*:[^;}]*\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'); if (!re.test(usedText)) a.remove(); }
			if (a.name.toLowerCase() === 'font-face') { const fam = (a.nodes || []).find(d => d.prop === 'font-family'); if (fam) { const f = fam.value.replace(/["']/g, '').trim(); if (!new RegExp('font(-family)?\\s*:[^;}]*' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(usedText)) a.remove(); } }
		});
	};
	const out = { path, variant, generated: Math.floor(Date.now() / 1000), links: {}, classes: [...htmlClasses].sort(), tags: [...htmlTags].sort() };
	let totalIn = 0, totalOut = 0, crit = '';
	const keys = Object.keys(rulesByLink);
	for (const k of keys) {
		const used = build(k, t => matched.has(t));
		const noAt = used.clone(); noAt.walkAtRules(a => { if (/keyframes$|font-face/i.test(a.name)) a.remove(); });
		pruneAt(used, noAt.toString());
		const css = minify(used);
		const c = build(k, t => aboveFold.has(t));
		const cNoAt = c.clone(); cNoAt.walkAtRules(a => { if (/keyframes$|font-face/i.test(a.name)) a.remove(); });
		pruneAt(c, cNoAt.toString());
		crit += minify(c);
		totalIn += cssText[k].length; totalOut += css.length;
		process.stderr.write(k+' in '+cssText[k].length+' used '+css.length+'\n');
		out.links[k] = { key: k, id: links[k].id, href: links[k].href, hrefAlt: links[k].hrefAlt || null, file: (links[k].href.split('?')[0].split('/').pop()), src_md5: md5(cssText[k]), css };
	}
	out.critical = crit;
	out.stats = { in: totalIn, out: totalOut, critical: crit.length, aboveFold: aboveFold.size, matched: matched.size, links: Object.keys(out.links).length, classes: out.classes.length };
	fs.mkdirSync(require('path').dirname(outFile), { recursive: true });
	fs.writeFileSync(outFile, JSON.stringify(out));
	console.log(JSON.stringify(out.stats), Object.entries(out.links).map(([k, v]) => k + ':' + v.css.length).join(' '));
	await br.close();
})();
