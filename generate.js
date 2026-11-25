// Animated Spider-Man vs Venom fighting on top of your GitHub contribution graph.
//  - green (contributed) cells are solid terrain
//  - Spider-Man walks, shoots webs and swings across the graph
//  - Venom walks, leaps and smashes green blocks (they come back when the loop restarts)
// The choreography is random on every run (set SEED=123 to reproduce one).
const fs = require("fs");
const path = require("path");
const S = require("./sprites/sprites.js");

// ---- tiny .env loader (no dependencies) ----
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const USER = process.env.GH_USER || "Javaboiscript";
const SEED = Number(process.env.SEED) || Date.now() % 1e9;

// ---- random ----
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(SEED);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f = n => +n.toFixed(2);

// ---- contribution data ----
async function fetchWeeks() {
  const q = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "spidey-vs-venom" },
    body: JSON.stringify({ query: q, variables: { u: USER } }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error(JSON.stringify(j.errors || j.message || res.status));
  return j.data.user.contributionsCollection.contributionCalendar.weeks
    .map(w => w.contributionDays.map(d => d.contributionCount));
}
function fakeWeeks() {
  return Array.from({ length: 53 }, () => Array.from({ length: 7 }, () => (rnd() < 0.3 ? ri(1, 10) : 0)));
}

// ---- geometry ----
const CELL = 11, GAP = 3, PITCH = CELL + GAP, PX = S.PX;
const SW = S.W * PX, SH = S.H * PX;
const GX = 20, GY = SH + 20, GRIDH = 7 * PITCH - GAP;

