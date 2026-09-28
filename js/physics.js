// Ball flight, bounce and roll, stepped live so spin can be added while the ball is moving.
// Course coordinates: x = right, y = down the hole, z = up (yards).
const Phys = (() => {
  const DT = 1 / 120;
  const KD = 0.0031;            // quadratic drag (1/yd)
  const KL = 0.0030;            // Magnus lift per unit club spin
  const LIFT_DECAY = Math.exp(-DT / 7);
  const CUP_R = 0.068;          // capture radius for the ball centre
  const SIDE_K = 0.03;          // in-flight sidespin: sideways accel per unit speed
  const BACK_K = 0.00045;       // in-flight back/top spin: extra lift per speed^2
  const REST = { green: 0.15, fringe: 0.22, fairway: 0.32, tee: 0.32, rough: 0.14, waste: 0.08, bunker: 0.02 };
  const KEEP = { green: 0.6, fringe: 0.6, fairway: 0.62, tee: 0.62, rough: 0.4, waste: 0.3, bunker: 0.06 };
  const CHECK = { green: 1, fringe: 0.8, fairway: 0.65, tee: 0.65, rough: 0.15, waste: 0, bunker: 0 };
  const ROLL = { green: 0.105, fringe: 0.19, fairway: 0.24, tee: 0.24, rough: 0.45, waste: 0.65, bunker: 1.8 };

  const FLAT = {
    heightAt: () => 0, gradAt: () => [0, 0], surfaceAt: () => 'fairway',
    waterLevelAt: () => -1e9, treeHit: null, pin: null,
  };

  // s: {x,y,z, aim, launch, speed, lift, tilt, check, wind:{x,y}, air, putt, carryOnly, noTrees, maxRoll}
  function start(hole, s) {
    const b = {
      hole, s, pts: [], t: 0, done: false, rolling: !!s.putt, bounces: 0, lipped: false, rollT: 0,
      x: s.x, y: s.y, z: s.z + (s.putt ? 0 : 0.03), vx: 0, vy: 0, vz: 0,
      lift: s.lift || 0, hitTrees: new Set(), ctl: { side: 0, back: 0 },
      pinX: hole.pin ? hole.pin.x : 1e9, pinY: hole.pin ? hole.pin.y : 1e9,
      res: { type: 'rest', carry: 0, apex: 0, events: [], landed: false },
    };
    const sinA = Math.sin(s.aim), cosA = Math.cos(s.aim);
    if (b.rolling) { b.vx = s.speed * sinA; b.vy = s.speed * cosA; b.rdx = sinA; b.rdy = cosA; }
    else {
      const cl = Math.cos(s.launch), sl = Math.sin(s.launch);
      b.vx = s.speed * cl * sinA; b.vy = s.speed * cl * cosA; b.vz = s.speed * sl;
    }
    // Spin axis: backspin axis points to the golfer's right; tilting it curves the ball (+ = right).
    const tilt = s.tilt || 0;
    b.ax = cosA * Math.cos(tilt); b.ay = -sinA * Math.cos(tilt); b.az = -Math.sin(tilt);
    b.startZ = b.z;
    b.pts.push(b.x, b.y, b.z, 0);
    return b;
  }
  const push = (b) => b.pts.push(b.x, b.y, b.z, b.t);
  function finish(b, type) {
    const r = b.res;
    r.type = type; r.x = b.x; r.y = b.y; r.z = b.z;
    r.total = Math.hypot(b.x - b.s.x, b.y - b.s.y);
    r.pts = b.pts; r.duration = b.t;
    if (!r.carry) r.carry = r.total;
    b.done = true;
  }
  function sink(b) {
    const sx = b.x, sy = b.y, sz = b.z;
    for (let i = 1; i <= 12; i++) {
      const k = i / 12;
      b.x = sx + (b.pinX - sx) * k; b.y = sy + (b.pinY - sy) * k; b.z = sz - 0.09 * k * k; b.t += DT; push(b);
    }
    finish(b, 'hole');
  }

  function flightStep(b) {
    const s = b.s, hole = b.hole, c = b.ctl;
    const wx = s.wind ? s.wind.x : 0, wy = s.wind ? s.wind.y : 0, kd = KD * (s.air || 1);
    const rx = b.vx - wx, ry = b.vy - wy, rz = b.vz;
    const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const cx = b.ay * rz - b.az * ry, cy = b.az * rx - b.ax * rz, cz = b.ax * ry - b.ay * rx;
    const hv = Math.hypot(b.vx, b.vy) || 1, rtx = b.vy / hv, rty = -b.vx / hv;
    const side = c.side * SIDE_K * sp, up = b.bounces === 0 ? c.back * BACK_K * sp * sp : 0;
    b.vx += (-kd * sp * rx + b.lift * sp * cx + side * rtx) * DT;
    b.vy += (-kd * sp * ry + b.lift * sp * cy + side * rty) * DT;
    b.vz += (-G - kd * sp * rz + b.lift * sp * cz + up) * DT;
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.t += DT;
    b.lift *= LIFT_DECAY;
    if (b.bounces === 0 && b.z - b.startZ > b.res.apex) b.res.apex = b.z - b.startZ;

    if (!s.noTrees && hole.treeHit) {
      const hit = hole.treeHit(b.x, b.y, b.z, b.hitTrees);
      if (hit === 'canopy') {
        const k = 0.25 + Math.random() * 0.2;
        b.vx = b.vx * k + (Math.random() - 0.5) * 5; b.vy = b.vy * k + (Math.random() - 0.5) * 5; b.vz = b.vz * k - Math.random() * 2;
        b.lift = 0; b.res.events.push({ t: b.t, type: 'tree' });
      } else if (hit && hit.trunk) {
        const d = b.vx * hit.nx + b.vy * hit.ny;
        if (d < 0) { b.vx = (b.vx - 2 * d * hit.nx) * 0.4; b.vy = (b.vy - 2 * d * hit.ny) * 0.4; }
        b.lift = 0; b.res.events.push({ t: b.t, type: 'tree' });
      }
    }

    if (b.vz < 0 && b.z <= hole.waterLevelAt(b.x, b.y)) { push(b); return finish(b, 'water'); }
    const gh = hole.heightAt(b.x, b.y);
    if (b.z <= gh) {
      b.z = gh;
      const r = b.res;
      if (s.carryOnly) { r.carry = Math.hypot(b.x - s.x, b.y - s.y); r.landX = b.x; r.landY = b.y; push(b); return finish(b, 'carry'); }
      const surf = hole.surfaceAt(b.x, b.y);
      if (b.bounces === 0) { r.carry = Math.hypot(b.x - s.x, b.y - s.y); r.landX = b.x; r.landY = b.y; r.landSurf = surf; r.landed = true; }
      r.events.push({ t: b.t, type: 'land', surf });
      if (surf === 'ob') { push(b); return finish(b, 'ob'); }
      if (surf === 'water') { push(b); return finish(b, 'water'); }
      if (Math.hypot(b.x - b.pinX, b.y - b.pinY) < CUP_R * 1.6 && b.vz > -26) return sink(b);
      const [hx, hy] = hole.gradAt(b.x, b.y);
      let nx = -hx, ny = -hy, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
      const e = REST[surf] ?? 0.2, cf = CHECK[surf] ?? 0;
      let keep = KEEP[surf] ?? 0.6;
      const chk = ((s.check || 0) + Math.max(0, c.back) * 1.1) * cf;
      if (c.back < 0) keep *= 1 - c.back * 0.35 * Math.max(cf, 0.3);      // topspin releases forward
      if (b.bounces === 0) keep *= Math.max(-0.35, 1 - chk);
      else if (b.bounces === 1) keep *= Math.max(0.2, 1 - chk * 0.45);
      b.vx = tx * keep - vn * e * nx; b.vy = ty * keep - vn * e * ny; b.vz = tz * keep - vn * e * nz;
      // sidespin grabs on landing
      const kick = c.side * 2.6 * Math.max(cf, 0.2);
      b.vx += rtx * kick; b.vy += rty * kick;
      b.bounces++;
      b.lift = 0;
      b.z = gh + 0.002;
      if (-vn * e < 1.6) {
        b.rolling = true; b.vz = 0;
        const h2 = Math.hypot(b.vx, b.vy);
        if (h2 > 0.01) { b.rdx = b.vx / h2; b.rdy = b.vy / h2; } else { b.rdx = Math.sin(s.aim); b.rdy = Math.cos(s.aim); }
      }
    }
    push(b);
  }

  function rollStep(b) {
    const hole = b.hole, c = b.ctl;
    const surf = hole.surfaceAt(b.x, b.y);
    if (surf === 'water') return finish(b, 'water');
    if (surf === 'ob') return finish(b, 'ob');
    const mu = ROLL[surf] ?? 0.2, muG = mu * G;
    const [hx, hy] = hole.gradAt(b.x, b.y);
    let ax = -G * hx * 0.714, ay = -G * hy * 0.714;
    const slopeAcc = Math.hypot(ax, ay);
    // leftover spin: backspin pulls the ball back along its line, topspin pushes it on, sidespin drifts it
    const decay = Math.exp(-b.rollT / 1.4), grip = Math.min(1, (CHECK[surf] ?? 0) + 0.25);
    const along = (-Math.max(0, c.back) * 3.2 - Math.min(0, c.back) * 1.8) * decay * grip;
    const sideA = c.side * 1.4 * decay * grip;
    ax += b.rdx * along + b.rdy * sideA; ay += b.rdy * along - b.rdx * sideA;
    const spinAcc = Math.abs(along) + Math.abs(sideA);
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 0.04 && slopeAcc + spinAcc < muG) return finish(b, 'rest');
    if (sp > 1e-6) { ax -= muG * b.vx / sp; ay -= muG * b.vy / sp; }
    const nvx = b.vx + ax * DT, nvy = b.vy + ay * DT;
    if (sp < 0.4 && nvx * b.vx + nvy * b.vy < 0 && slopeAcc + spinAcc < muG) return finish(b, 'rest');
    b.vx = nvx; b.vy = nvy;
    b.x += b.vx * DT; b.y += b.vy * DT; b.t += DT; b.rollT += DT;
    b.z = hole.heightAt(b.x, b.y);
    const dp = Math.hypot(b.x - b.pinX, b.y - b.pinY);
    if (dp < CUP_R) {
      const spd = Math.hypot(b.vx, b.vy);
      if (spd < 1.9) return sink(b);
      if (!b.lipped) {
        b.lipped = true;
        const a = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5), cs = Math.cos(a), sn = Math.sin(a), k = 0.55;
        const ox = b.vx; b.vx = (b.vx * cs - b.vy * sn) * k; b.vy = (ox * sn + b.vy * cs) * k;
        b.res.events.push({ t: b.t, type: 'lip' });
      }
    } else if (dp > CUP_R * 2.5) b.lipped = false;
    push(b);
    if (b.rollT > (b.s.maxRoll || 30)) finish(b, 'rest');
  }

  function step(b) {
    if (b.done) return false;
    if (b.rolling) rollStep(b); else if (b.t < 30) flightStep(b); else finish(b, 'rest');
    return !b.done;
  }
  function simulate(hole, s) {
    const b = start(hole, s);
    for (let i = 0; i < 12000 && step(b); i++);
    if (!b.done) finish(b, 'rest');
    return b.res;
  }

  // Build speed->carry tables so meter power maps linearly to carry distance.
  function calibrate(clubs) {
    for (const c of clubs) {
      if (c.putter) continue;
      const table = [[0, 0]];
      for (let sp = 6; sp <= 130; sp += 2) {
        const r = simulate(FLAT, { x: 0, y: 0, z: 0, aim: 0, launch: c.launch * Math.PI / 180, speed: sp, lift: KL * c.spin, carryOnly: true, noTrees: true });
        table.push([sp, r.carry]);
      }
      c.table = table;
    }
  }
  // speed -> carry table for a custom launch/lift (used for high and low shots so power still means carry)
  function buildTable(launchDeg, lift) {
    const table = [[0, 0]];
    for (let sp = 6; sp <= 130; sp += 2) {
      const r = simulate(FLAT, { x: 0, y: 0, z: 0, aim: 0, launch: launchDeg * Math.PI / 180, speed: sp, lift, carryOnly: true, noTrees: true });
      table.push([sp, r.carry]);
    }
    return table;
  }
  function speedForCarry(club, carry, table) {
    const t = table || club.table;
    for (let i = 1; i < t.length; i++) {
      if (t[i][1] >= carry) {
        const [s0, c0] = t[i - 1], [s1, c1] = t[i];
        return s0 + (s1 - s0) * (carry - c0) / (c1 - c0);
      }
    }
    return t[t.length - 1][0];
  }
  function puttSpeed(dist) { return Math.sqrt(2 * ROLL.green * G * dist); }

  return { start, step, simulate, calibrate, speedForCarry, buildTable, puttSpeed, KL, DT, ROLL, CUP_R, FLAT };
})();

if (typeof module !== 'undefined') module.exports = { Phys };
