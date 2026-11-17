// Class Bingo: cooperative live bingo for class.
// Express serves the pages and Socket.io keeps every player in sync.
// Session state is kept in memory (bingo is played live, one lesson at a time).

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "bingo";
const MAX_LIVE_SESSIONS = 200;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // sessions vanish after 8h without activity

let defaultCategories = [];
try {
  defaultCategories = JSON.parse(fs.readFileSync(path.join(__dirname, "categories.json"), "utf8"));
} catch (e) {
  defaultCategories = [];
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("/api/defaults", (req, res) => res.json({ categories: defaultCategories }));
app.get("/admin", (req, res) => res.redirect("/host"));
app.get("/s/:code", (req, res) => res.sendFile(path.join(__dirname, "public", "play.html")));
app.get("/healthz", (req, res) => res.send("ok"));
app.get("/api/leaderboard", async (req, res) => {
  try { res.json({ players: await db.leaderboard(10) }); } catch (e) { res.json({ players: [] }); }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/** code -> session */
const sessions = new Map();

// ---------- helpers ----------
const clean = (s, max = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (sessions.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gridSize(n) {
  if (n >= 24) return 5;
  if (n >= 15) return 4;
  return 3;
}

/** Build a card: array of cells; null = free centre (odd grids only). */
function makeCard(categories) {
  const size = gridSize(categories.length);
  const hasFree = size % 2 === 1;
  const needed = size * size - (hasFree ? 1 : 0);
  let pool = shuffle(categories);
  while (pool.length < needed) pool = pool.concat(shuffle(categories)); // tiny lists repeat
  const picks = pool.slice(0, needed);
  const cells = [];
  const centre = Math.floor((size * size) / 2);
  for (let i = 0, p = 0; i < size * size; i++) {
    if (hasFree && i === centre) cells.push(null);
    else cells.push(picks[p++]);
  }
  return { size, cells };
}

function lines(size) {
  const out = [];
  for (let r = 0; r < size; r++) out.push([...Array(size)].map((_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push([...Array(size)].map((_, r) => r * size + c));
  out.push([...Array(size)].map((_, i) => i * size + i));
  out.push([...Array(size)].map((_, i) => i * size + (size - 1 - i)));
  return out;
}

function countLines(player) {
  const { size, cells } = player.card;
  const isOn = (i) => cells[i] === null || player.marked.has(i);
  return lines(size).filter((line) => line.every(isOn)).length;
}

function publicState(s) {
  const heard = {};
  for (const cat of s.categories) heard[cat] = 0;
  const players = [];
  for (const p of s.players.values()) {
    const cats = new Set();
    for (const i of p.marked) if (p.card.cells[i]) cats.add(p.card.cells[i]);
    for (const c of cats) heard[c] = (heard[c] || 0) + 1;
    players.push({
      name: p.name,
      marks: p.marked.size,
      lines: p.lines,
      online: p.sockets.size > 0,
      bingoAt: p.bingoAt || null,
    });
  }
  players.sort((a, b) => b.lines - a.lines || b.marks - a.marks || a.name.localeCompare(b.name));
  return {
    code: s.code,
    title: s.title,
    status: s.status,
    round: s.round,
    categories: s.categories,
    heard,
    players,
    winners: s.winners,
    podium: s.podium || null,
    createdAt: s.createdAt,
  };
}

function yourState(p) {
  return { name: p.name, card: p.card, marked: [...p.marked], lines: p.lines };
}

function broadcast(s) {
  s.touchedAt = Date.now();
  io.to("s:" + s.code).emit("session:state", publicState(s));
  io.to("lobby").emit("lobby:list", lobbyList());
}

function lobbyList() {
  return [...sessions.values()]
    .filter((s) => s.status === "live")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({ code: s.code, title: s.title, players: s.players.size, createdAt: s.createdAt }));
}

const isAdmin = (pw) => typeof pw === "string" && pw === ADMIN_PASSWORD;
// The host of a session holds its secret hostKey; ADMIN_PASSWORD works as a master key for every session.
const canControl = (s, { password, hostKey } = {}) =>
  !!s && ((typeof hostKey === "string" && hostKey === s.hostKey) || isAdmin(password));
const makeKey = () => require("crypto").randomBytes(16).toString("hex");

// ---------- results ----------
/** Rank players: earliest bingo first, then more lines, then more marks. */
function ranking(s) {
  return [...s.players.values()]
    .filter((p) => p.marked.size > 0)
    .sort((a, b) =>
      (a.bingoAt || Infinity) - (b.bingoAt || Infinity) || b.lines - a.lines || b.marked.size - a.marked.size)
    .map((p, i) => ({ name: p.name, place: i + 1, lines: p.lines, marks: p.marked.size }));
}

let cachedBoard = [];
async function refreshLeaderboard() {
  try { cachedBoard = await db.leaderboard(10); } catch (e) { console.error("leaderboard:", e.message); }
  io.to("lobby").emit("leaderboard", cachedBoard);
}

/** Close the current round once: compute the podium, store results, tell everyone. */
function finishRound(s) {
  if (s.recordedRound === s.round) return;
  s.recordedRound = s.round;
  const rows = ranking(s);
  s.podium = rows.slice(0, 3);
  io.to("s:" + s.code).emit("podium", { round: s.round, podium: s.podium, total: rows.length });
  if (!rows.length) return;
  const heardCounts = publicState(s).heard;
  db.saveRound({ session: s.code, round: s.round, title: s.title, rows, heardCounts })
    .then(refreshLeaderboard)
    .catch((e) => console.error("saveRound:", e.message));
}

// ---------- sockets ----------
io.on("connection", (socket) => {
  socket.data.playerKey = null; // {code, pid}

  socket.on("lobby:join", (ack) => {
    socket.join("lobby");
    if (typeof ack === "function") ack(lobbyList());
    socket.emit("leaderboard", cachedBoard);
  });

  socket.on("host:check", (args = {}, ack) => {
    const s = sessions.get(String(args.code || "").toUpperCase());
    if (typeof ack === "function") ack({ ok: canControl(s, args) });
  });

  socket.on("admin:auth", ({ password } = {}, ack) => {
    if (typeof ack === "function") ack({ ok: isAdmin(password) });
  });

  socket.on("admin:create", ({ title, categories } = {}, ack) => {
    if (typeof ack !== "function") return;
    if ([...sessions.values()].filter((x) => x.status === "live").length >= MAX_LIVE_SESSIONS)
      return ack({ ok: false, error: "Too many games running right now, try again later" });
    const cats = [...new Set((Array.isArray(categories) ? categories : []).map((c) => clean(c, 60)).filter(Boolean))].slice(0, 60);
    if (cats.length < 8) return ack({ ok: false, error: "Add at least 8 categories" });
    const code = makeCode();
    const hostKey = makeKey();
    const s = {
      code,
      hostKey,
      title: clean(title, 60) || "Class Bingo",
      categories: cats,
      status: "live",
      round: 1,
      players: new Map(),
      winners: [],
      createdAt: Date.now(),
      touchedAt: Date.now(),
    };
    sessions.set(code, s);
    broadcast(s);
    ack({ ok: true, code, hostKey });
  });

  socket.on("admin:update", (args = {}, ack) => {
    const { code, categories } = args;
    const s = sessions.get(String(code || "").toUpperCase());
    if (!canControl(s, args)) return typeof ack === "function" && ack({ ok: false });
    const cats = [...new Set((categories || []).map((c) => clean(c, 60)).filter(Boolean))].slice(0, 60);
    if (cats.length < 8) return typeof ack === "function" && ack({ ok: false, error: "Add at least 8 categories" });
    s.categories = cats;
    broadcast(s);
    typeof ack === "function" && ack({ ok: true, note: "Applies from the next round" });
  });

  socket.on("admin:newround", (args = {}, ack) => {
    const { code } = args;
    const s = sessions.get(String(code || "").toUpperCase());
    if (!canControl(s, args)) return typeof ack === "function" && ack({ ok: false });
    finishRound(s);
    s.round += 1;
    s.podium = null;
    s.winners = [];
    s.status = "live";
    for (const p of s.players.values()) {
      p.card = makeCard(s.categories);
      p.marked = new Set();
      p.lines = 0;
      p.bingoAt = null;
      for (const sid of p.sockets) io.to(sid).emit("you", yourState(p));
    }
    broadcast(s);
    typeof ack === "function" && ack({ ok: true });
  });

  socket.on("admin:end", (args = {}, ack) => {
    const { code } = args;
    const s = sessions.get(String(code || "").toUpperCase());
    if (!canControl(s, args)) return typeof ack === "function" && ack({ ok: false });
    finishRound(s);
    s.status = "ended";
    broadcast(s);
    typeof ack === "function" && ack({ ok: true });
  });

  socket.on("admin:kick", (args = {}, ack) => {
    const { code, name } = args;
    const s = sessions.get(String(code || "").toUpperCase());
    if (!canControl(s, args)) return typeof ack === "function" && ack({ ok: false });
    for (const [pid, p] of s.players) {
      if (p.name === name) {
        for (const sid of p.sockets) io.to(sid).emit("kicked");
        s.players.delete(pid);
      }
    }
    broadcast(s);
    typeof ack === "function" && ack({ ok: true });
  });

  // Spectate (admin dashboard / projector) or pre-join view
  socket.on("session:watch", ({ code } = {}, ack) => {
    const s = sessions.get(String(code || "").toUpperCase());
    if (!s) return typeof ack === "function" && ack({ ok: false, error: "Session not found" });
    socket.join("s:" + s.code);
    typeof ack === "function" && ack({ ok: true, state: publicState(s) });
  });

  socket.on("player:join", ({ code, name, pid } = {}, ack) => {
    if (typeof ack !== "function") return;
    const s = sessions.get(String(code || "").toUpperCase());
    if (!s) return ack({ ok: false, error: "Session not found — check the code" });
    pid = clean(pid, 40);
    name = clean(name, 24);
    if (!pid) return ack({ ok: false, error: "Missing player id" });

    let p = s.players.get(pid);
    if (!p) {
      if (!name) return ack({ ok: false, error: "Enter a name" });
      if (s.status !== "live") return ack({ ok: false, error: "This session has ended" });
      const taken = [...s.players.values()].some((x) => x.name.toLowerCase() === name.toLowerCase());
      if (taken) return ack({ ok: false, error: "That name is taken in this session" });
      p = { name, card: makeCard(s.categories), marked: new Set(), lines: 0, bingoAt: null, sockets: new Set() };
      s.players.set(pid, p);
    }
    p.sockets.add(socket.id);
    socket.data.playerKey = { code: s.code, pid };
    socket.join("s:" + s.code);
    broadcast(s);
    ack({ ok: true, state: publicState(s), you: yourState(p) });
  });

  socket.on("player:mark", ({ idx } = {}, ack) => {
    const key = socket.data.playerKey;
    if (!key) return;
    const s = sessions.get(key.code);
    const p = s && s.players.get(key.pid);
    if (!p || s.status !== "live") return typeof ack === "function" && ack({ ok: false });
    idx = Number(idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= p.card.cells.length || p.card.cells[idx] === null) return;
    if (p.marked.has(idx)) p.marked.delete(idx);
    else p.marked.add(idx);

    const before = p.lines;
    p.lines = countLines(p);
    let newBingo = false;
    if (p.lines > before) {
      newBingo = true;
      if (!p.bingoAt) p.bingoAt = Date.now();
      s.winners.push({ name: p.name, lines: p.lines, at: Date.now() });
      io.to("s:" + s.code).emit("bingo", { name: p.name, lines: p.lines, first: s.winners.length === 1 });
    }
    for (const sid of p.sockets) if (sid !== socket.id) io.to(sid).emit("you", yourState(p));
    broadcast(s);
    typeof ack === "function" && ack({ ok: true, you: yourState(p), newBingo });
  });

  socket.on("disconnect", () => {
    const key = socket.data.playerKey;
    if (!key) return;
    const s = sessions.get(key.code);
    const p = s && s.players.get(key.pid);
    if (p) {
      p.sockets.delete(socket.id);
      broadcast(s);
    }
  });
});

// Clean up idle sessions
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions) if (now - s.touchedAt > SESSION_TTL_MS) sessions.delete(code);
}, 10 * 60 * 1000);

db.init()
  .catch((e) => console.error("Database unavailable, using memory:", e.message))
  .finally(refreshLeaderboard);

server.listen(PORT, () => console.log(`Class Bingo running on http://localhost:${PORT}`));
