# FITFREAK Vercel deployment fix

The live login failed because the frontend called `/api/auth/login`, but the existing
Vercel config only rewrote static frontend paths. The original Express server also
only called `app.listen()` locally and was not exposed as a Vercel Function.

Replace the matching files in E:\health with these files.

## 1. Install
npm install

## 2. Local test
npm run seed
npm start

Open http://localhost:5000

## 3. Production database
For reliable Vercel persistence, create a Turso/libSQL database and set:
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
JWT_SECRET

The code keeps local SQLite for development when TURSO_DATABASE_URL is not set.
On Vercel it uses the remote Turso/libSQL database.

## 4. Push
git add .
git commit -m "fix: make FITFREAK Vercel full stack"
git push origin main

## 5. Test
https://YOUR-DOMAIN.vercel.app/api/health

Expected:
{"ok":true,"database":"connected"}

Then login with:
demo@fitfreak.local
Demo@123
