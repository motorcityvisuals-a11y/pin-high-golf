// Low-poly golfer built in metres, scaled to yards. Faces local +Z; target is local +X (golfer's left).
const Golfer = (() => {
  const UP = new THREE.Vector3(0, 1, 0);
  const TILT = 0.5; // forward spine bend at address

  function cyl(a, b, ra, rb, mat, seg = 10) {
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, len, seg), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.castShadow = true;
    return m;
  }
  function mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lerpPose = (a, b, t) => ({ arm: a.arm + (b.arm - a.arm) * t, turn: a.turn + (b.turn - a.turn) * t, hinge: a.hinge + (b.hinge - a.hinge) * t, hip: a.hip + (b.hip - a.hip) * t });
  const ADDRESS = { arm: 0, turn: 0, hinge: 0, hip: 0 };

  function create(outfit) {
    const L = (c) => new THREE.MeshLambertMaterial({ color: c });
    const mats = {
      shirt: L(outfit.shirt), pants: L(outfit.pants), skin: L(outfit.skin), shoes: L(outfit.shoes),
      hat: L(outfit.hatColor), hair: L(outfit.hair), glove: L('#f7f7f2'), belt: L('#23201d'),
      sock: L('#fbfbf8'), eye: L('#1a1a1a'), sole: L('#e9e9e4'),
    };
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    root.scale.setScalar(1 / YD);

    const legs = new THREE.Group(); body.add(legs);
    const hips = new THREE.Group(); hips.position.set(0, 0.92, 0); body.add(hips);
    const spine = new THREE.Group(); spine.rotation.x = TILT; hips.add(spine);

    // torso
    const pelvis = mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.18, 12), mats.pants, 0, 0, 0); pelvis.scale.z = 0.75;
    const belt = mesh(new THREE.CylinderGeometry(0.173, 0.173, 0.04, 12), mats.belt, 0, 0.09, 0); belt.scale.z = 0.76;
    const torso = mesh(new THREE.CylinderGeometry(0.21, 0.172, 0.46, 12), mats.shirt, 0, 0.33, 0); torso.scale.z = 0.68;
    const yoke = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.44, 10), mats.shirt, 0, 0.54, 0); yoke.rotation.z = Math.PI / 2;
    const collar = mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.05, 12), mats.shirt, 0, 0.6, 0.01);
    const neck = mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.1, 10), mats.skin, 0, 0.63, 0.015);
    spine.add(pelvis, belt, torso, yoke, collar, neck);

    const head = new THREE.Group(); head.position.set(0, 0.74, 0.025); head.rotation.x = 0.35; spine.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.105, 18, 14), mats.skin); skull.scale.set(0.95, 1.06, 1);
    const nose = mesh(new THREE.SphereGeometry(0.018, 8, 6), mats.skin, 0, -0.012, 0.1);
    const eyeL = mesh(new THREE.SphereGeometry(0.012, 8, 6), mats.eye, 0.036, 0.018, 0.093);
    const eyeR = mesh(new THREE.SphereGeometry(0.012, 8, 6), mats.eye, -0.036, 0.018, 0.093);
    const earL = mesh(new THREE.SphereGeometry(0.024, 8, 6), mats.skin, 0.1, 0, 0);
    const earR = mesh(new THREE.SphereGeometry(0.024, 8, 6), mats.skin, -0.1, 0, 0);
    const hair = mesh(new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), mats.hair, 0, 0.008, -0.012);
    hair.rotation.x = -0.25;
    head.add(skull, nose, eyeL, eyeR, earL, earR, hair);
    const hatGroup = new THREE.Group(); head.add(hatGroup);

    // shoulders -> turn -> swing arc -> hands -> club
    const shoulders = new THREE.Group(); shoulders.position.set(0, 0.5, 0.02); spine.add(shoulders);
    const swing = new THREE.Group(); shoulders.add(swing);
    const H = V(0, -0.52, 0.3);
    for (const sx of [1, -1]) {
      const S = V(sx * 0.19, 0, 0), E = new THREE.Vector3().lerpVectors(S, H, 0.36), Hs = V(sx * 0.015, H.y, H.z);
      swing.add(cyl(S, E, 0.06, 0.054, mats.shirt), cyl(E, Hs, 0.047, 0.039, mats.skin));
      swing.add(mesh(new THREE.SphereGeometry(0.061, 10, 8), mats.shirt, S.x, S.y, S.z));
    }
    const hands = new THREE.Group(); hands.position.copy(H); swing.add(hands);
    hands.add(mesh(new THREE.SphereGeometry(0.047, 10, 8), mats.glove, 0.01, 0.02, 0));
    hands.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.skin, -0.005, -0.045, 0.01));
    const clubGroup = new THREE.Group(); hands.add(clubGroup);

    const g = { root, mats, pose: { ...ADDRESS }, anim: null, clubHead: V(0, 0, 0.8), club: null };

    function buildLegs() {
      while (legs.children.length) { const c = legs.children.pop(); c.geometry.dispose(); }
      const shorts = g.outfit.bottoms === 'shorts';
      for (const sx of [1, -1]) {
        const hip = V(sx * 0.1, 0.93, 0), knee = V(sx * 0.14, 0.5, 0.07), ankle = V(sx * 0.17, 0.09, 0);
        legs.add(cyl(hip, knee, 0.088, 0.066, mats.pants));
        legs.add(mesh(new THREE.SphereGeometry(0.066, 10, 8), shorts ? mats.skin : mats.pants, knee.x, knee.y, knee.z));
        if (shorts) {
          const sockTop = V(ankle.x, ankle.y + 0.13, ankle.z + 0.02);
          legs.add(cyl(knee, sockTop, 0.06, 0.052, mats.skin));
          legs.add(cyl(sockTop, ankle, 0.052, 0.05, mats.sock));
        } else legs.add(cyl(knee, ankle, 0.064, 0.056, mats.pants));
        legs.add(mesh(new THREE.BoxGeometry(0.11, 0.075, 0.27), mats.shoes, ankle.x, 0.05, 0.05));
        legs.add(mesh(new THREE.BoxGeometry(0.114, 0.022, 0.275), mats.sole, ankle.x, 0.012, 0.05));
      }
    }
    function buildHat() {
      while (hatGroup.children.length) { const c = hatGroup.children.pop(); c.geometry.dispose(); }
      const s = g.outfit.hat, m = mats.hat;
      const brim = (r, z, tilt) => { const b = mesh(new THREE.CylinderGeometry(r, r, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.03, z); b.rotation.x = tilt; return b; };
      if (s === 'cap') {
        hatGroup.add(mesh(new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.02, 0));
        hatGroup.add(brim(0.1, 0.06, -0.12));
        hatGroup.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), m, 0, 0.135, 0));
      } else if (s === 'visor') {
        const band = mesh(new THREE.TorusGeometry(0.107, 0.02, 6, 24), m, 0, 0.035, 0); band.rotation.x = Math.PI / 2;
        hatGroup.add(band, brim(0.1, 0.06, -0.12));
      } else if (s === 'bucket') {
        hatGroup.add(mesh(new THREE.CylinderGeometry(0.1, 0.118, 0.11, 18), m, 0, 0.075, 0));
        hatGroup.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.012, 22), m, 0, 0.022, 0));
      } else if (s === 'beanie') {
        const b = mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m, 0, 0.0, 0); b.scale.y = 1.12;
        hatGroup.add(b, mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.045, 18), m, 0, 0.005, 0));
        hatGroup.add(mesh(new THREE.SphereGeometry(0.036, 10, 8), m, 0, 0.145, 0));
      }
      hair.visible = s !== 'beanie' && s !== 'bucket';
    }

    g.setOutfit = (o) => {
      const prev = g.outfit || {};
      g.outfit = { ...o };
      mats.shirt.color.set(o.shirt); mats.pants.color.set(o.pants); mats.skin.color.set(o.skin);
      mats.shoes.color.set(o.shoes); mats.hat.color.set(o.hatColor); mats.hair.color.set(o.hair);
      if (prev.bottoms !== o.bottoms) buildLegs();
      if (prev.hat !== o.hat) buildHat();
    };

    g.setPose = (p) => {
      g.pose = p;
      swing.rotation.z = p.arm;
      shoulders.rotation.y = p.turn;
      clubGroup.rotation.z = p.hinge;
      hips.rotation.y = p.hip;
    };

    // Build a club so its head rests exactly on the ground at address, and remember where.
    g.setClub = (club, brand) => {
      g.club = club;
      while (clubGroup.children.length) clubGroup.children.pop().traverse(o => o.geometry && o.geometry.dispose());
      const saveP = root.position.clone(), saveQ = root.quaternion.clone(), saveS = root.scale.clone();
      root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.setScalar(1);
      const savePose = g.pose; g.setPose(ADDRESS);
      root.updateMatrixWorld(true);
      const hw = hands.getWorldPosition(new THREE.Vector3());
      const fwdBall = club.type === 'driver' ? 0.1 : club.type === 'wood' ? 0.06 : club.putter ? 0.02 : 0.03;
      const B = V(hw.x + fwdBall, club.type === 'driver' ? 0.045 : 0.03, hw.z + club.reach);
      const lb = hands.worldToLocal(B.clone());
      const handQ = hands.getWorldQuaternion(new THREE.Quaternion()).invert();
      const top = lb.clone().normalize().multiplyScalar(-0.07);
      const steel = new THREE.MeshLambertMaterial({ color: club.cat === 'woods' ? brand.shaft : '#c9cdd2' });
      const gripM = new THREE.MeshLambertMaterial({ color: '#161616' });
      const headM = new THREE.MeshPhongMaterial({ color: brand.head, shininess: 70, specular: 0x777777 });
      const accM = new THREE.MeshLambertMaterial({ color: brand.accent });
      const gripEnd = lb.clone().normalize().multiplyScalar(0.2);
      clubGroup.add(cyl(top, gripEnd, 0.014, 0.012, gripM, 8));
      clubGroup.add(cyl(gripEnd.clone().multiplyScalar(0.98), gripEnd.clone().multiplyScalar(1.12), 0.0125, 0.0125, accM, 8));
      clubGroup.add(cyl(gripEnd, lb, 0.007, 0.005, steel, 6));
      let head;
      if (club.type === 'driver' || club.type === 'wood' || club.type === 'hybrid') {
        const r = club.type === 'driver' ? 0.062 : club.type === 'wood' ? 0.048 : 0.04;
        head = new THREE.Group();
        const shell = mesh(new THREE.SphereGeometry(r, 16, 10), headM); shell.scale.set(0.95, 0.55, 1.2);
        const stripe = mesh(new THREE.BoxGeometry(r * 0.25, r * 0.08, r * 1.6), accM, 0, r * 0.3, 0);
        head.add(shell, stripe);
        head.position.copy(lb).add(V(0, 0, 0));
      } else if (club.putter) {
        head = new THREE.Group();
        head.add(mesh(new THREE.BoxGeometry(0.03, 0.024, 0.11), headM));
        head.add(mesh(new THREE.BoxGeometry(0.031, 0.004, 0.02), accM, 0, 0.013, 0));
        head.position.copy(lb);
      } else {
        head = new THREE.Group();
        const h = club.type === 'wedge' ? 0.052 : 0.046;
        head.add(mesh(new THREE.BoxGeometry(0.014, h, 0.078), headM, 0, 0, 0.02));
        head.add(mesh(new THREE.BoxGeometry(0.016, 0.008, 0.03), accM, -0.004, -h * 0.3, 0.03));
        head.position.copy(lb);
      }
      head.quaternion.copy(handQ);
      clubGroup.add(head);
      g.clubHead = B;       // metres, root-local
      g.setPose(savePose);
      root.position.copy(saveP); root.quaternion.copy(saveQ); root.scale.copy(saveS);
    };

    // Stand so the clubhead sits on the ball. ballW = world Vector3, aim = course heading.
    g.placeAt = (ballW, aim) => {
      const fx = Math.cos(aim), fy = -Math.sin(aim);         // golfer faces the target line's right side
      root.rotation.set(0, Math.atan2(fx, -fy), 0);
      const off = g.clubHead.clone().multiplyScalar(1 / YD).applyEuler(root.rotation);
      root.position.set(ballW.x - off.x, ballW.y - off.y + 0.005, ballW.z - off.z);
    };

    // ---- swing animation ----
    const topPose = (p, putter) => putter
      ? { arm: -(0.06 + 0.42 * p), turn: -0.04 * p, hinge: 0, hip: 0 }
      : { arm: -(0.35 + 1.85 * p), turn: -(0.25 + 0.95 * p), hinge: -(0.2 + 1.25 * p), hip: -0.3 * p };
    const impactPose = (putter) => putter ? { arm: 0, turn: 0, hinge: 0, hip: 0 } : { arm: 0.04, turn: 0.2, hinge: 0, hip: 0.35 };
    const finishPose = (p, putter) => putter
      ? { arm: 0.08 + 0.46 * p, turn: 0.05 * p, hinge: 0, hip: 0 }
      : { arm: 0.9 + 1.4 * p, turn: 0.6 + 0.9 * p, hinge: 0.3 + 1.1 * p, hip: 0.4 + 0.5 * p };

    g.backswing = (p) => { g.anim = null; g.setPose(topPose(p, g.club && g.club.putter)); g.topP = p; };
    g.downswing = (onImpact) => {
      const putter = g.club && g.club.putter, p = g.topP ?? 0.8;
      g.anim = { t: 0, from: { ...g.pose }, impact: impactPose(putter), finish: finishPose(p, putter),
        down: putter ? 0.32 + p * 0.1 : 0.2, follow: putter ? 0.45 : 0.55, onImpact, fired: false, hold: 0 };
    };
    g.practice = () => {
      g.topP = 0.85; const from = { ...ADDRESS };
      g.anim = { t: 0, practice: true, from, top: topPose(0.85, false), impact: impactPose(false), finish: finishPose(0.85, false) };
    };
    g.address = () => { g.anim = null; g.setPose(ADDRESS); };
    g.update = (dt) => {
      const a = g.anim; if (!a) return;
      a.t += dt;
      if (a.practice) {
        const T = [0.9, 0.2, 0.55, 1.2, 0.6];
        let t = a.t;
        if (t < T[0]) { const k = t / T[0]; g.setPose(lerpPose(a.from, a.top, 1 - (1 - k) * (1 - k))); return; } t -= T[0];
        if (t < T[1]) { const k = t / T[1]; g.setPose(lerpPose(a.top, a.impact, k * k)); return; } t -= T[1];
        if (t < T[2]) { const k = t / T[2]; g.setPose(lerpPose(a.impact, a.finish, 1 - (1 - k) ** 3)); return; } t -= T[2];
        if (t < T[3]) return; t -= T[3];
        if (t < T[4]) { const k = t / T[4]; g.setPose(lerpPose(a.finish, ADDRESS, k * k * (3 - 2 * k))); return; }
        g.anim = null; g.setPose(ADDRESS); return;
      }
      if (a.t < a.down) { const k = a.t / a.down; g.setPose(lerpPose(a.from, a.impact, k * k)); return; }
      if (!a.fired) { a.fired = true; g.setPose(a.impact); if (a.onImpact) a.onImpact(); }
      const k = Math.min(1, (a.t - a.down) / a.follow);
      g.setPose(lerpPose(a.impact, a.finish, 1 - (1 - k) ** 3));
      if (k >= 1) g.anim = null;
    };

    g.setOutfit(outfit);
    return g;
  }
  return { create };
})();
