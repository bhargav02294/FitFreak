# FITFREAK — Health & Fitness

Fast, smooth, dark-mode full-stack health & fitness college project.

## Stack
- Frontend: HTML5, CSS3, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Authentication: JWT + bcrypt
- No MongoDB, Supabase, Firebase or cloud database

## Run in E:\health
```powershell
cd E:\health
npm install
npm run seed
npm start
```

Open `http://localhost:5000`

Demo:
- Email: `demo@fitfreak.local`
- Password: `Demo@123`

## Performance
The home page uses lightweight CSS transforms/opacity for scroll reveals. Heavy continuous blur/rotation effects and repeated IntersectionObserver animations were removed.
