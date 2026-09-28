const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

const isVercel = process.env.VERCEL === "1";
const tursoUrl = String(process.env.TURSO_DATABASE_URL || "").trim();
const tursoToken = String(process.env.TURSO_AUTH_TOKEN || "").trim();

let databaseUrl;
let authToken;

if (tursoUrl) {
  // Production: Turso/libSQL
  databaseUrl = tursoUrl;
  authToken = tursoToken || undefined;

  console.log("FITFREAK DB: using Turso/libSQL");
} else if (isVercel) {
  // Emergency fallback only.
  // Vercel filesystem is not persistent.
  databaseUrl = "file:/tmp/fitfreak.db";

  console.warn(
    "FITFREAK DB: TURSO_DATABASE_URL is missing. Using temporary /tmp database."
  );
} else {
  // Local development: E:\health\backend\data\fitfreak.db
  const dataDir = path.join(__dirname, "data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
      recursive: true
    });
  }

  databaseUrl = `file:${path.join(dataDir, "fitfreak.db")}`;

  console.log("FITFREAK DB: using local SQLite database");
}

const client = createClient({
  url: databaseUrl,
  ...(authToken ? { authToken } : {})
});

// ----------------------------------------------------
// Schema
// ----------------------------------------------------

const schemaPath = path.join(
  __dirname,
  "..",
  "database",
  "schema.sql"
);

let schema = "";

try {
  schema = fs.readFileSync(schemaPath, "utf8");
} catch (error) {
  console.error("FITFREAK DB: unable to read schema.sql");
  console.error(error);
  throw error;
}

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

async function all(sql, args = []) {
  const result = await client.execute({
    sql,
    args
  });

  return result.rows.map((row) =>
    Object.fromEntries(Object.entries(row))
  );
}

async function one(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || undefined;
}

async function run(sql, args = []) {
  const result = await client.execute({
    sql,
    args
  });

  return {
    changes: Number(result.rowsAffected || 0),
    lastInsertRowid: result.lastInsertRowid
  };
}

// ----------------------------------------------------
// Database initialization
// ----------------------------------------------------

let readyPromise = null;

async function initialize() {
  console.log("FITFREAK DB: initializing database...");

  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  // --------------------------------------------------
  // Demo user
  // --------------------------------------------------

  const bcrypt = require("bcryptjs");

  const demoHash = bcrypt.hashSync(
    "Demo@123",
    10
  );

  await client.execute({
    sql: `
      INSERT OR IGNORE INTO users
      (
        name,
        email,
        password_hash,
        age,
        height_cm,
        weight_kg,
        fitness_level,
        bio
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
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

  // --------------------------------------------------
  // Demo workouts
  // --------------------------------------------------

  const workouts = [
    [
      "Full Body Power",
      "Strength",
      "Advanced",
      48,
      420,
      "Compound strength session.",
      "Dumbbells"
    ],
    [
      "HIIT Burn",
      "Cardio",
      "Intermediate",
      28,
      310,
      "High-intensity intervals.",
      "Bodyweight"
    ],
    [
      "Core & Stability",
      "Core",
      "Beginner",
      22,
      160,
      "Controlled core work.",
      "Mat"
    ],
    [
      "Mobility Flow",
      "Mobility",
      "Beginner",
      25,
      120,
      "Dynamic mobility sequence.",
      "Mat"
    ],
    [
      "Upper Body Sculpt",
      "Strength",
      "Intermediate",
      38,
      290,
      "Push, pull and shoulder work.",
      "Dumbbells"
    ],
    [
      "Morning Run",
      "Running",
      "Intermediate",
      35,
      360,
      "Steady outdoor or treadmill run.",
      "Treadmill"
    ]
  ];

  for (const workout of workouts) {
    await client.execute({
      sql: `
        INSERT INTO workouts
        (
          title,
          category,
          difficulty,
          duration_min,
          calories,
          description,
          equipment
        )
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM workouts
          WHERE title = ?
        )
      `,
      args: [
        ...workout,
        workout[0]
      ]
    });
  }

  // --------------------------------------------------
  // Demo user related data
  // --------------------------------------------------

  const user = await one(
    "SELECT id FROM users WHERE email = ?",
    ["demo@fitfreak.local"]
  );

  if (user) {
    // Goals
    const goalCount = await one(
      "SELECT COUNT(*) AS c FROM goals WHERE user_id = ?",
      [user.id]
    );

    if (Number(goalCount.c) === 0) {
      const goals = [
        [
          "Weekly training",
          240,
          180,
          "min",
          "Training",
          "2026-10-04"
        ],
        [
          "Daily hydration",
          8,
          6,
          "glasses",
          "Recovery",
          "2026-09-30"
        ],
        [
          "Healthy weight",
          68,
          72,
          "kg",
          "Body",
          "2026-12-31"
        ]
      ];

      for (const goal of goals) {
        await run(
          `
            INSERT INTO goals
            (
              user_id,
              title,
              target_value,
              current_value,
              unit,
              category,
              due_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            user.id,
            ...goal
          ]
        );
      }
    }

    // Progress
    const progressCount = await one(
      "SELECT COUNT(*) AS c FROM progress WHERE user_id = ?",
      [user.id]
    );

    if (Number(progressCount.c) === 0) {
      const progress = [
        [76, 20.5, "2026-07-01"],
        [74.8, 19.8, "2026-07-15"],
        [73.5, 19.1, "2026-08-01"],
        [72.8, 18.7, "2026-08-15"],
        [72, 18.2, "2026-09-01"]
      ];

      for (const row of progress) {
        await run(
          `
            INSERT INTO progress
            (
              user_id,
              weight_kg,
              body_fat,
              recorded_on,
              note
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            user.id,
            row[0],
            row[1],
            row[2],
            "Progress checkpoint"
          ]
        );
      }
    }
  }

  console.log("FITFREAK DB: initialization complete");
}

function ready() {
  if (!readyPromise) {
    readyPromise = initialize().catch((error) => {
      readyPromise = null;

      console.error(
        "FITFREAK DB: initialization failed"
      );

      console.error(error);

      throw error;
    });
  }

  return readyPromise;
}

module.exports = {
  client,
  ready,
  all,
  one,
  run
};