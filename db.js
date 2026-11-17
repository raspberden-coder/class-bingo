// Persistent results storage. Uses Postgres (e.g. Supabase) when DATABASE_URL is set;
// otherwise keeps results in memory so the game still works without a database.

const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
let pool = null;
const memory = []; // fallback store

async function init() {
  if (!url) {
    console.log("DATABASE_URL not set: results are kept in memory only.");
    return;
  }
  pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 3,
  });
  try {
    await createTables();
  } catch (e) {
    pool.end().catch(() => {});
    pool = null; // fall back to memory
    throw e;
  }
  console.log("Connected to Postgres.");
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS results (
      id          BIGSERIAL PRIMARY KEY,
      session     TEXT NOT NULL,
      round       INT  NOT NULL,
      title       TEXT,
      name        TEXT NOT NULL,
      name_key    TEXT NOT NULL,
      place       INT  NOT NULL,
      players     INT  NOT NULL,
      lines       INT  NOT NULL DEFAULT 0,
      marks       INT  NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS results_name_key ON results (name_key);
    CREATE TABLE IF NOT EXISTS heard (
      id          BIGSERIAL PRIMARY KEY,
      session     TEXT NOT NULL,
      round       INT  NOT NULL,
      category    TEXT NOT NULL,
      count       INT  NOT NULL,
      players     INT  NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Lock the tables for Supabase's public API; this server connects as the owner, which bypasses RLS.
    ALTER TABLE results ADD COLUMN IF NOT EXISTS avatar TEXT;
    ALTER TABLE results ENABLE ROW LEVEL SECURITY;
    ALTER TABLE heard   ENABLE ROW LEVEL SECURITY;
  `);
}

const points = (place) => (place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0);

/** rows: [{name, place, lines, marks}], heardCounts: {category: n} */
async function saveRound({ session, round, title, rows, heardCounts }) {
  const players = rows.length;
  if (!pool) {
    for (const r of rows) memory.push({ ...r, name_key: r.name.toLowerCase(), session, round, title, players });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO results (session, round, title, name, name_key, place, players, lines, marks, avatar)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [session, round, title, r.name, r.name.toLowerCase(), r.place, players, r.lines, r.marks, r.avatar || null]
      );
    }
    for (const [category, count] of Object.entries(heardCounts || {})) {
      if (count > 0)
        await client.query(`INSERT INTO heard (session, round, category, count, players) VALUES ($1,$2,$3,$4,$5)`, [
          session, round, category, count, players,
        ]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Top players across all sessions. */
async function leaderboard(limit = 10) {
  if (!pool) {
    const by = new Map();
    for (const r of memory) {
      const s = by.get(r.name_key) || { name: r.name, games: 0, wins: 0, podiums: 0, bingos: 0, points: 0 };
      s.name = r.name;
      s.avatar = r.avatar;
      s.games++;
      if (r.place === 1) s.wins++;
      if (r.place <= 3) s.podiums++;
      s.bingos += r.lines;
      s.points += points(r.place);
      by.set(r.name_key, s);
    }
    return [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.bingos - a.bingos).slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT (array_agg(name ORDER BY created_at DESC))[1] AS name,
            (array_agg(avatar ORDER BY created_at DESC))[1] AS avatar,
            count(*)::int AS games,
            count(*) FILTER (WHERE place = 1)::int AS wins,
            count(*) FILTER (WHERE place <= 3)::int AS podiums,
            coalesce(sum(lines), 0)::int AS bingos,
            sum(CASE place WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END)::int AS points
       FROM results
      GROUP BY name_key
      ORDER BY points DESC, wins DESC, bingos DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = { init, saveRound, leaderboard, get persistent() { return !!pool; } };
