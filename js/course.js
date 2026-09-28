// Procedural hole generation, surfaces, terrain heights, painted texture and 3D meshes.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Organic ellipse: ry runs along heading `ang` (radians from +y toward +x), rx across it.
function makeEll(cx, cy, rx, ry, ang, R, wob = 1) {
  return { cx, cy, rx, ry, ang, s: Math.sin(ang), c: Math.cos(ang), p1: R() * 6.283, p2: R() * 6.283,
    w1: 0.13 * wob, w2: 0.07 * wob, maxR: Math.max(rx, ry) * (1 + 0.2 * wob) + 1 };
}
function ellD(e, x, y) {
  const dx = x - e.cx, dy = y - e.cy, m = e.maxR * 2;
  if (dx > m || dx < -m || dy > m || dy < -m) return 9;
  const lx = (dx * e.c - dy * e.s) / e.rx, ly = (dx * e.s + dy * e.c) / e.ry;
  const q = Math.sqrt(lx * lx + ly * ly);
  const th = Math.atan2(ly, lx);
  return q / (1 + e.w1 * Math.sin(3 * th + e.p1) + e.w2 * Math.sin(5 * th + e.p2));
}
function ellOutline(e, n = 64, scale = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2;
    const org = (1 + e.w1 * Math.sin(3 * th + e.p1) + e.w2 * Math.sin(5 * th + e.p2)) * scale;
    const lx = Math.cos(th) * org * e.rx, ly = Math.sin(th) * org * e.ry;
    out.push([e.cx + e.c * lx + e.s * ly, e.cy - e.s * lx + e.c * ly]);
  }
  return out;
}

// Each hole on a course gets its own signature feature so no two look alike.
const SIGS = {
  island: { name: 'Island Green', pars: [3] }, lake: { name: 'Lakeside' }, frontpond: { name: 'Carry the Pond' },
  creek: { name: 'Creek Crossing', pars: [4, 5] }, twinlakes: { name: 'Twin Lakes', pars: [4, 5] },
  bunkerfield: { name: 'Bunker Field' }, forest: { name: 'The Chute' }, lonetree: { name: 'Lone Tree', pars: [4, 5] },
  autumn: { name: 'Autumn Row' }, azalea: { name: 'Azalea Garden' }, waste: { name: 'Sand Barrens' }, dunes: { name: 'The Dunes' }, rocks: { name: 'Boulder Run' },
};
const SIG_POOLS = {
  parkland: ['island', 'lake', 'forest', 'frontpond', 'bunkerfield', 'lonetree', 'creek', 'autumn', 'twinlakes'],
  links: ['bunkerfield', 'waste', 'dunes', 'creek', 'lonetree', 'frontpond', 'rocks', 'lake', 'forest'],
  tropical: ['island', 'lake', 'frontpond', 'twinlakes', 'creek', 'waste', 'forest', 'lonetree', 'bunkerfield'],
  alpine: ['forest', 'creek', 'lake', 'autumn', 'frontpond', 'rocks', 'bunkerfield', 'twinlakes', 'lonetree'],
};
const TREE_MIX = {
  parkland: [['oak', 'oak', 'pine'], ['pine', 'pine', 'cypress'], ['oak', 'birch'], ['oak', 'maple', 'oak'], ['cypress', 'oak', 'birch']],
  links: [['shrub', 'gorse'], ['gorse', 'shrub', 'shrub'], ['shrub', 'cypress', 'shrub']],
  tropical: [['palm', 'palm', 'bush'], ['palm', 'oak'], ['palm', 'bush', 'palm', 'cypress']],
  alpine: [['pine'], ['pine', 'birch'], ['pine', 'pine', 'cypress']],
  georgia: [['tallpine', 'tallpine', 'tallpine', 'tallpine', 'dogwood'], ['tallpine', 'tallpine', 'tallpine', 'tallpine', 'tallpine', 'magnolia'], ['tallpine', 'tallpine', 'tallpine', 'dogwood', 'tallpine', 'magnolia', 'tallpine']],
};
const LONE_TREE = { parkland: 'oak', links: 'cypress', tropical: 'palm', alpine: 'pine', georgia: 'tallpine' };
const TREE_SPEC = {
  pine: { color: '#2e5a2a', trunk: '#5a3f2a', mm: '#16361a' },
  cypress: { color: '#2b4a2c', trunk: '#5a3f2a', mm: '#142b16' },
  oak: { color: '#3f7a2c', trunk: '#5a3f2a', mm: '#1b4219' },
  maple: { color: '#c8552a', trunk: '#4a3524', mm: '#8a3a1c' },
  birch: { color: '#86b84a', trunk: '#ebe7dd', mm: '#4f7a30' },
  palm: { color: '#3f9b3a', trunk: '#8a6b45', mm: '#246024' },
  shrub: { color: '#6e7a38', mm: '#4a5226' },
  gorse: { color: '#8f8f2e', mm: '#77741f' },
  bush: { color: '#3f8a3a', mm: '#5a2a48' },
  tallpine: { color: '#2d5328', trunk: '#6b4a32', mm: '#15331a' },
  dogwood: { color: '#f3efe6', trunk: '#5a4232', mm: '#8f8a80' },
  magnolia: { color: '#264d25', trunk: '#4d3a2a', mm: '#12301a' },
  azalea: { color: '#e0357e', mm: '#b02565' },
};
const AZALEA = ['#e0357e', '#f25c9a', '#c2185b', '#ff8fb8', '#fbf7f2', '#ff6f61', '#d6246e'];
const AUTUMN = ['#c0392b', '#e0662a', '#e9a13b', '#b8452a', '#d98c1f', '#a8321f'];
const BLOOMS = ['#e84a8a', '#f06a4f', '#e8c33b', '#b04ad9', '#ff8fb8'];
const BED_COLORS = ['#e84a5f', '#ffcc4d', '#b967ff', '#ff8c42', '#f7f7f7', '#ff6fb5'];

class Hole {
  static plan(course) {
    if (course.plan) return course.plan;
    if (Hole._plans[course.id]) return Hole._plans[course.id];
    const R = mulberry32(course.seed * 17 + 5), pool = SIG_POOLS[course.theme], used = new Set();
    const ok = (s, par) => !SIGS[s].pars || SIGS[s].pars.includes(par);
    const order = course.pars.map((p, i) => i).sort((a, b) => (course.pars[a] === 3 ? 0 : 1) - (course.pars[b] === 3 ? 0 : 1));
    const plan = [];
    for (const i of order) {
      const par = course.pars[i];
      let cand = pool.filter(s => !used.has(s) && ok(s, par));
      if (par === 3 && cand.includes('island')) cand = ['island'];
      if (!cand.length) cand = pool.filter(s => ok(s, par));
      const s = cand[Math.floor(R() * cand.length)];
      used.add(s); plan[i] = s;
    }
    return (Hole._plans[course.id] = plan);
  }

