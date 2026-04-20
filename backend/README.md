# Bavaria Sport 32 — Backend

Node.js + Express + SQLite backend for Bavaria Sport 32 båtapp.

## Lokal utvikling

```bash
# Installer Node.js fra https://nodejs.org (velg LTS-versjonen)
# Åpne Terminal og kjør:

cd backend
npm install
npm run dev
```

API kjører på http://localhost:3001

## Endepunkter

| Metode | URL | Beskrivelse |
|--------|-----|-------------|
| GET | /api/health | Helsesjekk |
| GET | /api/events | Hent hendelseslogg |
| POST | /api/events | Legg til hendelse |
| GET | /api/docs | Hent dokumenter |
| POST | /api/docs | Last opp dokument |
| DELETE | /api/docs/:id | Slett dokument |
| GET | /api/parts | Hent reservedelsliste |
| POST | /api/parts | Legg til del |
| PUT | /api/parts/:id | Oppdater del |
| DELETE | /api/parts/:id | Slett del |
| GET | /api/maintenance | Hent vedlikeholdsoppgaver |
| POST | /api/maintenance | Legg til oppgave |
| PUT | /api/maintenance/:id | Oppdater oppgave |

## Miljøvariabler (.env)

```
PORT=3001
DB_PATH=./data/bavaria32.db
UPLOADS_PATH=./uploads
SIGNALK_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

## Deploy til Cerbo GX

Kopier hele mappen til Cerbo GX, endre .env, kjør `npm install && npm start`.
Node.js er tilgjengelig via Venus OS Large / opkg.
