// Procedural funny-face avatars. avatarSVG(seed) always draws the same face for the same seed.
(function () {
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

  const SKINS = ["#d7ff3c", "#ff8a65", "#ffd166", "#9be7c4", "#c3b1ff", "#ff9ecf", "#8fd3ff", "#f4e1c1", "#b8e986", "#ffb3a1"];
  const BGS = ["#141210", "#ff3d17", "#0e6e6e", "#3c3bff", "#1f7a4d", "#7a2bd6"];
  const INK = "#141210";

  function avatarSVG(seed, size) {
    const r = rng(seed || "x");
    const pick = (a) => a[Math.floor(r() * a.length)];
    const between = (a, b) => a + r() * (b - a);
    const skin = pick(SKINS);
    let bg = pick(BGS);
    if (bg === skin) bg = INK;
    const parts = [];

    // head: a wobbly blob
    const cx = 50, cy = between(52, 58), rx = between(28, 38), ry = between(30, 38);
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const k = between(0.88, 1.1);
      pts.push([cx + Math.cos(ang) * rx * k, cy + Math.sin(ang) * ry * k]);
    }
    let d = "";
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }

    // ears / antennae / hair
    const top = cy - ry;
    const hair = Math.floor(r() * 5);
    if (hair === 1) for (let i = 0; i < 3; i++) { const x = cx - 10 + i * 10 + between(-3, 3); parts.push(`<path d="M${x},${top + 4} Q${x + between(-8, 8)},${top - 12} ${x + between(-4, 4)},${top - 16}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`); }
    if (hair === 2) parts.push(`<path d="M${cx - rx * 0.8},${top + 10} Q${cx},${top - 14} ${cx + rx * 0.8},${top + 10} Q${cx},${top + 2} ${cx - rx * 0.8},${top + 10}Z" fill="${INK}"/>`);
    if (hair === 3) { parts.push(`<line x1="${cx + 4}" y1="${top + 9}" x2="${cx + 14}" y2="${top - 12}" stroke="${INK}" stroke-width="3"/><circle cx="${cx + 14}" cy="${top - 13}" r="4" fill="#ff3d17" stroke="${INK}" stroke-width="2.5"/>`); }
    if (hair === 4) { parts.push(`<circle cx="${cx - rx + 2}" cy="${cy}" r="7" fill="${skin}" stroke="${INK}" stroke-width="3"/><circle cx="${cx + rx - 2}" cy="${cy + between(-6, 6)}" r="${between(5, 9)}" fill="${skin}" stroke="${INK}" stroke-width="3"/>`); }

    parts.push(`<path d="${d}Z" fill="${skin}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`);

    // eyes
    const eyeY = cy - between(2, 10);
    const gap = between(9, 15);
    const eyeType = Math.floor(r() * 6);
    const eye = (x, s) => {
      if (eyeType === 0) return `<circle cx="${x}" cy="${eyeY}" r="${s}" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="${x + between(-s / 2, s / 2)}" cy="${eyeY + between(-s / 2, s / 2)}" r="${s / 2.4}" fill="${INK}"/>`;
      if (eyeType === 1) return `<path d="M${x - s},${eyeY} Q${x},${eyeY + s} ${x + s},${eyeY}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      if (eyeType === 2) return `<circle cx="${x}" cy="${eyeY}" r="${s * 0.45}" fill="${INK}"/>`;
      if (eyeType === 3) return `<line x1="${x - s * 0.7}" y1="${eyeY - s * 0.7}" x2="${x + s * 0.7}" y2="${eyeY + s * 0.7}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><line x1="${x + s * 0.7}" y1="${eyeY - s * 0.7}" x2="${x - s * 0.7}" y2="${eyeY + s * 0.7}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
      if (eyeType === 4) return `<circle cx="${x}" cy="${eyeY}" r="${s}" fill="#fff" stroke="${INK}" stroke-width="2.5"/><path d="M${x - s},${eyeY} A${s},${s} 0 0 1 ${x + s},${eyeY}Z" fill="${skin}" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${eyeY + s / 3}" r="${s / 3}" fill="${INK}"/>`;
      return `<circle cx="${x}" cy="${eyeY}" r="${s}" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${eyeY}" r="${s * 0.25}" fill="${INK}"/>`;
    };
    if (r() < 0.12) {
      parts.push(eye(cx + between(-3, 3), between(9, 13))); // cyclops
    } else {
      parts.push(eye(cx - gap, between(4, 9)), eye(cx + gap, between(4, 10))); // asymmetric on purpose
    }
    if (r() < 0.35) parts.push(`<path d="M${cx - gap - 7},${eyeY - 11} Q${cx},${eyeY - between(12, 20)} ${cx + gap + 7},${eyeY - 11}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`); // unibrow
    if (r() < 0.18) parts.push(`<circle cx="${cx - gap}" cy="${eyeY}" r="9" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="${cx + gap}" cy="${eyeY}" r="9" fill="none" stroke="${INK}" stroke-width="2.5"/><line x1="${cx - gap + 9}" y1="${eyeY}" x2="${cx + gap - 9}" y2="${eyeY}" stroke="${INK}" stroke-width="2.5"/>`); // glasses

    // nose
    const noseType = Math.floor(r() * 4);
    const ny = eyeY + between(8, 13);
    if (noseType === 1) parts.push(`<path d="M${cx},${ny - 6} L${cx - 4},${ny + 3} L${cx + 2},${ny + 3}" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`);
    if (noseType === 2) parts.push(`<ellipse cx="${cx}" cy="${ny}" rx="${between(4, 8)}" ry="${between(3, 6)}" fill="#ff3d17" stroke="${INK}" stroke-width="2.5"/>`);
    if (noseType === 3) parts.push(`<circle cx="${cx - 2.5}" cy="${ny}" r="1.6" fill="${INK}"/><circle cx="${cx + 2.5}" cy="${ny}" r="1.6" fill="${INK}"/>`);

    // mouth
    const my = ny + between(9, 14);
    const mw = between(8, 16);
    const mouthType = Math.floor(r() * 6);
    if (mouthType === 0) parts.push(`<path d="M${cx - mw},${my} Q${cx},${my + between(6, 14)} ${cx + mw},${my}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    if (mouthType === 1) { parts.push(`<rect x="${cx - mw}" y="${my - 4}" width="${mw * 2}" height="9" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`); for (let x = cx - mw + mw / 2; x < cx + mw - 1; x += mw / 2) parts.push(`<line x1="${x}" y1="${my - 4}" x2="${x}" y2="${my + 5}" stroke="${INK}" stroke-width="1.8"/>`); }
    if (mouthType === 2) parts.push(`<ellipse cx="${cx}" cy="${my + 2}" rx="${between(3, 6)}" ry="${between(4, 8)}" fill="${INK}"/>`);
    if (mouthType === 3) parts.push(`<path d="M${cx - mw},${my} q${mw / 4},-5 ${mw / 2},0 t${mw / 2},0 t${mw / 2},0 t${mw / 2},0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    if (mouthType === 4) parts.push(`<path d="M${cx - mw},${my} Q${cx},${my + 12} ${cx + mw},${my}Z" fill="${INK}"/><rect x="${cx - 4}" y="${my}" width="4" height="4" fill="#fff"/><rect x="${cx + 1}" y="${my}" width="4" height="5" fill="#fff"/>`);
    if (mouthType === 5) parts.push(`<line x1="${cx - mw}" y1="${my + 2}" x2="${cx + mw}" y2="${my - 1}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`);
    if (r() < 0.25) parts.push(`<path d="M${cx - 12},${my - 4} Q${cx - 6},${my - 10} ${cx},${my - 5} Q${cx + 6},${my - 10} ${cx + 12},${my - 4}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`); // moustache
    if (r() < 0.3) parts.push(`<circle cx="${cx - gap - 6}" cy="${my - 4}" r="4" fill="#ff3d17" opacity=".35"/><circle cx="${cx + gap + 6}" cy="${my - 4}" r="4" fill="#ff3d17" opacity=".35"/>`); // blush

    const s = size || 64;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${s}" height="${s}" class="ava"><rect width="100" height="100" rx="14" fill="${bg}"/>${parts.join("")}</svg>`;
  }

  function newSeed() { return Math.random().toString(36).slice(2, 10); }

  window.avatarSVG = avatarSVG;
  window.newAvatarSeed = newSeed;
})();
