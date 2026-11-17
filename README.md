# Class Bingo

Cooperative live bingo for lectures. Node + Express + Socket.io.

- `/` lobby: join with a 4-letter code, or click a live game
- `/s/CODE` player view
- `/host` anyone can host: edit squares, start a session, deal new rounds, end it. Only the creating browser (it holds a secret host key) controls a session.

`ADMIN_PASSWORD` (env var, default `bingo`) is a master key to take over any session from the host page.
Default categories live in `categories.json`.

Run locally: `npm install && npm start` → http://localhost:3000