// ============================ choreography ============================
function plan(weeks) {
  const cols = weeks.length;
  const solid = weeks.map(w => w.map(n => n > 0));
  const top = c => { const r = solid[c].indexOf(true); return r < 0 ? 7 : r; };
  const foot = c => (top(c) < 7 ? GY + top(c) * PITCH - 1 : GY + GRIDH);
  const pos = c => ({ x: GX + c * PITCH + CELL / 2 - SW / 2, y: foot(c) - SH });
  const colAt = x => clamp(Math.round((x + SW / 2 - GX - CELL / 2) / PITCH), 0, cols - 1);

  const breaks = [], ropes = [], webs = [];
  const fx = { blocks: [], flashes: [], cells: [], bursts: [], debris: [] };
  const make = (native, col) => {
    const p = pos(col);
    return { native, col, t: 0, x: p.x, y: p.y, wps: [{ t: 0, x: p.x, y: p.y }], states: [] };
  };
  const S0 = 5, V0 = cols - 6;
  const sp = make(+1, S0), vn = make(-1, V0);

  function go(ch, dur, x, y, state, face) {
    if (dur <= 0) return;
    ch.states.push({ t0: ch.t, t1: ch.t + dur, state, face });
    ch.t += dur; ch.x = x; ch.y = y;
    ch.wps.push({ t: ch.t, x, y });
  }
  const stand = (ch, dur, state = "idle") => go(ch, dur, ch.x, ch.y, state, ch.native);

  function walk(ch, to) {
    const dir = Math.sign(to - ch.col);
    while (ch.col !== to) {
      const n = ch.col + dir, a = pos(ch.col), b = pos(n);
      go(ch, 0.13, (a.x + b.x) / 2, Math.min(a.y, b.y) - 4, "walk", dir);
      go(ch, 0.13, b.x, b.y, "walk", dir);
      ch.col = n;
    }
  }
  // leap (venom) or web swing (spider, with a rope to the "sky")
  function arc(ch, to, rope) {
    const dir = Math.sign(to - ch.col); if (!dir) return;
    const a = pos(ch.col), b = pos(to), dist = Math.abs(to - ch.col);
    const dur = rope ? Math.min(2.4, 0.8 + 0.07 * dist) : Math.min(1.4, 0.5 + 0.04 * dist);
    const h = Math.max(4, Math.min(10 + dist * 2.2, Math.min(a.y, b.y) - 4));
    const N = Math.max(6, Math.round(dist / 1.5) + 4);
    const hd = S.spider.swingHand, offx = dir > 0 ? hd.x * PX : SW - hd.x * PX, offy = hd.y * PX;
    const r = rope ? { ax: (a.x + b.x) / 2 + offx, ay: 1, t0: ch.t, pts: [{ t: ch.t, x: a.x + offx, y: a.y + offy }] } : null;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      let x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u - h * 4 * u * (1 - u);
      if (k < N) y = Math.min(y, foot(colAt(x)) - SH - 1); // never fly through green blocks
      go(ch, dur / N, x, y, rope ? "swing" : "walk", dir);
      if (r) r.pts.push({ t: ch.t, x: x + offx, y: y + offy });
    }
    ch.col = to;
    if (r) { r.t1 = ch.t; ropes.push(r); }
  }
  // venom slams the block he stands on; it breaks and he drops down
  function smash(ch) {
    const c = ch.col, r = top(c);
    if (r >= 7) return false;
    stand(ch, 0.5, "smash");
    solid[c][r] = false; breaks.push({ c, r, t: ch.t });
    const np = pos(c);
    go(ch, 0.25, np.x, np.y, "idle", ch.native);
    return true;
  }
  const sync = () => { const T = Math.max(sp.t, vn.t); stand(sp, T - sp.t); stand(vn, T - vn.t); };
  const move = (ch, to, far, rope) => (Math.abs(to - ch.col) >= far ? arc(ch, to, rope) : walk(ch, to));

  // ---- episodes (constraint: Spider-Man always stays left of Venom, never crossing) ----
  const wander = () => {
    const sT = ri(3, Math.max(3, vn.col - 3));
    const vT = ri(Math.max(sp.col, sT) + 3, cols - 4);
    walk(sp, sT); walk(vn, vT);
  };
  const swingEp = () => {
    const hi = vn.col - 3, cand = [];
    for (let c = 4; c <= hi; c++) if (Math.abs(c - sp.col) >= 6) cand.push(c);
    if (!cand.length) return wander();
    arc(sp, cand[ri(0, cand.length - 1)], true);
    walk(vn, clamp(vn.col + ri(-3, 3), Math.max(sp.col, 0) + 3, cols - 4));
  };
  const smashEp = () => {
    const cand = [];
    for (let c = Math.max(sp.col + 4, 10); c <= cols - 10; c++) if (top(c) < 7) cand.push(c);
    if (!cand.length) return wander();
    const c = cand[ri(0, cand.length - 1)];
    move(vn, c, 5, false);
    for (let n = ri(1, 3); n > 0; n--) if (!smash(vn)) break;
  };
  const clash = () => {
    const lo = Math.max(sp.col + 2, 8), hi = Math.min(vn.col - 2, cols - 9);
    if (lo > hi) return wander();
    const m = ri(lo, hi);
    move(sp, m - 1, 8, true); move(vn, m + 1, 8, false);
    sync();
    for (let n = ri(2, 3); n > 0; n--) {
      const t0 = sp.t;
      webs.push({ t0, t1: t0 + 0.5, x1: sp.x + S.spider.atkHand.x * PX, y1: sp.y + S.spider.atkHand.y * PX, x2: vn.x + S.venom.hit.x * PX, y2: vn.y + S.venom.hit.y * PX });
      stand(sp, 0.5, "attack"); stand(vn, 0.5);
      sync(); stand(sp, 0.15); stand(vn, 0.15);
      stand(vn, 0.5, "attack"); stand(sp, 0.5);
      stand(sp, 0.15); stand(vn, 0.15);
    }
  };

  // spot the two fighters 3 columns apart (Spider-Man left, Venom right) for the big scenes
  const place = () => {
    const lo = Math.max(sp.col + 3, 9), hi = Math.min(vn.col, cols - 10);
    if (lo > hi) return false;
    const m = ri(lo, hi);
    move(sp, m - 3, 8, true); move(vn, m, 8, false); sync();
    return true;
  };
  const shot = kind => webs.push({ kind, t0: sp.t, t1: sp.t + (kind === "web" ? 0.5 : 0.4),
    x1: sp.x + S.spider.atkHand.x * PX, y1: sp.y + S.spider.atkHand.y * PX,
    x2: vn.x + S.venom.hit.x * PX, y2: vn.y + S.venom.hit.y * PX });

  // Venom's tentacle lashes Spider-Man: he is thrown back, lies flat, then gets up
  const beaten = () => {
    if (!place()) return wander();
    const t0 = vn.t;
    stand(sp, 0.4); stand(vn, 0.4, "attack");
    webs.push({ kind: "lash", t0, t1: t0 + 0.4, x1: vn.x + S.venom.hit.x * PX, y1: vn.y + S.venom.hit.y * PX,
      x2: sp.x + SW * 0.8, y2: sp.y + S.venom.hit.y * PX });
    const x0 = sp.x;
    go(sp, 0.25, x0 - 5, sp.y, "fall", sp.native);
    go(sp, 0.25, x0 - 9, sp.y, "flat", sp.native);
    stand(sp, 1.4, "flat");
    go(sp, 0.3, x0 - 5, sp.y, "fall", sp.native);
    go(sp, 0.3, x0, sp.y, "idle", sp.native);
    stand(vn, 1.9, "smash"); stand(vn, 0.6);
    sync();
  };

  // Spider-Man webs Venom into a cocoon, a green block drops on him and blasts him
  let finishers = 0;
  const finisher = () => {
    if (!place()) return wander();
    finishers++;
    for (const st of ["web1", "web2", "web3"]) { shot("web"); stand(sp, 0.5, "attack"); stand(vn, 0.5, st); }
    const vx0 = vn.x;                                              // topple over
    stand(sp, 0.6);
    go(vn, 0.3, vx0 + 3, vn.y, "web3", vn.native);
    go(vn, 0.3, vx0 + 6, vn.y, "webFlat", vn.native);
    // a real green block is pulled off the graph and dropped on him
    const cands = [];
    for (let c = Math.max(1, vn.col - 8); c <= Math.min(cols - 2, vn.col + 8); c++)
      if (c !== sp.col && c !== vn.col && top(c) < 7) cands.push(c);
    let src = null;
    if (cands.length) { const c = cands[ri(0, cands.length - 1)]; src = { c, r: top(c) }; solid[c][src.r] = false; breaks.push({ c, r: src.r, t: vn.t }); }
    const topY = vn.y + S.venom.flatTop * PX;
    fx.blocks.push({ t0: vn.t, t1: vn.t + 0.4, x: vn.x + SW / 2 - CELL / 2, y0: 2, y1: topY - CELL, src });
    stand(sp, 0.4); stand(vn, 0.4, "webFlat");
    fx.flashes.push({ t0: vn.t, t1: vn.t + 0.2, x: vn.x - 2, y: topY - 2, w: SW + 4, h: vn.y + SH - topY + 4 }); // crack
    stand(sp, 0.2); stand(vn, 0.2, "webFlat");
    const tB = vn.t, cx = vn.x + SW / 2, cy = vn.y + SH - 9;        // blast
    let tt = tB;
    for (const [d, i] of [[0.25, 0], [0.25, 1], [0.3, 2]]) { fx.bursts.push({ t0: tt, t1: tt + d, i, cx, cy }); tt += d; }
    for (let dc = -1; dc <= 1; dc++) {
      const c = clamp(vn.col + dc, 0, cols - 1);
      fx.cells.push({ c, r: top(c) < 7 ? top(c) : 6, t0: tB, t1: tB + 0.2 });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI + rnd(), d = 18 + ri(0, 14);
      fx.debris.push({ t0: tB, t1: tB + 0.8, x0: cx, y0: cy, x1: cx + d * Math.cos(a), y1: cy + d * Math.sin(a) - 8, k });
    }
    stand(sp, 0.8); stand(vn, 0.25, "webFlat"); stand(vn, 0.55, "defeat");
    stand(sp, 1.0, "victory"); stand(sp, 0.5); stand(vn, 1.5, "defeat");   // aftermath
    const hp = pos(vn.col);                                                // Venom gets back up
    stand(sp, 0.4); go(vn, 0.4, hp.x, hp.y, "idle", vn.native);
    sync();
  };

  const pool = [wander, wander, wander, swingEp, swingEp, smashEp, smashEp, smashEp, clash, clash, beaten, finisher, finisher];
  const names = [];
  for (let guard = 0; sp.t < 36 && guard < 80; guard++) {
    const ep = pool[ri(0, pool.length - 1)];
    names.push(ep.name || "ep"); ep(); sync();
  }
  if (!finishers) { finisher(); sync(); }
  // return home so the loop is seamless (smashing is kept away from the home columns)
  move(sp, S0, 8, true); move(vn, V0, 8, false); sync(); stand(sp, 1); stand(vn, 1);
  const T = Math.ceil(Math.max(sp.t, vn.t));
  stand(sp, T - sp.t); stand(vn, T - vn.t);
  console.log(`seed ${SEED}: ${T}s loop, ${breaks.length} blocks smashed, ${ropes.length} swings, ${webs.length} web shots, ${finishers} finisher(s)`);
  return { T, sp, vn, breaks, ropes, webs, fx };
}

