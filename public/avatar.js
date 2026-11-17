// Pixel-art funny faces in the style of old Japanese feature-phone emoji (16×16).
// avatarSVG(seed, size) always draws the same face for the same seed.
(function () {
  const N = 16;

  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(String(seed));
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // i-mode-ish palette: loud, flat colours
  const SKINS = ["#ffcc00", "#ff9900", "#ff99cc", "#66cc33", "#33ccff", "#cc99ff", "#ffffff", "#ffddaa", "#ff6666", "#99ffcc", "#d7ff3c", "#ffb3e6"];
  const BGS = ["#141210", "#ff3d17", "#0e6e6e", "#3c3bff", "#1f7a4d", "#7a2bd6", "#ff66aa", "#ffaa00"];
  const C = { k: "#141210", w: "#ffffff", r: "#ff2a2a", p: "#ff7eb6", b: "#2aa8ff", y: "#ffe600", g: "#9a9a9a", o: "#ff8a00" };

  // ---- head shapes: inside(x, y) on a 16×16 grid ----
  const HEADS = {
    round: (x, y) => ((x - 7.5) / 6.6) ** 2 + ((y - 8.6) / 6.1) ** 2 <= 1,
    wide: (x, y) => ((x - 7.5) / 7.2) ** 2 + ((y - 9) / 5.4) ** 2 <= 1,
    egg: (x, y) => ((x - 7.5) / (y < 8 ? 5.4 : 6.4)) ** 2 + ((y - 8.5) / 6.6) ** 2 <= 1,
    square: (x, y) => x >= 2 && x <= 13 && y >= 3 && y <= 14 && !((x === 2 || x === 13) && (y === 3 || y === 14)),
    onigiri: (x, y) => y >= 2 && y <= 14 && Math.abs(x - 7.5) <= 2.2 + (y - 2) * 0.5 && !(y === 14 && Math.abs(x - 7.5) > 6),
    ghost: (x, y) => (y <= 8 ? ((x - 7.5) / 6) ** 2 + ((y - 8) / 6) ** 2 <= 1 : x >= 2 && x <= 13 && !(y === 14 && x % 3 === 0)),
    alien: (x, y) => ((x - 7.5) / (7 - Math.max(0, y - 9) * 0.9)) ** 2 + ((y - 7.6) / 6.6) ** 2 <= 1,
    blob: null, // generated per seed
  };

  function makeBlob(r) {
    const k = Array.from({ length: 8 }, () => 0.85 + r() * 0.25);
    return (x, y) => {
      const dx = x - 7.5, dy = y - 8.6;
      const ang = Math.atan2(dy, dx);
      const i = ((Math.round(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      return (dx / (6.5 * k[i])) ** 2 + (dy / (6 * k[(i + 3) % 8])) ** 2 <= 1;
    };
  }

  // ---- sprite parts (the left eye is mirrored for the right one) ----
  // letters: k ink, w white, r red, p pink, b blue, y yellow, g grey, o orange, _ transparent
  const EYES = [
    ["k"], ["kk", "kk"], ["_k_", "k_k"], ["kkk"], ["k_k", "_k_", "k_k"], ["kkk", "kwk", "kkk"],
    ["_kk", "kwk", "kkk"], ["r_r", "rrr", "_r_"], ["_y_", "yyy", "_y_"], ["k__", "_k_", "k__"],
    ["kkk", "k_k", "kkk"], ["___", "kkk", "_k_"], ["kk", "wk"], ["k", "k"], ["_k", "k_"], ["b", "b"],
  ];
  const MOUTHS = [
    ["k___k", "_kkk_"], ["k_k_k", "_k_k_"], ["_k_", "k_k", "_k_"], ["kkkk", "krrk", "_kk_"],
    ["kkkk", "kwwk", "kkkk"], ["kkk"], ["_kkk_", "k___k"], ["_k_k_", "k_k_k"], ["kkkkk", "k_r_k", "_kkk_"],
    ["kk", "kk"], ["k___", "_kkk"], ["kkkk", "_rr_"], ["k_k", "_k_"], ["kwwwk", "kkkkk"], ["_r_", "rrr"],
  ];

  function avatarSVG(seed, size) {
    const r = rng(seed || "x");
    const pick = (a) => a[Math.floor(r() * a.length)];
    const chance = (p) => r() < p;
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N && c) grid[y][x] = c; };
    const stamp = (pat, x0, y0, mirror) => {
      pat.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch === "_") return;
        set(mirror ? x0 - dx : x0 + dx, y0 + dy, C[ch] || ch);
      }));
    };

    const skin = pick(SKINS);
    let bg = pick(BGS);
    if (bg === skin) bg = C.k;
    const headName = pick(Object.keys(HEADS));
    const inside = headName === "blob" ? makeBlob(r) : HEADS[headName];

    // ears are part of the head so the outline wraps around them
    const ears = chance(0.28) ? pick(["cat", "bunny", "bear", "horns"]) : null;
    const earPx = [];
    if (ears === "cat") for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) earPx.push([3 + j, 1 + i], [12 - j, 1 + i]);
    if (ears === "bunny") for (let y = 0; y < 4; y++) earPx.push([4, y], [5, y], [10, y], [11, y]);
    if (ears === "bear") earPx.push([2, 2], [3, 2], [2, 3], [3, 3], [12, 2], [13, 2], [12, 3], [13, 3]);
    const isHead = (x, y) => inside(x, y) || earPx.some(([ex, ey]) => ex === x && ey === y);

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isHead(x, y)) set(x, y, skin);
    const fill = grid.map((row) => row.slice());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!fill[y][x]) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx < 0 || ny < 0 || nx >= N || ny >= N || !fill[ny][nx];
      });
      if (edge) grid[y][x] = C.k;
    }
    if (ears === "bunny") { set(4, 2, C.p); set(11, 2, C.p); }
    if (ears === "cat") { set(4, 3, C.p); set(11, 3, C.p); }
    if (ears === "horns") { set(3, 2, C.r); set(3, 1, C.r); set(2, 0, C.r); set(12, 2, C.r); set(12, 1, C.r); set(13, 0, C.r); }

    // eyes
    const eye = pick(EYES);
    const eyeY = 6 + Math.floor(r() * 3);
    const gap = 2 + Math.floor(r() * 2);
    const lx = 7 - gap - (eye[0].length - 1);
    if (chance(0.08)) {
      stamp(pick([["kkk", "kwk", "kkk"], ["_kk_", "kwwk", "kwkk", "_kk_"]]), 6, eyeY - 1, false); // cyclops
    } else {
      stamp(eye, lx, eyeY, false);
      const right = chance(0.12) ? pick(EYES) : eye; // sometimes mismatched on purpose
      stamp(right, 8 + gap + (right[0].length - 1), eyeY, true);
    }

    // brows / shades
    if (chance(0.2)) { for (let x = lx - 1; x <= 16 - lx; x++) set(x, eyeY - 2, C.k); } // unibrow
    else if (chance(0.2)) { set(lx, eyeY - 2, C.k); set(lx + 1, eyeY - 3, C.k); set(15 - lx, eyeY - 2, C.k); set(14 - lx, eyeY - 3, C.k); } // angry brows
    if (chance(0.14)) { for (let x = 3; x <= 12; x++) set(x, eyeY - 1, C.k); set(3, eyeY, C.k); set(12, eyeY, C.k); set(7, eyeY, C.k); set(8, eyeY, C.k); }

    // mouth
    const mouth = pick(MOUTHS);
    const my = Math.min(eyeY + 3 + Math.floor(r() * 2), 13 - mouth.length + 1);
    stamp(mouth, Math.round(7.5 - mouth[0].length / 2), my, false);
    if (chance(0.2)) { set(6, my - 1, C.k); set(7, my - 2, C.k); set(8, my - 2, C.k); set(9, my - 1, C.k); } // moustache
    if (chance(0.12)) set(9, my + mouth.length, C.b); // drool

    // cheeks & extras
    if (chance(0.4)) { set(3, my - 1, C.p); set(4, my - 1, C.p); set(11, my - 1, C.p); set(12, my - 1, C.p); }
    if (chance(0.15)) { set(4, eyeY + 2, C.b); set(4, eyeY + 3, C.b); } // tear
    if (chance(0.18)) { set(13, 4, C.b); set(12, 5, C.b); set(13, 5, C.b); set(14, 5, C.b); set(13, 6, C.b); } // sweat drop
    if (chance(0.12)) { set(12, 2, C.r); set(14, 2, C.r); set(13, 3, C.r); set(12, 4, C.r); set(14, 4, C.r); } // anger mark
    if (chance(0.12)) { set(1, 2, C.y); set(0, 3, C.y); set(2, 3, C.y); set(1, 4, C.y); } // sparkle
    if (!ears && chance(0.3)) {
      const top = grid.findIndex((row) => row.some(Boolean));
      const t = pick(["tuft", "antenna", "bow", "hat", "leaf"]);
      if (t === "tuft") { set(7, top - 1, C.k); set(8, top - 2, C.k); set(6, top - 2, C.k); }
      if (t === "antenna") { set(8, top - 1, C.k); set(8, top - 2, C.k); set(8, top - 3, C.r); }
      if (t === "bow") { set(3, top + 1, C.r); set(4, top + 2, C.r); set(5, top + 1, C.r); set(3, top + 3, C.r); set(5, top + 3, C.r); }
      if (t === "hat") { for (let x = 4; x <= 11; x++) set(x, top, C.k); for (let x = 5; x <= 10; x++) for (let y = top - 3; y <= top - 1; y++) set(x, y, y === top - 1 ? C.r : C.k); }
      if (t === "leaf") { set(8, top - 1, "#1f7a4d"); set(9, top - 2, "#1f7a4d"); set(10, top - 2, "#66cc33"); }
    }

    // render: merge horizontal runs of one colour into a single rect
    let rects = "";
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        const c = grid[y][x];
        if (!c) { x++; continue; }
        let w = 1;
        while (x + w < N && grid[y][x + w] === c) w++;
        rects += `<rect x="${x + 2}" y="${y + 2}" width="${w}" height="1" fill="${c}"/>`;
        x += w;
      }
    }
    const s = size || 64;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${s}" height="${s}" class="ava" shape-rendering="crispEdges"><rect width="20" height="20" fill="${bg}"/>${rects}</svg>`;
  }

  function newSeed() { return Math.random().toString(36).slice(2, 10); }

  window.avatarSVG = avatarSVG;
  window.newAvatarSeed = newSeed;
})();