  constructor(course, index) {
    const th = this.theme = THEMES[course.theme];
    this.course = course; this.index = index; this.par = course.pars[index];
    const R = mulberry32(course.seed * 131 + index * 7919 + 17);
    const rr = (a, b) => a + R() * (b - a);
    const sgn = () => (R() < 0.5 ? -1 : 1);
    const pickOf = (a) => a[Math.floor(R() * a.length)];
    this.ph = Array.from({ length: 8 }, () => R() * Math.PI * 2);
    const sig = this.sig = Hole.plan(course)[index];
    this.sigName = course.holeNames ? course.holeNames[index] : sig === 'lonetree' ? 'Lone ' + LONE_TREE[course.theme].replace(/^./, c => c.toUpperCase()) : SIGS[sig].name;
    this.style = {
      mow: pickOf(['stripes', 'wide', 'diag', 'checker']), gmow: pickOf(['checker', 'stripes', 'rings']),
      tint: rr(-1, 1), light: rr(-0.05, 0.05), path: sgn(), pathOn: R() < 0.8,
    };
    if (th.mow) { this.style.mow = th.mow; this.style.gmow = th.gmow; this.style.tint *= 0.4; }
    this.hillAmp = th.hillAmp * rr(0.7, 1.25) * (sig === 'dunes' ? 1.4 : 1);
    this.sideAmp = th.sideAmp * rr(0.6, 1.2) * (sig === 'dunes' ? 1.9 : 1);
    this.fwBase = th.fwW * rr(0.9, 1.1) * (sig === 'forest' ? 0.85 : sig === 'bunkerfield' || sig === 'waste' ? 1.1 : 1);
    this.obDist = 62;
    this._n = { d: 0, s: 0, side: 0 };
    this._c = { t: 'rough', d: 0, s: 0, w: 0, side: 0, gd: 9, bd: 9, wd: 9, sandy: false };

    // ---- centreline ----
    const par = this.par, pts = [[0, 0]];
    if (par === 3) {
      pts.push([rr(-14, 14), rr(140, 200)]);
    } else if (par === 4) {
      const L = rr(350, 440), by = rr(215, 250), bx = rr(-8, 8);
      const dog = R() < 0.75 ? sgn() * rr(18, 48) : rr(-6, 6);
      const rem = L - by;
      pts.push([bx, by], [bx + dog, by + Math.sqrt(rem * rem - dog * dog)]);
    } else {
      const b1 = rr(225, 255), x1 = rr(-10, 10);
      const d2 = sgn() * rr(15, 40), seg2 = rr(170, 200);
      const p2 = [x1 + d2, b1 + Math.sqrt(seg2 * seg2 - d2 * d2)];
      const d3 = rr(-35, 35), seg3 = rr(95, 130);
      pts.push([x1, b1], p2, [p2[0] + d3, p2[1] + Math.sqrt(seg3 * seg3 - d3 * d3)]);
    }
    this.pts = pts;
    this.segs = [];
    let s0 = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      this.segs.push({ ax, ay, dx: (bx - ax) / len, dy: (by - ay) / len, len, s0 });
      s0 += len;
    }
    const total = this.total = s0;
    this.yards = Math.round(s0);

    // ---- green & pin ----
    const last = this.segs[this.segs.length - 1];
    const gAng = Math.atan2(last.dx, last.dy);
    const [gx, gy] = pts[pts.length - 1];
    const grx = rr(10, 14), gry = par === 3 ? rr(11, 15) : rr(13, 18);
    this.green = makeEll(gx, gy, grx, gry, gAng, R, rr(0.6, 1.5));
    this.greenR = (grx + gry) / 2;
    const pa = rr(0, 6.283), pr = rr(0.12, 0.58);
    const plx = Math.cos(pa) * pr * grx, ply = Math.sin(pa) * pr * gry;
    this.pin = { x: gx + Math.cos(gAng) * plx + Math.sin(gAng) * ply, y: gy - Math.sin(gAng) * plx + Math.cos(gAng) * ply };
    const sa = rr(0, 6.283), sm = rr(0.006, 0.016) * (th.gslope || 1);
    this.gSlope = { x: Math.cos(sa) * sm, y: Math.sin(sa) * sm };
    this.teeH = this.baseH(0, 0) + 0.4;
    this.greenH = this.baseH(gx, gy) + 0.3 + (this.ph[7] / 6.283) * 1.4;

    this.fwStart = par === 3 ? total - gry - 24 : rr(55, 85);
    this.fwEnd = total - gry * 0.3;

    // ---- bounds ----
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.minX = Math.min(...xs) - 85; this.maxX = Math.max(...xs) + 85;
    this.minY = -45; this.maxY = Math.max(...ys) + 55;

    // ---- bunkers ----
    this.bunkers = []; this.water = []; this.wastes = []; this.rocks = []; this.beds = [];
    const bw = rr(0.7, 1.5);
    const addB = (cx, cy, rx, ry, ang, depth = 0.5) => {
      if (ellD(this.green, cx, cy) < 1.3 || Math.hypot(cx, cy) < 30) return;
      const b = makeEll(cx, cy, rx, ry, ang, R, bw); b.depth = depth; this.bunkers.push(b);
    };
    if (par >= 4) {
      const n = th.fwBunkers + (R() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const s = rr(195, 270); if (s > total - 80) continue;
        const p = this.pointAt(s), w = this.fw(s), off = sgn() * (w + rr(-3, 4));
        addB(p.x + p.nx * off, p.y + p.ny * off, rr(4, 7), rr(7, 12), p.ang);
      }
      if (par === 5) {
        const s = Math.min(rr(420, 465), total - 90), p = this.pointAt(s), off = sgn() * (this.fw(s) + rr(-2, 3));
        addB(p.x + p.nx * off, p.y + p.ny * off, rr(4, 6), rr(8, 13), p.ang);
      }
      // approach bunkers short of the green
      for (let i = 0; i < 1 + (R() < 0.5 ? 1 : 0); i++) {
        const s = total - rr(35, 60), p = this.pointAt(s), off = sgn() * this.fw(s) * rr(0.55, 1.1);
        addB(p.x + p.nx * off, p.y + p.ny * off, rr(3, 5), rr(4, 7), p.ang + rr(-0.5, 0.5), 0.6);
      }
    }
    if (sig !== 'island') {
      const around = [-1.9, 1.9, -1.1, 1.1, Math.PI];
      const nSide = Math.max(1, th.sideBunkers - (R() < 0.4 ? 1 : 0));
      for (let i = 0; i < nSide; i++) {
        const a = around.splice(Math.floor(R() * around.length), 1)[0];
        const br = rr(3, 5.5), rad = Math.abs(Math.cos(a)) * gry + Math.abs(Math.sin(a)) * grx;
        const dist = rad * 1.02 + br + 0.8;
        addB(gx + Math.sin(gAng + a) * dist, gy + Math.cos(gAng + a) * dist, br, rr(4.5, 8), gAng + a + Math.PI / 2, 0.7);
      }
    }
    const pots = th.pots + (sig === 'dunes' ? 7 : 0);
    for (let i = 0; i < pots; i++) {
      const s = rr(110, total - 45), p = this.pointAt(s), off = rr(-0.9, 0.9) * this.fw(s), r = rr(2, 3.2);
      addB(p.x + p.nx * off, p.y + p.ny * off, r, r, 0, 0.95);
    }

