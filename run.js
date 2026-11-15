// Noćna obnova: pita web koje stranice trebaju obnovu, generira, provjerava izgled i tek onda uključuje.
const { execFile } = require('child_process'); const put = require('./put');
const TOKEN = process.env.RS_UCSS_TOKEN; if (!TOKEN) { console.error('nema RS_UCSS_TOKEN'); process.exit(1); }
const BASE = 'https://www.redsun.hr';
const post = (a) => put.post({ t: TOKEN, ...a });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const START = Date.now(), BUDGET = 320 * 60e3, PER_PAGE = 15 * 60e3; // posao mora stati u vremensko ograničenje posla (350 min)
const VARIANTS = ['normal', 'guest'];
// pokreće node skriptu; ispis ide u log, vraća stdout
const node = (args, timeout, quiet, env) => new Promise((res, rej) => {
	const p = execFile('node', args, { timeout, maxBuffer: 64e6, env: { ...process.env, ...(env || {}) } }, (e, out) => { if (e) { e.out = String(out || ''); rej(e); } else res(String(out)); });
	p.stderr.pipe(process.stderr); if (!quiet) p.stdout.pipe(process.stdout);
});
const gen = async (path, v, f) => { try { await node(['gen.js', path, v, f], 15 * 60e3); } catch (e) { console.log(`gen ${v} nije uspio (${e.message.slice(0, 120)}), ponavljam za 30 s`); await sleep(30000); await node(['gen.js', path, v, f], 15 * 60e3); } };
const verifyV = async (path, s, v) => {
	const out = await node(['verify.js', path, `out/${s}.normal.json`, `out/${s}.guest.json`], 30 * 60e3, true, { ONLY_V: v }).catch(e => e.out || JSON.stringify({ ok: false, error: e.message.slice(0, 200) }));
	try { return JSON.parse(out.trim().split('\n').pop()); } catch (e) { return { ok: false, error: 'neispravan izlaz provjere' }; }
};

// stranica kojoj provjera nije prošla zato što se web promijenio između izrade i provjere (NIJE PRIMIJENJENO)
// ili zbog prolazne greške dobiva novi pokušaj idućih noći (najviše 4 dana); prave razlike u izgledu i isključene stranice ne
async function retryable(q) {
	const out = [];
	for (const p of q.pages || []) {
		if (q.generated && q.generated[p] && Object.keys(q.generated[p]).length) continue;
		const key = require('crypto').createHash('md5').update(p).digest('hex');
		const m = await fetch(`${BASE}/wp-content/uploads/rs-ucss/${key}/meta.json?cmp=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null);
		if (!m || !m.rejected || /^isključeno/.test(m.rejected)) continue;
		const age = Date.now() / 1000 - (m.pending || 0);
		if (/NIJE PRIMIJENJENO|Command failed|ne učitava|ne može preuzeti|Timeout/i.test(m.rejected) && age > 18 * 3600 && age < 4 * 86400) out.push(p);
	}
	return out;
}

(async () => {
	const q = await put.post({ action: 'rs_ucss_queue', t: TOKEN });
	const force = (process.env.RS_UCSS_PATHS || '').split(/[\s,]+/).filter(Boolean);
	const todo = force.length ? [...new Set(force)] : [...new Set([...Object.keys(q.requests || {}), ...Object.keys(q.stale || {}), ...await retryable(q)])]; // ručno zadane putanje = samo one
	console.log('Stranice za obnovu:', todo.length ? todo.join(' ') : 'nema');
	let fail = 0, left = [];
	for (const [i, path] of todo.entries()) {
		if (Date.now() - START > BUDGET - PER_PAGE) { left = todo.slice(i); break; }
		const s = path.replace(/[^a-z0-9]+/gi, '_') || 'home';
		const t0 = Date.now();
		try {
			await Promise.all(VARIANTS.map(v => gen(path, v, `out/${s}.${v}.json`))); // obje varijante istodobno
			for (const v of VARIANTS) await put(`out/${s}.${v}.json`, TOKEN);
			await sleep(2000);
			const res = {};
			await Promise.all(VARIANTS.map(async v => { res[v] = await verifyV(path, s, v); }));
			const bad = VARIANTS.filter(v => !res[v].ok);
			if (bad.length) { await sleep(20000); await Promise.all(bad.map(async v => { res[v] = await verifyV(path, s, v); })); } // jedan ponovni pokušaj (prolazni šum)
			const all = { path, ok: VARIANTS.every(v => res[v].ok), results: VARIANTS.flatMap(v => res[v].results || []), error: VARIANTS.map(v => res[v].error).filter(Boolean).join('; ') };
			const min = ((Date.now() - t0) / 60e3).toFixed(1);
			if (all.ok) { await post({ action: 'rs_ucss_approve', path, ok: '1' }); console.log('OK', path, min + ' min'); }
			else {
				console.log(JSON.stringify(all));
				const why = all.results.filter(r => !r.ok).map(r => `${r.variant} ${r.vp}${r.applied ? '' : ' NIJE PRIMIJENJENO ' + (r.skipped || '')} layout ${r.layoutDiff} px ${r.px}/${r.noise ?? '-'} izbornik ${r.menuPx}/${r.menuNoise ?? '-'} h ${r.hA}/${r.hB}`).join('; ') || all.error || '';
				await post({ action: 'rs_ucss_approve', path, why }); console.log('PROVJERA NIJE PROŠLA', path, why); fail++;
			}
		} catch (e) { console.log('GREŠKA', path, e.message.slice(0, 300)); fail++; }
	}
	if (left.length) console.log('Nije stalo u vrijeme, ostaje za iduću noć:', left.join(' '));
	if (fail) process.exit(2); // GitHub tada šalje e-mail o neuspjelom pokretanju
})();
