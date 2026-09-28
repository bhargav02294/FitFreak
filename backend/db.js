const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

// FITFREAK supports two database modes:
// 1) Local development: SQLite file under backend/data.
// 2) Vercel production: Turso/libSQL via environment variables.
// Never try to mkdir/write inside /var/task on Vercel; the deployed bundle is read-only.

const isVercel = Boolean(process.env.VERCEL);
const hasRemoteDb = Boolean(process.env.TURSO_DATABASE_URL);

let url;
let authToken;

if (hasRemoteDb) {
  url = process.env.TURSO_DATABASE_URL;
  authToken = process.env.TURSO_AUTH_TOKEN || undefined;
} else if (isVercel) {
  // Safe emergency/demo fallback when Turso variables have not been added yet.
  // /tmp is writable on Vercel, but it is ephemeral. Configure Turso for real persistence.
  url = "file:/tmp/fitfreak.db";
  console.warn("FITFREAK: TURSO_DATABASE_URL is not configured. Using ephemeral /tmp SQLite on Vercel.");
} else {
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  url = `file:${path.join(dataDir, "fitfreak.db")}`;
}

const client = createClient({
  url,
  ...(authToken ? { authToken } : {})
});

const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

let readyPromise;

async function initialize() {
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sql of statements) {
    await client.execute(sql);
  }

  const bcrypt = require("bcryptjs");
  const demoHash = bcrypt.hashSync("Demo@123", 10);

  await client.execute({
    sql: `INSERT OR IGNORE INTO users
      (name,email,password_hash,age,height_cm,weight_kg,fitness_level,bio)
      VALUES(?,?,?,?,?,?,?,?)`,
    args: [
      "Alex Morgan",
      "demo@fitfreak.local",
      demoHash,
      22,
      178,
      72,
      "Advanced",
      "Training smart. Living strong."
    ]
  });

  const workouts = [
    ["Full Body Power","Strength","Advanced",48,420,"Compound strength session.","Dumbbells"],
    ["HIIT Burn","Cardio","Intermediate",28,310,"High-intensity intervals.","Bodyweight"],
    ["Core & Stability","Core","Beginner",22,160,"Controlled core work.","Mat"],
    ["Mobility Flow","Mobility","Beginner",25,120,"Dynamic mobility sequence.","Mat"],
    ["Upper Body Sculpt","Strength","Intermediate",38,290,"Push, pull and shoulder work.","Dumbbells"],
    ["Morning Run","Running","Intermediate",35,360,"Steady outdoor or treadmill run.","Treadmill"]
  ];

  for (const w of workouts) {
    await client.execute({
      sql: `INSERT INTO workouts
        (title,category,difficulty,duration_min,calories,description,equipment)
        SELECT ?,?,?,?,?,?,?
        WHERE NOT EXISTS (SELECT 1 FROM workouts WHERE title=?)`,
      args: [...w, w[0]]
    });
  }

  const user = await one("SELECT id FROM users WHERE email=?", ["demo@fitfreak.local"]);

  if (user) {
    const goalCount = await one("SELECT COUNT(*) AS c FROM goals WHERE user_id=?", [user.id]);
    if (Number(goalCount.c) === 0) {
      const goals = [
        ["Weekly training",240,180,"min","Training","2026-10-04"],
        ["Daily hydration",8,6,"glasses","Recovery","2026-09-30"],
        ["Healthy weight",68,72,"kg","Body","2026-12-31"]
      ];
      for (const g of goals) {
        await run(
          `INSERT INTO goals(user_id,title,target_value,current_value,unit,category,due_date)
           VALUES(?,?,?,?,?,?,?)`,
          [user.id, ...g]
        );
      }
    }

    const progressCount = await one("SELECT COUNT(*) AS c FROM progress WHERE user_id=?", [user.id]);
    if (Number(progressCount.c) === 0) {
      const rows = [
        [76,20.5,"2026-07-01"],
        [74.8,19.8,"2026-07-15"],
        [73.5,19.1,"2026-08-01"],
        [72.8,18.7,"2026-08-15"],
        [72,18.2,"2026-09-01"]
      ];
      for (const r of rows) {
        await run(
          `INSERT INTO progress(user_id,weight_kg,body_fat,recorded_on,note)
           VALUES(?,?,?,?,?)`,
          [user.id, r[0], r[1], r[2], "Progress checkpoint"]
        );
      }
    }
  }
}

function ready() {
  if (!readyPromise) {
    readyPromise = initialize().catch((err) => {
      readyPromise = undefined;
      throw err;
    });
  }
  return readyPromise;
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows.map((row) => Object.fromEntries(Object.entries(row)));
}

async function one(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || undefined;
}

async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    changes: Number(result.rowsAffected || 0),
    lastInsertRowid: result.lastInsertRowid
  };
}

module.exports = { client, ready, all, one, run };
