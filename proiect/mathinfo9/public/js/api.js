/* Client API: autentificare, cereri, flux live (SSE). Funcționează și fără server (mod offline). */
const API = (() => {
  const TOKEN_KEY = 'mi9-token';
  const st = { token: '', user: null, reachable: false, ai: false, model: '' };
  try { st.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignorat */ }
  const subs = { auth: [], live: [] };
  const emit = (k, v) => subs[k].forEach(f => { try { f(v); } catch (e) { console.error(e); } });
  const on = (k, f) => subs[k].push(f);

  async function req(method, url, body, timeout = 20000) {
    const r = await fetch(url, {
      method, signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', ...(st.token ? { Authorization: 'Bearer ' + st.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j = {}; try { j = await r.json(); } catch (e) { /* răspuns non-JSON */ }
    if (!r.ok) { const e = new Error(j.error || 'Eroare ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  const get = (u) => req('GET', u), post = (u, b) => req('POST', u, b || {}), put = (u, b) => req('PUT', u, b), del = (u) => req('DELETE', u);

  let es = null;
  function connect() {
    disconnect();
    if (!st.token || !st.reachable) return;
    es = new EventSource('/api/stream?token=' + encodeURIComponent(st.token));
    es.onmessage = ev => { try { emit('live', JSON.parse(ev.data)); } catch (e) { /* ignorat */ } };
    es.onerror = () => emit('live', { type: 'conn', ok: false });
    es.onopen = () => emit('live', { type: 'conn', ok: true });
  }
  function disconnect() { if (es) { es.close(); es = null; } }

  function setSession(token, user) {
    st.token = token || ''; st.user = user || null;
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignorat */ }
    if (user) connect(); else disconnect();
  }

  async function init() {
    try {
      const c = await req('GET', '/api/config', undefined, 2500);
      if (typeof c.ai !== 'boolean') throw new Error('nu e serverul nostru');
      st.reachable = true; st.ai = c.ai; st.model = c.model;
    } catch (e) { st.reachable = false; return null; }
    if (st.token) {
      try { const me = await get('/api/me'); st.user = me.user; connect(); return me; }
      catch (e) { if (e.status === 401) setSession('', null); }
    }
    return null;
  }
  async function login(username, password) { const r = await post('/api/login', { username, password }); setSession(r.token, r.user); return r; }
  async function register(p) { const r = await post('/api/register', p); setSession(r.token, r.user); return r; }
  async function logout() { try { await post('/api/logout'); } catch (e) { /* ignorat */ } setSession('', null); emit('auth', null); }

  return { st, on, emit, get, post, put, del, init, login, register, logout, connect, disconnect };
})();
