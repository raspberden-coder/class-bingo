# Lecture Bingo

Cooperative live bingo for lectures. Node + Express + Socket.io.

- `/` lobby: join with a 4-letter code, or click a live game
- `/s/CODE` player view
- `/admin` admin: edit categories, start sessions, deal new rounds, end sessions

Set the `ADMIN_PASSWORD` environment variable (default: `bingo`).
Default categories live in `categories.json`.

Run locally: `npm install && npm start` → http://localhost:3000
