# MathInfo 9 H2H – Learn & Arena

Platformă web pentru Matematică și Informatică de clasa a IX-a (LT „Emil Racoviță” Vaslui):
lecții, tutor AI, dueluri H2H (local și online), clase cu profesor și teme cu auto-corectare.

Server Node.js **fără dependențe npm** (folosește `node:sqlite`, inclus în Node ≥ 22.5) + frontend static.

## Pornire

```
cd mathinfo9
npm start            # sau dublu-click pe start.bat (Windows)
```

Apoi deschide http://localhost:3000. Colegii din aceeași rețea (Wi-Fi-ul școlii) intră pe `http://IP-ul-tău:3000`
(vezi IP-ul cu `ipconfig`). Dacă portul 3000 este ocupat: `set PORT=3456` înainte de pornire.

Fără server (deschizi doar `public/index.html`) merg lecțiile, tutorul local, arena contra rivalului digital și
laboratorul; conturile, clasele, temele și duelurile online au nevoie de server.

## Configurare (`.env`, vezi `.env.example`)

| Variabilă | Rol |
|---|---|
| `TEACHER_CODE` | codul cerut la crearea unui cont de **profesor** (implicit `profesor-ler` — **schimbă-l**) |
| `GEMINI_API_KEY` | cheia Google AI Studio; activează AI-ul pentru toți elevii (cheia rămâne pe server) |
| `GEMINI_MODEL` | implicit `gemini-2.5-flash` |
| `PORT` | implicit 3000 |

## Ce poate face

- **Cont** (elev / profesor). Progresul (XP, insigne, lecții) se sincronizează pe server.
- **Clase:** profesorul creează o clasă și primește un cod; elevii intră cu codul.
- **Teme:** profesorul alege întrebări din bancă (72), le scrie singur sau le generează cu AI; elevii le rezolvă,
  se notează automat, iar profesorul vede rezultatele pe elev și procentul de răspunsuri corecte pe întrebare.
- **Duel online:** meci rapid (împerechere automată) sau cameră cu cod; punctajul și cronometrul sunt calculate pe server.
- **Lecții:** 22 (10 mate + 12 info) pe programa clasei a IX-a, cu formule, exemple și cod C++.
- **Tutor AI:** calcule exacte locale (ecuații, cmmdc, baze…); restul merge la Gemini, cu lecția aleasă ca
  context. Fără cheie, răspunde din baza locală sau din textul lecției.

## Structură

```
server/server.js   API + SQLite + dueluri (SSE) + proxy AI + fișiere statice
server/test.js     teste de integrare (pornește serverul cu DB_FILE=/tmp/t.db PORT=3100, apoi node server/test.js)
server/bot.js      adversar de test:  node server/bot.js COD_CAMERĂ http://localhost:3000
public/            frontend (index.html, css, js)
public/js/lessons.js  lecțiile  ·  public/js/data.js  întrebările și baza tutorului
data/mathinfo.db   baza de date (creată automat; nu o publica)
```

## Publicare online

Orice găzduire cu Node ≥ 22.5 și **disc persistent** pentru `data/` (Render, Railway, Fly.io, un VPS):
comanda de pornire `node server/server.js`, variabilele de mai sus ca „environment variables”. Pune serverul în
spatele HTTPS (în mod normal îl oferă platforma). Parolele sunt stocate cu scrypt; sesiunile expiră după 30 de zile.

## Limitări cunoscute

- XP-ul vine de la client (un elev tehnic poate să și-l falsifice); punctajul duelurilor și notele temelor sunt calculate pe server.
- O tema poate fi trimisă o singură dată; nu există încă ștergerea elevilor dintr-o clasă sau resetarea parolei.
- Conținutul (lecții, întrebări) a fost scris automat și merită verificat de un profesor.
