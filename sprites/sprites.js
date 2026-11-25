// Sprites. Spider-Man comes from the user's pixel-art sheet (sprites/spider.json, sliced 1:1 from the
// image, one sheet pixel = one sprite pixel). Venom is hand-drawn (12x14) and doubled to match the size.
// Legend: R red, O/K black, N navy (Spider-Man blue), W white, D venom blue, L venom highlight, T tongue
// Spider-Man natively faces RIGHT, Venom natively faces LEFT.
const spiderRaw = require("./spider.json");

const cat = (a, b) => [...a, ...b];
// ------------------------------ Venom (12x14 drawing) ------------------------------
const venomTop = [
  "...KKKKKK...",
  "..KKKKKKKK..",
  ".KWWKKKKWWK.",
  ".KKKWKKWKKK.",
  ".KWKWKWKWKK.",
  "..KTTTTTTK..",
  "KKDDKKKKDDKK",
  "KDDDKWWKDDDK",
  "KDLDKWWKDLDK",
  "KDD.KKKK.DDK",
  "KK..KDDK..KK",
];
const venomIdle = cat(venomTop, ["....DDDD....", "...DDD.DDD..", "..KKK...KKK."]);
const venomWalkA = cat(venomTop, ["...DDDDDD...", "..DDD...DD..", ".KKK.....KK."]);
const venomWalkB = cat(venomTop, ["...DDDDDD...", "...DD..DDD..", "..KK...KKK.."]);
const venomAttack = venomIdle.map((r, i) => (i === 6 ? "WWDDKKKKDDKK" : i === 7 ? "WDDDKWWKDDDK" : r));
const venomSmash = venomIdle.map((r, i) =>
  i === 3 ? "K.KKKKKKKK.K" : i === 4 ? "KKKWKWKWKKKK" : i === 5 ? "K.KTTTTTTK.K" : r);

// ------------------------------ helpers ------------------------------
const double = rows => rows.flatMap(r => { const d = [...r].map(c => c + c).join(""); return [d, d]; });
const W = Math.max(...Object.values(spiderRaw).map(r => r[0].length), 24);
const H = Math.max(...Object.values(spiderRaw).map(r => r.length), 28);
// pad to the common canvas: horizontally centred, feet on the bottom row
function pad(rows) {
  const w = rows[0].length, left = Math.floor((W - w) / 2);
  const blank = ".".repeat(W);
  return [...Array(H - rows.length).fill(blank),
          ...rows.map(r => ".".repeat(left) + r + ".".repeat(W - w - left))];
}
const fit = rows => pad(rows);

// rotate a frame 90 degrees; ccw = top goes to the left
const rotate = (rows, ccw) => {
  const h = rows.length, w = rows[0].length, out = [];
  for (let x = 0; x < w; x++) {
    let line = "";
    for (let y = 0; y < h; y++) line += ccw ? rows[y][w - 1 - x] : rows[h - 1 - y][x];
    out.push(line);
  }
  return out;
};
// wrap a frame in web strands. region = how far across (px from the left) the web reaches
function webify(rows, region) {
  const top = rows.findIndex(r => /[^.]/.test(r));
  return rows.map((row, y) => [...row].map((c, x) => {
    if (c === "." || x >= region) return c;
    if (c === "W" && y < top + 12) return c;               // keep the eyes and teeth visible
    return ((x + y) % 4 === 0 || (x - y + 400) % 5 === 0) ? "G" : c;
  }).join(""));
}
// burnt-out look: scatter scorch marks over the blue parts
const scorch = rows => rows.map((row, y) => [...row].map((c, x) => ((c === "D" || c === "L") && (x * 7 + y * 13) % 5 < 2 ? "K" : c)).join(""));
// explosion disc: white core, yellow, orange, ragged red edge (smoke variant: grey puffs)
function disc(r, smoke) {
  const n = 2 * r + 1, out = [];
  for (let y = 0; y < n; y++) {
    let line = "";
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      let c = ".";
      if (d <= 1) {
        if (smoke) c = d > 0.45 && (x + y) % 3 !== 0 ? "S" : d < 0.35 ? "Q" : ".";
        else c = d < 0.35 ? "W" : d < 0.65 ? "Y" : d < 0.88 ? "Q" : ((x * 7 + y * 13) % 5 === 0 ? "." : "E");
      }
      line += c;
    }
    out.push(line);
  }
  return out;
}

const spider = {
  idle: fit(spiderRaw.idle), walkA: fit(spiderRaw.walkA), walkB: fit(spiderRaw.walkB),
  attack: fit(spiderRaw.attack), swing: fit(spiderRaw.swing),
};
const venom = {
  idle: fit(double(venomIdle)), walkA: fit(double(venomWalkA)), walkB: fit(double(venomWalkB)),
  attack: fit(double(venomAttack)), smash: fit(double(venomSmash)),
};

// extra poses
spider.fall = fit(spiderRaw.fall);                       // knocked back
spider.flat = fit(rotate(spiderRaw.idle, true));          // lying on his back, head to the left
spider.victory = spider.swing;                            // arms up
venom.web1 = webify(venom.idle, 10);                      // first webs hit his left side
venom.web2 = webify(venom.idle, 18);
venom.web3 = webify(venom.idle, W);                       // fully cocooned
venom.webFlat = webify(fit(rotate(double(venomIdle), false)), W); // cocoon lying down, head to the right
venom.defeat = scorch(fit(rotate(double(venomIdle), false)));     // scorched, lying flat
const burst = [disc(6), disc(11), disc(14, true)];

// anchors (canvas pixels): where webs leave Spider-Man's hands / land on Venom
function extreme(rows, rowFrom, rowTo, side) {
  let best = null;
  for (let y = rowFrom; y < rowTo; y++) for (let x = 0; x < W; x++) if (rows[y][x] !== ".") {
    if (!best || (side === "right" ? x >= best.x : x <= best.x)) best = { x: side === "right" ? x + 1 : x, y: y + 0.5 };
  }
  return best;
}
const firstRow = rows => rows.findIndex(r => /[^.]/.test(r));
const sa = spider.attack, ss = spider.swing, vi = venom.idle;
const atkTop = firstRow(sa);
spider.atkHand = extreme(sa, atkTop, atkTop + Math.floor((H - atkTop) / 2), "right");
const swTop = firstRow(ss);
spider.swingHand = extreme(ss, swTop, swTop + 4, "right");
venom.hit = { ...extreme(vi, firstRow(vi) + 8, firstRow(vi) + 18, "left") };

venom.flatTop = firstRow(venom.webFlat);
module.exports = { W, H, PX: 1, spider, venom, burst };
