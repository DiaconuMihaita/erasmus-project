/* Adversar de test pentru dueluri online:  node server/bot.js COD_CAMERĂ [http://localhost:3000]
   Se înregistrează ca „Bot”, intră în cameră și răspunde (la întâmplare, după 2-6 s). */
const code = (process.argv[2] || '').toUpperCase(), BASE = process.argv[3] || 'http://localhost:3000';
const post = async (u, b, t) => (await fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify(b || {}) })).json();
(async () => {
  const name = 'bot' + Math.random().toString(36).slice(2, 7);
  const { token } = await post('/api/register', { username: name, password: 'botbot123', display: 'Bot ' + name.slice(3, 5).toUpperCase() });
  const r = await fetch(BASE + '/api/stream?token=' + token); let buf = '', match = null;
  setTimeout(async () => console.log('join:', JSON.stringify(await post('/api/h2h/join', { code }, token))), 500);
  for await (const ch of r.body) {
    buf += new TextDecoder().decode(ch); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const m = /^data: (.*)$/m.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (!m) continue;
      const ev = JSON.parse(m[1]);
      if (ev.type === 'match') match = ev.id;
      if (ev.type === 'round') setTimeout(() => post('/api/h2h/answer', { match, i: ev.i, idx: Math.floor(Math.random() * 4) }, token), 2000 + Math.random() * 4000);
      if (ev.type === 'end') { console.log('final', ev.sc, ev.reason); process.exit(0); }
    }
  }
})();
