const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const SECRET = process.env.JWT_SECRET || "fitfreak-demo-secret-change-me";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));

const safe = async (id) =>
  db.one(
    `SELECT id,name,email,age,gender,height_cm,weight_kg,fitness_level,bio,created_at
     FROM users WHERE id=?`,
    [id]
  );

const tok = (u) =>
  jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: "7d" });

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

app.use(async (req, res, next) => {
  try {
    await db.ready();
    next();
  } catch (err) {
    console.error("Database initialization error:", err);
    res.status(500).json({ error: "Database initialization failed" });
  }
});

app.get("/api/health", async (_req, res) => {
  const row = await db.one("SELECT 1 AS ok");
  res.json({ ok: Number(row.ok) === 1, database: "connected" });
});

app.post("/api/auth/register", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.email || !b.password || String(b.password).length < 6) {
    return res.status(400).json({
      error: "Name, email and 6+ character password required"
    });
  }

  const email = String(b.email).trim().toLowerCase();
  const existing = await db.one("SELECT id FROM users WHERE email=?", [email]);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = bcrypt.hashSync(String(b.password), 10);
  const result = await db.run(
    `INSERT INTO users(name,email,password_hash)
     VALUES(?,?,?)`,
    [String(b.name).trim(), email, passwordHash]
  );

  const user = await safe(result.lastInsertRowid);
  return res.status(201).json({ token: tok(user), user });
});

app.post("/api/auth/login", async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();

  const user = await db.one(
    "SELECT * FROM users WHERE email=?",
    [email]
  );

  if (!user || !bcrypt.compareSync(String(b.password || ""), user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json({
    token: tok(user),
    user: await safe(user.id)
  });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await safe(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.put("/api/me", auth, async (req, res) => {
  const allowed = ["name","age","gender","height_cm","weight_kg","fitness_level","bio"];
  const sets = [];
  const args = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key}=?`);
      args.push(req.body[key]);
    }
  }

  if (sets.length) {
    args.push(req.user.id);
    await db.run(`UPDATE users SET ${sets.join(",")} WHERE id=?`, args);
  }

  res.json(await safe(req.user.id));
});

app.get("/api/workouts", async (_req, res) => {
  res.json(await db.all("SELECT * FROM workouts ORDER BY id"));
});

app.post("/api/workouts/log", auth, async (req, res) => {
  const workout = await db.one(
    "SELECT * FROM workouts WHERE id=?",
    [req.body.workout_id]
  );

  if (!workout) {
    return res.status(404).json({ error: "Workout not found" });
  }

  await db.run(
    `INSERT INTO workout_logs(user_id,workout_id,duration_min,calories)
     VALUES(?,?,?,?)`,
    [req.user.id, workout.id, workout.duration_min, workout.calories]
  );

  res.json({ ok: true });
});

app.get("/api/dashboard", auth, async (req, res) => {
  const id = req.user.id;

  const stats = await db.one(
    `SELECT COUNT(*) AS sessions,
            COALESCE(SUM(duration_min),0) AS minutes,
            COALESCE(SUM(calories),0) AS calories
     FROM workout_logs WHERE user_id=?`,
    [id]
  );

  const nut = await db.one(
    `SELECT COALESCE(SUM(calories),0) AS calories,
            COALESCE(SUM(protein_g),0) AS protein
     FROM meals
     WHERE user_id=? AND date(logged_at)=date('now')`,
    [id]
  );

  const water = await db.one(
    `SELECT glasses FROM water_logs
     WHERE user_id=? AND logged_date=date('now')`,
    [id]
  ) || { glasses: 0 };

  const goals = await db.all("SELECT * FROM goals WHERE user_id=?", [id]);

  const recent = await db.all(
    `SELECT l.*,w.title,w.category
     FROM workout_logs l
     JOIN workouts w ON w.id=l.workout_id
     WHERE l.user_id=?
     ORDER BY l.completed_at DESC LIMIT 5`,
    [id]
  );

  res.json({
    user: await safe(id),
    stats,
    nut,
    water,
    goals,
    recent
  });
});

app.get("/api/meals", auth, async (req, res) => {
  res.json(await db.all(
    "SELECT * FROM meals WHERE user_id=? ORDER BY logged_at DESC",
    [req.user.id]
  ));
});

app.post("/api/meals", auth, async (req, res) => {
  const b = req.body || {};
  const result = await db.run(
    `INSERT INTO meals
      (user_id,meal_type,name,calories,protein_g,carbs_g,fats_g)
     VALUES(?,?,?,?,?,?,?)`,
    [
      req.user.id,
      b.meal_type,
      b.name,
      Number(b.calories) || 0,
      Number(b.protein_g) || 0,
      Number(b.carbs_g) || 0,
      Number(b.fats_g) || 0
    ]
  );

  res.json(await db.one("SELECT * FROM meals WHERE id=?", [result.lastInsertRowid]));
});

app.delete("/api/meals/:id", auth, async (req, res) => {
  await db.run(
    "DELETE FROM meals WHERE id=? AND user_id=?",
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

app.get("/api/progress", auth, async (req, res) => {
  res.json(await db.all(
    "SELECT * FROM progress WHERE user_id=? ORDER BY recorded_on",
    [req.user.id]
  ));
});

app.post("/api/progress", auth, async (req, res) => {
  const b = req.body || {};
  const result = await db.run(
    `INSERT INTO progress(user_id,weight_kg,body_fat,recorded_on,note)
     VALUES(?,?,?,?,?)`,
    [
      req.user.id,
      b.weight_kg,
      b.body_fat || 0,
      b.recorded_on,
      b.note || ""
    ]
  );

  await db.run(
    "UPDATE users SET weight_kg=? WHERE id=?",
    [b.weight_kg, req.user.id]
  );

  res.json(await db.one(
    "SELECT * FROM progress WHERE id=?",
    [result.lastInsertRowid]
  ));
});

app.post("/api/water", auth, async (req, res) => {
  const glasses = Number(req.body.glasses) || 0;

  await db.run(
    `INSERT INTO water_logs(user_id,glasses,logged_date)
     VALUES(?,?,date('now'))
     ON CONFLICT(user_id,logged_date)
     DO UPDATE SET glasses=excluded.glasses`,
    [req.user.id, glasses]
  );

  res.json({ glasses });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found" });
  }
  return res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`FITFREAK: http://localhost:${PORT}`);
  });
}

module.exports = app;