    // ---- signature feature ----
    if (sig === 'island') {
      const e = makeEll(gx, gy, grx * 1.75 + 7, gry * 1.75 + 7, gAng, R, 0.5); e.island = true;
      this.water.push(e);
    } else if (sig === 'lake') {
      const side = sgn(), sc = total * rr(0.45, 0.62), p = this.pointAt(sc), len = Math.min(total * rr(0.35, 0.55), 240);
      const rx = rr(20, 32), off = side * (this.fw(sc) + rx * rr(0.3, 0.55));
      this.addWaterEll(makeEll(p.x + p.nx * off, p.y + p.ny * off, rx, len / 2, p.ang, R, 0.9));
    } else if (sig === 'frontpond') {
      const pry = rr(7, 11), d = gry + pry * 1.25 + rr(4, 7);
      this.addWaterEll(makeEll(gx - Math.sin(gAng) * d, gy - Math.cos(gAng) * d, rr(18, 28), pry, gAng, R, 0.8));
    } else if (sig === 'creek') {
      const ss = par === 5 ? [rr(185, 215), total - rr(90, 120)] : [total - rr(75, 100)];
      for (const s of ss) { const p = this.pointAt(s); this.addWaterEll(makeEll(p.x, p.y, rr(48, 62), rr(4, 6), p.ang + rr(-0.3, 0.3), R, 0.45)); }
    } else if (sig === 'twinlakes') {
      const s = rr(200, Math.min(250, total - 90)), p = this.pointAt(s), w = this.fw(s);
      for (const side of [-1, 1]) {
        const rx = rr(12, 18), off = side * (w + rx * rr(0.25, 0.5));
        this.addWaterEll(makeEll(p.x + p.nx * off, p.y + p.ny * off, rx, rr(20, 32), p.ang, R, 0.9));
      }
    } else if (sig === 'bunkerfield') {
      const n = Math.round(rr(8, 12));
      for (let i = 0; i < n; i++) {
        const s = rr(70, total - 40), p = this.pointAt(s), r1 = rr(2.5, 5);
        addB(p.x + p.nx * this.fw(s) * rr(-1.4, 1.4), p.y + p.ny * this.fw(s) * rr(-1.4, 1.4), r1, r1 * rr(1, 2.2), p.ang + rr(-0.6, 0.6), 0.6);
      }
      if (par >= 4) {
        const s = rr(135, 170), p = this.pointAt(s), w = this.fw(s);
        for (let k = -1; k <= 1; k++) addB(p.x + p.nx * k * w * 0.7, p.y + p.ny * k * w * 0.7, rr(3, 4.5), rr(3, 4.5), p.ang + Math.PI / 2, 0.6);
      }
    } else if (sig === 'waste') {
      let side = sgn();
      for (let k = 0; k < 2; k++, side = -side) {
        const s = total * rr(0.25, 0.75), p = this.pointAt(s), rx = rr(14, 24) * (k ? 0.7 : 1), off = side * (this.fw(s) + rx * 0.45);
        this.wastes.push(makeEll(p.x + p.nx * off, p.y + p.ny * off, rx, rr(35, 65) * (k ? 0.7 : 1), p.ang, R, 1.3));
      }
    }
    const waterSig = ['island', 'lake', 'frontpond', 'creek', 'twinlakes'].includes(sig);
    if (!waterSig && R() < th.waterChance * 0.55) this.addWater(R, 'main', gAng, gx, gy, gry);
    if (course.theme === 'tropical' && R() < 0.4) this.addWater(R, 'side', gAng, gx, gy, gry);
    for (const w of this.water) {
      const save = this.water; this.water = [];
      let lo = Infinity;
      for (const [px, py] of ellOutline(w, 24, 1.35)) lo = Math.min(lo, this.heightAt(px, py));
      this.water = save;
      w.level = lo - 0.35;
      if (w.island) w.level = Math.min(w.level, this.greenH - 0.9);
    }