// ============================ rendering ============================
const THEMES = {
  dark:  { bg: "#0d1117", levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"], K: "#2c2c3a", glow: "#7c7cff", web: "#e6edf3" },
  light: { bg: "#ffffff", levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"], K: "#15151c", glow: "none",    web: "#555555" },
};
const COLORS = { R: "#cf1919", N: "#144259", B: "#2450d6", W: "#ffffff", T: "#ff6fa0", O: "#0a0a12", K: "#0a0a12", D: "#1b3f9c", L: "#3b78e8",
  Y: "#ffd93d", Q: "#ff8c1a", E: "#e0301e", S: "#7b8190", G: "#d9dde3" };

function rects(rows, theme, check = true) {
  let out = "";
  rows.forEach((row, y) => {
    if (check && row.length !== S.W) throw new Error(`sprite row ${y} is ${row.length} wide: ${row}`);
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      if (c === ".") { x++; continue; }
      let e = x; while (e < row.length && row[e] === c) e++;
      out += `<rect x="${x * PX}" y="${y * PX}" width="${(e - x) * PX}" height="${PX}" fill="${COLORS[c]}"/>`;
      x = e;
    }
  });
  return out;
}

// SMIL helper: pts = [{t, v}] sorted by time (seconds)
function smil(P, attr, pts, discrete) {
  const q = [];
  for (const p of [{ t: 0, v: pts[0].v }, ...pts, { t: P.T, v: pts[pts.length - 1].v }]) {
    if (q.length && Math.abs(q[q.length - 1].t - p.t) < 1e-6 && discrete) q[q.length - 1] = p; else q.push(p);
  }
  q[0].t = 0; q[q.length - 1].t = P.T;
  const kt = q.map(p => +(p.t / P.T).toFixed(5)).join(";");
  const tag = attr === "transform" ? `animateTransform attributeName="transform" type="translate"` : `animate attributeName="${attr}"`;
  return `<${tag} dur="${P.T}s" repeatCount="indefinite" calcMode="${discrete ? "discrete" : "linear"}" keyTimes="${kt}" values="${q.map(p => p.v).join(";")}"/>`;
}
const onOff = (P, ivs) => {
  const pts = [{ t: 0, v: 0 }];
  for (const [a, b] of ivs) { pts.push({ t: a, v: 1 }); pts.push({ t: b, v: 0 }); }
  return smil(P, "opacity", pts, true);
};

function character(P, ch, def, theme, name) {
  const flipG = inner => `<g transform="translate(${SW} 0) scale(-1 1)">${inner}</g>`;
  // group visibility intervals by (state, flipped)
  const groups = {};
  for (const s of ch.states) {
    const key = `${s.state}|${s.face !== ch.native ? 1 : 0}`;
    const list = (groups[key] = groups[key] || []);
    if (list.length && Math.abs(list[list.length - 1][1] - s.t0) < 1e-6) list[list.length - 1][1] = s.t1;
    else list.push([s.t0, s.t1]);
  }
  let out = "";
  for (const [key, ivs] of Object.entries(groups)) {
    const [state, fl] = key.split("|");
    let inner;
    if (state === "walk") {
      const tog = (rows, vals) => `<g opacity="${vals.split(";")[0]}"><animate attributeName="opacity" dur="0.5s" repeatCount="indefinite" calcMode="discrete" keyTimes="0;0.5" values="${vals}"/>${rects(rows, theme)}</g>`;
      inner = tog(def.walkA, "1;0") + tog(def.walkB, "0;1");
    } else inner = rects(def[state], theme);
    out += `<g opacity="0">${onOff(P, ivs)}${fl === "1" ? flipG(inner) : inner}</g>\n`;
  }
  const tr = smil(P, "transform", ch.wps.map(w => ({ t: w.t, v: `${f(w.x)} ${f(w.y)}` })), false);
  return `<g id="${name}"><g>${tr}\n${out}</g></g>`;
}

function build(P, weeks, theme) {
  const cols = weeks.length;
  const W = cols * PITCH - GAP + 2 * GX, H = GY + GRIDH + 12;
  const max = Math.max(1, ...weeks.flat());
  const lvl = n => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

  let cells = "";
  weeks.forEach((w, c) => w.forEach((n, r) =>
    cells += `<rect x="${GX + c * PITCH}" y="${GY + r * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.levels[lvl(n)]}"/>`));

  // smashed blocks: dark overlay (+ short white flash) appears at impact, gone when the loop restarts
  let broken = "";
  for (const b of P.breaks) {
    const x = GX + b.c * PITCH, y = GY + b.r * PITCH;
    broken += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.levels[0]}" opacity="0">${smil(P, "opacity", [{ t: 0, v: 0 }, { t: b.t, v: 1 }], true)}</rect>`;
    broken += `<rect x="${x - 1}" y="${y - 1}" width="${CELL + 2}" height="${CELL + 2}" rx="3" fill="#ffffff" opacity="0">${smil(P, "opacity", [{ t: 0, v: 0 }, { t: b.t, v: 0.9 }, { t: b.t + 0.2, v: 0 }], true)}</rect>`;
  }

  let lines = "";
  for (const r of P.ropes) {
    const xs = r.pts.map(p => ({ t: p.t, v: f(p.x) })), ys = r.pts.map(p => ({ t: p.t, v: f(p.y) }));
    lines += `<line x1="${f(r.ax)}" y1="${r.ay}" x2="${xs[0].v}" y2="${ys[0].v}" stroke="${theme.web}" stroke-width="1" opacity="0">${onOff(P, [[r.t0, r.t1]])}${smil(P, "x2", xs, false)}${smil(P, "y2", ys, false)}</line>\n`;
  }
  for (const w of P.webs) {
    lines += `<line x1="${f(w.x1)}" y1="${f(w.y1)}" x2="${f(w.x1)}" y2="${f(w.y1)}" stroke="${w.kind === "lash" ? "#8ab4ff" : theme.web}" stroke-width="${w.kind === "lash" ? 1.5 : 1}" stroke-linecap="round" opacity="0">${onOff(P, [[w.t0, w.t1]])}` +
      smil(P, "x2", [{ t: 0, v: f(w.x1) }, { t: w.t0, v: f(w.x1) }, { t: w.t0 + 0.15, v: f(w.x2) }], false) +
      smil(P, "y2", [{ t: 0, v: f(w.y1) }, { t: w.t0, v: f(w.y1) }, { t: w.t0 + 0.15, v: f(w.y2) }], false) + `</line>\n`;
  }

  // finisher effects: neighbouring cells flash under the fighters, the rest is drawn on top
  const flashRect = (x, y, w, h, t0, t1, rx) =>
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="#ffffff" opacity="0">${smil(P, "opacity", [{ t: 0, v: 0 }, { t: t0, v: 0.9 }, { t: t1, v: 0 }], true)}</rect>`;
  let fxUnder = "", fxOver = "";
  for (const c of P.fx.cells) fxUnder += flashRect(GX + c.c * PITCH, GY + c.r * PITCH, CELL, CELL, c.t0, c.t1, 2);
  for (const b of P.fx.blocks) {
    const lv = b.src ? lvl(weeks[b.src.c][b.src.r]) : 4;
    fxOver += `<rect x="${f(b.x)}" y="${b.y0}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.levels[Math.max(lv, 1)]}" opacity="0">${onOff(P, [[b.t0, b.t1]])}` +
      `${smil(P, "y", [{ t: 0, v: b.y0 }, { t: b.t0, v: b.y0 }, { t: b.t1, v: f(b.y1) }], false)}</rect>`;
  }
  for (const fl of P.fx.flashes) fxOver += flashRect(fl.x, fl.y, fl.w, fl.h, fl.t0, fl.t1, 3);
  for (const b of P.fx.bursts) {
    const rows = S.burst[b.i];
    fxOver += `<g transform="translate(${f(b.cx - rows[0].length / 2)} ${f(b.cy - rows.length / 2)})" opacity="0">${onOff(P, [[b.t0, b.t1]])}${rects(rows, theme, false)}</g>`;
  }
  for (const d of P.fx.debris)
    fxOver += `<rect x="${f(d.x0)}" y="${f(d.y0)}" width="2" height="2" fill="${theme.levels[2 + (d.k % 3)]}" opacity="0">${onOff(P, [[d.t0, d.t1]])}` +
      `${smil(P, "x", [{ t: 0, v: f(d.x0) }, { t: d.t0, v: f(d.x0) }, { t: d.t1, v: f(d.x1) }], false)}${smil(P, "y", [{ t: 0, v: f(d.y0) }, { t: d.t0, v: f(d.y0) }, { t: d.t1, v: f(d.y1) }], false)}</rect>`;

  const glow = theme.glow === "none" ? "" : ` style="filter:drop-shadow(0 0 1px ${theme.glow})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${theme.bg}"/>
${cells}
${broken}
${fxUnder}${lines}<g shape-rendering="crispEdges"${glow}>
${character(P, P.sp, S.spider, theme, "spiderman")}
${character(P, P.vn, S.venom, theme, "venom")}
</g>
${fxOver}
</svg>
`;
}

(async () => {
  let weeks;
  try {
    if (!TOKEN) throw new Error("no token in env");
    weeks = await fetchWeeks();
    console.log(`Fetched ${weeks.length} weeks of contributions for ${USER}`);
  } catch (e) {
    console.warn("Could not fetch contributions (" + e.message + "), using fake data");
    weeks = fakeWeeks();
  }
  const P = plan(weeks);
  if (process.env.DEBUG_T) console.log("blast", P.fx.bursts.map(b => b.t0.toFixed(2)).join(" "), "block", P.fx.blocks.map(b => b.t0.toFixed(2)).join(" "));
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  for (const [name, theme] of Object.entries(THEMES)) {
    const file = path.join(__dirname, "dist", `spidey-vs-venom${name === "dark" ? "" : "-light"}.svg`);
    fs.writeFileSync(file, build(P, weeks, theme));
    console.log("wrote", file);
  }
})();
