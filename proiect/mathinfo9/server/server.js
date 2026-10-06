/* MathInfo 9 H2H — server (Node ≥ 22, fără dependențe): API + SQLite + dueluri online (SSE) + proxy AI + fișiere statice */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

/* ---------- configurare (.env opțional) ---------- */
try {
  for (const ln of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(ln);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* fără .env */ }
const PORT = +process.env.PORT || 3000;
const TEACHER_CODE = process.env.TEACHER_CODE || 'profesor-ler';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const { QUESTIONS } = require(path.join(PUBLIC, 'js', 'data.js'));
const { LESSONS } = require(path.join(PUBLIC, 'js', 'lessons.js'));

/* ---------- baza de date ---------- */
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(ROOT, 'data', 'mathinfo.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display TEXT NOT NULL, role TEXT NOT NULL,
  salt TEXT NOT NULL, hash TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members (class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined INTEGER NOT NULL, PRIMARY KEY (class_id, user_id));
CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  due INTEGER, lesson_id TEXT, questions TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE (assignment_id, user_id));
CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, p1 INTEGER, p2 INTEGER, s1 INTEGER, s2 INTEGER, winner INTEGER, subject TEXT, created INTEGER NOT NULL);
`);
const q = (sql) => db.prepare(sql);
const now = () => Date.now();

/* ---------- utilitare ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };
const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b); };
const readBody = (req) => new Promise((ok, no) => {
  let n = 0; const ch = [];
  req.on('data', c => { n += c.length; if (n > 1e6) { no(new HttpError(413, 'Cerere prea mare')); req.destroy(); } else ch.push(c); });
  req.on('end', () => { try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}); } catch (e) { no(new HttpError(400, 'JSON invalid')); } });
  req.on('error', no);
});
const str = (v, min, max, label) => { if (typeof v !== 'string') fail(400, `${label} lipsește`); const t = v.trim(); if (t.length < min || t.length > max) fail(400, `${label}: între ${min} și ${max} caractere`); return t; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; };
const hits = new Map();
function limit(key, max, ms) {
  const t = now(), arr = (hits.get(key) || []).filter(x => t - x < ms);
  if (arr.length >= max) fail(429, 'Prea multe cereri. Încearcă din nou în câteva momente.');
  arr.push(t); hits.set(key, arr);
}
setInterval(() => { const t = now(); for (const [k, v] of hits) if (!v.some(x => t - x < 120000)) hits.delete(k); }, 60000).unref();

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const level = xp => Math.floor(xp / 150) + 1;
const publicUser = u => ({ id: u.id, username: u.username, display: u.display, role: u.role, xp: u.xp });

function auth(req, url, required = true) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  let user = null;
  if (token) user = q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
  if (!user && required) fail(401, 'Trebuie să fii autentificat');
  return user;
}
const needTeacher = u => { if (u.role !== 'teacher') fail(403, 'Doar profesorii pot face asta'); };
const newSession = uid => { const t = crypto.randomBytes(24).toString('hex'); q('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)').run(t, uid, now()); return t; };

/* ---------- AI (Gemini, cheia rămâne pe server) ---------- */
const SYSTEM = 'Ești tutorul MathInfo 9, pentru elevi de clasa a IX-a de la Liceul Teoretic „Emil Racoviță” Vaslui. Răspunzi doar în limba română, clar și prietenos, la Matematică (algebră, funcții, șiruri, vectori, trigonometrie) și Informatică (C++, algoritmi) de clasa a IX-a. Explică pas cu pas, ghidează elevul să înțeleagă (nu doar să copieze rezultatul), folosește exemple scurte și formatare simplă (**bold**, `cod`, liste, blocuri ``` pentru cod). Dacă întrebarea nu ține de aceste materii, redirecționează politicos.';
const inlineText = s => s.replace(/`/g, '');
function lessonText(l) {
  return `Lecția „${l.title}” (${l.s === 'mate' ? 'Matematică' : 'Informatică'}):\n` + l.body.map(([t, c]) => t === 'ul' ? c.map(x => '- ' + inlineText(x)).join('\n') : t === 'code' ? '```\n' + c + '\n```' : inlineText(c)).join('\n');
}
async function gemini(contents, system, json = false) {
  if (!GEMINI_KEY) fail(503, 'AI indisponibil: serverul nu are cheie Gemini configurată');
  const body = { systemInstruction: { parts: [{ text: system }] }, contents };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000)
  });
  if (!r.ok) { let m = 'eroare ' + r.status; try { m = (await r.json()).error.message; } catch (e) { /* ignorat */ } fail(502, 'Gemini: ' + m); }
  const d = await r.json();
  const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
  if (!parts) fail(502, 'Gemini a returnat un răspuns gol');
  return parts.map(p => p.text || '').join('');
}
function cleanQuestions(arr, max = 30) {
  if (!Array.isArray(arr) || !arr.length || arr.length > max) fail(400, `Trebuie între 1 și ${max} întrebări`);
  return arr.map((x, i) => {
    const o = Array.isArray(x.o) ? x.o.map(s => String(s).trim().slice(0, 200)).filter(Boolean) : [];
    if (o.length < 2 || o.length > 6) fail(400, `Întrebarea ${i + 1}: între 2 și 6 variante`);
    if (!Number.isInteger(x.a) || x.a < 0 || x.a >= o.length) fail(400, `Întrebarea ${i + 1}: răspuns corect invalid`);
    return { q: str(String(x.q || ''), 3, 500, `Întrebarea ${i + 1}`), o, a: x.a, e: String(x.e || '').slice(0, 500) };
  });
}

/* ---------- dueluri online ---------- */
const ROUNDS = 7, TIME = 15;
const streams = new Map();       // userId -> Set<res>
const queues = { mix: [], mate: [], info: [] };
const rooms = new Map();         // cod -> { uid, subject }
const matches = new Map();       // id -> meci
const userMatch = new Map();     // userId -> id meci
let matchSeq = 1;

function emit(uid, ev) { const s = streams.get(uid); if (s) for (const r of s) r.write(`data: ${JSON.stringify(ev)}\n\n`); }
const both = (m, ev) => m.p.forEach((uid, i) => emit(uid, { ...ev, you: i }));
const nameOf = uid => q('SELECT display FROM users WHERE id = ?').get(uid).display;

function createMatch(a, b, subject) {
  const pool = QUESTIONS.filter(x => subject === 'mix' || x.s === subject);
  const qs = shuffle(pool).slice(0, ROUNDS).map(x => { const order = shuffle(x.o.map((_, i) => i)); return { s: x.s, t: x.t, q: x.q, e: x.e, o: order.map(i => x.o[i]), a: order.indexOf(x.a) }; });
  const m = { id: matchSeq++, p: [a, b], names: [nameOf(a), nameOf(b)], subject, qs, i: -1, sc: [0, 0], cor: [0, 0], ans: [null, null], phase: 'lobby', t0: 0, timer: null };
  matches.set(m.id, m); userMatch.set(a, m.id); userMatch.set(b, m.id);
  both(m, { type: 'match', id: m.id, names: m.names, subject, rounds: ROUNDS, time: TIME });
  m.timer = setTimeout(() => nextRound(m), 3500);
  return m;
}
function roundPayload(m) { const x = m.qs[m.i]; return { type: 'round', i: m.i, n: m.qs.length, q: { q: x.q, t: x.t, s: x.s, o: x.o }, time: TIME, left: Math.max(0, TIME - (now() - m.t0) / 1000) }; }
function nextRound(m) {
  if (!matches.has(m.id)) return;
  m.i++;
  if (m.i >= m.qs.length) return endMatch(m, 'finished');
  m.ans = [null, null]; m.phase = 'ask'; m.t0 = now();
  both(m, roundPayload(m));
  m.timer = setTimeout(() => reveal(m), TIME * 1000 + 400);
}
function reveal(m) {
  if (m.phase !== 'ask') return;
  clearTimeout(m.timer); m.phase = 'reveal';
  const x = m.qs[m.i], gain = [0, 0];
  for (const p of [0, 1]) { const a = m.ans[p]; if (a && a.idx === x.a) { gain[p] = 100 + Math.round(a.left / TIME * 50); m.cor[p]++; } m.sc[p] += gain[p]; }
  both(m, { type: 'reveal', i: m.i, correct: x.a, e: x.e, picks: m.ans.map(a => a ? a.idx : null), gain, sc: m.sc, cor: m.cor, last: m.i === m.qs.length - 1 });
  m.timer = setTimeout(() => nextRound(m), 5200);
}
function endMatch(m, reason, forfeitWinner = -1) {
  clearTimeout(m.timer); m.phase = 'done';
  const [a, b] = m.sc; let winner = forfeitWinner >= 0 ? forfeitWinner : a > b ? 0 : b > a ? 1 : -1;
  both(m, { type: 'end', sc: m.sc, cor: m.cor, names: m.names, winner, reason });
  if (m.i >= 0) q('INSERT INTO matches (p1, p2, s1, s2, winner, subject, created) VALUES (?,?,?,?,?,?,?)').run(m.p[0], m.p[1], m.sc[0], m.sc[1], winner >= 0 ? m.p[winner] : null, m.subject, now());
  matches.delete(m.id); m.p.forEach(u => userMatch.delete(u));
}
function leaveAll(uid, fromStream = false) {
  for (const k of Object.keys(queues)) queues[k] = queues[k].filter(w => w !== uid);
  for (const [c, r] of rooms) if (r.uid === uid) rooms.delete(c);
  const mid = userMatch.get(uid);
  if (mid && !fromStream) { const m = matches.get(mid); if (m) endMatch(m, 'forfeit', m.p[0] === uid ? 1 : 0); }
}
const online = uid => streams.has(uid) && streams.get(uid).size > 0;

/* ---------- rute API ---------- */
const routes = [];
const route = (method, pattern, fn, auth = false) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

route('GET', '/api/config', async () => ({ ai: !!GEMINI_KEY, model: GEMINI_MODEL, rounds: ROUNDS }));

route('POST', '/api/register', async ({ body, ip }) => {
  limit('reg:' + ip, 10, 600000);
  const username = str(body.username, 3, 20, 'Utilizator');
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) fail(400, 'Utilizator: doar litere, cifre, _ . -');
  const pw = str(body.password, 6, 100, 'Parola');
  const display = str(body.display || username, 2, 24, 'Nume afișat');
  const role = body.role === 'teacher' ? 'teacher' : 'student';
  if (role === 'teacher' && body.teacherCode !== TEACHER_CODE) fail(403, 'Cod de profesor incorect');
  if (q('SELECT 1 FROM users WHERE username = ?').get(username)) fail(409, 'Numele de utilizator este deja luat');
  const salt = crypto.randomBytes(16).toString('hex');
  const r = q('INSERT INTO users (username, display, role, salt, hash, created) VALUES (?,?,?,?,?,?)').run(username, display, role, salt, hashPw(pw, salt), now());
  const user = q('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  return { token: newSession(user.id), user: publicUser(user), data: {} };
});
route('POST', '/api/login', async ({ body, ip }) => {
  limit('login:' + ip, 15, 300000);
  const u = q('SELECT * FROM users WHERE username = ?').get(String(body.username || '').trim());
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) fail(401, 'Utilizator sau parolă greșite');
  return { token: newSession(u.id), user: publicUser(u), data: JSON.parse(u.data || '{}') };
});
route('POST', '/api/logout', async ({ req, url }) => {
  const h = req.headers.authorization || ''; if (h.startsWith('Bearer ')) q('DELETE FROM sessions WHERE token = ?').run(h.slice(7));
  return { ok: true };
}, true);
route('GET', '/api/me', async ({ user }) => ({ user: publicUser(user), data: JSON.parse(user.data || '{}') }), true);
route('PUT', '/api/me', async ({ user, body }) => {
  const data = JSON.stringify(body.data || {});
  if (data.length > 300000) fail(413, 'Date prea mari');
  const xp = Math.max(0, Math.min(1e6, Math.floor(+body.xp || 0)));
  q('UPDATE users SET data = ?, xp = ? WHERE id = ?').run(data, xp, user.id);
  if (typeof body.display === 'string' && body.display.trim().length >= 2) q('UPDATE users SET display = ? WHERE id = ?').run(body.display.trim().slice(0, 24), user.id);
  return { ok: true };
}, true);

route('GET', '/api/leaderboard', async () => ({
  rows: q(`SELECT u.display, u.xp, (SELECT COUNT(*) FROM matches m WHERE m.winner = u.id) AS wins FROM users u WHERE u.role = 'student' AND u.xp > 0 ORDER BY u.xp DESC LIMIT 20`).all().map(r => ({ ...r, level: level(r.xp) }))
}));

/* ----- clase ----- */
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = (n) => Array.from({ length: n }, () => CODE_CH[crypto.randomInt(CODE_CH.length)]).join('');
function classFor(user, id) {
  const c = q('SELECT * FROM classes WHERE id = ?').get(id);
  if (!c) fail(404, 'Clasa nu există');
  const isOwner = user.role === 'teacher' && c.teacher_id === user.id;
  const isMember = !!q('SELECT 1 FROM members WHERE class_id = ? AND user_id = ?').get(id, user.id);
  if (!isOwner && !isMember) fail(403, 'Nu ai acces la această clasă');
  return { c, isOwner };
}
route('POST', '/api/classes', async ({ user, body }) => {
  needTeacher(user);
  const name = str(body.name, 2, 60, 'Numele clasei');
  let code; do { code = genCode(6); } while (q('SELECT 1 FROM classes WHERE code = ?').get(code));
  const r = q('INSERT INTO classes (teacher_id, name, code, created) VALUES (?,?,?,?)').run(user.id, name, code, now());
  return { id: Number(r.lastInsertRowid), name, code };
}, true);
route('GET', '/api/classes', async ({ user }) => {
  if (user.role === 'teacher') return { classes: q('SELECT c.id, c.name, c.code, (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id) AS students, (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id) AS assignments FROM classes c WHERE c.teacher_id = ? ORDER BY c.id DESC').all(user.id) };
  return { classes: q('SELECT c.id, c.name, t.display AS teacher FROM members m JOIN classes c ON c.id = m.class_id JOIN users t ON t.id = c.teacher_id WHERE m.user_id = ? ORDER BY c.id DESC').all(user.id) };
}, true);
route('POST', '/api/classes/join', async ({ user, body }) => {
  if (user.role !== 'student') fail(403, 'Doar elevii se pot alătura unei clase');
  const c = q('SELECT * FROM classes WHERE code = ?').get(String(body.code || '').trim().toUpperCase());
  if (!c) fail(404, 'Cod de clasă invalid');
  q('INSERT OR IGNORE INTO members (class_id, user_id, joined) VALUES (?,?,?)').run(c.id, user.id, now());
  return { id: c.id, name: c.name };
}, true);
route('GET', '/api/classes/:id', async ({ user, params }) => {
  const { c, isOwner } = classFor(user, +params.id);
  const teacher = q('SELECT display FROM users WHERE id = ?').get(c.teacher_id).display;
  const asg = q('SELECT id, title, descr, due, lesson_id, created, json_array_length(questions) AS n FROM assignments WHERE class_id = ? ORDER BY id DESC').all(c.id);
  if (isOwner) {
    const members = q('SELECT u.id, u.display, u.username, u.xp, (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.user_id = u.id AND a.class_id = ?) AS done FROM members m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? ORDER BY u.xp DESC').all(c.id, c.id);
    const cnt = q('SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ?');
    return { class: { id: c.id, name: c.name, code: c.code, teacher }, owner: true, members, assignments: asg.map(a => ({ ...a, submitted: cnt.get(a.id).n })) };
  }
  const mine = q('SELECT score, total, created FROM submissions WHERE assignment_id = ? AND user_id = ?');
  return { class: { id: c.id, name: c.name, teacher }, owner: false, assignments: asg.map(a => ({ ...a, mine: mine.get(a.id) || null })) };
}, true);
route('DELETE', '/api/classes/:id', async ({ user, params }) => {
  const { c, isOwner } = classFor(user, +params.id); if (!isOwner) fail(403, 'Doar profesorul clasei poate șterge clasa');
  q('DELETE FROM classes WHERE id = ?').run(c.id); return { ok: true };
}, true);
route('POST', '/api/classes/:id/assignments', async ({ user, params, body }) => {
  const { c, isOwner } = classFor(user, +params.id); if (!isOwner) fail(403, 'Doar profesorul clasei poate da teme');
  const title = str(body.title, 2, 100, 'Titlul temei'), descr = String(body.descr || '').slice(0, 1000);
  const questions = cleanQuestions(body.questions);
  const due = body.due ? Math.floor(+body.due) : null;
  const lesson = LESSONS.some(l => l.id === body.lessonId) ? body.lessonId : null;
  const r = q('INSERT INTO assignments (class_id, title, descr, due, lesson_id, questions, created) VALUES (?,?,?,?,?,?,?)').run(c.id, title, descr, due, lesson, JSON.stringify(questions), now());
  return { id: Number(r.lastInsertRowid) };
}, true);

function assignmentFor(user, id) {
  const a = q('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!a) fail(404, 'Tema nu există');
  const { c, isOwner } = classFor(user, a.class_id);
  return { a, c, isOwner, questions: JSON.parse(a.questions) };
}
route('GET', '/api/assignments/:id', async ({ user, params }) => {
  const { a, c, isOwner, questions } = assignmentFor(user, +params.id);
  const head = { id: a.id, title: a.title, descr: a.descr, due: a.due, lessonId: a.lesson_id, className: c.name, classId: c.id };
  if (isOwner) {
    const subs = q('SELECT s.user_id, u.display, s.score, s.total, s.created, s.answers FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.assignment_id = ? ORDER BY s.score DESC, s.created').all(a.id);
    const missing = q('SELECT u.display FROM members m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? AND u.id NOT IN (SELECT user_id FROM submissions WHERE assignment_id = ?)').all(c.id, a.id).map(r => r.display);
    const stats = questions.map((qq, i) => ({ q: qq.q, pct: subs.length ? Math.round(subs.filter(s => JSON.parse(s.answers)[i] === qq.a).length / subs.length * 100) : null }));
    return { ...head, owner: true, questions, submissions: subs.map(s => ({ user: s.display, score: s.score, total: s.total, created: s.created })), missing, stats };
  }
  const mine = q('SELECT * FROM submissions WHERE assignment_id = ? AND user_id = ?').get(a.id, user.id);
  if (mine) {
    const ans = JSON.parse(mine.answers);
    return { ...head, owner: false, done: true, score: mine.score, total: mine.total, review: questions.map((x, i) => ({ ...x, picked: ans[i] })) };
  }
  return { ...head, owner: false, done: false, questions: questions.map(x => ({ q: x.q, o: x.o })) };
}, true);
route('POST', '/api/assignments/:id/submit', async ({ user, params, body }) => {
  if (user.role !== 'student') fail(403, 'Doar elevii pot trimite teme');
  const { a, questions } = assignmentFor(user, +params.id);
  if (q('SELECT 1 FROM submissions WHERE assignment_id = ? AND user_id = ?').get(a.id, user.id)) fail(409, 'Ai trimis deja această temă');
  if (a.due && now() > a.due + 86400000 * 0) { /* termen depășit: se acceptă, dar rămâne marcat de profesor */ }
  const ans = Array.isArray(body.answers) ? body.answers.slice(0, questions.length).map(v => Number.isInteger(v) ? v : null) : [];
  while (ans.length < questions.length) ans.push(null);
  const score = questions.filter((x, i) => ans[i] === x.a).length;
  q('INSERT INTO submissions (assignment_id, user_id, answers, score, total, created) VALUES (?,?,?,?,?,?)').run(a.id, user.id, JSON.stringify(ans), score, questions.length, now());
  return { score, total: questions.length, review: questions.map((x, i) => ({ ...x, picked: ans[i] })) };
}, true);
route('DELETE', '/api/assignments/:id', async ({ user, params }) => {
  const { a, isOwner } = assignmentFor(user, +params.id); if (!isOwner) fail(403, 'Doar profesorul poate șterge tema');
  q('DELETE FROM assignments WHERE id = ?').run(a.id); return { ok: true };
}, true);

/* ----- AI ----- */
route('POST', '/api/ai', async ({ body, ip, user }) => {
  limit('ai:' + (user ? user.id : ip), 20, 60000);
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map(m => ({ role: m.r === 'u' ? 'user' : 'model', parts: [{ text: String(m.t || '').slice(0, 2000) }] }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') fail(400, 'Mesaj lipsă');
  const lesson = LESSONS.find(l => l.id === body.lessonId);
  const system = SYSTEM + (lesson ? '\n\nElevul studiază acum această lecție; folosește-o ca referință principală și leag-o de întrebare:\n' + lessonText(lesson) : '');
  return { text: await gemini(msgs, system) };
});
route('POST', '/api/ai/questions', async ({ user, body, ip }) => {
  needTeacher(user); limit('aiq:' + user.id, 10, 60000);
  const topic = str(body.topic, 3, 200, 'Tema'), n = Math.max(1, Math.min(10, +body.n || 5));
  const lesson = LESSONS.find(l => l.id === body.lessonId);
  const prompt = `Generează ${n} întrebări grilă (cu exact 4 variante, un singur răspuns corect) pentru elevi de clasa a IX-a, despre: ${topic}. ${lesson ? 'Bazează-te pe această lecție:\n' + lessonText(lesson) : ''}\nReturnează DOAR un array JSON de obiecte de forma {"q": "enunț", "o": ["varianta A","varianta B","varianta C","varianta D"], "a": 0, "e": "explicația rezolvării"}, unde "a" este indexul (0-3) variantei corecte. Verifică atent calculele și ordinea variantelor.`;
  const text = await gemini([{ role: 'user', parts: [{ text: prompt }] }], SYSTEM, true);
  let arr; try { arr = JSON.parse(text.replace(/^```json|```$/g, '').trim()); } catch (e) { fail(502, 'AI-ul a returnat un format neașteptat. Încearcă din nou.'); }
  return { questions: cleanQuestions(Array.isArray(arr) ? arr.slice(0, n) : arr, 10) };
}, true);

/* ----- H2H online ----- */
route('GET', '/api/h2h/lobby', async ({ user }) => ({ online: streams.size, waiting: Object.values(queues).reduce((s, a) => s + a.length, 0), inMatch: userMatch.has(user.id) }), true);
route('POST', '/api/h2h/queue', async ({ user, body }) => {
  const subject = ['mix', 'mate', 'info'].includes(body.subject) ? body.subject : 'mix';
  if (userMatch.has(user.id)) fail(409, 'Ești deja într-un meci');
  if (!online(user.id)) fail(409, 'Conexiunea live nu este activă. Reîncarcă pagina.');
  leaveAll(user.id, true);
  queues[subject] = queues[subject].filter(uid => online(uid) && !userMatch.has(uid));
  const other = queues[subject].shift();
  if (other) { createMatch(other, user.id, subject); return { status: 'matched' }; }
  queues[subject].push(user.id); return { status: 'waiting' };
}, true);
route('POST', '/api/h2h/room', async ({ user, body }) => {
  const subject = ['mix', 'mate', 'info'].includes(body.subject) ? body.subject : 'mix';
  if (userMatch.has(user.id)) fail(409, 'Ești deja într-un meci');
  if (!online(user.id)) fail(409, 'Conexiunea live nu este activă. Reîncarcă pagina.');
  leaveAll(user.id, true);
  let code; do { code = genCode(5); } while (rooms.has(code));
  rooms.set(code, { uid: user.id, subject }); return { code };
}, true);
route('POST', '/api/h2h/join', async ({ user, body }) => {
  const code = String(body.code || '').trim().toUpperCase(), r = rooms.get(code);
  if (!r || !online(r.uid)) fail(404, 'Camera nu există sau a expirat');
  if (r.uid === user.id) fail(400, 'Nu poți intra în propria cameră');
  if (userMatch.has(user.id) || userMatch.has(r.uid)) fail(409, 'Unul dintre jucători este deja într-un meci');
  if (!online(user.id)) fail(409, 'Conexiunea live nu este activă. Reîncarcă pagina.');
  leaveAll(user.id, true); rooms.delete(code); createMatch(r.uid, user.id, r.subject); return { status: 'matched' };
}, true);
route('POST', '/api/h2h/cancel', async ({ user }) => { leaveAll(user.id, true); return { ok: true }; }, true);
route('POST', '/api/h2h/leave', async ({ user }) => { leaveAll(user.id); return { ok: true }; }, true);
route('POST', '/api/h2h/answer', async ({ user, body }) => {
  const mid = userMatch.get(user.id), m = mid && matches.get(mid);
  if (!m || m.id !== body.match || m.phase !== 'ask' || m.i !== body.i) return { ok: false };
  const p = m.p.indexOf(user.id), idx = body.idx;
  if (m.ans[p] || !Number.isInteger(idx) || idx < 0 || idx > 3) return { ok: false };
  m.ans[p] = { idx, left: Math.max(0, TIME - (now() - m.t0) / 1000) };
  emit(m.p[1 - p], { type: 'opp', i: m.i });
  if (m.ans[0] && m.ans[1]) reveal(m);
  return { ok: true };
}, true);

/* ---------- server HTTP ---------- */
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Interzis'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — pagina nu există'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress || '?';
  try {
    if (url.pathname === '/api/stream' && req.method === 'GET') {
      const user = auth(req, url);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      if (!streams.has(user.id)) streams.set(user.id, new Set());
      streams.get(user.id).add(res);
      res.write(`data: ${JSON.stringify({ type: 'hello', online: streams.size })}\n\n`);
      const mid = userMatch.get(user.id), m = mid && matches.get(mid);
      if (m) { const you = m.p.indexOf(user.id); res.write(`data: ${JSON.stringify({ type: 'match', id: m.id, names: m.names, subject: m.subject, rounds: ROUNDS, time: TIME, you, resume: true })}\n\n`); if (m.phase === 'ask') res.write(`data: ${JSON.stringify({ ...roundPayload(m), you })}\n\n`); }
      const ka = setInterval(() => res.write(': ka\n\n'), 15000);
      req.on('close', () => { clearInterval(ka); const s = streams.get(user.id); if (s) { s.delete(res); if (!s.size) { streams.delete(user.id); leaveAll(user.id, true); } } });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(res, 404, { error: 'Rută inexistentă' });
      const params = r.re.exec(url.pathname).groups || {};
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const user = auth(req, url, !!r.auth);
      return send(res, 200, await r.fn({ req, url, params, body, ip, user }));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metodă nepermisă' });
    serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e); send(res, 500, { error: 'Eroare internă' });
  }
});
q('DELETE FROM sessions WHERE created < ?').run(now() - 30 * 86400000);
server.listen(PORT, () => {
  console.log(`
MathInfo 9 H2H rulează pe http://localhost:${PORT}`);
  console.log(`  cod profesor (înregistrare): ${TEACHER_CODE}${process.env.TEACHER_CODE ? '' : '   <- schimbă-l cu variabila TEACHER_CODE'}`);
  console.log(`  AI Gemini: ${GEMINI_KEY ? 'activ (' + GEMINI_MODEL + ')' : 'oprit (setează GEMINI_API_KEY în .env)'}
`);
});
