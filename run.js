// Noćna obnova: pita web koje stranice trebaju obnovu, generira, provjerava izgled i tek onda uključuje.
const { execFileSync } = require('child_process'); const put = require('./put');
const TOKEN = process.env.RS_UCSS_TOKEN; if (!TOKEN) { console.error('nema RS_UCSS_TOKEN'); process.exit(1); }
const API = 'https://www.redsun.hr/wp-admin/admin-ajax.php';
const post = async (a) => (await fetch(API, { method: 'POST', body: new URLSearchParams({ t: TOKEN, ...a }) })).json();
(async () => {
	const q = await (await fetch(API + '?action=rs_ucss_queue&t=' + encodeURIComponent(TOKEN))).json();
	const force = (process.env.RS_UCSS_PATHS || '').split(/[\s,]+/).filter(Boolean);
	const todo = [...new Set([...force, ...Object.keys(q.requests || {}), ...Object.keys(q.stale || {})])];
	console.log('Stranice za obnovu:', todo.length ? todo.join(' ') : 'nema');
	let fail = 0;
	for (const path of todo) {
		const s = path.replace(/[^a-z0-9]+/gi, '_') || 'home';
		try {
			for (const v of ['normal', 'guest']) execFileSync('node', ['gen.js', path, v, `out/${s}.${v}.json`], { stdio: 'inherit', timeout: 15 * 60e3 });
			for (const v of ['normal', 'guest']) await put(`out/${s}.${v}.json`, TOKEN);
			await new Promise(r => setTimeout(r, 2000));
			const verify = () => JSON.parse(execFileSync('node', ['verify.js', path, `out/${s}.normal.json`, `out/${s}.guest.json`], { timeout: 30 * 60e3 }).toString().trim().split('\n').pop());
			let res = verify(); if (!res.ok) { await new Promise(r => setTimeout(r, 20000)); res = verify(); } // jedan ponovni pokušaj (prolazni šum)
			if (res.ok) { await post({ action: 'rs_ucss_approve', path, ok: '1' }); console.log('OK', path); }
			else {
				const why = (res.results || []).filter(r => !r.ok).map(r => `${r.variant} ${r.vp} layout ${r.layoutDiff} px ${r.px} h ${r.hA}/${r.hB}`).join('; ') || res.error || '';
				await post({ action: 'rs_ucss_approve', path, why }); console.log('PROVJERA NIJE PROŠLA', path, why); fail++;
			}
		} catch (e) { console.log('GREŠKA', path, e.message.slice(0, 300)); fail++; }
	}
	if (fail) process.exit(2); // GitHub tada šalje e-mail o neuspjelom pokretanju
})();
