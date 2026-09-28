const db = require("./db");
const bcrypt = require("bcryptjs");

(async () => {
  await db.ready();
  const hash = bcrypt.hashSync("Demo@123", 10);

  await db.run(
    `INSERT OR IGNORE INTO users
      (name,email,password_hash,age,height_cm,weight_kg,fitness_level,bio)
     VALUES(?,?,?,?,?,?,?,?)`,
    ["Alex Morgan","demo@fitfreak.local",hash,22,178,72,"Advanced","Training smart. Living strong."]
  );

  const ws = [
    ["Full Body Power","Strength","Advanced",48,420,"Compound strength session.","Dumbbells"],
    ["HIIT Burn","Cardio","Intermediate",28,310,"High-intensity intervals.","Bodyweight"],
    ["Core & Stability","Core","Beginner",22,160,"Controlled core work.","Mat"],
    ["Mobility Flow","Mobility","Beginner",25,120,"Dynamic mobility sequence.","Mat"],
    ["Upper Body Sculpt","Strength","Intermediate",38,290,"Push, pull and shoulder work.","Dumbbells"],
    ["Morning Run","Running","Intermediate",35,360,"Steady outdoor or treadmill run.","Treadmill"]
  ];

  for (const x of ws) {
    await db.run(
      `INSERT INTO workouts(title,category,difficulty,duration_min,calories,description,equipment)
       SELECT ?,?,?,?,?,?,?
       WHERE NOT EXISTS (SELECT 1 FROM workouts WHERE title=?)`,
      [...x, x[0]]
    );
  }

  console.log("FITFREAK seed complete: demo@fitfreak.local / Demo@123");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
