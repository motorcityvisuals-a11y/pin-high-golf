// Game controller: rendering, menus, shot flow, camera, HUD, minimap, scorecard and sound.
(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---------------- persistence ----------------
  const store = {
    load(k, d) { try { const v = localStorage.getItem('pinhigh.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    save(k, v) { try { localStorage.setItem('pinhigh.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const saved = store.load('settings', {});
  const settings = {
    course: COURSES.some(c => c.id === saved.course) ? saved.course : COURSES[0].id,
    time: TIMES[saved.time] ? saved.time : 'day',
    outfit: Object.assign({}, DEFAULT_OUTFIT, saved.outfit || {}),
    bag: Object.assign({ woods: 'kestrel', irons: 'tidewater', wedges: 'solstice', putter: 'ironclad' }, saved.bag || {}),
    sound: saved.sound !== false,
    fans: saved.fans !== false,
    name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 14) : 'You',
  };
  const saveSettings = () => store.save('settings', settings);
  const bests = store.load('bests', {});
  const brandOf = (club) => BRANDS.find(b => b.id === settings.bag[club.cat]) || BRANDS[1];

  Phys.calibrate(CLUBS);

  // ---------------- renderer / scene ----------------
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe2f3, 300, 2200);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 7000);
  const detailTex = makeDetailTexture();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 520 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = V3(0, 1, 0);
  const lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff1d0, 0, 320, 1); scene.add(l); return l; });

  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: V3() }, sunCol: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0); vec3 c = mix(bottom, top, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0); c += sunCol * (smoothstep(0.9993, 0.9996, s) * 1.2 + pow(s, 14.0) * 0.28);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMat);
  sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);
  const starPos = [];
  for (let i = 0; i < 1600; i++) {
    const y = 0.04 + 0.96 * Math.random(), r = Math.sqrt(1 - y * y), a = Math.random() * Math.PI * 2;
    starPos.push(Math.cos(a) * r * 4800, y * 4800, Math.sin(a) * r * 4800);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);

  // ball, shadow blob, tee peg, trail, aim ring and arc
  // A real golf ball: dimpled cover, printed logo and an alignment line, rolling as it moves.
  const BALL_R = 0.013;           // yards
  function makeBallTextures() {
    const W = 512, H = 256, cv = document.createElement('canvas'), bc = document.createElement('canvas');
    cv.width = bc.width = W; cv.height = bc.height = H;
    const x = cv.getContext('2d'), b = bc.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    b.fillStyle = '#ffffff'; b.fillRect(0, 0, W, H);
    // dimples in rings of latitude, spaced so they stay round on the sphere
    for (let row = 0; row < 18; row++) {
      const lat = (row + 0.5) / 18 * Math.PI, n = Math.max(1, Math.round(36 * Math.sin(lat)));
      const y = (row + 0.5) / 18 * H, off = (row % 2) * 0.5;
      for (let k = 0; k < n; k++) {
        const cx = (k + off) / n * W, rx = W / n * 0.42, ry = H / 18 * 0.42;
        for (const dx of [0, -W, W]) {
          const g = b.createRadialGradient(cx + dx, y, 0, cx + dx, y, Math.max(rx, ry));
          g.addColorStop(0, '#6a6a6a'); g.addColorStop(0.75, '#bdbdbd'); g.addColorStop(1, '#ffffff');
          b.fillStyle = g; b.beginPath(); b.ellipse(cx + dx, y, rx, ry, 0, 0, 6.283); b.fill();
          x.fillStyle = 'rgba(0,0,0,0.035)'; x.beginPath(); x.ellipse(cx + dx, y, rx * 0.9, ry * 0.9, 0, 0, 6.283); x.fill();
        }
      }
    }
    // alignment line around the equator and a printed logo
    x.fillStyle = '#1b1d22'; x.fillRect(0, H / 2 - 2, W * 0.36, 4); x.fillRect(W * 0.64, H / 2 - 2, W * 0.36, 4);
    x.font = 'italic 800 30px "Saira Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#c8102e'; x.fillText('PIN HIGH', W / 2, H / 2 - 2);
    x.font = '700 16px "Saira Condensed", sans-serif'; x.fillStyle = '#1b1d22'; x.fillText('1', W * 0.25, H * 0.3);
    return { map: new THREE.CanvasTexture(cv), bump: new THREE.CanvasTexture(bc) };
  }
  const ballTex = makeBallTextures();
  const ballMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: ballTex.map, bumpMap: ballTex.bump, bumpScale: 0.0025, shininess: 90, specular: 0x999999 });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 36, 24), ballMat);
  ballMesh.castShadow = true; scene.add(ballMesh);
  const ballPrev = V3(), _roll = new THREE.Quaternion(), _axis = V3();
  let ballPrevOk = false;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.06, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; scene.add(blob);
  const teePeg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.06, 8), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
  scene.add(teePeg);
  const TRAIL_MAX = 1500;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
  const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  const trail = new THREE.Line(trailGeo, trailMat); trail.frustumCulled = false; scene.add(trail);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide });
  const ring = new THREE.Group();
  const ringA = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56), ringMat);
  const ringB = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthTest: false }));
  const ringC = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.13, 20), ringMat);
  for (const m of [ringA, ringB, ringC]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 10; ring.add(m); }
  scene.add(ring);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
  const arcMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.85, depthTest: false });
  const arc = new THREE.Line(arcGeo, arcMat); arc.frustumCulled = false; arc.renderOrder = 9; scene.add(arc);

  // ball tracer: a camera-facing ribbon rebuilt each frame from the flight path
  const TR_MAX = 800;
  const trPos = new Float32Array(TR_MAX * 6), trCol = new Float32Array(TR_MAX * 6), trIdx = new Uint16Array((TR_MAX - 1) * 6);
  for (let i = 0; i < TR_MAX - 1; i++) { const a = i * 2; trIdx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
  tracerGeo.setIndex(new THREE.BufferAttribute(trIdx, 1));
  tracerGeo.setDrawRange(0, 0);
  const tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  tracer.frustumCulled = false; tracer.renderOrder = 8; scene.add(tracer);
  const trPts = [];
  const _t = V3(), _c = V3(), _s = V3(), UPV = V3(0, 1, 0);
  function clearTracer() { trPts.length = 0; tracerGeo.setDrawRange(0, 0); }
  function drawTracer(putt) {
    const n = Math.min(trPts.length, TR_MAX);
    if (n < 2) { tracerGeo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = trPts[i], a = trPts[Math.max(0, i - 1)], b = trPts[Math.min(n - 1, i + 1)], k = i / (n - 1);
      _t.subVectors(b, a); _c.subVectors(camera.position, p);
      if (putt) _s.crossVectors(_t, UPV); else _s.crossVectors(_t, _c);
      const w = putt ? 0.022 : clamp(_c.length() * 0.0026, 0.025, 1.4) * (0.35 + 0.65 * k);
      _s.multiplyScalar(w / (_s.length() || 1));
      trPos.set([p.x + _s.x, p.y + _s.y, p.z + _s.z, p.x - _s.x, p.y - _s.y, p.z - _s.z], i * 6);
      const g = 0.7 + 0.3 * k, bl = 0.2 + 0.8 * k;
      trCol.set([1, g, bl, 1, g, bl], i * 6);
    }
    tracerGeo.attributes.position.needsUpdate = true; tracerGeo.attributes.color.needsUpdate = true;
    tracerGeo.setDrawRange(0, (n - 1) * 6);
  }

  // green reading: particles drifting downhill across the green
  const FLOW_N = 240, flowPos = new Float32Array(FLOW_N * 3), flow = [];
  const flowGeo = new THREE.BufferGeometry(); flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
  const dotTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(cv);
  })();
  const flowPts = new THREE.Points(flowGeo, new THREE.PointsMaterial({ color: 0xffffff, map: dotTex, size: 0.07, transparent: true, opacity: 0.95, depthWrite: false }));
  flowPts.frustumCulled = false; flowPts.visible = false; scene.add(flowPts);
  function spawnFlow(p) {
    const e = G.hole.green;
    for (let k = 0; k < 20; k++) {
      const x = e.cx + (Math.random() * 2 - 1) * e.maxR, y = e.cy + (Math.random() * 2 - 1) * e.maxR;
      if (ellD(e, x, y) < 1.05) { p.x = x; p.y = y; p.life = 1.2 + Math.random() * 2.2; return; }
    }
    p.life = 0.1;
  }
  function updateFlow(dt) {
    const h = G.hole;
    if (!flow.length) for (let i = 0; i < FLOW_N; i++) { flow.push({ x: 0, y: 0, life: 0 }); }
    for (let i = 0; i < FLOW_N; i++) {
      const p = flow[i];
      p.life -= dt;
      if (p.life <= 0 || ellD(h.green, p.x, p.y) > 1.1) spawnFlow(p);
      const [hx, hy] = h.gradAt(p.x, p.y);
      p.x -= hx * 28 * dt; p.y -= hy * 28 * dt;
      flowPos[i * 3] = p.x; flowPos[i * 3 + 1] = h.heightAt(p.x, p.y) + 0.04; flowPos[i * 3 + 2] = -p.y;
    }
    flowGeo.attributes.position.needsUpdate = true;
  }

  // EA-style putting: triangle aim marker + the "putt read" line showing the path into the cup.
  const triMarker = (() => {
    const g = new THREE.Group();
    const tri = new THREE.Shape([new THREE.Vector2(0, 0.26), new THREE.Vector2(-0.17, -0.12), new THREE.Vector2(0.17, -0.12)]);
    const inner = new THREE.Shape([new THREE.Vector2(0, 0.17), new THREE.Vector2(-0.1, -0.06), new THREE.Vector2(0.1, -0.06)]);
    const mk = (shape, color, y) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 11; return m; };
    g.add(mk(tri, 0x0b1f47, 0), mk(inner, 0xffffff, 0.002));
    g.scale.setScalar(1.7);
    g.visible = false; scene.add(g);
    return g;
  })();
  const readMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  let readMesh = null;
  function hideRead() { if (readMesh) readMesh.visible = false; G.read = null; }
  function solvePuttRead() {
    const h = G.hole, b = G.ball, px = h.pin.x, py = h.pin.y;
    const ghost = Object.create(h); ghost.pin = null;            // simulate as if the cup weren't there
    const d = Math.hypot(px - b.x, py - b.y), th0 = Math.atan2(px - b.x, py - b.y);
    const rx = Math.cos(th0), ry = -Math.sin(th0);
    const run = (th, v) => Phys.simulate(ghost, { x: b.x, y: b.y, z: b.z, aim: th, speed: v, putt: true, maxRoll: 25 });
    const closest = (P) => { let best = 1e9, bi = 0; for (let i = 0; i < P.length; i += 4) { const q = (P[i] - px) ** 2 + (P[i + 1] - py) ** 2; if (q < best) { best = q; bi = i; } } return bi; };
    const lat = (r) => { const i = closest(r.pts); return (r.pts[i] - px) * rx + (r.pts[i + 1] - py) * ry; };
    const past = (r) => {
      const P = r.pts, i = closest(P), n = P.length;
      if (i >= n - 8) return -Math.hypot(P[n - 4] - px, P[n - 3] - py);
      let L = 0; for (let k = i; k < n - 4; k += 4) L += Math.hypot(P[k + 4] - P[k], P[k + 5] - P[k + 1]);
      return L;
    };
    let th = th0, v = Phys.puttSpeed(d + 0.33);
    for (let it = 0; it < 3; it++) {
      let lo = th0 - 0.6, hi = th0 + 0.6;
      for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (lat(run(m, v)) > 0) hi = m; else lo = m; }
      th = (lo + hi) / 2;
      let vl = v * 0.4, vh = v * 2.2;
      for (let k = 0; k < 10; k++) { const m = (vl + vh) / 2; if (past(run(th, m)) > 0.33) vh = m; else vl = m; }
      v = (vl + vh) / 2;
    }
    const r = run(th, v);
    return { th, v, pts: r.pts, end: closest(r.pts), flat: v * v / (2 * Phys.ROLL.green * G_ACC) };
  }
  function buildReadLine(rd) {
    if (readMesh) { scene.remove(readMesh); readMesh.geometry.dispose(); }
    const P = rd.pts, pos = [], idx = [], hw = 0.022;
    let L = 0, prev = null;
    for (let i = 0; i + 4 <= rd.end; i += 4) {
      const x0 = P[i], y0 = P[i + 1], x1 = P[i + 4], y1 = P[i + 5], seg = Math.hypot(x1 - x0, y1 - y0);
      L += seg;
      if (!seg || Math.floor(L / 0.28) % 3 === 2) continue;          // long dashes, short gaps
      const nx = -(y1 - y0) / seg * hw, ny = (x1 - x0) / seg * hw, v = pos.length / 3;
      const z0 = P[i + 2] + 0.018, z1 = P[i + 6] + 0.018;
      pos.push(x0 + nx, z0, -(y0 + ny), x0 - nx, z0, -(y0 - ny), x1 + nx, z1, -(y1 + ny), x1 - nx, z1, -(y1 - ny));
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    readMesh = new THREE.Mesh(g, readMat); readMesh.renderOrder = 9; readMesh.frustumCulled = false;
    scene.add(readMesh);
  }
  function runPuttRead() {
    if (G.mode !== 'play' || G.phase !== 'aim' || !CLUBS[G.clubIdx].putter || !G.hole) return;
    const rd = solvePuttRead();
    G.read = rd; buildReadLine(rd);
    if (!G.userAim) { G.aim = rd.th; G.wantDist = rd.flat; applyTarget(); }   // Assisted Aim
    mmDirty = true;
  }

  const golfer = Golfer.create(settings.outfit);
  scene.add(golfer.root);

  // ---------------- sound ----------------
  // Only two sounds: the recorded ball strike, and morning birdsong looping behind dawn rounds.
  // Every other sound hook stays a no-op so gameplay code can call it freely.
  const Sfx = (() => {
    let ctx = null, master = null, hitBuf = null, hitStart = 0, dawnBuf = null, loop = null, birdsWanted = false;
    // where each of the 12 driver strikes sits in driver-strikes.mp3 (seconds)
    const DRIVER_HITS = [1.03, 2.32, 3.74, 5.09, 6.50, 7.87, 9.25, 10.68, 12.04, 13.40, 14.68, 16.12];
    let drvBuf = null, drvHits = [], drvBag = [], drvLast = -1;
    function nextDriverHit() {                // shuffle-bag: every hit once before any repeats, never twice in a row
      if (!drvBag.length) {
        drvBag = drvHits.map((_, i) => i).sort(() => Math.random() - 0.5);
        if (drvBag[drvBag.length - 1] === drvLast && drvBag.length > 1) drvBag.unshift(drvBag.pop());
      }
      return (drvLast = drvBag.pop());
    }
    function driverStrike(gain) {
      const k = nextDriverHit(), t0 = drvHits[k], len = 1.0;
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
      src.buffer = drvBuf;
      g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + len - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + len);
      src.connect(g).connect(master); src.start(t, t0, len);
    }
    const S = {};
    for (const k of ['tick', 'whoosh', 'land', 'tree', 'cup', 'splash', 'clap', 'cheer', 'groan', 'ambient', 'birdCall', 'perfectHit']) S[k] = () => {};
    const on = () => ctx && settings.sound;
    const load = (url) => fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(url))))
      .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
    S.init = () => {
      if (!ctx) {
        try {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
          master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
          // ball strike (Mixkit free sound effect): trim the silence before the hit
          load('audio/golf-ball-hit.wav').then(b => {
            const d = b.getChannelData(0); let i = 0;
            while (i < d.length && Math.abs(d[i]) < 0.02) i++;
            hitStart = Math.max(0, i / b.sampleRate - 0.003); hitBuf = b;
          }).catch(() => {});
          // morning birdsong (Freesound community recording)
          load('audio/morning-birdsong.mp3').then(b => { dawnBuf = b; S.birds(birdsWanted); }).catch(() => {});
          // driver strikes: one recording holding 12 separate hits (local copy only; falls back to the Mixkit strike)
          load('audio/driver-strikes.mp3').then(b => {
            const d = b.getChannelData(0), sr = b.sampleRate;
            drvHits = DRIVER_HITS.map(t => {        // snap each marked hit to its exact attack in the decoded audio
              const i0 = Math.max(0, Math.floor((t - 0.12) * sr)), i1 = Math.min(d.length, Math.floor((t + 0.12) * sr));
              let pk = 0; for (let i = i0; i < i1; i++) pk = Math.max(pk, Math.abs(d[i]));
              let i = i0; while (i < i1 && Math.abs(d[i]) < pk * 0.35) i++;
              return Math.max(0, i / sr - 0.004);
            });
            drvBuf = b;
          }).catch(() => {});
        } catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    function strike(rate, gain) {
      if (!on() || !hitBuf) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = hitBuf; src.playbackRate.value = rate; g.gain.value = gain;
      src.connect(g).connect(master); src.start(ctx.currentTime, hitStart);
    }
    S.hit = (club) => {
      if (on() && drvBuf && (club.type === 'driver' || club.type === 'wood')) return driverStrike(club.type === 'driver' ? 1.6 : 1.3);
      strike(club.type === 'driver' ? 0.95 : club.type === 'wedge' ? 1.08 : 1, club.type === 'driver' ? 1 : 0.85);
    };
    S.putt = () => {};                     // putts are silent
    // Locking power inside the blue bar: a bright rising bell arpeggio over a soft bass thump.
    S.perfect = () => {
      if (!on()) return;
      const t0 = ctx.currentTime;
      const bell = (f, at, dur, gain) => {
        for (const [mul, g, type] of [[1, 1, 'triangle'], [2.01, 0.28, 'sine'], [3.02, 0.1, 'sine']]) {
          const o = ctx.createOscillator(), e = ctx.createGain(), t = t0 + at;
          o.type = type; o.frequency.value = f * mul;
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(gain * g, t + 0.006);
          e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(e).connect(master); o.start(t); o.stop(t + dur + 0.05);
        }
      };
      [[1318.5, 0], [1568, 0.055], [2093, 0.11], [2637, 0.165]].forEach(([f, at], i) => bell(f, at, 0.9 - i * 0.1, 0.16));
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.22);
      e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(e).connect(master); o.start(t0); o.stop(t0 + 0.3);
    };
    // Endless birdsong that crossfades each pass into the next so there's no seam.
    S.birds = (want) => {
      birdsWanted = want;
      if (!ctx || !dawnBuf) return;
      const play = want && settings.sound;
      if (play && !loop) {
        const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
        const L = { bus, timer: 0, alive: true }, XF = 4, buf = dawnBuf;
        const spawn = (offset) => {
          if (!L.alive) return;
          const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime, len = buf.duration - offset;
          src.buffer = buf;
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + XF);
          g.gain.setValueAtTime(1, t + len - XF); g.gain.linearRampToValueAtTime(0.0001, t + len);
          src.connect(g).connect(bus); src.start(t, offset); src.stop(t + len + 0.05);
          L.timer = setTimeout(() => spawn(0), (len - XF) * 1000);
        };
        spawn(Math.random() * buf.duration * 0.5);
        loop = L;
      }
      if (loop) loop.bus.gain.setTargetAtTime(play ? 0.55 : 0, ctx.currentTime, 0.8);
      if (!play && loop) {
        const L = loop; L.alive = false; clearTimeout(L.timer);
        setTimeout(() => L.bus.disconnect(), 3000); loop = null;
      }
    };
    S.nature = (mode, level) => S.birds(mode === 'birds' && level >= 0.9);
    return S;
  })();

  // ---------------- game state ----------------
  const G = {
    mode: 'menu', paused: false, course: COURSES[0], holeIdx: 0, hole: null, holes: {}, scores: [],
    strokes: 0, ball: { x: 0, y: 0, z: 0 }, prev: null, surf: 'tee', teed: true,
    aim: 0, wantDist: 0, targetDist: 0, target: { x: 0, y: 0 }, clubIdx: 0, puttRange: 10,
    phase: 'idle', m: 0, power: 0, acc: 0, shape: 0, shapeComp: 0, spinAmt: 0, spinDir: { x: 0, y: -1 }, spinCharge: false,
    wind: { mph: 0, ang: 0, x: 0, y: 0 },
    shot: null, fast: false, viewTarget: false, mmView: 'hole',
    flyT: 0, time: 0, orbit: 0, practiceT: 3, token: 0,
  };
  const G_ACC = G_GRAV;
  const DEBUG = /[?&]debug\b/.test(location.search);
  function crowdReact(k) {
    if (!settings.fans) return;
    Sfx.cheer(k); Crowd.cheer(G.crowd, Math.min(1.4, k));
  }
  function crowdGroan(k) { if (settings.fans) Sfx.groan(k); }
  const later = (fn, ms) => { const tk = G.token; setTimeout(() => { if (tk === G.token) fn(); }, ms); };

  function getHole(course, i) {
    const k = course.id + ':' + i;
    if (!G.holes[k]) G.holes[k] = new Hole(course, i);
    return G.holes[k];
  }
  const courseYards = (c) => c.pars.reduce((s, _, i) => s + getHole(c, i).yards, 0);

  // ---------------- time of day ----------------
  function updateFog() {
    const T = TIMES[settings.time], th = G.hole ? G.hole.theme : THEMES.parkland;
    const far = th.backdrop === 'mountains' ? 3600 : 2300;
    scene.fog.near = T.lamps ? 140 : 280;
    scene.fog.far = T.lamps ? far * 0.55 : far;
  }
  function applyTime(key) {
    const T = TIMES[key]; settings.time = key;
    Sfx.nature(key === 'night' ? 'night' : 'birds', key === 'dawn' ? 1 : key === 'day' ? 0.35 : key === 'sunset' ? 0.25 : 1);
    skyMat.uniforms.top.value.set(T.skyTop); skyMat.uniforms.bottom.value.set(T.skyBot);
    scene.fog.color.set(T.fog); renderer.setClearColor(T.fog);
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.set(T.sun); sun.intensity = T.sunI;
    const el = T.sunEl * Math.PI / 180, az = T.sunAz * Math.PI / 180;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    skyMat.uniforms.sunDir.value.copy(sunDir); skyMat.uniforms.sunCol.value.set(T.disc);
    stars.material.opacity = T.stars;
    lampLights.forEach(l => { l.intensity = T.lamps ? 1.3 : 0; });
    if (G.hole && G.hole.lamps) G.hole.lamps.visible = T.lamps;
    applyBallColor();
    trailMat.color.set(T.lamps ? 0xfff0a0 : 0xffffff); trailMat.opacity = T.lamps ? 0.95 : 0.6;
    updateFog();
    document.querySelectorAll('[data-time]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.time === key)));
  }

  // ---------------- hole setup ----------------
  function showHole(i) {
    if (G.hole && G.hole.group) { scene.remove(G.hole.group); G.hole.dispose(); G.hole.group = null; G.hole.canvas = null; }
    const h = getHole(G.course, i);
    G.hole = h; G.holeIdx = i;
    h.buildScene(renderer, detailTex);
    scene.add(h.group);
    chunks.length = 0; parts.length = 0;
    G.crowd = Crowd.build(h, G.course.seed * 13 + i * 7);
    G.crowd.group.visible = settings.fans;
    h.group.add(G.crowd.group);
    h.lampSpots.forEach((p, k) => lampLights[k].position.copy(p));
    flow.length = 0;
    h.lamps.visible = TIMES[settings.time].lamps;
    const R = mulberry32(G.course.seed * 7 + i * 101 + 3);
    const mph = Math.round(R() * 11 * G.course.windMul), ang = R() * Math.PI * 2;
    G.wind = { mph, ang, x: Math.sin(ang) * mph * MPH * 1.6, y: Math.cos(ang) * mph * MPH * 1.6 };
    updateFog();
  }
  function withLoading(fn) {
    $('loading').hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { try { fn(); } finally { $('loading').hidden = true; } }));
  }

  // ---------------- clubs & aiming ----------------
  function lieDist(club) {
    let d = (LIES[G.surf] || LIES.rough).dist;
    if (G.surf === 'bunker' && (club.id === 'SW' || club.id === 'LW' || club.id === 'GW')) d = 0.92;
    if (club.id === 'DR' && G.surf !== 'tee') d *= 0.92;
    return d;
  }
  function effCarry(i) {
    const c = CLUBS[i];
    return c.putter ? G.puttRange : c.carry * brandOf(c).dist * lieDist(c);
  }
  const pinDist = () => Math.hypot(G.hole.pin.x - G.ball.x, G.hole.pin.y - G.ball.y);
  function autoClub() {
    const d = pinDist();
    if (G.surf === 'green' || (G.surf === 'fringe' && d < 12)) return PUTTER_IDX;
    for (let i = PUTTER_IDX - 1; i >= 0; i--) if (effCarry(i) >= d * 0.97) return (i === 0 && G.surf !== 'tee') ? 1 : i;
    return G.surf === 'tee' ? 0 : 1;
  }
  function puttRangeFor(d) {
    for (const s of [3, 5, 8, 12, 18, 25, 35, 50]) if (s >= d * 1.25) return s;
    return 65;
  }
  function setDefaultAim() {
    const c = CLUBS[G.clubIdx], b = G.ball, h = G.hole, pin = h.pin;
    const eff = effCarry(G.clubIdx);
    let tx = pin.x, ty = pin.y;
    if (!c.putter && pinDist() > eff * 1.02) {
      const n = h.nearest(b.x, b.y);
      for (let s = n.s; s <= h.total; s += 2) {
        const p = h.pointAt(s);
        if (Math.hypot(p.x - b.x, p.y - b.y) >= eff) { tx = p.x; ty = p.y; break; }
      }
    }
    G.aim = Math.atan2(tx - b.x, ty - b.y);
    G.wantDist = Math.hypot(tx - b.x, ty - b.y);
  }
  function applyTarget() {
    const c = CLUBS[G.clubIdx];
    if (c.putter) { G.wantDist = Math.max(0.33, G.wantDist); G.puttRange = G.wantDist; G.targetDist = G.wantDist; }
    else G.targetDist = Math.min(G.wantDist, effCarry(G.clubIdx));
    placeGolfer();
    updatePreview();
    updateShotInfo();
    mmDirty = true;
  }
  function equipClub() {
    const c = CLUBS[G.clubIdx];
    golfer.setClub(c, brandOf(c));
    updateClubCard();
  }
  function placeGolfer() {
    const b = G.ball, c = CLUBS[G.clubIdx];
    const back = c.putter ? 0.1 : c.cat === 'woods' ? 0.17 : 0.13;
    const hx = b.x - Math.sin(G.aim) * back, hy = b.y - Math.cos(G.aim) * back;
    golfer.placeAt(V3(hx, b.z + 0.028 + (G.teed ? 0.03 : 0), -hy), G.aim);
  }
  function changeClub(d) {
    if (G.mode !== 'play' || G.phase !== 'aim') return;
    const n = clamp(G.clubIdx + d, 0, PUTTER_IDX);
    if (n === G.clubIdx) return;
    G.clubIdx = n;
    if (!G.userAim) setDefaultAim();
    if (CLUBS[n].putter) G.wantDist = Math.max(G.wantDist, 1);
    if (CLUBS[n].putter) { G.shapeX = 0; G.shapeY = 0; }
    equipClub(); applyTarget(); updateSideUI();
    if (CLUBS[n].putter) later(runPuttRead, 30); else hideRead();
    Sfx.tick();
  }

  function updatePreview() {
    const c = CLUBS[G.clubIdx], b = G.ball, h = G.hole;
    const tx = b.x + Math.sin(G.aim) * G.targetDist, ty = b.y + Math.cos(G.aim) * G.targetDist;
    G.target = { x: tx, y: ty };
    ring.position.set(tx, h.heightAt(tx, ty) + 0.04, -ty);
    ring.scale.setScalar(1 + G.targetDist * 0.012);
    triMarker.position.set(tx, h.heightAt(tx, ty) + 0.03, -ty);
    triMarker.rotation.y = -G.aim;
    const pos = arcGeo.attributes.position.array;
    let n = 0;
    if (c.putter) {
      // straight aim line from the ball to the triangle marker
      const steps = Math.min(300, Math.max(2, Math.ceil(G.targetDist / 0.1)));
      for (let i = 0; i <= steps; i++) {
        const k = i / steps * Math.max(0, G.targetDist - 0.12), x = b.x + Math.sin(G.aim) * k, y = b.y + Math.cos(G.aim) * k;
        pos[n * 3] = x; pos[n * 3 + 1] = h.heightAt(x, y) + 0.025; pos[n * 3 + 2] = -y; n++;
      }
      arcMat.dashSize = 0.1; arcMat.gapSize = 0.1;
    } else {
      const sp = shapeParams(c);
      const base = { x: b.x, y: b.y, z: b.z + (G.teed ? 0.03 : 0), aim: G.aim, launch: sp.launch * Math.PI / 180,
        speed: Phys.speedForCarry(c, G.targetDist, sp.table), lift: sp.lift, carryOnly: true, noTrees: true, air: G.course.air, tilt: sp.tilt };
      G.shapeComp = 0;
      if (sp.tilt) {
        // start the ball off-line so the draw/fade curves back onto the target
        const probe = Phys.simulate(h, base);
        const dev = (probe.landX - b.x) * Math.cos(G.aim) - (probe.landY - b.y) * Math.sin(G.aim);
        G.shapeComp = -Math.atan2(dev, Math.max(5, G.targetDist));
        base.aim = G.aim + G.shapeComp;
      }
      const r = Phys.simulate(h, base);
      const step = Math.max(1, Math.floor(r.pts.length / 4 / 300));
      for (let i = 0; i < r.pts.length / 4 && n < 600; i += step) {
        pos[n * 3] = r.pts[i * 4]; pos[n * 3 + 1] = r.pts[i * 4 + 2]; pos[n * 3 + 2] = -r.pts[i * 4 + 1]; n++;
      }
      arcMat.dashSize = 1.2; arcMat.gapSize = 0.9;
    }
    arcGeo.setDrawRange(0, n);
    arcGeo.attributes.position.needsUpdate = true;
    arc.computeLineDistances();
    ring.visible = !c.putter; triMarker.visible = !!c.putter;
    G.idealDirty = true;
    ring.visible = arc.visible = true;
  }

  // ---------------- shot flow ----------------
  function prepareShot() {
    const h = G.hole, b = G.ball;
    G.surf = h.surfaceAt(b.x, b.y);
    if (G.surf === 'water' || G.surf === 'ob') G.surf = 'rough';
    b.z = h.heightAt(b.x, b.y);
    G.teed = G.surf === 'tee';
    G.clubIdx = autoClub();
    G.shapeX = 0; G.shapeY = 0; G.userAim = false; G.perfectPower = false; G.idealP = null; G.idealDirty = true;
    setDefaultAim();
    G.phase = 'aim'; G.m = 0; G.power = 0; G.viewTarget = false;
    G.mmView = pinDist() < 45 ? 'green' : 'hole';
    $('mmToggle').setAttribute('aria-pressed', String(G.mmView === 'green'));
    equipClub(); golfer.address(); applyTarget();
    hideRead(); if (CLUBS[G.clubIdx].putter) later(runPuttRead, 60);
    clearTracer();
    ballMesh.visible = true;
    updateSideUI(); updateHoleCard(); updateMeterMsg();
  }

  function swingClick() {
    Sfx.init();
    if (G.mode !== 'play' || G.paused) return;
    if (G.phase === 'flyover') { G.flyT = 99; return; }
    if (G.phase === 'flight') { addSpinTap(); return; }
    if (G.phase === 'aim') { G.phase = 'power'; G.m = 0; G.viewTarget = false; Sfx.tick(); updateMeterMsg(); return; }
    if (G.phase === 'power') {
      G.power = Math.max(0.02, G.m); G.phase = 'accuracy';
      G.perfectPower = !CLUBS[G.clubIdx].putter && G.idealP != null && Math.abs(G.power - G.idealP) <= perfectW();
      if (G.perfectPower) {
        Sfx.init(); Sfx.perfect();
        const mt = $('meter'); mt.classList.remove('perfect'); void mt.offsetWidth; mt.classList.add('perfect');
      } else Sfx.tick();
      updateMeterMsg(); return;
    }
    if (G.phase === 'accuracy') { G.acc = G.m; startDownswing(); }
  }
  function cancelSwing() {
    if (G.phase !== 'power' && G.phase !== 'accuracy') return false;
    G.phase = 'aim'; G.m = 0; golfer.address(); updateMeterMsg();
    return true;
  }
  function startDownswing() {
    G.phase = 'swing';
    if (!CLUBS[G.clubIdx].putter) Sfx.whoosh();
    golfer.downswing(launch);
    updateMeterMsg();
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Shot shape pad: x = draw(-1)..fade(+1), y = low(-1)..high(+1).
  const shapeTables = new Map();
  function shapeParams(c) {
    const y = Math.round((G.shapeY || 0) * 20) / 20;
    const launch = c.launch * (1 + y * 0.32), lift = Phys.KL * c.spin * (1 + y * 0.25);
    let table = c.table;
    if (y) {
      const key = c.id + ':' + y;
      if (!shapeTables.has(key)) shapeTables.set(key, Phys.buildTable(launch, lift));
      table = shapeTables.get(key);
    }
    return { launch, lift, table, tilt: (G.shapeX || 0) * 0.36, check: 1 + y * 0.5 };
  }
  // How hard to hit it: solved by simulation (wind, elevation, shape for full shots; slope and break for putts).
  const perfectW = () => (CLUBS[G.clubIdx].putter ? 0.03 : 0.025);
  function solveIdealPower() {
    const c = CLUBS[G.clubIdx], b = G.ball, h = G.hole;
    if (!h || G.phase !== 'aim' && G.phase !== 'power') return;
    const sa = Math.sin(G.aim), ca = Math.cos(G.aim);
    let lo = 0.02, hi = c.putter ? 1 : METER.max;
    if (c.putter) {
      const want = G.targetDist + 0.33;                 // die about a foot past the hole
      for (let k = 0; k < 11; k++) {
        const p = (lo + hi) / 2;
        const r = Phys.simulate(h, { x: b.x, y: b.y, z: b.z, aim: G.aim, speed: Phys.puttSpeed(p * G.puttRange), putt: true, maxRoll: 20 });
        const along = (r.x - b.x) * sa + (r.y - b.y) * ca;
        if (r.type === 'hole' || along >= want) hi = p; else lo = p;
      }
    } else {
      const eff = effCarry(G.clubIdx), aim = G.aim + (G.shapeComp || 0), sp = shapeParams(c);
      for (let k = 0; k < 11; k++) {
        const p = (lo + hi) / 2;
        const r = Phys.simulate(h, { x: b.x, y: b.y, z: b.z + (G.teed ? 0.03 : 0), aim, launch: sp.launch * Math.PI / 180,
          speed: Phys.speedForCarry(c, p * eff, sp.table), lift: sp.lift, tilt: sp.tilt, carryOnly: true, noTrees: true, air: G.course.air, wind: G.wind });
        const along = ((r.landX ?? r.x) - b.x) * sa + ((r.landY ?? r.y) - b.y) * ca;
        if (along >= G.targetDist) hi = p; else lo = p;
      }
    }
    G.idealP = clamp((lo + hi) / 2, 0.02, c.putter ? 1 : METER.max);
  }
  let idealAt = 0;
  function launch() {
    const c = CLUBS[G.clubIdx], br = brandOf(c), b = G.ball, h = G.hole;
    const sweet = sweetFor(c, G.power), red = zoneOf(G.power) === 'red';
    const e = Math.sign(G.acc) * Math.max(0, Math.abs(G.acc) - sweet) * (red ? 1.35 : 1);  // >0 early (left), <0 late (right)
    if (G.perfectPower) { Sfx.perfectHit(c); later(() => toast(e === 0 ? '<b>PERFECT</b> · power and strike' : '<b>Perfect power</b>'), 200); if (e === 0) later(() => crowdReact(0.5), 350); }
    else if (!c.putter && red && e === 0) { later(() => toast('<b>Pured it</b> · red-zone strike'), 250); later(() => crowdReact(0.45), 400); }
    G.prev = { x: b.x, y: b.y };
    G.strokes++;
    let s;
    if (c.putter) {
      s = { x: b.x, y: b.y, z: b.z, aim: G.aim - e * 0.2 * (1 - br.forgive * 0.5), speed: Phys.puttSpeed(G.power * G.puttRange), putt: true };
      Sfx.putt();
    } else {
      const lie = LIES[G.surf] || LIES.rough, sp = shapeParams(c);
      s = {
        x: b.x, y: b.y, z: b.z + (G.teed ? 0.03 : 0),
        aim: G.aim + G.shapeComp - e * 0.18 * (1 - br.forgive * 0.5),
        launch: (sp.launch + (G.surf === 'bunker' ? 3 : 0)) * Math.PI / 180,
        speed: Phys.speedForCarry(c, G.power * effCarry(G.clubIdx), sp.table),
        lift: sp.lift * rnd(0.93, 1.07),
        tilt: -e * 2.4 * (1 - br.forgive) + sp.tilt + rnd(-0.035, 0.035),
        check: Math.max(0, (c.spin - 0.55) * 1.5 * br.spin) * lie.check * sp.check * rnd(0.6, 1.4),
        wind: G.wind, air: G.course.air,
      };
      Sfx.hit(c);
      spawnDivot(b, s.aim, c, G.surf, G.power);
    }
    const sim = Phys.start(h, s);
    G.shot = { sim, res: sim.res, pts: sim.pts, t: 0, club: c, putt: !!c.putter, aim: s.aim, ev: 0, trI: 0, err: e, cam: null, sx: b.x, sy: b.y, landT: Infinity };
    G.spinAmt = 0; G.spinDir = { x: 0, y: -1 }; G.spinPt = { x: 0, y: 0 }; G.spinCharge = false;
    // every strike carries its own spin: club loft, brand grooves, lie and a bit of luck
    const clubGrip = c.type === 'wedge' ? 1.5 : c.type === 'iron' ? 1.15 : c.type === 'hybrid' ? 0.95 : c.putter ? 0 : 0.8;
    G.spinMul = clubGrip * br.spin * rnd(0.7, 1.35) * (G.surf === 'rough' ? 0.55 : G.surf === 'bunker' ? 0.8 : 1);
    G.rpmBase = c.putter ? 0 : (2500 + (c.spin - 0.5) * 10500) * br.spin * rnd(0.82, 1.2) * (G.surf === 'rough' ? 0.6 : 1);
    G.phase = 'flight';
    G.teed = false;
    ring.visible = arc.visible = false;
    clearTracer(); updateSideUI();
    updateHoleCard(); updateMeterMsg();
  }

  // In-flight spin is a point on the ball face: x = side spin, y = top(+) / back(-). It moves in small steps.
  const canSpin = () => G.phase === 'flight' && G.shot && !G.shot.putt;
  function setSpinPt(x, y) {
    const l = Math.hypot(x, y), k = l > 1 ? 1 / l : 1;
    G.spinPt = { x: x * k, y: y * k };
    G.spinAmt = Math.min(1, l);
    if (G.spinAmt > 0.001) G.spinDir = { x: G.spinPt.x / G.spinAmt, y: G.spinPt.y / G.spinAmt };
  }
  function growSpin(step) {                     // Space: more spin in the current direction
    const p = G.spinPt || { x: 0, y: 0 }, d = G.spinAmt > 0.001 ? G.spinDir : { x: 0, y: -1 };
    setSpinPt(p.x + d.x * step, p.y + d.y * step);
  }
  function nudgeSpin(dx, dy, step) { const p = G.spinPt || { x: 0, y: 0 }; setSpinPt(p.x + dx * step, p.y + dy * step); }
  function addSpinTap() {
    if (!canSpin() || G.spinAmt >= 1) return;
    growSpin(0.1); Sfx.tick();
  }
  function updateFlight(dt) {
    const S = G.shot, sim = S.sim, P = S.pts;
    if (!S.putt) {
      // live spin: holding Space grows it, holding an arrow glides the spin point that way
      if (G.spinCharge) growSpin(dt * 0.8);
      const dx = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
      const dy = ((keys.ArrowUp || keys.KeyW) ? 1 : 0) - ((keys.ArrowDown || keys.KeyS) ? 1 : 0);
      if ((dx || dy) && G.spinHoldT > 0.22) nudgeSpin(dx, dy, dt * 0.7);
      G.spinHoldT = (dx || dy) ? (G.spinHoldT || 0) + dt : 0;
      sim.ctl.side = G.spinDir.x * G.spinAmt * G.spinMul; sim.ctl.back = -G.spinDir.y * G.spinAmt * G.spinMul;
    }
    S.t += dt;
    while (!sim.done && sim.t < S.t + Phys.DT) Phys.step(sim);
    const n = P.length / 4, tEnd = P[(n - 1) * 4 + 3];
    const t = Math.min(S.t, tEnd);
    let i = Math.min(n - 2, Math.floor(t / Phys.DT)); if (i < 0) i = 0;
    const j = Math.min(n - 1, i + 1);
    const k = n > 1 ? clamp((t - P[i * 4 + 3]) / Phys.DT, 0, 1) : 0;
    S.x = P[i * 4] + (P[j * 4] - P[i * 4]) * k; S.y = P[i * 4 + 1] + (P[j * 4 + 1] - P[i * 4 + 1]) * k; S.z = P[i * 4 + 2] + (P[j * 4 + 2] - P[i * 4 + 2]) * k;
    const ev = S.res.events;
    while (S.ev < ev.length && ev[S.ev].t <= S.t) {
      const e = ev[S.ev++];
      if (e.type === 'land' && !S.landed) { S.landed = true; S.landT = e.t; Sfx.land(e.surf); }
      else if (e.type === 'tree') Sfx.tree();
      else if (e.type === 'lip') { Sfx.tick(); crowdGroan(0.8); }
    }
    // tracer follows the ball through the air (and along the green for putts)
    const stepN = S.putt ? 4 : 3;
    while (S.trI <= i && trPts.length < TR_MAX) {
      if (!S.putt && P[S.trI * 4 + 3] > S.landT + 0.01) break;
      trPts.push(V3(P[S.trI * 4], P[S.trI * 4 + 2] + (S.putt ? 0.012 : 0.02), -P[S.trI * 4 + 1]));
      S.trI += stepN;
    }
    if (!S.landed || S.putt) { const hp = V3(S.x, S.z + (S.putt ? 0.012 : 0.02), -S.y); if (trPts.length) trPts[trPts.length - 1] = hp; }
    mmDirty = true;
    if (sim.done && S.t >= tEnd) finishShot();
  }


  const fmtDist = (d, green) => (green && d < 10 ? Math.max(1, Math.round(d * 3)) + ' ft' : Math.round(d) + ' yds');
  function dropPoint(S) {
    const P = S.pts, h = G.hole, n = P.length / 4;
    for (let i = n - 1; i >= 0; i -= 3) {
      const x = P[i * 4], y = P[i * 4 + 1], s = h.surfaceAt(x, y);
      if (s !== 'water' && s !== 'ob') {
        const dx = P[0] - x, dy = P[1] - y, L = Math.hypot(dx, dy) || 1;
        const px = x + dx / L * 2.5, py = y + dy / L * 2.5, s2 = h.surfaceAt(px, py);
        return (s2 !== 'water' && s2 !== 'ob') ? { x: px, y: py, z: 0 } : { x, y, z: 0 };
      }
    }
    return { ...G.prev, z: 0 };
  }
  function finishShot() {
    const S = G.shot, r = S.res, h = G.hole;
    G.phase = 'result';
    G.spinCharge = false;
    updateMeterMsg(); updateSideUI();
    if (r.type === 'hole') { holeOut(); return; }
    let wait = 1500;
    if (r.type === 'water') {
      G.strokes++; Sfx.splash(); crowdGroan(1); banner('Water hazard', 'One-stroke penalty · take a drop');
      G.ball = dropPoint(S); wait = 2200;
    } else if (r.type === 'ob') {
      G.strokes++; banner('Out of bounds', 'Stroke and distance');
      G.ball = { ...G.prev, z: 0 }; wait = 2200;
    } else {
      G.ball = { x: r.x, y: r.y, z: r.z };
      const d = Math.hypot(h.pin.x - r.x, h.pin.y - r.y), surf = h.surfaceAt(r.x, r.y);
      if (surf === 'green' && d <= 0.34 && G.strokes < 10) {        // auto tap-in from a foot
        updateHoleCard();
        later(() => { G.strokes++; toast('<b>Tap-in</b>'); holeOut(); }, 650);
        return;
      }
      if (S.putt) { toast(`<b>${fmtDist(d, true)}</b> left`); if (d < 1.2) crowdGroan(0.6); }
      else if (surf === 'green' && d < 4) crowdReact(1.1);
      else if ((surf === 'green' || surf === 'fringe') && d < 9) crowdReact(0.6);
      else if (S.club.id === 'DR' && r.total > 285 && (surf === 'fairway')) crowdReact(0.4);
      else toast(`Carry <b>${Math.round(r.carry)}</b> · Total <b>${Math.round(r.total)}</b> · ${(surf === 'waste' ? (WASTE_LABEL[h.course.theme] || 'Waste') : (LIES[surf] || LIES.rough).label)}`);
    }
    updateHoleCard();
    if (G.strokes >= 10) { later(() => holeOut(true), wait); return; }
    later(() => { hideBanner(); prepareShot(); }, wait);
  }
  function holeOut(pickedUp) {
    const h = G.hole, score = G.strokes;
    G.scores[G.holeIdx] = score;
    G.phase = 'holed';
    const diff = score - h.par;
    const name = pickedUp ? 'Picked up' : score === 1 ? 'Hole in one' : (SCORE_NAMES[String(diff)] || ('+' + diff));
    if (!pickedUp) {
      Sfx.cup();
      crowdReact(score === 1 ? 1.7 : diff <= -2 ? 1.5 : diff === -1 ? 1.15 : diff === 0 ? 0.55 : 0.25);
    }
    const tag = $('lt3Tag');
    tag.textContent = name;
    tag.dataset.s = pickedUp ? 'x' : score === 1 || diff <= -2 ? 'eagle' : diff === -1 ? 'birdie' : diff === 0 ? 'par' : diff === 1 ? 'bogey' : 'double';
    $('lt3Name').textContent = settings.name.toUpperCase();
    const rtp = roundToPar(), tp = $('lt3Par'); tp.textContent = fmtPar(rtp); tp.classList.toggle('u', rtp < 0);
    $('lt3Sub').textContent = `Hole ${G.holeIdx + 1} · Par ${h.par} · ${score} ${score === 1 ? 'stroke' : 'strokes'}`;
    const lt = $('lt3'); lt.hidden = false; lt.classList.remove('show'); void lt.offsetWidth; lt.classList.add('show');
    updateHoleCard(); updateMeterMsg();
    later(() => { lt.hidden = true; showCard(true); }, pickedUp ? 2600 : 3600);
  }

  // ---------------- flow: menu <-> round ----------------
  function enterMenu() {
    G.token++;
    G.mode = 'menu'; G.paused = false; G.phase = 'idle';
    Sfx.ambient(false);
    $('hud').hidden = true; $('pause').hidden = true; $('card').hidden = true; $('menu').hidden = false;
    loadMenuScene();
    updateBest();
    resize();
  }
  function loadMenuScene() {
    G.course = COURSES.find(c => c.id === settings.course);
    withLoading(() => {
      showHole(0);
      G.ball = { x: 0, y: 0, z: G.hole.heightAt(0, 0) }; G.surf = 'tee'; G.teed = true;
      const p = G.hole.pointAt(70);
      G.aim = Math.atan2(p.x, p.y);
      G.clubIdx = 0; equipClub(); placeGolfer(); golfer.address();
      ring.visible = arc.visible = false; clearTracer(); ballMesh.visible = true;
      camInit = false;
    });
  }
  function startRound() {
    Sfx.init();
    G.token++;
    G.course = COURSES.find(c => c.id === settings.course);
    G.scores = [];
    G.mode = 'play'; G.paused = false;
    Sfx.ambient(settings.fans);
    $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = true; $('card').hidden = true;
    resize();
    beginHole(0);
  }
  function beginHole(i, skipFly) {
    G.token++;
    hideBanner(); $('toast').hidden = true; $('lt3').hidden = true;
    withLoading(() => {
      showHole(i);
      G.strokes = 0; G.ball = { x: 0, y: 0, z: 0 }; G.prev = null;
      prepareShot();
      if (!skipFly) {
        G.phase = 'flyover'; G.flyT = 0; camInit = false;
        ring.visible = arc.visible = false;
        const h = G.hole, intro = $('intro');
        intro.innerHTML = `<div class="n num">${i + 1}</div><div class="t"><b>Par ${h.par} · ${h.yards} yds</b><span>${h.sigName} · ${G.course.name}</span><span class="skip">Tap to skip</span></div>`;
        intro.hidden = false;
        updateMeterMsg();
      }
      mmSize(); mmDirty = true;
    });
  }
  function endFlyover() {
    $('intro').hidden = true;
    if (G.phase === 'flyover') { G.phase = 'aim'; ring.visible = arc.visible = true; updateMeterMsg(); }
  }

  // ---------------- camera ----------------
  const camPos = V3(), camLook = V3();
  let camInit = false;
  function groundAt(x, z) {
    const h = G.hole; if (!h) return 0;
    const y = -z;
    if (x < h.minX || x > h.maxX || y < h.minY || y > h.maxY) return h.outerHeight(x, y);
    return h.heightAt(x, y);
  }
  function updateCamera(dt) {
    let dp, dl, rp = 5, rl = 7;
    const b = G.ball;
    if (G.mode === 'menu') {
      G.orbit += dt * 0.16;
      const c = golfer.root.position;
      dp = V3(c.x + Math.sin(G.orbit) * 4.4, c.y + 1.75, c.z + Math.cos(G.orbit) * 4.4);
      dl = V3(c.x, c.y + 0.95, c.z);
      rp = rl = 3;
    } else if (G.phase === 'flyover') {
      const T = 4.4, h = G.hole;
      G.flyT += dt;
      const k = Math.min(1, G.flyT / T), e = k * k * (3 - 2 * k), s = h.total * (1 - e);
      const p = h.pointAt(s - 45), q = h.pointAt(Math.min(h.total, s + 70));
      dp = V3(p.x, h.heightAt(p.x, p.y) + 36 - 26 * e, -p.y);
      dl = V3(q.x, h.heightAt(q.x, q.y), -q.y);
      rp = rl = 4;
      if (G.flyT >= T) endFlyover();
    } else if ((G.phase === 'flight' || G.phase === 'result' || G.phase === 'holed') && G.shot) {
      const S = G.shot, sim = S.sim, d = V3(Math.sin(S.aim), 0, -Math.cos(S.aim)), right = V3(Math.cos(S.aim), 0, Math.sin(S.aim));
      const bw = V3(S.x ?? b.x, S.z ?? b.z, -(S.y ?? b.y));
      if (!S.cam) S.cam = { stage: 'launch', t: 0, pos: camPos.clone().addScaledVector(d, -1.5).add(V3(0, 0.8, 0)) };
      const cam = S.cam; cam.t += dt;
      if (S.putt) {
        dp = bw.clone().addScaledVector(d, -2.4).addScaledVector(right, 0.35).add(V3(0, 1.45, 0));
        dl = bw.clone().addScaledVector(d, 1.2); rp = 3.2; rl = 7;
      } else {
        if (cam.stage === 'launch') { dp = cam.pos; dl = bw; rp = 6; rl = 12; if (cam.t > 0.85) cam.stage = 'follow'; }
        if (cam.stage === 'follow') {
          const hv = Math.hypot(sim.vx, sim.vy), hd = hv > 1 ? V3(sim.vx / hv, 0, -sim.vy / hv) : d.clone();
          dp = bw.clone().addScaledVector(hd, -12).add(V3(0, 4.5, 0)); dl = bw; rp = 2.6; rl = 12;
          const above = S.z - G.hole.heightAt(S.x, S.y), flown = Math.hypot(S.x - S.sx, S.y - S.sy);
          if (!sim.rolling && sim.bounces === 0 && sim.vz < 0 && above < sim.res.apex * 0.72 && flown > 50) {
            // cut to a camera beside the landing zone looking back at the incoming ball
            const u = -sim.vz, tl = (-u + Math.sqrt(u * u + 2 * G_ACC * Math.max(0, above))) / G_ACC;
            const lx = S.x + sim.vx * tl * 0.85, ly = S.y + sim.vy * tl * 0.85;
            const rt = V3(-hd.z, 0, hd.x);
            const side = (G.hole.nearest(lx, ly).side > 0) ? -1 : 1;
            // off to the side of the landing zone so the bounce and roll stay in frame
            const pos = V3(lx, 0, -ly).addScaledVector(hd, 5).addScaledVector(rt, 14 * side);
            pos.y = groundAt(pos.x, pos.z) + 3.4;
            cam.stage = 'land'; cam.pos = pos; cam.hd = hd; camInit = false;
          }
        }
        if (cam.stage === 'land') {
          dp = cam.pos; dl = bw; rp = 6; rl = 12;
          if (S.landed && cam.pos.distanceTo(bw) > 28) cam.stage = 'roll';
        }
        if (cam.stage === 'roll') {
          const hv = Math.hypot(sim.vx, sim.vy);
          if (hv > 0.5) cam.hd = V3(sim.vx / hv, 0, -sim.vy / hv);
          const hd = cam.hd || d;
          dp = bw.clone().addScaledVector(hd, -9).add(V3(0, 3.2, 0)); dl = bw; rp = 2.2; rl = 10;
        }
      }
    } else {
      const c = CLUBS[G.clubIdx];
      const d = V3(Math.sin(G.aim), 0, -Math.cos(G.aim)), right = V3(Math.cos(G.aim), 0, Math.sin(G.aim));
      const bw = V3(b.x, b.z, -b.y);
      if (G.viewTarget) {
        const t = V3(G.target.x, G.hole.heightAt(G.target.x, G.target.y), -G.target.y);
        dp = t.clone().addScaledVector(d, c.putter ? -4 : -16).addScaledVector(right, c.putter ? 1 : 4).add(V3(0, c.putter ? 3 : 11, 0));
        dl = t; rp = rl = 4;
      } else if (c.putter) {
        dp = bw.clone().addScaledVector(d, -3.3).addScaledVector(right, 0.4).add(V3(0, 1.35, 0));
        const ld = Math.min(6, G.targetDist * 0.55 + 1), lx = b.x + Math.sin(G.aim) * ld, ly = b.y + Math.cos(G.aim) * ld;
        dl = V3(lx, G.hole.heightAt(lx, ly), -ly); rp = rl = 8;
      } else {
        dp = bw.clone().addScaledVector(d, -6.4).addScaledVector(right, 0.9).add(V3(0, 2.4, 0));
        dl = bw.clone().addScaledVector(d, 34).add(V3(0, 1.2, 0)); rp = rl = 7;
      }
    }
    if (!camInit) { camPos.copy(dp); camLook.copy(dl); camInit = true; }
    camPos.lerp(dp, 1 - Math.exp(-rp * dt));
    camLook.lerp(dl, 1 - Math.exp(-rl * dt));
    if (!Number.isFinite(camPos.x + camPos.y + camPos.z + camLook.x + camLook.y + camLook.z)) {
      if (DEBUG) console.warn('camera NaN', G.phase, G.shot && G.shot.cam && G.shot.cam.stage, dp, dl);
      camPos.copy(dp); camLook.copy(dl);
    }
    const gh = groundAt(camPos.x, camPos.z);
    if (camPos.y < gh + 0.7) camPos.y = gh + 0.7;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  // ---------------- HUD ----------------
  let toastTimer = 0;
  function toast(html) { const t = $('toast'); t.innerHTML = html; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }
  function banner(main, sub) {
    const b = $('banner'); $('bannerMain').textContent = main; $('bannerSub').textContent = sub || ''; $('bannerSub').hidden = !sub;
    b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function hideBanner() { $('banner').hidden = true; }
  function totalStr() {
    let s = 0, p = 0;
    G.scores.forEach((v, i) => { if (v != null) { s += v; p += G.course.pars[i]; } });
    const d = s - p;
    return d === 0 ? 'E' : d > 0 ? '+' + d : String(d);
  }
  // ---------------- broadcast score bug ----------------
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function roundToPar() {
    let d = 0;
    G.scores.forEach((v, i) => { if (v != null) d += v - G.course.pars[i]; });
    return d;
  }
  const fmtPar = (v) => (v === 0 ? 'E' : v > 0 ? '+' + v : String(v));
  function updateHoleCard() {
    const h = G.hole; if (!h) return;
    $('hName').textContent = settings.name.toUpperCase();
    const tp = roundToPar(), el = $('hTotal');
    el.textContent = fmtPar(tp); el.classList.toggle('under', tp < 0);
    $('hHole').textContent = ordinal(G.holeIdx + 1); $('hYds').textContent = h.yards;
    const cur = G.phase === 'flight' || G.phase === 'result' || G.phase === 'holed' ? G.strokes : G.strokes + 1;
    const n = Math.max(h.par, cur);
    $('hShots').innerHTML = Array.from({ length: n }, (_, k) => `<i${k + 1 === cur ? ' class="on"' : k + 1 < cur ? ' class="done"' : ''}>${k + 1}</i>`).join('');
    updateToHole();
  }
  function updateToHole(x, y) {
    const h = G.hole; if (!h) return;
    if (x === undefined) { x = G.ball.x; y = G.ball.y; }
    const d = Math.hypot(h.pin.x - x, h.pin.y - y);
    $('hTo').textContent = G.phase === 'holed' ? 'In the hole' : d < 10 && h.surfaceAt(x, y) !== 'rough' && ellD(h.green, x, y) < 1.4
      ? `To Hole: ${Math.max(1, Math.round(d * 3))} Feet` : `To Hole: ${Math.round(d)} Yards`;
  }

  function updateClubCard() {
    const c = CLUBS[G.clubIdx], br = brandOf(c);
    $('clubId').textContent = c.id; $('clubName').textContent = c.name;
    $('clubSub').textContent = `${br.name} · ${c.putter ? 'marker ' + fmtDist(G.puttRange, true) : Math.round(effCarry(G.clubIdx)) + ' yds'}`;
  }
  function updateShotInfo() {
    const h = G.hole; if (!h) return;
    const c = CLUBS[G.clubIdx], lie = $('lie');
    lie.dataset.lie = G.surf;
    lie.textContent = G.surf === 'waste' ? (WASTE_LABEL[h.course.theme] || 'Waste') : (LIES[G.surf] || LIES.rough).label;
    const d = pinDist(), green = G.surf === 'green' || G.surf === 'fringe';
    const txt = fmtDist(d, green).split(' ');
    $('pinDist').textContent = txt[0]; $('pinUnit').textContent = txt[1];
    const dz = (h.heightAt(h.pin.x, h.pin.y) - G.ball.z) * 3;
    const ez = Math.abs(dz) >= 10 ? Math.round(dz / 3) + ' yds' : (Math.abs(dz) >= 1 ? Math.round(dz) + ' ft' : Math.abs(dz * 12) >= 2 ? Math.round(dz * 12) + ' in' : '');
    $('elev').textContent = ez ? (dz > 0 ? '▲ ' : '▼ ') + ez.replace('-', '') + (dz > 0 ? ' up' : ' down') : 'Level';
    $('targetDist').textContent = c.putter ? '' : `Target ${Math.round(G.targetDist)}`;
    const eff = effCarry(G.clubIdx);
    $('meterRight').textContent = c.putter ? `100% = rolls to the marker (${fmtDist(eff, true)})` : `100% = ${Math.round(eff)} · red to ${Math.round(eff * METER.max)} yds`;
    if (G.idealP == null) G.idealP = clamp(G.targetDist / eff, 0.02, METER.max);
    updateClubCard();
    updateWind();
  }
  // Swing meter: green (easy) -> yellow -> red (up to 110% power, tiny sweet spot, fast return).
  const METER = { min: -0.18, max: 1.1, green: 0.7, yellow: 0.95 };
  const mpos = (m) => (m - METER.min) / (METER.max - METER.min) * 100;
  const zoneOf = (p) => (p >= METER.yellow ? 'red' : p >= METER.green ? 'yellow' : 'green');
  function sweetFor(c, p) {
    const base = 0.028 * brandOf(c).sweet * (c.putter ? 1.4 : 1), z = zoneOf(p);
    if (c.putter) return base * 1.2;          // putting has no power zones
    return base * (z === 'green' ? 1.5 : z === 'yellow' ? 1 : 0.45);
  }
  const returnSpeed = (p) => 1.3 + Math.max(0, p - METER.yellow) * 7;
  (function paintMeter() {
    const z = mpos(0), g = mpos(METER.green), y = mpos(METER.yellow);
    const grad = (a) => `linear-gradient(90deg, transparent 0 ${z}%, rgba(31,154,74,${a}) ${z}%, rgba(63,208,106,${a}) ${g - 3}%, rgba(242,194,48,${a}) ${g + 3}%, rgba(245,184,42,${a}) ${y - 1.5}%, rgba(224,52,74,${a}) ${y + 1.5}%, rgba(179,18,43,${a}) 100%)`;
    $('meterZones').style.background = grad(0.3);
    $('meterFill').style.background = grad(1);
    document.querySelector('.meter-zero').style.left = z + '%';
    for (const [id, v] of [['tickG', METER.green], ['tickY', METER.yellow], ['tick100', 1]]) $(id).style.left = mpos(v) + '%';
  })();
  function updateMeter() {
    const needle = $('meterNeedle'), fill = $('meterFill'), pm = $('meterPower');
    const live = G.phase === 'power' || G.phase === 'accuracy';
    const m = live ? G.m : (G.phase === 'swing' ? G.acc : 0);
    needle.style.left = mpos(m) + '%';
    const top = G.phase === 'power' ? G.m : (G.phase === 'accuracy' || G.phase === 'swing' || G.phase === 'flight') ? G.power : 0;
    fill.style.clipPath = `inset(0 ${100 - mpos(Math.max(0, top))}% 0 ${mpos(0)}%)`;
    if (G.idealDirty && G.time - idealAt > 0.12) { G.idealDirty = false; idealAt = G.time; solveIdealPower(); }
    const pb = $('meterHint'), ip = G.idealP ?? 0.8, w = perfectW();
    pb.hidden = !!CLUBS[G.clubIdx].putter;
    pb.style.left = mpos(Math.max(0, ip - w)) + '%'; pb.style.width = (mpos(ip + w) - mpos(Math.max(0, ip - w))) + '%';
    const sw = $('meterSweet'), sweet = sweetFor(CLUBS[G.clubIdx], G.phase === 'power' ? G.m : G.phase === 'aim' ? 0.8 : G.power);
    sw.style.left = mpos(-sweet) + '%'; sw.style.width = (mpos(sweet) - mpos(-sweet)) + '%';
    pm.style.display = (G.phase === 'accuracy' || G.phase === 'swing' || G.phase === 'flight') ? 'block' : 'none';
    pm.style.left = mpos(G.power) + '%';
  }
  function updateMeterMsg() {
    const msg = { aim: '<b>Space</b> or tap to swing', power: 'Tap to set <b>power</b>', accuracy: G.perfectPower ? '<b>PERFECT POWER!</b> Now tap on the <b>white line</b>' : { green: 'Green zone · easy strike: tap on the <b>white line</b>', yellow: 'Yellow zone · tap on the <b>white line</b>', red: '<b>Red zone</b> · extra power, tiny sweet spot!' }[zoneOf(G.power)],
      swing: '', flight: (G.shot && G.shot.putt) ? '' : 'Hold <b>Space</b> for spin · <b>arrows</b> aim it', flyover: 'Tap to skip flyover', result: '', holed: '' }[G.phase] ?? '';
    $('meterMsg').innerHTML = msg || '&nbsp;';
  }
  function updateWind() {
    $('windMph').textContent = G.wind.mph;
    $('windArrow').style.transform = `rotate(${(G.wind.ang - G.aim) * 180 / Math.PI}deg)`;
  }
  const SHAPE_NAMES = { '-1': 'Draw', '0': 'Straight', '1': 'Fade' };
  function spinName() {
    const p = G.spinPt || { x: 0, y: 0 }, out = [];
    if (Math.abs(p.y) >= 0.03) out.push(`${p.y < 0 ? 'Back' : 'Top'} ${Math.round(Math.abs(p.y) * 100)}%`);
    if (Math.abs(p.x) >= 0.03) out.push(`${p.x > 0 ? 'Right' : 'Left'} ${Math.round(Math.abs(p.x) * 100)}%`);
    return out.join(' · ') || 'No spin';
  }
  function updateSideUI() {
    const putter = CLUBS[G.clubIdx].putter, flying = G.phase === 'flight' && G.shot && !G.shot.putt;
    $('shapeBox').hidden = !!flying; $('spinBox').hidden = !flying;
    $('shapeBox').classList.toggle('off', !!putter || G.phase !== 'aim');
    const sx = G.shapeX || 0, sy = G.shapeY || 0;
    $('shapeDot').style.left = (50 + sx * 42) + '%'; $('shapeDot').style.top = (50 - sy * 42) + '%';
    const parts = [];
    if (Math.abs(sx) >= 0.05) parts.push(`${sx < 0 ? 'Draw' : 'Fade'} ${Math.round(Math.abs(sx) * 100)}%`);
    if (Math.abs(sy) >= 0.05) parts.push(`${sy > 0 ? 'High' : 'Low'} ${Math.round(Math.abs(sy) * 100)}%`);
    $('shapeLabel').textContent = parts.length ? parts.join(' · ') : 'Stock shot';
    if (flying) {
      $('spinRing').style.setProperty('--amt', G.spinAmt.toFixed(3));
      const p = G.spinPt || { x: 0, y: 0 };
      $('spinPtDot').style.left = (50 + p.x * 40) + '%'; $('spinPtDot').style.top = (50 - p.y * 40) + '%';
      $('spinLabel').textContent = G.spinAmt > 0.02 ? spinName() : 'Hold Space';
    }
  }
  function setShape(x, y, quiet) {
    if (G.phase !== 'aim' || CLUBS[G.clubIdx].putter) return;
    const snap = (v) => (Math.abs(v) < 0.08 ? 0 : clamp(v, -1, 1));
    G.shapeX = snap(x); G.shapeY = snap(y);
    applyTarget(); updateSideUI(); if (!quiet) Sfx.tick();
  }


  // ---------------- minimap ----------------
  const mm = $('minimap'), mctx = mm.getContext('2d');
  let mmDirty = true, mmFrame = 0, mmDpr = 1;
  function mmSize() {
    const r = mm.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    mmDpr = dpr;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (mm.width !== w || mm.height !== h) { mm.width = w; mm.height = h; }
    mmDirty = true;
  }
  function mmXform() {
    const h = G.hole, W = mm.width, H = mm.height;
    let cx, cy, spanX, spanY;
    if (G.mmView === 'green') {
      const b = G.ball, p = h.pin, d = Math.hypot(b.x - p.x, b.y - p.y);
      cx = p.x; cy = p.y; let half = 15;
      if (d < 40) { cx = (b.x + p.x) / 2; cy = (b.y + p.y) / 2; half = Math.max(11, d * 0.62 + 5); }
      spanX = spanY = half * 2;
    } else {
      const xs = h.pts.map(p => p[0]);
      const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = -20, y1 = h.pts[h.pts.length - 1][1] + 28;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; spanX = x1 - x0; spanY = y1 - y0;
    }
    const sc = Math.min(W / spanX, H / spanY);
    const r = { x0: cx - W / sc / 2, x1: cx + W / sc / 2, y0: cy - H / sc / 2, y1: cy + H / sc / 2 };
    return { r, sc, to: (x, y) => [(x - r.x0) * sc, (r.y1 - y) * sc], from: (px, py) => [r.x0 + px / sc, r.y1 - py / sc] };
  }
  function drawMinimap() {
    const h = G.hole; if (!h || !h.canvas || !mm.width) return;
    const X = mmXform(), { r, sc } = X, W = mm.width, H = mm.height, c = mctx;
    const dpr = mmDpr;
    c.fillStyle = h.theme.outer; c.fillRect(0, 0, W, H);
    const [sx, sy] = h.toCanvas(r.x0, r.y1), sw = (r.x1 - r.x0) * h.ppy, sh = (r.y1 - r.y0) * h.ppy;
    const img = h.canvas, kx = W / sw, ky = H / sh;
    const ax = Math.max(0, sx), ay = Math.max(0, sy), bx = Math.min(img.width, sx + sw), by = Math.min(img.height, sy + sh);
    if (bx > ax && by > ay) c.drawImage(img, ax, ay, bx - ax, by - ay, (ax - sx) * kx, (ay - sy) * ky, (bx - ax) * kx, (by - ay) * ky);
    if (G.mmView === 'hole') {
      for (const t of h.trees.concat(h.rocks)) {
        if (t.x < r.x0 - 6 || t.x > r.x1 + 6 || t.y < r.y0 - 6 || t.y > r.y1 + 6) continue;
        const [px, py] = X.to(t.x, t.y);
        c.fillStyle = t.mm || '#8a8680';
        c.beginPath(); c.arc(px, py, Math.max(1.2 * dpr, t.r * sc * 0.8), 0, 6.283); c.fill();
      }
    } else {
      const step = Math.max(1.4, 16 * dpr / sc);
      c.lineWidth = 1.2 * dpr; c.lineCap = 'round';
      for (let x = Math.ceil(r.x0 / step) * step; x < r.x1; x += step) for (let y = Math.ceil(r.y0 / step) * step; y < r.y1; y += step) {
        if (ellD(h.green, x, y) > 1.04) continue;
        const [hx, hy] = h.gradAt(x, y), m = Math.hypot(hx, hy);
        if (m < 0.004) continue;
        const ux = -hx / m, uy = -hy / m, len = Math.min(step * 0.8, step * 0.25 + m * 30 * step);
        const [p0x, p0y] = X.to(x - ux * len / 2, y - uy * len / 2), [p1x, p1y] = X.to(x + ux * len / 2, y + uy * len / 2);
        c.strokeStyle = m < 0.012 ? 'rgba(255,255,255,.75)' : m < 0.024 ? 'rgba(255,214,90,.95)' : 'rgba(255,90,70,.95)';
        c.beginPath(); c.moveTo(p0x, p0y); c.lineTo(p1x, p1y);
        const a = Math.atan2(p1y - p0y, p1x - p0x), hl = 3.2 * dpr;
        c.lineTo(p1x - Math.cos(a - 0.5) * hl, p1y - Math.sin(a - 0.5) * hl);
        c.moveTo(p1x, p1y); c.lineTo(p1x - Math.cos(a + 0.5) * hl, p1y - Math.sin(a + 0.5) * hl);
        c.stroke();
      }
    }
    const b = G.ball;
    const [bpx, bpy] = X.to(b.x, b.y);
    if (G.phase === 'aim' || G.phase === 'power' || G.phase === 'accuracy' || G.phase === 'flyover') {
      const [tpx, tpy] = X.to(G.target.x, G.target.y);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5 * dpr; c.setLineDash([4 * dpr, 3 * dpr]);
      c.beginPath(); c.moveTo(bpx, bpy); c.lineTo(tpx, tpy); c.stroke(); c.setLineDash([]);
      const rr = Math.max(4 * dpr, (CLUBS[G.clubIdx].putter ? 0.3 : 1 + G.targetDist * 0.012) * sc);
      c.lineWidth = 2 * dpr; c.beginPath(); c.arc(tpx, tpy, rr, 0, 6.283); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
    }
    if (G.shot && (G.phase === 'flight' || G.phase === 'result' || G.phase === 'holed')) {
      const P = G.shot.pts, n = Math.min(P.length / 4, Math.floor(G.shot.t / Phys.DT) + 1);
      c.strokeStyle = '#ffd24a'; c.lineWidth = 2 * dpr; c.beginPath();
      for (let i = 0; i < n; i += 4) { const [px, py] = X.to(P[i * 4], P[i * 4 + 1]); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
    }
    if (G.read && CLUBS[G.clubIdx].putter && (G.phase === 'aim' || G.phase === 'power' || G.phase === 'accuracy')) {
      const P = G.read.pts;
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 2 * dpr; c.setLineDash([]);
      c.beginPath();
      for (let i = 0; i <= G.read.end; i += 8) { const [qx, qy] = X.to(P[i], P[i + 1]); i ? c.lineTo(qx, qy) : c.moveTo(qx, qy); }
      c.stroke();
    }
    // pin flag
    const [fx, fy] = X.to(h.pin.x, h.pin.y);
    c.fillStyle = '#111'; c.beginPath(); c.arc(fx, fy, 2 * dpr, 0, 6.283); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5 * dpr; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 14 * dpr); c.stroke();
    c.fillStyle = h.theme.flag; c.beginPath(); c.moveTo(fx, fy - 14 * dpr); c.lineTo(fx + 9 * dpr, fy - 11 * dpr); c.lineTo(fx, fy - 8 * dpr); c.fill();
    // ball
    const bp = G.shot && G.phase === 'flight' ? X.to(G.shot.x, G.shot.y) : [bpx, bpy];
    c.fillStyle = '#fff'; c.strokeStyle = '#0b2a20'; c.lineWidth = 1.5 * dpr;
    c.beginPath(); c.arc(bp[0], bp[1], 3.6 * dpr, 0, 6.283); c.fill(); c.stroke();
  }
  function mmAim(e) {
    if (G.mode !== 'play' || G.phase !== 'aim') return;
    const rect = mm.getBoundingClientRect();
    const px = (e.clientX - rect.left) * mm.width / rect.width, py = (e.clientY - rect.top) * mm.height / rect.height;
    const [x, y] = mmXform().from(px, py), b = G.ball;
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < 0.5) return;
    G.aim = Math.atan2(x - b.x, y - b.y); G.wantDist = d; G.userAim = true;
    applyTarget();
  }
  let mmDown = false;
  mm.addEventListener('pointerdown', (e) => { mmDown = true; mm.setPointerCapture(e.pointerId); mmAim(e); });
  mm.addEventListener('pointermove', (e) => { if (mmDown) mmAim(e); });
  mm.addEventListener('pointerup', () => { mmDown = false; });
  $('mmToggle').addEventListener('click', () => {
    G.mmView = G.mmView === 'green' ? 'hole' : 'green';
    $('mmToggle').setAttribute('aria-pressed', String(G.mmView === 'green')); mmDirty = true;
  });

  // ---------------- scorecard ----------------
  function markClass(score, par) {
    const d = score - par;
    return d <= -2 ? 'e' : d === -1 ? 'b' : d === 1 ? 'bo' : d >= 2 ? 'db' : '';
  }
  function buildCard() {
    const c = G.course, holes = c.pars.map((_, i) => getHole(c, i));
    const cur = (i) => (i === G.holeIdx && G.mode === 'play' ? ' class="cur"' : '');
    let html = '<tr><th>Hole</th>' + holes.map((_, i) => `<th${cur(i)}>${i + 1}</th>`).join('') + '<th>Out</th></tr>';
    html += '<tr><td>Yards</td>' + holes.map((h, i) => `<td${cur(i)}>${h.yards}</td>`).join('') + `<td class="tot">${holes.reduce((s, h) => s + h.yards, 0)}</td></tr>`;
    html += '<tr><td>Par</td>' + holes.map((h, i) => `<td${cur(i)}>${h.par}</td>`).join('') + `<td class="tot">${c.pars.reduce((a, b) => a + b, 0)}</td></tr>`;
    let tot = 0;
    html += '<tr><td>Score</td>' + holes.map((h, i) => {
      const s = G.scores[i];
      if (s == null) return `<td${cur(i)}>–</td>`;
      tot += s;
      return `<td${cur(i)}><span class="mk ${markClass(s, h.par)}">${s}</span></td>`;
    }).join('') + `<td class="tot">${tot || '–'}</td></tr>`;
    html = html.replace('<td>Score</td>', `<td>${settings.name.toUpperCase()}</td>`);
    $('scTable').innerHTML = html;
    $('cardCourse').textContent = c.name;
    const rtp = roundToPar();
    $('cardMe').innerHTML = `<span class="nm">${settings.name.toUpperCase()}</span><span class="tp${rtp < 0 ? ' u' : ''}">${fmtPar(rtp)}</span>`;
  }
  function showCard(between) {
    buildCard();
    const btns = $('cardBtns'), last = G.holeIdx >= G.course.pars.length - 1, done = between && last;
    $('cardTitle').textContent = done ? 'Round complete' : 'Scorecard';
    $('cardSummary').textContent = '';
    btns.innerHTML = '';
    const add = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; btns.append(b); return b; };
    if (done) {
      const total = G.scores.reduce((a, b) => a + (b || 0), 0), par = G.course.pars.reduce((a, b) => a + b, 0);
      const birdies = G.scores.filter((s, i) => s < G.course.pars[i]).length;
      const prev = bests[G.course.id];
      const isBest = prev == null || total < prev;
      if (isBest) { bests[G.course.id] = total; store.save('bests', bests); }
      $('cardSummary').textContent = `${total} strokes (${totalStr()}) on a par ${par}. ${birdies} ${birdies === 1 ? 'hole' : 'holes'} under par.` +
        (isBest ? ' New course best.' : ` Course best: ${prev}.`);
      add('Main menu', '', () => { $('card').hidden = true; enterMenu(); });
      add('Play again', 'primary', () => { $('card').hidden = true; startRound(); }).focus();
    } else if (between) {
      add('Next hole', 'primary', () => { $('card').hidden = true; beginHole(G.holeIdx + 1); }).focus();
    } else {
      add('Close', 'primary', () => { $('card').hidden = true; G.paused = false; }).focus();
    }
    $('card').hidden = false;
    if (!between) G.paused = true;
  }

  // ---------------- pause ----------------
  function togglePause(force) {
    const open = force ?? $('pause').hidden;
    if (!$('card').hidden) return;
    $('pause').hidden = !open; G.paused = open;
    $('pauseCourse').textContent = `${G.course.name} · Hole ${G.holeIdx + 1}`;
    $('soundBtn').setAttribute('aria-pressed', String(settings.sound)); $('soundBtn').textContent = settings.sound ? 'On' : 'Off';
    $('fansBtn').setAttribute('aria-pressed', String(settings.fans)); $('fansBtn').textContent = settings.fans ? 'On' : 'Off';
    if (open) $('resumeBtn').focus();
  }
  $('btnPause').onclick = () => togglePause(true);
  $('resumeBtn').onclick = () => togglePause(false);
  $('quitBtn').onclick = () => { togglePause(false); enterMenu(); };
  $('restartBtn').onclick = () => { togglePause(false); G.scores[G.holeIdx] = undefined; beginHole(G.holeIdx, true); };

  // ---------------- reset when something gets stuck ----------------
  // Puts the round back into a clean "ready to hit" state without losing the score.
  function resetShot(reason) {
    if (G.mode !== 'play' || !G.hole) return;
    G.token++;                                   // cancel any pending timers from the stuck state
    const wasPhase = G.phase;
    G.paused = false;
    for (const id of ['pause', 'loading', 'banner', 'lt3', 'intro', 'toast']) $(id).hidden = true;
    if (wasPhase === 'holed') {                  // the hole was finished: go straight to the card
      if (G.scores[G.holeIdx] == null) G.scores[G.holeIdx] = G.strokes;
      showCard(true); return;
    }
    $('card').hidden = true;
    let b = G.ball;
    if (wasPhase === 'flight' && G.prev) {       // shot interrupted mid-air: replay it, no stroke charged
      b = { ...G.prev }; G.strokes = Math.max(0, G.strokes - 1);
    }
    const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && !['water', 'ob'].includes(G.hole.surfaceAt(p.x, p.y));
    if (!ok(b)) b = ok(G.prev) ? { ...G.prev } : { x: 0, y: 0 };
    G.ball = { x: b.x, y: b.y, z: 0 };
    G.shot = null; G.spinCharge = false; G.spinAmt = 0; G.spinPt = { x: 0, y: 0 };
    camInit = false; ballPrevOk = false; ballMesh.quaternion.identity(); ballMesh.visible = true;
    if (!G.hole.group) showHole(G.holeIdx);
    prepareShot();
    resize();
    toast(`<b>Reset</b> · ${reason || 'ready to hit'}`);
  }
  function reloadHole() {
    if (G.mode !== 'play') return;
    const keep = { ball: { ...G.ball }, strokes: G.strokes, prev: G.prev };
    togglePause(false);
    G.token++;
    withLoading(() => {
      showHole(G.holeIdx);
      G.strokes = keep.strokes; G.prev = keep.prev; G.ball = keep.ball;
      resetShot('hole reloaded');
    });
  }
  $('btnReset').onclick = () => resetShot();
  $('resetBtn').onclick = () => { togglePause(false); resetShot(); };
  $('reloadBtn').onclick = reloadHole;

  // Watchdog: if a phase that should end by itself lasts far too long, reset it.
  const PHASE_LIMIT = { swing: 4, flight: 45, result: 9, holed: 12, flyover: 10 };
  let watchPhase = '', watchT = 0, loadT = 0;
  function watchdog(dt) {
    if (G.mode !== 'play') { watchPhase = ''; return; }
    if (!$('loading').hidden) { loadT += dt; if (loadT > 12) { loadT = 0; $('loading').hidden = true; resetShot('loading took too long'); } return; }
    loadT = 0;
    if (G.paused || !$('card').hidden) { watchT = 0; return; }
    if (G.phase !== watchPhase) { watchPhase = G.phase; watchT = 0; return; }
    watchT += dt;
    const lim = PHASE_LIMIT[G.phase];
    if (lim && watchT > lim) { watchT = 0; resetShot('the game got stuck, so the shot was reset'); }
    const bad = !Number.isFinite(G.ball.x + G.ball.y) || !Number.isFinite(camera.position.x + camera.position.y + camera.position.z);
    if (bad) resetShot('fixed a glitch');
  }
  window.addEventListener('error', () => {
    if (G.mode === 'play') toast('Something went wrong. Press <b>R</b> or tap <b>Reset</b> if the game stops responding.');
  });
  function setFans(on) {
    settings.fans = on; saveSettings();
    if (G.crowd) G.crowd.group.visible = on;
    Sfx.ambient(on && G.mode === 'play');
    document.querySelectorAll('[data-fans]').forEach(b => b.setAttribute('aria-checked', String((b.dataset.fans === 'on') === on)));
  }
  $('soundBtn').onclick = () => { settings.sound = !settings.sound; saveSettings(); applyTime(settings.time); togglePause(true); };
  $('fansBtn').onclick = () => { setFans(!settings.fans); togglePause(true); };
  document.querySelectorAll('[data-fans]').forEach(b => b.onclick = () => setFans(b.dataset.fans === 'on'));
  setFans(settings.fans);
  $('btnCard').onclick = () => { if ($('card').hidden) showCard(false); };
  $('btnView').onclick = () => { if (G.phase === 'aim') G.viewTarget = !G.viewTarget; };
  $('clubPrev').onclick = () => changeClub(-1);
  $('clubNext').onclick = () => changeClub(1);
  $('meter').addEventListener('pointerdown', (e) => { e.preventDefault(); swingClick(); });

  // shot shape buttons and in-flight spin widget
  const shapePad = $('shapePad');
  let shapeDrag = false;
  const padSet = (e) => {
    const r = shapePad.getBoundingClientRect();
    setShape(((e.clientX - r.left) / r.width * 2 - 1) / 0.84, -((e.clientY - r.top) / r.height * 2 - 1) / 0.84, true);
  };
  shapePad.addEventListener('pointerdown', (e) => { if (G.phase !== 'aim') return; shapeDrag = true; shapePad.setPointerCapture(e.pointerId); padSet(e); });
  shapePad.addEventListener('pointermove', (e) => { if (shapeDrag) padSet(e); });
  shapePad.addEventListener('pointerup', () => { if (shapeDrag) Sfx.tick(); shapeDrag = false; });
  shapePad.addEventListener('dblclick', () => setShape(0, 0));
  const ringEl = $('spinRing');
  let ringDrag = false;
  const ringSet = (e) => {
    if (!canSpin()) return;
    const r = ringEl.getBoundingClientRect();
    setSpinPt(((e.clientX - r.left) / r.width * 2 - 1) / 0.8, -((e.clientY - r.top) / r.height * 2 - 1) / 0.8);
  };
  ringEl.addEventListener('pointerdown', (e) => { e.preventDefault(); ringDrag = true; ringEl.setPointerCapture(e.pointerId); ringSet(e); Sfx.tick(); });
  ringEl.addEventListener('pointermove', (e) => { if (ringDrag) ringSet(e); });
  ringEl.addEventListener('pointerup', () => { ringDrag = false; });
  ringEl.addEventListener('pointercancel', () => { ringDrag = false; });
  document.querySelectorAll('[data-spin]').forEach(b => b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!canSpin()) return;
    const [x, y] = b.dataset.spin.split(',').map(Number);
    nudgeSpin(x, y, 0.1); Sfx.tick();
    clearInterval(b._rep); b._rep = setInterval(() => { if (canSpin()) nudgeSpin(x, y, 0.06); else clearInterval(b._rep); }, 110);
  }));
  document.querySelectorAll('[data-spin]').forEach(b => { for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearInterval(b._rep)); });

  // ---------------- input on the 3D view ----------------
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, drag: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || G.mode !== 'play') return;
    const dx = e.clientX - down.x;
    if (!down.drag && Math.abs(dx) > 7) down.drag = true;
    if (down.drag && G.phase === 'aim') {
      const k = CLUBS[G.clubIdx].putter ? 0.0012 : 0.0035;
      G.aim += dx * k; down.x = e.clientX; G.userAim = true;
      applyTarget();
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (down && !down.drag && G.mode === 'play') swingClick();
    down = null;
  });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.shiftKey) keys.Shift = true;
    if (G.mode !== 'play') return;
    if (e.code === 'Escape') {
      if (!$('card').hidden && !G.paused) return;
      if (!$('card').hidden) { $('card').hidden = true; G.paused = false; return; }
      if (!cancelSwing()) togglePause();
      return;
    }
    if (e.code === 'KeyR') { resetShot(); return; }
    if (G.paused) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (G.phase === 'flight') { if (!e.repeat) { G.spinCharge = true; addSpinTap(); } }
      else if (!e.repeat) swingClick();
    }
    else if (e.code === 'KeyQ') setShape((G.shapeX || 0) - 0.25, G.shapeY || 0);
    else if (e.code === 'KeyE') setShape((G.shapeX || 0) + 0.25, G.shapeY || 0);
    else if (e.code === 'KeyZ') setShape(G.shapeX || 0, (G.shapeY || 0) - 0.25);
    else if (e.code === 'KeyX') setShape(G.shapeX || 0, (G.shapeY || 0) + 0.25);
    else if (canSpin() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) { nudgeSpin(e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0, e.code === 'ArrowUp' ? 1 : e.code === 'ArrowDown' ? -1 : 0, 0.08); Sfx.tick(); }
    }
    else if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && CLUBS[G.clubIdx].putter && G.phase === 'aim') {
      e.preventDefault();
      G.wantDist = Math.max(0.33, G.wantDist + (e.code === 'ArrowUp' ? 1 : -1) / 3 * (e.shiftKey ? 3 : 1));
      G.userAim = true; applyTarget();
    }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); changeClub(-1); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); changeClub(1); }
    else if (e.code === 'KeyC') { if ($('card').hidden) showCard(false); }
    else if (e.code === 'KeyT') { if (G.phase === 'aim') G.viewTarget = !G.viewTarget; }
    else if (e.code === 'KeyM') $('mmToggle').click();
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (!e.shiftKey) keys.Shift = false; if (e.code === 'Space') G.spinCharge = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.spinCharge = false; });

  // ---------------- main menu UI ----------------
  function radio(el, on) { el.setAttribute('aria-checked', String(on)); }
  function buildMenu() {
    const list = $('courseList');
    list.innerHTML = '';
    for (const c of COURSES) {
      const th = THEMES[c.theme], par = c.pars.reduce((a, b) => a + b, 0);
      const b = document.createElement('button');
      b.className = 'course'; b.setAttribute('role', 'radio'); b.dataset.course = c.id;
      b.innerHTML = `<span class="cn">${c.name}</span><span class="cm">Par ${par} · ${courseYards(c).toLocaleString()} yds</span>
        <span class="cb">${c.blurb}</span>
        <span class="turf">${[th.fair, th.rough, th.sand, th.water, th.green, th.outer].map(x => `<i style="background:${x}"></i>`).join('')}</span>`;
      b.onclick = () => {
        if (settings.course === c.id) return;
        settings.course = c.id; saveSettings();
        list.querySelectorAll('.course').forEach(x => radio(x, x.dataset.course === c.id));
        updateBest(); loadMenuScene();
      };
      radio(b, c.id === settings.course);
      list.append(b);
    }
    for (const id of ['timeSeg', 'timeSeg2']) {
      const seg = $(id); seg.innerHTML = '';
      for (const k in TIMES) {
        const T = TIMES[k], b = document.createElement('button');
        b.setAttribute('role', 'radio'); b.dataset.time = k;
        b.innerHTML = `<i style="background:linear-gradient(${T.skyTop}, ${T.skyBot})"></i>${T.label}`;
        b.onclick = () => { Sfx.init(); applyTime(k); saveSettings(); };
        seg.append(b);
      }
    }
    // outfit
    document.querySelectorAll('[data-opt]').forEach(box => {
      const key = box.dataset.opt; box.innerHTML = ''; box.setAttribute('role', 'radiogroup');
      for (const col of OUTFIT_OPTIONS[key]) {
        const b = document.createElement('button');
        b.className = 'sw'; b.style.background = col; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', key + ' ' + col); b.dataset.val = col;
        b.onclick = () => { settings.outfit[key] = col; outfitChanged(); };
        box.append(b);
      }
      // any colour at all via the native picker
      const cust = document.createElement('label');
      cust.className = 'sw custom'; cust.setAttribute('role', 'radio'); cust.title = 'Pick any colour';
      const inp = document.createElement('input');
      inp.type = 'color'; inp.id = 'pick-' + key; inp.setAttribute('aria-label', 'Custom ' + key + ' colour');
      inp.addEventListener('input', () => { settings.outfit[key] = inp.value; outfitChanged(); });
      cust.append(inp); box.append(cust);
    });
    document.querySelectorAll('[data-pill]').forEach(box => {
      const key = box.dataset.pill; box.innerHTML = ''; box.setAttribute('role', 'radiogroup');
      for (const [val, label] of OUTFIT_OPTIONS[key]) {
        const b = document.createElement('button');
        b.className = 'pill'; b.textContent = label; b.setAttribute('role', 'radio'); b.dataset.val = val;
        b.onclick = () => { settings.outfit[key] = val; outfitChanged(); };
        box.append(b);
      }
    });
    $('randomFit').onclick = () => {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      for (const k of ['shirt', 'pants', 'hatColor', 'shoes']) settings.outfit[k] = pick(OUTFIT_OPTIONS[k]);
      settings.outfit.hat = pick(OUTFIT_OPTIONS.hat)[0]; settings.outfit.bottoms = pick(OUTFIT_OPTIONS.bottoms)[0];
      outfitChanged();
    };
    syncOutfitUI();
    const nm = $('playerName'); nm.value = settings.name;
    nm.addEventListener('input', () => { settings.name = nm.value.trim().slice(0, 14) || 'You'; saveSettings(); });
    buildBag();
    // tabs
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
      document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      if (t.dataset.tab === 'golfer') G.orbit = Math.atan2(camPos.x - golfer.root.position.x, camPos.z - golfer.root.position.z);
    });
    $('teeOff').onclick = startRound;
  }
  function outfitChanged() { golfer.setOutfit(settings.outfit); applyBallColor(); saveSettings(); syncOutfitUI(); }
  function applyBallColor() {
    const c = settings.outfit.ball || '#ffffff';
    ballMat.color.set(c);
    ballMat.emissive.set(c).multiplyScalar(TIMES[settings.time].lamps ? 0.55 : 0.12);
  }
  function syncOutfitUI() {
    document.querySelectorAll('[data-opt]').forEach(box => {
      const v = settings.outfit[box.dataset.opt], known = OUTFIT_OPTIONS[box.dataset.opt].includes(v);
      box.querySelectorAll('.sw').forEach(b => radio(b, b.classList.contains('custom') ? !known : b.dataset.val === v));
      const cust = box.querySelector('.custom');
      if (cust) { cust.style.setProperty('--pick', known ? 'transparent' : v); cust.querySelector('input').value = v; }
    });
    document.querySelectorAll('[data-pill]').forEach(box => box.querySelectorAll('.pill').forEach(b => radio(b, b.dataset.val === settings.outfit[box.dataset.pill])));
  }
  function buildBag() {
    const wrap = $('bagSlots'); wrap.innerHTML = '';
    for (const slot of BAG_SLOTS) {
      const br = BRANDS.find(b => b.id === settings.bag[slot.id]) || BRANDS[1];
      const d = document.createElement('div'); d.className = 'slot';
      const stat = (label, v) => `<span>${label}</span><div class="bar"><i style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i></div>`;
      const stats = slot.id === 'putter'
        ? stat('Accuracy', (br.sweet - 0.6) / 1.1) + stat('Forgiveness', br.forgive / 0.7)
        : stat('Distance', (br.dist - 0.9) / 0.18) + stat('Accuracy', (br.sweet - 0.6) / 1.1) + stat('Forgiveness', br.forgive / 0.7) + stat('Spin', (br.spin - 0.8) / 0.6);
      d.innerHTML = `<div class="slot-head"><b>${slot.label}</b><span>${slot.clubs}</span></div>
        <div class="brandpick" role="radiogroup">${BRANDS.map(b => `<button class="brandbtn" role="radio" aria-checked="${b.id === br.id}" data-b="${b.id}"><i style="background:linear-gradient(90deg, ${b.head} 60%, ${b.accent} 60%)"></i>${b.name}</button>`).join('')}</div>
        <p class="blurb"><b style="color:var(--chalk)">${br.name}</b> · ${br.tag}. ${br.blurb}</p>
        <div class="stats">${stats}</div>`;
      d.querySelectorAll('.brandbtn').forEach(btn => btn.onclick = () => {
        settings.bag[slot.id] = btn.dataset.b; saveSettings(); buildBag();
        if (G.mode === 'menu') equipClub();
      });
      wrap.append(d);
    }
    $('bagTable').innerHTML = CLUBS.map(c => {
      const br = brandOf(c);
      return `<tr><td>${c.name}</td><td>${br.name}</td><td>${c.putter ? '—' : Math.round(c.carry * br.dist) + ' yds'}</td></tr>`;
    }).join('');
  }
  function updateBest() {
    const b = bests[settings.course], c = COURSES.find(x => x.id === settings.course);
    if (b == null) { $('bestScore').textContent = 'No card yet'; return; }
    const d = b - c.pars.reduce((a, x) => a + x, 0);
    $('bestScore').innerHTML = `Best <b style="color:var(--chalk)">${b}</b> (${d === 0 ? 'E' : d > 0 ? '+' + d : d})`;
  }

  // ---------------- live flight read-out & ball marker ----------------
  const _p = V3();
  let statTick = 0;
  function currentRpm() {
    const back = -G.spinDir.y * G.spinAmt * G.spinMul;
    return Math.max(300, G.rpmBase * (1 + back * 0.55) + Math.abs(G.spinDir.x * G.spinAmt * G.spinMul) * 1800);
  }
  // ---------------- divots & sand splash ----------------
  const DIRT = new THREE.MeshLambertMaterial({ color: 0x5b4128 });
  const scarGeo = new THREE.CircleGeometry(0.5, 14);
  const chunkGeo = new THREE.BoxGeometry(0.13, 0.03, 0.26);
  const PART_N = 90, partPos = new Float32Array(PART_N * 3), partCol = new Float32Array(PART_N * 3), parts = [];
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
  const partPts = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, map: dotTex, transparent: true, depthWrite: false, alphaTest: 0.2 }));
  partPts.frustumCulled = false; partPts.visible = false; scene.add(partPts);
  const chunks = [];
  function spawnDivot(b, aim, club, surf, power) {
    const h = G.hole;
    if (!h || !h.group || club.putter || surf === 'green' || surf === 'fringe') return;
    const iron = club.type === 'iron' || club.type === 'wedge' || club.type === 'hybrid';
    const sand = surf === 'bunker';
    if (!iron && !sand) return;
    const sa = Math.sin(aim), ca = Math.cos(aim), big = club.type === 'wedge' ? 1.1 : club.type === 'hybrid' ? 0.6 : 1;
    const x = b.x + sa * 0.08, y = b.y + ca * 0.08, gz = h.heightAt(x, y);
    const grass = new THREE.Color(sand ? h.theme.sand : h.theme[surf === 'rough' ? 'rough' : 'fair']);
    const soil = new THREE.Color(sand ? h.theme.sand2 : '#5b4128');
    // scar left in the turf (or a crater in the sand)
    const scar = new THREE.Mesh(scarGeo, sand ? new THREE.MeshLambertMaterial({ color: new THREE.Color(h.theme.sand2) }) : DIRT);
    scar.rotation.set(-Math.PI / 2, 0, -aim);
    scar.scale.set(sand ? 0.34 : 0.12 * big, sand ? 0.42 : 0.3 * big, 1);
    scar.position.set(x + sa * 0.1, gz + 0.012, -(y + ca * 0.1));
    scar.renderOrder = 1; scar.material.polygonOffset = true; scar.material.polygonOffsetFactor = -1;
    h.group.add(scar);
    // the turf chunk itself, grass on top and dirt underneath
    if (!sand) {
      const mats = [DIRT, DIRT, new THREE.MeshLambertMaterial({ color: grass }), DIRT, DIRT, DIRT];
      const m = new THREE.Mesh(chunkGeo, mats);
      m.scale.setScalar(big * (0.8 + power * 0.4)); m.castShadow = true;
      m.position.set(x, gz + 0.03, -y);
      m.rotation.y = -aim;
      const sp = (3.5 + power * 5) * big, side = (Math.random() - 0.5) * 1.6;
      chunks.push({ m, vx: sa * sp + ca * side, vy: ca * sp - sa * side, vz: 3 + Math.random() * 3.5 * power,
        wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 6, wz: (Math.random() - 0.5) * 18, done: false });
      h.group.add(m);
    }
    // spray of bits
    const n = sand ? 70 : 34;
    for (let i = 0; i < n; i++) {
      const p = parts.length < PART_N ? {} : parts.shift();
      const a = aim + (Math.random() - 0.5) * (sand ? 1.6 : 0.9), sp = (sand ? 2 + Math.random() * 6 : 1.5 + Math.random() * 5) * (0.6 + power * 0.5);
      Object.assign(p, { x, y, z: gz + 0.02, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, vz: 1.5 + Math.random() * (sand ? 5 : 3.5), life: 0.9 + Math.random() * 0.8,
        c: Math.random() < (sand ? 0.8 : 0.45) ? grass : soil });
      parts.push(p);
    }
    partPts.visible = true;
  }
  function updateDivots(dt) {
    const h = G.hole;
    for (const c of chunks) {
      if (c.done) continue;
      c.vz -= G_ACC * dt;
      const p = c.m.position;
      p.x += c.vx * dt; p.z -= c.vy * dt; p.y += c.vz * dt;
      c.m.rotation.x += c.wx * dt; c.m.rotation.y += c.wy * dt; c.m.rotation.z += c.wz * dt;
      const gz = h ? h.heightAt(p.x, -p.z) : 0;
      if (p.y <= gz + 0.02 && c.vz < 0) {
        if (Math.abs(c.vz) > 2) { c.vz *= -0.25; c.vx *= 0.4; c.vy *= 0.4; c.wx *= 0.4; c.wz *= 0.4; }
        else {                               // settle flat, grass side up or down
          c.done = true; p.y = gz + 0.016;
          c.m.rotation.set(Math.random() < 0.7 ? 0 : Math.PI, c.m.rotation.y, 0);
        }
      }
    }
    if (chunks.length && chunks.every(c => c.done)) chunks.length = 0;
    if (!parts.length) { partPts.visible = false; return; }
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      p.vz -= G_ACC * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const gz = h ? h.heightAt(p.x, p.y) : 0;
      if (p.z < gz) { p.z = gz; p.vx *= 0.3; p.vy *= 0.3; p.vz = 0; }
      if (p.life <= 0) { parts.splice(i, 1); continue; }
    }
    for (const p of parts) {
      partPos[n * 3] = p.x; partPos[n * 3 + 1] = p.z + 0.01; partPos[n * 3 + 2] = -p.y;
      partCol[n * 3] = p.c.r; partCol[n * 3 + 1] = p.c.g; partCol[n * 3 + 2] = p.c.b; n++;
    }
    partGeo.setDrawRange(0, n);
    partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
  }

  function updateFlightHUD() {
    const S = G.shot, flying = S && G.phase === 'flight';
    const mark = $('ballMark'), stats = $('flightStats');
    if (!flying) { mark.hidden = true; stats.hidden = true; return; }
    _p.copy(ballMesh.position).project(camera);
    const on = _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
    mark.hidden = !on;
    if (on) mark.style.transform = `translate(${(_p.x + 1) / 2 * window.innerWidth}px, ${(1 - _p.y) / 2 * window.innerHeight}px)`;
    if (!S.putt) updateSideUI();
    if ((statTick++ % 6) !== 0) return;
    stats.hidden = false;
    const h = G.hole, dist = Math.hypot(S.x - S.sx, S.y - S.sy);
    if (S.putt) {
      stats.innerHTML = `Rolling <b>${fmtDist(dist, true)}</b> · to hole <b>${fmtDist(Math.hypot(h.pin.x - S.x, h.pin.y - S.y), true)}</b>`;
    } else {
      const ht = Math.max(0, S.z - h.heightAt(S.x, S.y));
      stats.innerHTML = `Height <b>${Math.round(ht)}</b> · ${S.landed ? 'Carry <b>' + Math.round(S.res.carry) + '</b> · Total' : 'Distance'} <b>${Math.round(dist)}</b> yds` +
        ` · <b>${Math.round(currentRpm() / 10) * 10}</b> rpm` + (G.spinAmt > 0.02 ? ` · <b>${spinName()}</b>` : '');
      updateToHole(S.x, S.y);
    }
  }

  // ---------------- resize & loop ----------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (G.mode === 'menu') {
      if (w > 760) camera.setViewOffset(w, h, -Math.min(460, w) / 2, 0, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.3, w, h);
    } else {
      // lift the picture so the ball at address sits above the bottom HUD panel
      const dock = document.querySelector('.dock'), dh = dock && dock.offsetHeight ? dock.offsetHeight : 110;
      camera.setViewOffset(w, h, 0, Math.min(h * 0.2, dh * 0.9 + 10), w, h);
    }
    camera.updateProjectionMatrix();
    mmSize();
  }
  window.addEventListener('resize', resize);

  function update(dt) {
    if (G.mode === 'menu') {
      G.practiceT -= dt;
      if (G.practiceT <= 0) { golfer.practice(); G.practiceT = 8; }
      return;
    }
    const c = CLUBS[G.clubIdx];
    const spd = c.putter ? 1 / 1.6 : 1 / 1.15;
    if (G.phase === 'aim') {
      const rot = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
      if (rot) {
        const rate = (c.putter ? 0.1 : 0.4) * (keys.Shift || keys.ShiftLeft || keys.ShiftRight ? 0.2 : 1);
        G.aim += rot * rate * dt; G.userAim = true; applyTarget();
      }
    } else if (G.phase === 'power') {
      const cap = METER.max;
      G.m += dt * spd;
      if (G.m >= cap) { G.m = cap; G.power = cap; G.phase = 'accuracy'; updateMeterMsg(); }
      golfer.backswing(Math.min(1, G.m));
    } else if (G.phase === 'accuracy') {
      G.m -= dt * spd * returnSpeed(G.power);
      if (G.m <= -0.18) { G.m = -0.18; G.acc = -0.18; startDownswing(); }
    } else if (G.phase === 'flight') {
      updateFlight(dt);
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.min(1, (now - last) / 1000), dt = Math.min(0.05, rawDt); last = now;
    try { watchdog(rawDt); } catch (err) { /* never let the watchdog itself stall the loop */ }
    G.time += dt;
    if (!G.paused) { update(dt); golfer.update(dt); if (G.crowd) Crowd.update(G.crowd, dt); updateDivots(dt); }
    if (G.hole && G.hole.group) {
      updateCamera(dt);
      // ball
      let bx = G.ball.x, by = G.ball.y, bz = G.ball.z;
      const S = G.shot, inAir = S && G.phase === 'flight';
      if (inAir || (S && G.phase === 'result' && S.res.type === 'water')) { bx = S.x; by = S.y; bz = S.z; }
      const holed = G.phase === 'holed' && G.mode === 'play';
      if (holed) { bx = G.hole.pin.x; by = G.hole.pin.y; bz = G.hole.heightAt(bx, by); }
      // true size up close; grows only as much as needed to stay a few pixels wide far away
      const dist = Math.hypot(camera.position.x - bx, camera.position.y - bz, camera.position.z + by) || 1;
      const minPx = inAir ? 3.5 : 4.5, H = renderer.domElement.clientHeight || 600;
      const s = clamp(minPx * dist * Math.tan(camera.fov * Math.PI / 360) / (BALL_R * H), 1, 14);
      const lift = G.teed ? 0.03 : 0;
      ballMesh.scale.setScalar(s);
      ballMesh.position.set(bx, bz + BALL_R * s + lift - (holed ? BALL_R * 1.6 : 0), -by);
      // roll the ball along the ground; spin it backwards in the air
      if (ballPrevOk) {
        const mv = _t.subVectors(ballMesh.position, ballPrev), d = Math.hypot(mv.x, mv.z);
        if (inAir && S && !S.putt && !S.landed) {
          _axis.set(Math.cos(S.aim), 0, Math.sin(S.aim));
          _roll.setFromAxisAngle(_axis, dt * 30); ballMesh.quaternion.premultiply(_roll);
        } else if (d > 1e-5 && d < 5) {
          _axis.set(mv.z, 0, -mv.x).normalize().multiplyScalar(-1);
          _roll.setFromAxisAngle(_axis, -d / (BALL_R * s)); ballMesh.quaternion.premultiply(_roll);
        }
      }
      if (!Number.isFinite(ballMesh.quaternion.w)) { if (DEBUG) console.warn('ball quaternion NaN'); ballMesh.quaternion.identity(); }
      ballPrev.copy(ballMesh.position); ballPrevOk = true;
      const gh = G.hole.heightAt(bx, by), above = Math.max(0, bz - gh);
      blob.position.set(bx, gh + 0.015, -by); blob.scale.setScalar(s * (BALL_R * 1.3 / 0.06) * (1 + above * 0.04));
      blob.material.opacity = 0.34 * clamp(1 - above / 25, 0.15, 1);
      const sunk = G.phase === 'result' && S && S.res.type === 'water' && S.t >= S.res.duration;
      ballMesh.visible = !sunk;
      blob.visible = !sunk && !holed;
      teePeg.visible = G.teed && !CLUBS[G.clubIdx].putter;
      teePeg.position.set(G.ball.x, G.ball.z + 0.02, -G.ball.y);
      G.hole.animateFlag(G.time, G.wind.ang, G.wind.mph);
      // sun & shadows follow the action
      const f = ballMesh.position;
      sun.target.position.copy(f); sun.position.copy(f).addScaledVector(sunDir, 220);
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      // green reading grid + downhill flow
      const readOn = G.mode === 'play' && G.phase !== 'flyover' && G.phase !== 'holed' &&
        (CLUBS[G.clubIdx].putter || Math.hypot(G.hole.pin.x - G.ball.x, G.hole.pin.y - G.ball.y) < 30);
      if (G.hole.greenGrid) G.hole.greenGrid.visible = readOn;
      if (readMesh) readMesh.visible = !!G.read && CLUBS[G.clubIdx].putter && ['aim', 'power', 'accuracy', 'swing'].includes(G.phase);
      triMarker.visible = CLUBS[G.clubIdx].putter && G.mode === 'play' && ['aim', 'power', 'accuracy'].includes(G.phase);
      if (CLUBS[G.clubIdx].putter) ring.visible = false;
      flowPts.visible = readOn;
      if (readOn && !G.paused) updateFlow(dt);
      if (G.shot && (G.phase === 'flight' || G.phase === 'result')) drawTracer(G.shot.putt);
    }
    renderer.render(scene, camera);
    if (G.mode === 'play') {
      updateMeter();
      updateFlightHUD();
      mmFrame++;
      if (mmDirty && (G.phase !== 'flight' || mmFrame % 2 === 0)) { drawMinimap(); mmDirty = false; }
    }
  }

  // ---------------- boot ----------------
  if (/[?&]debug\b/.test(location.search)) window.PH = { G, prepareShot, beginHole, holeOut, solvePuttRead, camera, ballMesh, camLook: () => camLook, swing: (p, a) => { G.power = p; G.acc = a; G.phase = 'accuracy'; golfer.backswing(p); startDownswing(); } };
  buildMenu();
  applyTime(settings.time);
  enterMenu();
  requestAnimationFrame(frame);
})();
