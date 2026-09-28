# FITFREAK — Vercel backend fix

## Why the old deployment crashed
The previous `backend/db.js` always executed `fs.mkdirSync()` against `/var/task/backend/data` on Vercel. `/var/task` is the deployed function bundle and must not be treated as a writable application data directory. That caused:

`ENOENT: no such file or directory, mkdir '/var/task/backend/data'`

The corrected code never writes to `/var/task` on Vercel.

## Database modes
- Local: `backend/data/fitfreak.db`
- Vercel with Turso variables: persistent Turso/libSQL
- Vercel without Turso variables: `/tmp/fitfreak.db` emergency demo fallback (ephemeral; not suitable for persistent users)

For a real deployment, add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `JWT_SECRET` in Vercel Project Settings → Environment Variables for Production (and Preview if desired), then redeploy.

## Deploy
```powershell
cd E:\health
npm install
git add .
git commit -m "fix: prevent Vercel filesystem database crash"
git push origin main
```

Then test:

`https://YOUR-DOMAIN.vercel.app/api/health`

Expected:

```json
{"ok":true,"database":"connected"}
```

## Local
```powershell
npm run seed
npm start
```
