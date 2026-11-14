// učitava rezultat generatora na web (kao "na čekanju")
const fs = require('fs');
module.exports = async function put(file, token) {
	const d = JSON.parse(fs.readFileSync(file, 'utf8'));
	const links = Object.entries(d.links).map(([k, v]) => ({ key: v.key || k, id: v.id, file: v.file, fileAlt: (v.hrefAlt || '').split('?')[0].split('/').pop(), css: v.css }));
	const p = { variant: d.variant || 'normal', path: d.path, generated: d.generated, classes: [...new Set(d.classes.map(c => c.replace(/\d+$/, '#')))].sort(), tags: d.tags || [], critical: '', pending: 1, links };
	const body = new URLSearchParams({ action: 'rs_ucss_put', t: token, d: Buffer.from(JSON.stringify(p)).toString('base64') });
	const r = await fetch('https://www.redsun.hr/wp-admin/admin-ajax.php', { method: 'POST', body });
	const j = await r.json().catch(() => ({}));
	if (!j.success) throw new Error('put ' + d.path + ' ' + r.status);
};
