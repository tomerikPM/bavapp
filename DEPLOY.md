# Deploy Bavapp

To deploy-targets:
- **Cerbo GX MK2 ombord** (primær — kjører lokalt på båtens Signal K)
- **Railway** (sky-mirror for fjerntilgang)

---

# Deploy til Cerbo GX MK2

Bavapp kjører som daemontools-tjeneste på Cerbo, snakker med Signal K på `localhost:3000`.

## Forutsetninger

- SSH-tilgang til Cerbo (root-passord satt via Superuser-trikset, se [victronenergy.com/live/ccgx:root_access](https://www.victronenergy.com/live/ccgx:root_access))
- Cerbo på samme nett som Mac (via RUT200 wifi "Summer", IP `192.168.1.237`)
- Venus OS Large image (har Node.js v20 + npm)

## Første deploy

```bash
./sync-to-cerbo.sh
```

Skriptet:
1. rsync av `backend/` + `frontend/` til `/data/bavapp/`
2. `npm install --omit=dev` på Cerbo (henter prebuilt better-sqlite3 for armv7)
3. Lager `/data/bavapp/service/{run,log/run}` (daemontools)
4. Symlink `/service/bavapp → /data/bavapp/service` — svscan plukker opp innen 5 sek
5. Restarter service via `svc -t` for å plukke opp ny kode

## Seed data fra lokal Mac

Etter første deploy er DB tom (rsync ekskluderer `data/` og `uploads/`). Importer costs + documents + photos + uploads-filer:

```bash
./wipe-and-seed-cerbo.sh
```

Skriptet eksporterer fra lokal Mac-DB, sletter Cerbo-DB, lar service auto-seed strukturelle tabeller (parts, maintenance, vessel_items, features, changelog), og importerer tre user-data-tabeller via `better-sqlite3` (Cerbo har ikke `sqlite3` CLI).

## Drift på Cerbo

```bash
# Status
ssh root@192.168.1.237 svstat /service/bavapp

# Logger (live)
ssh root@192.168.1.237 tail -f /var/log/bavapp/current

# Restart
ssh root@192.168.1.237 svc -t /service/bavapp

# Stopp / start
ssh root@192.168.1.237 svc -d /service/bavapp
ssh root@192.168.1.237 svc -u /service/bavapp
```

Bavapp kjøres på `http://192.168.1.237:3001/` på boat-LAN (RUT200 wifi "Summer").

## Override host

```bash
CERBO_HOST=root@10.0.0.50 ./sync-to-cerbo.sh
```

---

# Deploy Bavapp til Railway

## Før deploy

Bavapp har **HTTP Basic Auth**-gate som aktiveres automatisk når `SITE_PASSWORD` er satt og trafikken kommer fra ikke-lokal IP. Localhost, båtens LAN (192.168.x / 10.x) og `/api/health` slipper alltid gjennom.

## 1. Commit og push til GitHub

```bash
cd ~/Library/CloudStorage/OneDrive-PolarisMedia/bavaria32

# Sjekk at ikke data eller uploads er med
git status
# backend/data/*.db og backend/uploads/ skal IKKE stå i changes

git add -A
git commit -m "deploy: passord-gate, railway-config, backend_url bootstrap"
git push origin main
```

### Hvis push feiler med "Permission denied (publickey)"

Remote-en er SSH-basert, men ingen SSH-nøkkel er registrert mot GitHub-kontoen din.
Løsning: bytt til HTTPS — `gh`-CLI sin credential-helper håndterer tokenet automatisk.

```bash
# Sjekk at gh er autentisert
gh auth status

# Bytt til HTTPS (engangs)
git remote set-url origin https://github.com/<brukernavn>/<repo>.git

# Prøv push på nytt
git push origin main
```

Alternativt, for SSH på sikt: `gh ssh-key add ~/.ssh/id_ed25519.pub` (etter at
du har generert nøkkel med `ssh-keygen -t ed25519`).

## 2. Opprett Railway-prosjekt

1. Logg inn på [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo** → velg `tomerikPM/bavapp`
3. **Viktig:** Service → Settings → Source → **Add Root Directory = `backend`**
   (uten dette feiler Nixpacks med "npm: command not found" fordi `package.json` er i `backend/`)
4. Railway plukker opp `railway.json` og bruker:
   - Build: `npm install --omit=dev`
   - Start: `node server.js`
   - Healthcheck: `/api/health`

## 3. Opprett persistent Volume

På tjeneste-siden i Railway:
1. **Settings → Volumes → + New Volume**
2. Mount path: `/data`
3. Size: 1 GB (holder lenge)

## 4. Sett miljøvariabler

I **Variables**-fanen:

| Variabel              | Verdi                        |
|-----------------------|------------------------------|
| `SITE_USER`           | `bavapp`                     |
| `SITE_PASSWORD`       | `<velg et godt passord>`     |
| `DB_PATH`             | `/data/bavaria32.db`         |
| `UPLOADS_PATH`        | `/data/uploads`              |
| `FALLBACK_LAT`        | `58.1467`                    |
| `FALLBACK_LON`        | `7.9956`                     |
| `SCRAPE_RADIUS_KM`    | `50`                         |

Ikke sett `PORT` — Railway gjør det automatisk.

## 5. Første deploy

Railway auto-deployer når du har koblet repo-en. Etter ~2 min skal `https://<prosjekt>.up.railway.app/api/health` svare OK.

Forsøk å åpne URL-en i nettleseren — du skal få basic auth-prompt. Logg inn med `SITE_USER` / `SITE_PASSWORD`. Foreløpig ser du seedet data (tom DB med Bavaria 32-spek).

## 6. Overfør data fra lokalt til Railway

To alternativer:

### Alt A: Railway CLI + rsync (anbefalt)

```bash
# Installer Railway CLI hvis du ikke har den
brew install railway

railway login
railway link   # koble til ditt prosjekt

# Stopp lokal backend først (unngå korrupt SQLite)
# Få tak i kjørende containerens shell:
railway shell

# I container-shellet:
mkdir -p /data/uploads/photos
exit

# Fra lokal maskin — kopier via Railway SSH
# (Merk: krever at Railway Volume er mountet; dette ER tilfelle)
cd ~/Library/CloudStorage/OneDrive-PolarisMedia/bavaria32/backend
railway run bash -c "tar czf - data uploads" < /dev/null > ./local-backup.tar.gz  # IKKE denne — omvendt retning!
```

Egentlig, siden Railway CLI ikke har direkte filoverføring, bruk alternativ B:

### Alt B: Backup/restore via admin-endepunkt (implementert)

**Lokalt — lag tar.gz av DB + uploads:**
```bash
# SITE_PASSWORD ikke satt lokalt → ingen auth nødvendig
curl -sS http://localhost:3001/api/admin/backup -o bavapp-backup.tar.gz
ls -lh bavapp-backup.tar.gz   # bør være ~20-30 MB
```

**Railway — aktiver restore og last opp:**

1. Sett midlertidig `ENABLE_ADMIN_RESTORE=1` i Railway → Variables (appen restarter automatisk)
2. Last opp:
   ```bash
   curl -u bavapp:<SITE_PASSWORD> \
        -F "archive=@bavapp-backup.tar.gz" \
        https://<prosjekt>.up.railway.app/api/admin/restore
   ```
3. Respons: `{"ok":true,"message":"…","db_size_bytes":…,"photo_count":…}`
4. **Appen prosess-exiter innen 2 sek** → Railway auto-restarter → ny DB + uploads er aktive
5. Last appen på nytt i nettleseren
6. **Viktig:** Fjern `ENABLE_ADMIN_RESTORE` fra Variables når du er ferdig (restore er destruktiv og bør ikke være aktivert permanent)

**Verifiser**: `curl -u bavapp:<pass> https://.../api/admin/status` viser DB-størrelse og filtall.

## 6b. Sync lokale endringer til Railway

All dataredigering skjer lokalt. Railway er visnings-speil, oppdatert via sync-script.

### Engangsoppsett
Behold `ENABLE_ADMIN_RESTORE=1` i Railway Variables (Basic Auth + sterkt passord beskytter endepunktet).

### Hver gang du vil sync-e
```bash
export SITE_PASSWORD="<ditt-passord>"
./sync-to-railway.sh
```

Scriptet:
1. Verifiserer at lokal backend kjører
2. Lager tar.gz-backup via `/api/admin/backup`
3. Laster opp til Railway via `/api/admin/restore`
4. Venter på restart
5. Verifiserer at DB-størrelse + tabell-rader er på plass

**NB:** Restore overskriver hele Railway-DB-en. Ikke rediger data via Railway-UI — det går tapt ved neste sync.

Bruk `RAILWAY_URL` eller `SITE_USER` env-variabler for å overstyre defaults hvis du har custom domain eller annen bruker.

## 7. Custom domain (valgfritt)

Railway → **Settings → Domains → + Custom Domain**. Gratis HTTPS via Let's Encrypt.

## 8. Videre drift

- Auto-deploy på push til `main`
- Loggoversikt i Railway dashboard
- **Endre SITE_PASSWORD**: oppdater i Variables → appen restarter automatisk

## Feilsøking

| Problem                              | Løsning                                                                     |
|--------------------------------------|-----------------------------------------------------------------------------|
| `/api/health` svarer ikke            | Sjekk build-log. Mest sannsynlig npm install eller require-feil             |
| Får auth-prompt men riktig passord virker ikke | Sjekk at `SITE_PASSWORD` ikke har trailing whitespace                        |
| Bilder vises ikke etter restore      | Sjekk at UPLOADS_PATH matcher volume-mount (`/data/uploads`)                |
| DB mangler data etter restart        | Volume ikke opprettet eller DB_PATH peker utenfor volumet                   |
| Signal K + Ruter status "utilgjengelig" | Forventet — Signal K og RUT200 kjører kun på båtens LAN                     |
