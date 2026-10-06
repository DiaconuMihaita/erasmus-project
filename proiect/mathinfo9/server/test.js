/* Test de integrare: pornește serverul separat (PORT=3100 DB_FILE=/tmp/t.db) și rulează: node server/test.js */
const BASE = process.env.BASE || 'http://localhost:3100';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
async function api(method, url, body, token) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) { /* gol */ }
  return { s: r.status, ...j };
}
function stream(token, onEv) {
  const ctl = new AbortController();
  fetch(BASE + '/api/stream?token=' + token, { signal: ctl.signal }).then(async r => {
    const dec = new TextDecoder(); let buf = '';
    for await (const ch of r.body) { buf += dec.decode(ch); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); const m = /^data: (.*)$/m.exec(b); if (m) onEv(JSON.parse(m[1])); } }
  }).catch(() => { });
  return ctl;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const sfx = Date.now().toString(36);
  let r = await api('POST', '/api/register', { username: 'prof' + sfx, password: 'parola1', role: 'teacher', teacherCode: 'gresit' });
  ok(r.s === 403, 'profesor cu cod greșit respins');
  const T = await api('POST', '/api/register', { username: 'prof' + sfx, password: 'parola1', role: 'teacher', teacherCode: 'profesor-ler', display: 'Dna Prof' });
  ok(T.token && T.user.role === 'teacher', 'profesor înregistrat');
  const A = await api('POST', '/api/register', { username: 'ana' + sfx, password: 'parola1', display: 'Ana' });
  const B = await api('POST', '/api/register', { username: 'bob' + sfx, password: 'parola1', display: 'Bob' });
  ok(A.token && B.token, 'elevi înregistrați');
  r = await api('POST', '/api/login', { username: 'ana' + sfx, password: 'gresita' }); ok(r.s === 401, 'login cu parolă greșită respins');
  r = await api('POST', '/api/login', { username: 'ANA' + sfx, password: 'parola1' }); ok(r.token, 'login (nume insensibil la litere)');

  r = await api('POST', '/api/classes', { name: 'IX A' }, A.token); ok(r.s === 403, 'elev nu poate crea clasă');
  const C = await api('POST', '/api/classes', { name: 'IX A' }, T.token); ok(C.code && C.code.length === 6, 'clasă creată, cod ' + C.code);
  r = await api('POST', '/api/classes/join', { code: C.code.toLowerCase() }, A.token); ok(r.id === C.id, 'Ana intră în clasă');
  r = await api('POST', '/api/classes/join', { code: 'ZZZZZZ' }, B.token); ok(r.s === 404, 'cod invalid respins');
  await api('POST', '/api/classes/join', { code: C.code }, B.token);

  const qs = [{ q: '2 + 2 = ?', o: ['3', '4', '5', '6'], a: 1, e: 'patru' }, { q: '3 · 3 = ?', o: ['6', '9'], a: 1 }];
  r = await api('POST', `/api/classes/${C.id}/assignments`, { title: 'Test', questions: [{ q: 'x', o: ['a'], a: 0 }] }, T.token); ok(r.s === 400, 'întrebare invalidă respinsă');
  const AS = await api('POST', `/api/classes/${C.id}/assignments`, { title: 'Temă 1', descr: 'Rezolvați', questions: qs, lessonId: 'm1' }, T.token); ok(AS.id, 'temă creată');
  r = await api('GET', `/api/assignments/${AS.id}`, null, A.token);
  ok(r.questions.length === 2 && r.questions[0].a === undefined, 'elevul vede întrebările fără răspunsuri');
  r = await api('POST', `/api/assignments/${AS.id}/submit`, { answers: [1, 0] }, A.token); ok(r.score === 1 && r.total === 2, 'notare corectă 1/2');
  r = await api('POST', `/api/assignments/${AS.id}/submit`, { answers: [1, 1] }, A.token); ok(r.s === 409, 'a doua trimitere respinsă');
  r = await api('GET', `/api/assignments/${AS.id}`, null, A.token); ok(r.done && r.review[0].a === 1, 'după trimitere vede corectura');
  r = await api('GET', `/api/assignments/${AS.id}`, null, T.token); ok(r.owner && r.submissions.length === 1 && r.missing.includes('Bob'), 'profesorul vede rezultate + cine nu a făcut');
  r = await api('GET', `/api/classes/${C.id}`, null, T.token); ok(r.members.length === 2 && r.assignments[0].submitted === 1, 'detalii clasă pentru profesor');
  const other = await api('POST', '/api/register', { username: 'cip' + sfx, password: 'parola1' });
  r = await api('GET', `/api/classes/${C.id}`, null, other.token); ok(r.s === 403, 'străinul nu vede clasa');

  r = await api('PUT', '/api/me', { data: { xp: 50, done: { m1: 1 } }, xp: 50 }, A.token); ok(r.ok, 'sincronizare profil');
  r = await api('GET', '/api/me', null, A.token); ok(r.data.done.m1 === 1, 'profil citit înapoi');
  r = await api('POST', '/api/ai', { messages: [{ r: 'u', t: 'salut' }] }); ok(r.s === 503, 'AI fără cheie → 503 (clientul face fallback local)');

  // duel online
  const evA = [], evB = [];
  const sA = stream(A.token, e => evA.push(e)), sB = stream(B.token, e => evB.push(e));
  await sleep(300);
  r = await api('POST', '/api/h2h/room', { subject: 'info' }, A.token); ok(r.code, 'cameră creată ' + r.code);
  const code = r.code;
  r = await api('POST', '/api/h2h/join', { code }, B.token); ok(r.status === 'matched', 'Bob intră în cameră');
  await sleep(4000);
  const round = evA.find(e => e.type === 'round');
  ok(round && round.q.o.length === 4 && round.q.a === undefined, 'runda 1 primită, fără răspuns corect în payload');
  ok(evA.find(e => e.type === 'match').you === 0 && evB.find(e => e.type === 'match').you === 1, 'indici de jucător corecți');
  await api('POST', '/api/h2h/answer', { match: evA.find(e => e.type === 'match').id, i: 0, idx: 0 }, A.token);
  await sleep(200);
  ok(evB.some(e => e.type === 'opp'), 'adversarul este notificat că ai răspuns');
  await api('POST', '/api/h2h/answer', { match: evA.find(e => e.type === 'match').id, i: 0, idx: 1 }, B.token);
  await sleep(300);
  const rev = evA.find(e => e.type === 'reveal');
  ok(rev && rev.picks[0] === 0 && rev.picks[1] === 1 && typeof rev.correct === 'number', 'reveal cu alegerile ambilor jucători');
  const pts = rev.gain[0] + rev.gain[1]; ok(pts === 0 || (pts >= 100 && pts <= 150), 'punctaj în interval: ' + JSON.stringify(rev.gain));
  r = await api('POST', '/api/h2h/leave', {}, B.token);
  await sleep(300);
  const end = evA.find(e => e.type === 'end'); ok(end && end.reason === 'forfeit' && end.winner === 0, 'abandon → victorie pentru Ana');
  r = await api('GET', '/api/leaderboard'); ok(r.rows.some(x => x.display === 'Ana' && x.wins === 1), 'clasament global cu victorii');

  // meci rapid
  r = await api('POST', '/api/h2h/queue', { subject: 'mate' }, A.token); ok(r.status === 'waiting', 'Ana în coadă');
  r = await api('POST', '/api/h2h/queue', { subject: 'mate' }, B.token); ok(r.status === 'matched', 'Bob e împerecheat cu Ana');
  sA.abort(); sB.abort();
  console.log(fails ? `\n${fails} teste eșuate` : '\nToate testele au trecut'); process.exit(fails ? 1 : 0);
})();