    // ---- trees ----
    this.trees = [];
    const mix = sig === 'autumn' ? ['maple', 'maple', 'birch', 'maple', th.trees[0]] : pickOf(TREE_MIX[course.theme]);
    this.treeMix = mix;
    let dens = th.treeDensity * rr(1.0, 1.35), near = 10, far = 56, clear = 7;
    if (sig === 'forest') { dens *= 2; near = 4; far = 42; clear = 3.5; }
    if (sig === 'autumn') dens *= 1.3;
    const pick = () => mix[Math.floor(R() * mix.length)];
    const tryTree = (x, y, type) => {
      const c = this.classify(x, y);
      if (c.t === 'water' || c.t === 'bunker' || c.t === 'green' || c.t === 'fringe' || c.t === 'tee' || c.t === 'fairway') return null;
      if (c.t !== 'ob' && c.d < c.w + clear) return null;
      if (Math.hypot(x, y) < 20 || ellD(this.green, x, y) < 2.2) return null;
      for (const w of this.water) if (ellD(w, x, y) < 1.4) return null;
      if (x < this.minX + 2 || x > this.maxX - 2 || y < this.minY + 2 || y > this.maxY - 2) return null;
      const t = this.makeTree(type, x, y, R, this.heightAt(x, y));
      this.trees.push(t); return t;
    };
    for (let s = -25; s < total + 35; s += 7 / dens) {
      for (const side of [-1, 1]) {
        if (R() > 0.8) continue;
        const sc = Math.max(0, Math.min(total, s)), p = this.pointAt(sc);
        const d = this.fw(sc) + rr(near, far);
        const ext = s < 0 ? s : (s > total ? s - total : 0);
        tryTree(p.x + p.nx * side * d + p.fx * ext + rr(-3, 3), p.y + p.ny * side * d + p.fy * ext + rr(-3, 3), pick());
      }
    }
    for (let i = 0; i < 6 * dens; i++) {
      const s = rr(70, total - 60), p = this.pointAt(s), d = sgn() * (this.fw(s) + rr(8, 16));
      tryTree(p.x + p.nx * d, p.y + p.ny * d, pick());
    }
    // groves: tight clumps of the same species
    const groves = Math.round(rr(3, 6) * Math.min(1.6, dens));
    for (let g = 0; g < groves; g++) {
      const s = rr(30, total), p = this.pointAt(s), d = sgn() * (this.fw(s) + rr(clear + 6, 48)), type = pick();
      const cx = p.x + p.nx * d, cy = p.y + p.ny * d, n = 3 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) tryTree(cx + rr(-6, 6), cy + rr(-6, 6), type);
    }
    if (sig === 'lonetree') {
      const s = par === 5 ? rr(290, 330) : total - rr(95, 125), p = this.pointAt(s), off = rr(-0.35, 0.35) * this.fw(s);
      const x = p.x + p.nx * off, y = p.y + p.ny * off;
      const t = this.makeTree(LONE_TREE[course.theme], x, y, R, this.heightAt(x, y));
      t.h *= 1.5; t.r *= 1.55; t.trunkH *= 1.3; t.trunkR *= 1.7;
      this.trees.push(t);
    }
    if (th.azaleas) {
      const addAz = (x, y) => {
        const c = this.classify(x, y);
        if (['water', 'bunker', 'green', 'fringe', 'tee', 'fairway', 'ob'].includes(c.t) || ellD(this.green, x, y) < 1.35) return;
        for (const w of this.water) if (ellD(w, x, y) < 1.25) return;
        if (Math.hypot(x, y) < 7) return;
        this.trees.push(this.makeTree('azalea', x, y, R, this.heightAt(x, y)));
      };
      const clusters = sig === 'azalea' ? 28 : 13;
      for (let k = 0; k < clusters; k++) {
        const r = R();
        let cx, cy;
        if (r < 0.45) { const a = gAng + rr(-2.3, 2.3), d = Math.max(grx, gry) * rr(1.45, 2.1) + 3; cx = gx + Math.sin(a) * d; cy = gy + Math.cos(a) * d; }
        else if (r < 0.6) { cx = sgn() * rr(9, 16); cy = rr(-9, 6); }
        else { const s = rr(20, total - 30), p = this.pointAt(s), d = sgn() * (this.fw(s) + rr(5, 14)); cx = p.x + p.nx * d; cy = p.y + p.ny * d; }
        const m = 3 + Math.floor(R() * 5);
        for (let j = 0; j < m; j++) addAz(cx + rr(-3.5, 3.5), cy + rr(-3.5, 3.5));
      }
    }
    // backdrop trees on the surrounding land
    const nOuter = th.backdrop === 'forest' ? 380 : th.backdrop === 'mountains' ? 360 : th.backdrop === 'ocean' ? 110 : 70;
    const x0 = this.minX, x1 = this.maxX, y0 = this.minY, y1 = this.maxY;
    for (let i = 0; i < nOuter; i++) {
      const off = rr(2, th.backdrop === 'ocean' ? 55 : 150), side = Math.floor(R() * 4), u = R();
      let x, y;
      if (side === 0) { x = x0 - off + (x1 - x0 + 2 * off) * u; y = y0 - off; }
      else if (side === 1) { x = x1 + off; y = y0 - off + (y1 - y0 + 2 * off) * u; }
      else if (side === 2) { x = x0 - off + (x1 - x0 + 2 * off) * u; y = y1 + off; }
      else { x = x0 - off; y = y0 - off + (y1 - y0 + 2 * off) * u; }
      this.trees.push(this.makeTree(pick(), x, y, R, this.outerHeight(x, y)));
    }

    // ---- rocks & flower beds ----
    const nRocks = sig === 'rocks' ? 45 : (course.theme === 'alpine' || course.theme === 'links') ? 10 : 3;
    for (let i = 0, tries = 0; i < nRocks && tries < nRocks * 6; tries++) {
      const s = rr(-10, total + 20), p = this.pointAt(Math.max(0, Math.min(total, s))), d = sgn() * (this.fw(s) + rr(sig === 'rocks' ? 3 : 8, 55));
      const x = p.x + p.nx * d, y = p.y + p.ny * d, c = this.classify(x, y);
      if (c.t !== 'rough' && c.t !== 'waste') continue;
      const r = sig === 'rocks' ? rr(0.6, 2.4) : rr(0.4, 1.4);
      this.rocks.push({ type: 'rock', x, y, gz: this.heightAt(x, y), r, h: r * 0.8, trunkH: r * 0.75, trunkR: r * 0.85, rot: rr(0, 6.28) });
      i++;
    }
    if (course.theme !== 'links') {
      const col = pickOf(BED_COLORS), col2 = pickOf(BED_COLORS);
      for (const sx of [-1, 1]) this.beds.push(Object.assign(makeEll(sx * rr(8, 11), rr(-6, 0), rr(1.8, 2.6), rr(4, 6), rr(-0.3, 0.3), R, 0.6), { col: sx < 0 ? col : col2 }));
      const bd = gry + rr(12, 16), ba = gAng + rr(-0.5, 0.5);
      this.beds.push(Object.assign(makeEll(gx + Math.sin(ba) * bd, gy + Math.cos(ba) * bd, rr(2, 3), rr(5, 8), ba + Math.PI / 2, R, 0.6), { col: pickOf(BED_COLORS) }));
    }

    this.treeGrid = new Map();
    for (const t of this.trees.concat(this.rocks)) {
      const k = Math.floor(t.x / 10) + ',' + Math.floor(t.y / 10);
      if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
      this.treeGrid.get(k).push(t);
    }
  }

  addWaterEll(e) {
    for (let tries = 0; tries < 4; tries++) {
      let ok = ellD(e, 0, 0) > 1.6 && ellD(e, this.pin.x, this.pin.y) > 1.3;
      for (const [px, py] of ellOutline(this.green, 12, 1.08)) if (ellD(e, px, py) < 1.12) ok = false;
      if (ok) {
        this.bunkers = this.bunkers.filter(b => ellD(e, b.cx, b.cy) > 1.25 && ellD(b, e.cx, e.cy) > 1.1);
        this.water.push(e); return true;
      }
      e.rx *= 0.8; e.ry *= 0.8; e.maxR *= 0.8;
    }
    return false;
  }
  addWater(R, kind, gAng, gx, gy, gry) {
    const rr = (a, b) => a + R() * (b - a);
    const sgn = () => (R() < 0.5 ? -1 : 1);
    let e;
    if (this.par === 3 && kind === 'main') {
      const d = gry + rr(10, 15);
      e = makeEll(gx - Math.sin(gAng) * d, gy - Math.cos(gAng) * d, rr(16, 24), rr(6, 9), gAng, R, 0.8);
    } else if (this.par === 5 && kind === 'main' && R() < 0.55) {
      const p = this.pointAt(rr(280, 330));
      e = makeEll(p.x, p.y, rr(42, 55), rr(5, 7), p.ang, R, 0.5);
    } else {
      const s = rr(150, Math.max(160, Math.min(this.total - 45, 300))), p = this.pointAt(s);
      const rx = rr(12, 20), off = sgn() * (this.fw(s) + rx * rr(0.35, 0.85));
      e = makeEll(p.x + p.nx * off, p.y + p.ny * off, rx, rr(22, 40), p.ang, R, 0.9);
    }
    this.addWaterEll(e);
  }

  makeTree(type, x, y, R, gz) {
    const rr = (a, b) => a + R() * (b - a);
    const t = { type, x, y, gz, trunkR: 0.3 };
    switch (type) {
      case 'pine': t.h = rr(9, 15); t.r = rr(2.4, 3.6); t.trunkH = t.h * 0.16; t.trunkR = 0.25; break;
      case 'cypress': t.h = rr(12, 18); t.r = rr(1.4, 2.1); t.trunkH = 1; t.trunkR = 0.2; break;
      case 'tallpine': t.h = rr(20, 29); t.r = rr(2.6, 3.8); t.trunkH = t.h * rr(0.5, 0.62); t.trunkR = 0.3; break;
      case 'dogwood': t.h = rr(5, 7.5); t.r = rr(2.6, 3.6); t.trunkH = t.h * 0.3; t.trunkR = 0.14; t.col = R() < 0.7 ? '#f3efe6' : '#f2b8c8'; break;
      case 'magnolia': t.h = rr(9, 13); t.r = rr(3.6, 5); t.trunkH = t.h * 0.22; t.trunkR = 0.3; break;
      case 'azalea': t.h = rr(1.1, 1.9); t.r = rr(1.1, 2); t.trunkH = 0.1; t.trunkR = 0; t.col = AZALEA[Math.floor(R() * AZALEA.length)]; break;
      case 'oak': t.h = rr(8, 12); t.r = rr(3.4, 5.4); t.trunkH = t.h * 0.34; t.trunkR = 0.35; break;
      case 'maple': t.h = rr(8, 12); t.r = rr(3.2, 5); t.trunkH = t.h * 0.32; t.trunkR = 0.3; t.col = AUTUMN[Math.floor(R() * AUTUMN.length)]; break;
      case 'birch': t.h = rr(9, 13); t.r = rr(2, 2.8); t.trunkH = t.h * 0.42; t.trunkR = 0.17; break;
      case 'palm': t.h = rr(8, 12.5); t.r = rr(2.8, 3.6); t.trunkH = t.h - 0.6; t.trunkR = 0.2; break;
      case 'bush': t.h = rr(1, 1.8); t.r = rr(1, 1.8); t.trunkH = 0.1; t.trunkR = 0; t.col = BLOOMS[Math.floor(R() * BLOOMS.length)]; break;
      case 'gorse': t.h = rr(1, 1.6); t.r = rr(1.2, 2); t.trunkH = 0.1; t.trunkR = 0; t.col = R() < 0.5 ? '#d9c22a' : '#8f8f2e'; break;
      default: t.h = rr(1.1, 2.1); t.r = rr(1.3, 2.3); t.trunkH = 0.1; t.trunkR = 0;
    }
    t.mm = TREE_SPEC[type].mm;
    t.tint = rr(-0.08, 0.08);
    t.rot = rr(0, 6.283);
    return t;
  }
  static canopy(t) {
    switch (t.type) {
      case 'pine': case 'cypress': case 'tallpine': return { kind: 'cone', y0: t.trunkH, h: t.h - t.trunkH, r: t.r };
      case 'oak': case 'maple': case 'dogwood': return { kind: 'ell', cy: t.trunkH + t.r * 0.75, rx: t.r, ry: t.r * 0.8 };
      case 'magnolia': return { kind: 'ell', cy: t.trunkH + t.r * 0.9, rx: t.r, ry: t.r * 1.05 };
      case 'birch': return { kind: 'ell', cy: t.trunkH + t.r * 0.95, rx: t.r, ry: t.r * 1.15 };
      case 'palm': return { kind: 'palm', cy: t.h - 0.4, rx: t.r, ry: 1.4 };
      case 'rock': return { kind: 'none' };
      default: return { kind: 'ell', cy: t.h * 0.45, rx: t.r, ry: t.h * 0.6 };
    }
  }

  // ---------- geometry queries ----------
  nearest(x, y) {
    const n = this._n; let best = Infinity;
    for (const g of this.segs) {
      let t = (x - g.ax) * g.dx + (y - g.ay) * g.dy;
      t = t < 0 ? 0 : t > g.len ? g.len : t;
      const px = g.ax + g.dx * t, py = g.ay + g.dy * t;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < best) { best = d2; n.s = g.s0 + t; n.side = (x - px) * g.dy - (y - py) * g.dx; }
    }
    n.d = Math.sqrt(best);
    return n;
  }
  pointAt(s) {
    let g = this.segs[0];
    for (const sg of this.segs) if (s >= sg.s0) g = sg;
    const t = Math.min(g.len, s - g.s0);
    return { x: g.ax + g.dx * t, y: g.ay + g.dy * t, ang: Math.atan2(g.dx, g.dy), nx: g.dy, ny: -g.dx, fx: g.dx, fy: g.dy };
  }
  fw(s) { return this.fwBase + 3.5 * Math.sin(s * 0.023 + this.ph[0]) + 2 * Math.sin(s * 0.061 + this.ph[1]); }
  inWater(w, x, y) {
    if (ellD(w, x, y) >= 1) return false;
    return !(w.island && ellD(this.green, x, y) < 1.3);
  }

  classify(x, y) {
    const n = this.nearest(x, y), c = this._c;
    c.d = n.d; c.s = n.s; c.side = n.side; c.gd = 9; c.bd = 9; c.wd = 9; c.sandy = false;
    const w = this.fw(n.s); c.w = w;
    if (n.d > this.obDist || y < -32 || (n.s >= this.total - 0.01 && n.d > 42)) { c.t = 'ob'; return c; }
    for (const wa of this.water) if (this.inWater(wa, x, y)) { c.t = 'water'; c.wd = ellD(wa, x, y); return c; }
    const gd = ellD(this.green, x, y); c.gd = gd;
    if (gd < 1) { c.t = 'green'; return c; }
    for (const b of this.bunkers) { const d = ellD(b, x, y); if (d < 1) { c.t = 'bunker'; c.bd = d; return c; } }
    if (gd < 1 + 2.4 / this.greenR) { c.t = 'fringe'; return c; }
    if (x > -4.5 && x < 4.5 && y > -7 && y < 3.5) { c.t = 'tee'; return c; }
    for (const e of this.wastes) { const d = ellD(e, x, y); if (d < 1) { c.t = 'waste'; c.sandy = true; c.bd = d; return c; } }
    if (n.s >= this.fwStart && n.s <= this.fwEnd && n.d < w) { c.t = 'fairway'; return c; }
    if (this.theme.waste && n.d > w + 16 + 5 * Math.sin(n.s * 0.03 + this.ph[6])) { c.t = 'waste'; return c; }
    c.t = 'rough'; return c;
  }
  surfaceAt(x, y) { return this.classify(x, y).t; }
  waterLevelAt(x, y) {
    for (const w of this.water) if (this.inWater(w, x, y)) return w.level;
    return -1e9;
  }

  baseH(x, y) {
    const p = this.ph, A = this.hillAmp;
    return A * (0.55 * Math.sin(x * 0.029 + p[0]) * Math.sin(y * 0.021 + p[1]) +
      0.35 * Math.sin((x + y) * 0.015 + p[2]) + 0.22 * Math.sin(x * 0.063 - y * 0.047 + p[3]));
  }
  heightAt(x, y) {
    const n = this.nearest(x, y);
    const nd = n.d, ns = n.s;
    let h = this.baseH(x, y);
    const w = this.fw(ns);
    h += this.sideAmp * smooth(w + 8, w + 45, nd) * (0.6 + 0.4 * Math.sin(ns * 0.05 + this.ph[4]));
    // tee box pad
    const tdx = Math.max(Math.abs(x) - 4.5, 0), tdy = Math.max(-7 - y, y - 3.5, 0);
    const tw = smooth(9, 1, Math.hypot(tdx, tdy));
    if (tw > 0) h += (this.teeH - h) * tw;
    // green plane with a tilt and gentle undulation
    const gd = ellD(this.green, x, y);
    if (gd < 2) {
      const gw = smooth(1.9, 1.08, gd);
      if (gw > 0) {
        const dx = x - this.green.cx, dy = y - this.green.cy;
        const gp = this.greenH + this.gSlope.x * dx + this.gSlope.y * dy +
          0.055 * (this.theme.gslope || 1) * Math.sin(dx * 0.22 + this.ph[5]) * Math.cos(dy * 0.19 + this.ph[4]);
        h += (gp - h) * gw;
      }
    }
    for (const b of this.bunkers) { const d = ellD(b, x, y); if (d < 1.15) h -= b.depth * (1 - smooth(0.6, 1.08, d)); }
    for (const e of this.wastes) { const d = ellD(e, x, y); if (d < 1.2) h -= 0.3 * (1 - smooth(0.7, 1.15, d)); }
    for (const wa of this.water) {
      const d = ellD(wa, x, y);
      if (d < 1.4) {
        let k = smooth(1.38, 1.0, d);
        if (wa.island) k *= smooth(1.2, 1.42, gd);
        h += ((wa.level - 1.2) - h) * k;
      }
    }
    const e = Math.min(x - this.minX, this.maxX - x, y - this.minY, this.maxY - y);
    if (e < 30) h *= smooth(0, 30, e);
    return h;
  }
  gradAt(x, y) {
    const e = 0.12;
    return [(this.heightAt(x + e, y) - this.heightAt(x - e, y)) / (2 * e), (this.heightAt(x, y + e) - this.heightAt(x, y - e)) / (2 * e)];
  }
  outerHeight(x, y) {
    const off = Math.max(this.minX - x, x - this.maxX, this.minY - y, y - this.maxY, 0);
    const O = Hole.RING_OFF, H = this.theme.rings;
    for (let k = 1; k < O.length; k++) if (off <= O[k]) return H[k - 1] + (H[k] - H[k - 1]) * (off - O[k - 1]) / (O[k] - O[k - 1]);
    return H[H.length - 1];
  }

  treeHit(x, y, z, used) {
    const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.treeGrid.get((cx + i) + ',' + (cy + j));
      if (!list) continue;
      for (const t of list) {
        if (used.has(t)) continue;
        const dx = x - t.x, dy = y - t.y, zr = z - t.gz;
        if (zr > t.h + 0.6 || zr < -0.5) continue;
        const d = Math.hypot(dx, dy);
        if (d > Math.max(t.r, t.trunkR) + 0.5) continue;
        const c = Hole.canopy(t);
        let inC = false;
        if (c.kind === 'cone') inC = zr > c.y0 && d < c.r * (c.y0 + c.h - zr) / c.h;
        else if (c.kind === 'ell') inC = (d / c.rx) ** 2 + ((zr - c.cy) / c.ry) ** 2 < 1;
        else if (c.kind === 'palm') inC = zr > t.h - 1.2 && d < t.r * 0.9;
        if (inC) { used.add(t); return 'canopy'; }
        if (t.trunkR > 0 && zr < t.trunkH && d < t.trunkR + 0.03) { used.add(t); return { trunk: true, nx: dx / (d || 1), ny: dy / (d || 1) }; }
      }
    }
    return null;
  }

  // ---------- painted top-down texture (also drives the minimap) ----------
  paint() {
    const th = this.theme, st = this.style;
    const W = this.maxX - this.minX, L = this.maxY - this.minY;
    const ppy = this.ppy = Math.min(3, 2048 / W, 2048 / L, Math.sqrt(1.3e6 / (W * L)));
    const cw = Math.round(W * ppy), ch = Math.round(L * ppy);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cw, ch), D = img.data;
    // per-hole grass tint so neighbouring holes don't read identical
    const warm = [214, 200, 90], cool = [40, 120, 110];
    const tint = (rgb) => mixRGB(rgb, st.tint > 0 ? warm : cool, Math.abs(st.tint) * 0.12).map(v => v * (1 + st.light));
    const C = {};
    for (const k of ['fair', 'fair2', 'cut', 'rough', 'rough2', 'green', 'green2', 'fringe']) C[k] = tint(hexRGB(th[k]));
    for (const k of ['sand', 'sand2', 'water', 'water2', 'outer']) C[k] = hexRGB(th[k]);
    C.waste = th.waste ? hexRGB(th.waste) : C.rough2;
    C.ob = th.waste ? mixRGB(C.waste, C.rough2, 0.2) : mixRGB(C.rough2, [20, 40, 15], 0.18);
    C.path = [186, 181, 168]; C.soil = [58, 70, 40];
    const beds = this.beds.map(b => ({ e: b, col: hexRGB(b.col) }));
    const gcx = this.green.cx, gcy = this.green.cy;
    let i = 0;
    for (let py = 0; py < ch; py++) {
      const y = this.maxY - (py + 0.5) / ppy;
      for (let px = 0; px < cw; px++, i += 4) {
        const x = this.minX + (px + 0.5) / ppy;
        const c = this.classify(x, y);
        const nz = hash2(px, py) - 0.5;
        let col, sh = 0;
        switch (c.t) {
          case 'fairway': {
            let s;
            if (st.mow === 'wide') s = Math.floor(c.s / 16) & 1;
            else if (st.mow === 'diag') s = Math.floor((x + y) * 0.7 / 7) & 1;
            else if (st.mow === 'checker') s = (Math.floor(c.s / 9) + Math.floor((Math.sign(c.side) * c.d + 200) / 9)) & 1;
            else s = Math.floor(c.s / 9) & 1;
            col = s ? C.fair : C.fair2; sh = nz * 9; if (c.d > c.w - 0.9) sh -= 9; break;
          }
          case 'rough': {
            col = mixRGB(C.rough, C.rough2, vnoise(x * 0.11, y * 0.11));
            if (c.d < c.w + 2.2 && c.s >= this.fwStart && c.s <= this.fwEnd) col = C.cut;
            sh = nz * 16; break;
          }
          case 'waste':
            if (c.sandy) { col = mixRGB(C.sand2, C.rough2, vnoise(x * 0.25, y * 0.25) * 0.35); if (hash2(px >> 1, py >> 1) < 0.03) col = C.rough2; sh = nz * 20; }
            else { col = mixRGB(C.waste, C.rough2, vnoise(x * 0.2, y * 0.2) * 0.35); sh = nz * 18; }
            break;
          case 'green': {
            let s;
            if (st.gmow === 'stripes') s = Math.floor(y / 2.2) & 1;
            else if (st.gmow === 'rings') s = Math.floor(Math.hypot(x - gcx, y - gcy) / 2.2) & 1;
            else s = (Math.floor(x / 2.4) + Math.floor(y / 2.4)) & 1;
            col = s ? C.green : C.green2; sh = nz * 5; break;
          }
          case 'fringe': col = C.fringe; sh = nz * 8; break;
          case 'bunker': col = c.bd > 0.86 ? C.sand2 : C.sand; sh = nz * 18; break;
          case 'water': col = mixRGB(C.water, C.water2, smooth(0.2, 1, c.wd)); sh = nz * 4; break;
          case 'tee': col = (Math.floor(y / 1.6) & 1) ? C.fair : C.fair2; sh = nz * 6; break;
          default: col = mixRGB(C.ob, C.outer, vnoise(x * 0.07, y * 0.07) * 0.4); sh = nz * 16 - 4;
        }
        if (c.t === 'rough' || c.t === 'ob' || (c.t === 'waste' && !c.sandy)) {
          if (st.pathOn && c.side * st.path > 0 && c.s > -8 && c.s < this.total - 22 && Math.abs(c.d - (c.w + 10 + 3 * Math.sin(c.s * 0.021 + this.ph[2]))) < 1.1) {
            col = C.path; sh = nz * 10;
          }
          for (const b of beds) {
            if (ellD(b.e, x, y) < 1) { const hh = hash2(px, py); col = hh < 0.4 ? b.col : hh < 0.55 ? [250, 250, 245] : C.soil; sh = nz * 20; break; }
          }
        }
        D[i] = Math.max(0, Math.min(255, col[0] + sh));
        D[i + 1] = Math.max(0, Math.min(255, col[1] + sh));
        D[i + 2] = Math.max(0, Math.min(255, col[2] + sh));
        D[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.canvas = cv;
    return cv;
  }
  toCanvas(x, y) { return [(x - this.minX) * this.ppy, (this.maxY - y) * this.ppy]; }

  // ---------- 3D scene ----------
  buildScene(renderer, detailTex) {
    const th = this.theme;
    const grp = new THREE.Group();
    this.group = grp;
    if (!this.canvas) this.paint();
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture = tex;

    // terrain grid
    const W = this.maxX - this.minX, L = this.maxY - this.minY, step = 1.6;
    const nx = Math.ceil(W / step) + 1, ny = Math.ceil(L / step) + 1;
    const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
    for (let j = 0, v = 0; j < ny; j++) {
      const y = this.minY + j * L / (ny - 1);
      for (let i = 0; i < nx; i++, v++) {
        const x = this.minX + i * W / (nx - 1);
        pos[v * 3] = x; pos[v * 3 + 1] = this.heightAt(x, y); pos[v * 3 + 2] = -y;
        uv[v * 2] = (x - this.minX) / W; uv[v * 2 + 1] = (y - this.minY) / L;
      }
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    for (let j = 0, k = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    addDetail(mat, detailTex, W / 5, L / 5);
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    grp.add(terrain);

    grp.add(this.buildOuter(detailTex));
    if (th.ocean) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000),
        new THREE.MeshPhongMaterial({ color: th.water, shininess: 80, specular: 0x6688aa }));
      sea.rotation.x = -Math.PI / 2; sea.position.set((this.minX + this.maxX) / 2, -3.5, -(this.minY + this.maxY) / 2);
      grp.add(sea);
    }

    // water hazards (island greens get a hole cut for the green)
    for (const w of this.water) {
      const shape = new THREE.Shape(ellOutline(w, 72, 1.0).map(([x, y]) => new THREE.Vector2(x, y)));
      if (w.island) shape.holes.push(new THREE.Path(ellOutline(this.green, 64, 1.3).map(([x, y]) => new THREE.Vector2(x, y))));
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: th.water2, transparent: true, opacity: 0.86, shininess: 90, specular: 0xbfd8ff }));
      m.position.y = w.level; m.receiveShadow = true;
      grp.add(m);
    }

    this.buildTrees(grp);
    this.buildRocks(grp);
    this.buildPin(grp);
    this.buildGreenRead(grp);

    // tee markers
    const tm = new THREE.MeshLambertMaterial({ color: th.flag });
    for (const sx of [-3.4, 3.4]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), tm);
      m.position.set(sx, this.heightAt(sx, 2.4) + 0.12, -2.4); m.castShadow = true; grp.add(m);
    }
    // out-of-bounds stakes
    const stakes = [];
    for (let s = 0; s <= this.total + 20; s += 26) {
      const p = this.pointAt(Math.min(s, this.total));
      for (const side of [-1, 1]) {
        const x = p.x + p.nx * side * (this.obDist + 0.5), y = p.y + p.ny * side * (this.obDist + 0.5);
        if (this.waterLevelAt(x, y) > -1e8) continue;
        stakes.push([x, y]);
      }
    }
    const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.09), new THREE.MeshLambertMaterial({ color: 0xffffff }), stakes.length);
    const M4 = new THREE.Matrix4();
    stakes.forEach(([x, y], i) => { M4.makeTranslation(x, this.heightAt(x, y) + 0.45, -y); sm.setMatrixAt(i, M4); });
    grp.add(sm);

    // floodlight towers (visible at night)
    this.lamps = new THREE.Group();
    this.lampSpots = [];
    const poleM = new THREE.MeshLambertMaterial({ color: 0x5b636b });
    const headM = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (let i = 0; i < 4; i++) {
      const p = this.pointAt(this.total * (i / 3)), side = i % 2 ? 1 : -1;
      const x = p.x + p.nx * side * 72, y = p.y + p.ny * side * 72, gz = this.heightAt(x, y);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 28, 8), poleM);
      pole.position.set(x, gz + 14, -y);
      const head = new THREE.Mesh(new THREE.BoxGeometry(4, 1.8, 0.6), headM);
      head.position.set(x, gz + 28.5, -y); head.lookAt(p.x, gz + 20, -p.y);
      this.lamps.add(pole, head);
      this.lampSpots.push(new THREE.Vector3(x - p.nx * side * 4, gz + 27, -(y - p.ny * side * 4)));
    }
    grp.add(this.lamps);
    return grp;
  }

  // Slope grid draped over the green as thin flat ribbons, coloured by steepness.
  buildGreenRead(grp) {
    const e = this.green, R = e.maxR * 1.25, cx = e.cx, cy = e.cy, pos = [], col = [], idx = [], hw = 0.022;
    const colorFor = (m) => m < 0.01 ? [0.85, 0.97, 1] : m < 0.02 ? [0.5, 1, 0.5] : m < 0.03 ? [1, 0.85, 0.25] : [1, 0.38, 0.28];
    const seg = (x0, y0, x1, y1) => {
      if (ellD(e, x0, y0) > 1.16 || ellD(e, x1, y1) > 1.16) return;
      const [hx, hy] = this.gradAt((x0 + x1) / 2, (y0 + y1) / 2), c = colorFor(Math.hypot(hx, hy));
      const L = Math.hypot(x1 - x0, y1 - y0), px = -(y1 - y0) / L * hw, py = (x1 - x0) / L * hw;
      const h0 = this.heightAt(x0, y0) + 0.02, h1 = this.heightAt(x1, y1) + 0.02, v = pos.length / 3;
      pos.push(x0 + px, h0, -(y0 + py), x0 - px, h0, -(y0 - py), x1 + px, h1, -(y1 + py), x1 - px, h1, -(y1 - py));
      for (let k = 0; k < 4; k++) col.push(c[0], c[1], c[2]);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    };
    for (let x = Math.floor(cx - R); x <= cx + R; x += 1) for (let y = cy - R; y < cy + R; y += 0.5) seg(x, y, x, y + 0.5);
    for (let y = Math.floor(cy - R); y <= cy + R; y += 1) for (let x = cx - R; x < cx + R; x += 0.5) seg(x, y, x + 0.5, y);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const grid = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    grid.visible = false; grid.renderOrder = 2;
    this.greenGrid = grid;
    grp.add(grid);
  }

  buildOuter(detailTex) {
    const th = this.theme, O = Hole.RING_OFF, H = th.rings, S = 24, M = S * 4;
    const pos = [], uv = [], idx = [];
    for (let k = 0; k < O.length; k++) {
      const off = O[k], x0 = this.minX - off, x1 = this.maxX + off, y0 = this.minY - off, y1 = this.maxY + off;
      for (let side = 0; side < 4; side++) for (let i = 0; i < S; i++) {
        const t = i / S;
        let x, y;
        if (side === 0) { x = x0 + (x1 - x0) * t; y = y0; }
        else if (side === 1) { x = x1; y = y0 + (y1 - y0) * t; }
        else if (side === 2) { x = x1 - (x1 - x0) * t; y = y1; }
        else { x = x0; y = y1 - (y1 - y0) * t; }
        const u = (side * S + i) / M;
        const h = k >= 3 ? H[k] * (0.45 + 1.1 * vnoise(u * 11 + k * 3.7, k * 1.3)) : H[k];
        pos.push(x, h, -y); uv.push(x / 12, y / 12);
      }
    }
    for (let k = 0; k < O.length - 1; k++) for (let i = 0; i < M; i++) {
      const a = k * M + i, b = k * M + (i + 1) % M, c = (k + 1) * M + i, d = (k + 1) * M + (i + 1) % M;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(128, 128);
    const base = hexRGB(th.outer), alt = th.waste ? hexRGB(th.waste) : hexRGB(th.rough2);
    for (let i = 0, p = 0; i < 128 * 128; i++, p += 4) {
      const x = i % 128, y = (i / 128) | 0;
      const c = mixRGB(base, alt, vnoise(x / 16, y / 16) * 0.5 * (vnoise((x % 128) / 8, (y % 128) / 8)));
      const n = (hash2(x, y) - 0.5) * 16;
      img.data[p] = c[0] + n; img.data[p + 1] = c[1] + n; img.data[p + 2] = c[2] + n; img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t }));
    m.receiveShadow = true;
    return m;
  }

  buildTrees(grp) {
    const byType = {};
    for (const t of this.trees) (byType[t.type] = byType[t.type] || []).push(t);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const snow = this.course.theme === 'alpine';
    const cone = () => new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
    const geos = {
      pine: cone(), cypress: cone(), oak: new THREE.IcosahedronGeometry(1, 1), maple: new THREE.IcosahedronGeometry(1, 1),
      birch: new THREE.IcosahedronGeometry(1, 1), palm: new THREE.ConeGeometry(1, 0.55, 9).translate(0, 0.1, 0),
      shrub: new THREE.IcosahedronGeometry(1, 0), gorse: new THREE.IcosahedronGeometry(1, 0), bush: new THREE.IcosahedronGeometry(1, 0),
      tallpine: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), dogwood: new THREE.IcosahedronGeometry(1, 1),
      magnolia: new THREE.IcosahedronGeometry(1, 1), azalea: new THREE.IcosahedronGeometry(1, 1),
    };
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 6).translate(0, 0.5, 0);
    for (const type in byType) {
      const list = byType[type], sp = TREE_SPEC[type];
      const canopy = new THREE.InstancedMesh(geos[type], new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
      canopy.castShadow = true;
      const trunk = sp.trunk ? new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: sp.trunk }), list.length) : null;
      if (trunk) trunk.castShadow = true;
      list.forEach((t, i) => {
        const c = Hole.canopy(t);
        Q.setFromAxisAngle(UPV, t.rot);
        let trunkTop;
        if (c.kind === 'cone') { V.set(t.x, t.gz + c.y0, -t.y); Sc.set(c.r, c.h, c.r); trunkTop = c.y0 + 0.6; }
        else if (c.kind === 'palm') { V.set(t.x, t.gz + c.cy, -t.y); Sc.set(c.rx, c.ry, c.rx); trunkTop = t.h; }
        else { V.set(t.x, t.gz + c.cy, -t.y); Sc.set(c.rx, c.ry, c.rx); trunkTop = c.cy; }
        M4.compose(V, Q, Sc); canopy.setMatrixAt(i, M4);
        col.set(t.col || sp.color).offsetHSL(t.tint * 0.3, 0, t.tint);
        canopy.setColorAt(i, col);
        if (trunk) {
          const tr = Math.max(t.trunkR, 0.05);
          V.set(t.x, t.gz - 0.2, -t.y); Sc.set(tr * 2, trunkTop + 0.2, tr * 2);
          M4.compose(V, Q, Sc); trunk.setMatrixAt(i, M4);
        }
      });
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
      grp.add(canopy); if (trunk) grp.add(trunk);
      if ((type === 'pine' || type === 'cypress') && snow) {
        const caps = new THREE.InstancedMesh(cone(), new THREE.MeshLambertMaterial({ color: 0xf4f8fb }), list.length);
        list.forEach((t, i) => {
          Q.setFromAxisAngle(UPV, t.rot);
          const hh = (t.h - t.trunkH) * 0.34;
          V.set(t.x, t.gz + t.h - hh + 0.02, -t.y); Sc.set(t.r * 0.36, hh, t.r * 0.36);
          M4.compose(V, Q, Sc); caps.setMatrixAt(i, M4);
        });
        caps.castShadow = true; grp.add(caps);
      }
    }
  }
  buildRocks(grp) {
    if (!this.rocks.length) return;
    const m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.rocks.length);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), col = new THREE.Color();
    this.rocks.forEach((r, i) => {
      Q.setFromEuler(E.set(r.rot * 0.3, r.rot, r.rot * 0.2));
      M4.compose(new THREE.Vector3(r.x, r.gz + r.r * 0.2, -r.y), Q, new THREE.Vector3(r.r, r.r * 0.7, r.r * 0.9));
      m.setMatrixAt(i, M4);
      col.setHSL(0.08, 0.06, 0.42 + (r.rot % 1) * 0.18); m.setColorAt(i, col);
    });
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }

  buildPin(grp) {
    const px = this.pin.x, py = this.pin.y, gz = this.heightAt(px, py);
    const pin = new THREE.Group();
    pin.position.set(px, gz, -py);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: 0x0b0d0c }));
    cup.rotation.x = -Math.PI / 2; cup.position.y = 0.012;
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.078, 24), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.013;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }));
    pole.position.y = 1.2; pole.castShadow = true;
    const fg = new THREE.PlaneGeometry(0.62, 0.42, 10, 4); fg.translate(0.31, 0, 0);
    const flag = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: this.theme.flag, side: THREE.DoubleSide }));
    flag.position.y = 2.17; flag.castShadow = true;
    this.flagBase = Float32Array.from(fg.attributes.position.array);
    pin.add(cup, rim, pole, flag);
    this.pinGroup = pin; this.flag = flag;
    grp.add(pin);
  }
  animateFlag(time, windAng, windMph) {
    if (!this.flag) return;
    const a = this.flag.geometry.attributes.position, b = this.flagBase, k = 0.03 + windMph * 0.004;
    for (let i = 0; i < a.count; i++) {
      const x = b[i * 3];
      a.array[i * 3 + 2] = Math.sin(time * (4 + windMph * 0.3) - x * 9) * k * x * 2.4;
    }
    a.needsUpdate = true;
    this.flag.geometry.computeVertexNormals();
    this.flag.rotation.y = -windAng + Math.PI / 2;
  }

  dispose() {
    if (!this.group) return;
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { if (m.map) m.map.dispose(); m.dispose(); }
    });
  }
}
Hole.RING_OFF = [0, 60, 150, 300, 600, 1200, 2500];
Hole._plans = {};

// Multiply a repeating grass-grain texture into a Lambert material so close-ups aren't mushy.
function addDetail(mat, detailTex, rx, ry) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detailTex };
    sh.uniforms.detailRepeat = { value: new THREE.Vector2(rx, ry) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailRepeat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 0.87 + 0.26 * texture2D(detailMap, vUv * detailRepeat).r;');
  };
}
function makeDetailTexture() {
  const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
  const R = mulberry32(99), v = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) v[i] = R();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = v[y * n + x], b = v[((y + 1) % n) * n + x], c = v[((y + 2) % n) * n + x];
    const g = 0.5 + ((a + b + c) / 3 - 0.5) * 1.6 + (vnoise(x / 16, y / 16) - 0.5) * 0.3;
    const p = (y * n + x) * 4, val = Math.max(0, Math.min(255, g * 255));
    img.data[p] = img.data[p + 1] = img.data[p + 2] = val; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
