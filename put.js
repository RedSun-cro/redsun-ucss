// učitava rezultat generatora na web (kao "na čekanju"); zaštita hostinga povremeno odbije zahtjev, pa se ponavlja
const fs = require('fs');
const API = 'https://www.redsun.hr/wp-admin/admin-ajax.php';
async function post(params, tries = 6) {
	let last = '';
	for (let i = 0; i < tries; i++) {
		try {
			const r = await fetch(API, { method: 'POST', body: new URLSearchParams(params), headers: { 'User-Agent': 'RedSun-UCSS/1.0 (+https://github.com/RedSun-cro/redsun-ucss)' } });
			const t = await r.text();
			try { const j = JSON.parse(t); if (j.success !== false) return j; last = 'odgovor: ' + t.slice(0, 120); } catch (e) { last = 'nije JSON (zaštita?) ' + r.status; }
		} catch (e) { last = e.message + (e.cause ? ' / ' + (e.cause.code || e.cause.message) : ''); }
		await new Promise(s => setTimeout(s, 15000 * (i + 1)));
	}
	throw new Error(last);
}
async function put(file, token) {
	const d = JSON.parse(fs.readFileSync(file, 'utf8'));
	const links = Object.entries(d.links).map(([k, v]) => ({ key: v.key || k, id: v.id, file: v.file, fileAlt: (v.hrefAlt || '').split('?')[0].split('/').pop(), css: v.css }));
	const p = { variant: d.variant || 'normal', path: d.path, generated: d.generated, classes: [...new Set(d.classes.map(c => c.replace(/\d+$/, '#')))].sort(), tags: d.tags || [], critical: '', pending: 1, links };
	const j = await post({ action: 'rs_ucss_put', t: token, d: Buffer.from(JSON.stringify(p)).toString('base64') });
	if (!j.success) throw new Error('put ' + d.path);
}
module.exports = put; module.exports.post = post;
