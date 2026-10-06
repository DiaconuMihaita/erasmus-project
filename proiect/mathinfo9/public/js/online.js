/* Dueluri H2H online (în timp real, prin server) */
(() => {
  'use strict';
  const { $, $$, esc, toast, ARROW, go } = MI;
  const KEYS = ['1', '2', '3', '4'], KEYS2 = ['a', 's', 'd', 'f'];

  let M = null;                 // meciul curent
  let lobby = { state: 'idle', code: '', subject: 'mix', online: 0 };
  let timer = null;

  /* ---------- lobby (în pagina Arena) ---------- */
  function mount() {
    const box = $('#onlineBox'); if (!box) return;
    if (M) return paintGame();
    if (!API.st.reachable) { box.innerHTML = `<h4>Duel online</h4><p class="hint">Dueluri între dispozitive diferite au nevoie de server. Pornește-l cu <code>npm start</code>.</p>`; return; }
    if (!API.st.user) { box.innerHTML = `<h4>Duel online</h4><p class="lead" style="font-size:1rem">Joacă în timp real împotriva unui coleg de pe alt telefon sau calculator.</p><button class="btn lime" id="olog">Intră în cont</button>`; $('#olog').onclick = MI.openAuth; return; }
    paintLobby();
    API.get('/api/h2h/lobby').then(r => { lobby.online = r.online; const el = $('#olc'); if (el) el.textContent = `${r.online} online acum`; }).catch(() => { });
  }

  function paintLobby() {
    const box = $('#onlineBox'); if (!box || M) return;
    const subj = ['mix', 'mate', 'info'].map(s => `<button class="opt" data-s="${s}" aria-pressed="${lobby.subject === s}">${s === 'mix' ? 'Mix' : s === 'mate' ? 'Matematică' : 'Informatică'}</button>`).join('');
    let body;
    if (lobby.state === 'queue') body = `<div class="waiting"><span class="spin"></span><div><b>Se caută un adversar…</b><p class="hint">Rămâi pe această pagină. Un alt elev trebuie să apese „Meci rapid” la aceeași materie.</p></div></div><button class="btn ghost" id="ocancel">Anulează</button>`;
    else if (lobby.state === 'room') body = `<div class="waiting"><span class="spin"></span><div><b>Camera ta este deschisă</b><p class="hint">Dă-i prietenului acest cod:</p><div class="room-code">${esc(lobby.code)}</div></div></div><button class="btn ghost" id="ocancel">Închide camera</button>`;
    else body = `<div class="opts" id="osubj">${subj}</div>
      <div class="cta"><button class="btn lime" id="oq">Meci rapid ${ARROW}</button><button class="btn ghost" id="oroom">Creează cameră</button></div>
      <form class="join-row" id="ojoin"><input id="ocode" maxlength="5" placeholder="COD CAMERĂ" autocomplete="off" style="text-transform:uppercase"><button class="btn" type="submit">Intră</button></form>`;
    box.innerHTML = `<div class="online-head"><div><h4>Duel online</h4><p class="lead" style="font-size:1.05rem">Împotriva unui coleg, în timp real. Același set de întrebări, același cronometru.</p></div><span class="chip live-chip"><i class="live"></i><span id="olc">${lobby.online ? lobby.online + ' online acum' : 'conectat'}</span></span></div>${body}`;
    const c = $('#ocancel'); if (c) c.onclick = async () => { await API.post('/api/h2h/cancel').catch(() => { }); lobby.state = 'idle'; paintLobby(); };
    if (lobby.state !== 'idle') return;
    $('#osubj').onclick = e => { const b = e.target.closest('.opt'); if (b) { lobby.subject = b.dataset.s; paintLobby(); } };
    $('#oq').onclick = async () => { try { const r = await API.post('/api/h2h/queue', { subject: lobby.subject }); if (r.status === 'waiting') { lobby.state = 'queue'; paintLobby(); } } catch (e) { toast('!', e.message); } };
    $('#oroom').onclick = async () => { try { const r = await API.post('/api/h2h/room', { subject: lobby.subject }); lobby.state = 'room'; lobby.code = r.code; paintLobby(); } catch (e) { toast('!', e.message); } };
    $('#ojoin').onsubmit = async e => { e.preventDefault(); try { await API.post('/api/h2h/join', { code: $('#ocode').value }); } catch (ex) { toast('!', ex.message); } };
  }

  /* ---------- evenimente live ---------- */
  API.on('live', ev => {
    if (ev.type === 'hello') { lobby.online = ev.online; return; }
    if (ev.type === 'conn') return;
    if (ev.type === 'match') {
      if (M && M.id === ev.id) { M.you = ev.you; return; }   // reluare după reconectare
      M = { id: ev.id, names: ev.names, you: ev.you, subject: ev.subject, rounds: ev.rounds, time: ev.time, sc: [0, 0], cor: [0, 0], phase: 'intro', i: -1, streak: 0, best: 0, picked: null, oppDone: false, rev: null };
      lobby.state = 'idle';
      if (MI.curr() !== 'arena') go('#/arena'); else MI.R.arena();
      return;
    }
    if (!M) return;
    if (ev.type === 'round') {
      M.phase = 'ask'; M.i = ev.i; M.q = ev.q; M.n = ev.n; M.picked = null; M.oppDone = false; M.rev = null; M.endsAt = Date.now() + ev.left * 1000;
    } else if (ev.type === 'opp') { M.oppDone = true; if (M.phase === 'ask') { const s = $('#st-opp'); if (s) s.textContent = 'a răspuns'; } return; }
    else if (ev.type === 'reveal') {
      M.phase = 'reveal'; M.rev = ev; M.sc = ev.sc; M.cor = ev.cor;
      const g = ev.gain[M.you]; MI.S().stats.answered++;
      if (g) { MI.S().stats.correct++; M.streak++; M.best = Math.max(M.best, M.streak); } else M.streak = 0;
    } else if (ev.type === 'end') {
      M.phase = 'end'; M.end = ev; M.sc = ev.sc; M.cor = ev.cor; award();
    }
    if (MI.curr() === 'arena') paintGame();
  });

  function award() {
    if (M.awarded) return; M.awarded = true;
    const S = MI.S(), me = M.you, e = M.end, win = e.winner === me, draw = e.winner === -1;
    S.stats.duels++; if (win) S.stats.wins++; if (M.cor[me] === M.rounds) S.stats.perfect++;
    S.stats.bestStreak = Math.max(S.stats.bestStreak, M.best);
    M.xp = M.cor[me] * 10 + (win ? 50 : draw ? 20 : 10) + (M.cor[me] === M.rounds ? 30 : 0);
    MI.addXP(M.xp); MI.checkBadges(); MI.pushNow();
  }

  /* ---------- ecranul de joc ---------- */
  function paintGame() {
    const g = $('#game'); if (!g || !M) return;
    $('#setupWrap').style.display = 'none'; $('#v-arena').classList.add('playing'); g.classList.add('on');
    clearInterval(timer);
    const me = M.you, op = 1 - me;
    if (M.phase === 'intro') {
      g.innerHTML = `<div class="card result"><span class="eyebrow">Adversar găsit</span><h2>${esc(M.names[me])} <span style="opacity:.3">vs</span> ${esc(M.names[op])}</h2><p class="lead" style="margin:0 auto">${M.rounds} întrebări · ${M.time} secunde fiecare. Pregătește-te…</p></div>`;
      return;
    }
    if (M.phase === 'end') {
      const e = M.end, win = e.winner === me, draw = e.winner === -1;
      const title = e.reason === 'forfeit' ? (win ? 'Adversarul a abandonat.' : 'Ai abandonat.') : draw ? 'Egal.' : win ? 'Ai câștigat.' : esc(M.names[op]) + ' câștigă.';
      g.innerHTML = `<div class="card result"><span class="eyebrow">Rezultat final · online</span><h2>${title}</h2>
        <div class="final"><div class="${M.sc[me] >= M.sc[op] ? 'win' : ''}"><b>${M.sc[me]}</b><span>${esc(M.names[me])} · ${M.cor[me]}/${M.rounds} corecte</span></div><div class="${M.sc[op] >= M.sc[me] ? 'win' : ''}"><b>${M.sc[op]}</b><span>${esc(M.names[op])} · ${M.cor[op]}/${M.rounds} corecte</span></div></div>
        <div class="gains"><span class="chip">+${M.xp} XP</span><span class="chip">Serie maximă: ${M.best}</span></div>
        <div class="cta" style="justify-content:center"><button class="btn lime" id="oback">Înapoi în arenă</button></div></div>`;
      $('#oback').onclick = () => { M = null; MI.R.arena(); };
      return;
    }
    const q = M.q, rev = M.rev, C = 2 * Math.PI * 38;
    const tags = i => rev ? [me, op].filter(p => rev.picks[p] === i).map(p => `<i>${p === me ? 'TU' : 'RIVAL'}</i>`).join('') : '';
    g.innerHTML = `
      <div class="hud">
        <div class="pl ${M.sc[me] > M.sc[op] ? 'lead-p' : ''}"><div class="av">${esc(M.names[me][0].toUpperCase())}</div><div><div class="nm">${esc(M.names[me])}</div><div class="sc">${M.sc[me]}</div><div class="state" id="st-me">${rev ? (rev.gain[me] ? '+' + rev.gain[me] + ' puncte' : rev.picks[me] === null ? 'timp expirat' : 'greșit') : M.picked !== null ? 'a răspuns' : 'gândește…'}</div></div></div>
        <div class="ring" id="ring"><svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="38"/><circle class="fg" id="rfg" cx="42" cy="42" r="38" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><b id="tnum">${M.time}</b></div>
        <div class="pl r ${M.sc[op] > M.sc[me] ? 'lead-p' : ''}"><div class="av">${esc(M.names[op][0].toUpperCase())}</div><div><div class="nm">${esc(M.names[op])}</div><div class="sc">${M.sc[op]}</div><div class="state" id="st-opp">${rev ? (rev.gain[op] ? '+' + rev.gain[op] + ' puncte' : rev.picks[op] === null ? 'timp expirat' : 'greșit') : M.oppDone ? 'a răspuns' : 'gândește…'}</div></div></div>
      </div>
      <div class="card qcard">
        <div class="qmeta"><span class="chip ${q.s}"><i class="dot"></i>${q.s === 'mate' ? 'Matematică' : 'Informatică'} · ${esc(q.t)}</span><span class="chip">Întrebarea ${M.i + 1} / ${M.n}</span></div>
        <div class="qtext">${esc(q.q)}</div>
        <div class="answers"><div class="pgrid">${q.o.map((t, i) => {
      let cls = ''; if (rev) cls = i === rev.correct ? 'right' : (rev.picks[me] === i || rev.picks[op] === i) ? 'wrong' : 'dim'; else if (M.picked === i) cls = 'picked';
      return `<button class="ans ${cls}" data-i="${i}" ${rev || M.picked !== null ? 'disabled' : ''}><span class="k">${i + 1}</span><span>${esc(t)}</span><span class="tags">${tags(i)}</span></button>`;
    }).join('')}</div></div>
        <div class="reveal ${rev ? 'on' : ''}" id="reveal">${rev ? `<p><b>Explicație</b>${esc(rev.e)}</p><span class="hint" id="nxt">${rev.last ? 'Rezultatul apare imediat…' : 'Următoarea întrebare imediat…'}</span>` : ''}</div>
      </div>
      <p style="margin-top:14px"><button class="btn sm ghost danger" id="oleave">Abandonează duelul</button></p>`;
    $('#oleave').onclick = async () => { if (confirm('Abandonezi duelul? Adversarul câștigă.')) { await API.post('/api/h2h/leave').catch(() => { }); } };
    g.querySelector('.pgrid').onclick = e => { const b = e.target.closest('.ans'); if (b && !b.disabled) answer(+b.dataset.i); };
    if (M.phase === 'ask') {
      timer = setInterval(() => {
        const left = Math.max(0, (M.endsAt - Date.now()) / 1000), fg = $('#rfg'); if (!fg) return clearInterval(timer);
        fg.style.strokeDashoffset = String(C * (1 - left / M.time)); $('#tnum').textContent = Math.ceil(left); $('#ring').classList.toggle('low', left <= 5);
      }, 100);
    }
  }

  async function answer(idx) {
    if (!M || M.phase !== 'ask' || M.picked !== null) return;
    M.picked = idx; paintGame();
    try { await API.post('/api/h2h/answer', { match: M.id, i: M.i, idx }); } catch (e) { toast('!', 'Răspunsul nu a ajuns: ' + e.message); }
  }
  document.addEventListener('keydown', e => {
    if (!M || M.phase !== 'ask' || MI.curr() !== 'arena' || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase(); const i = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : KEYS2.indexOf(k);
    if (i >= 0) answer(i);
  });

  /* integrare în Arena */
  const orig = MI.R.arena;
  MI.R.arena = (a) => { orig(a); mount(); };
})();
