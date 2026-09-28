// Grandstands full of fans around the green (and one by the tee). Fans bounce when they cheer.
const Crowd = (() => {
  const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4f4ef', '#1d3557', '#ffd166', '#f4a261', '#7b2cbf', '#3aa0ff', '#161616', '#ff7eb6', '#3a7d44', '#c8102e'];
  const SKIN = ['#f6d3b8', '#e8b48f', '#c98c5f', '#8d5a3b', '#5a3825'];
  const HATS = ['#fbfbf8', '#141414', '#1d3557', '#c8102e', '#ffd166'];

  // Candidate spots around the green, checked for water, trees and bounds.
  function sites(hole) {
    const g = hole.green, fx = Math.sin(g.ang), fy = Math.cos(g.ang), R = Math.max(g.rx, g.ry);
    const out = [];
    const clear = (x, y, r) => {
      if (x < hole.minX + 14 || x > hole.maxX - 14 || y < hole.minY + 10 || y > hole.maxY - 10) return false;
      for (let a = 0; a < 6.28; a += 0.8) if (hole.waterLevelAt(x + Math.cos(a) * r, y + Math.sin(a) * r) > -1e8) return false;
      if (hole.waterLevelAt(x, y) > -1e8) return false;
      for (const t of hole.trees) if (Math.hypot(t.x - x, t.y - y) < r + t.r) return false;
      for (const w of hole.water) if (w.island && Math.hypot(w.cx - x, w.cy - y) < Math.max(w.rx, w.ry) + r) return false;
      return true;
    };
    for (const a of [0, 0.7, -0.7, 1.4, -1.4, 2.0, -2.0]) {
      if (out.length >= 2) break;
      const dx = Math.sin(g.ang + a), dy = Math.cos(g.ang + a), d = R * 1.9 + 16;
      const x = g.cx + dx * d, y = g.cy + dy * d;
      if (out.some(o => Math.hypot(o.x - x, o.y - y) < 30)) continue;
      if (clear(x, y, 13)) out.push({ x, y, fx: -dx, fy: -dy });
    }
    for (const side of [1, -1]) {           // one stand beside the tee
      const x = side * 16, y = -2;
      if (clear(x, y, 12)) { out.push({ x, y, fx: -side * 0.8, fy: 0.6, small: true }); break; }
    }
    return out;
  }

  function build(hole, seed) {
    const R = mulberry32(seed);
    const group = new THREE.Group();
    const stands = [];
    const tierM = new THREE.MeshLambertMaterial({ color: 0xc9ced4 });
    const rimM = new THREE.MeshLambertMaterial({ color: 0x6d747c });
    const skirtM = new THREE.MeshLambertMaterial({ color: hole.theme.flag });
    const roofM = new THREE.MeshLambertMaterial({ color: 0xf2f2ee, side: THREE.DoubleSide });
    const bodyGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 7).translate(0, 0.31, 0);
    const headGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const hatGeo = new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const s of sites(hole)) {
      const W = s.small ? 14 : 22, rows = s.small ? 4 : 6, depth = 1.35, rise = 0.55;
      const st = new THREE.Group();
      const gz = hole.heightAt(s.x, s.y);
      st.position.set(s.x, gz, -s.y);
      st.rotation.y = Math.atan2(s.fx, -s.fy);          // local +z faces the green
      for (let i = 0; i < rows; i++) {
        const h = rise * (i + 1) + 1.5;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(W, h, depth), tierM);
        tier.position.set(0, h / 2 - 1.5, -i * depth); tier.castShadow = tier.receiveShadow = true;
        st.add(tier);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, 0.15), rimM);
      back.position.set(0, rise * rows + 0.6, -(rows - 0.5) * depth); st.add(back);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.7, 0.08), skirtM);
      skirt.position.set(0, 0.2, depth / 2 + 0.04); st.add(skirt);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, rows * depth * 0.75), roofM);
      roof.rotation.x = -Math.PI / 2 + 0.12; roof.position.set(0, rise * rows + 3.2, -(rows - 1) * depth * 0.6); roof.castShadow = true; st.add(roof);
      for (const px of [-W / 2 + 0.3, W / 2 - 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), rimM);
        post.position.set(px, rise * rows + 1.5, -(rows - 1) * depth); st.add(post);
      }
      // fans
      const fans = [];
      for (let i = 0; i < rows; i++) for (let x = -W / 2 + 0.7; x <= W / 2 - 0.7; x += 0.72) {
        if (R() > 0.82) continue;
        fans.push({ x: x + (R() - 0.5) * 0.15, y: rise * (i + 1), z: -i * depth - 0.25, ph: R() * 6.28, amp: 0.2 + R() * 0.35, hat: R() < 0.35 });
      }
      const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), fans.length);
      const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), fans.length);
      const hats = new THREE.InstancedMesh(hatGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), fans.length);
      const c = new THREE.Color();
      fans.forEach((f, k) => {
        bodies.setColorAt(k, c.set(SHIRTS[Math.floor(R() * SHIRTS.length)]));
        heads.setColorAt(k, c.set(SKIN[Math.floor(R() * SKIN.length)]));
        hats.setColorAt(k, c.set(HATS[Math.floor(R() * HATS.length)]));
      });
      bodies.castShadow = true;
      st.add(bodies, heads, hats);
      group.add(st);
      stands.push({ fans, bodies, heads, hats });
    }
    const crowd = { group, stands, excite: 0, t: 0 };
    pose(crowd, 0);
    return crowd;
  }

  const M4 = new THREE.Matrix4();
  function pose(crowd, t) {
    for (const s of crowd.stands) {
      s.fans.forEach((f, k) => {
        const jump = crowd.excite > 0.02 ? Math.max(0, Math.sin(t * (7 + f.amp * 4) + f.ph)) * f.amp * crowd.excite : 0;
        const sway = Math.sin(t * 0.8 + f.ph) * 0.015;
        const y = f.y + jump + sway;
        M4.makeTranslation(f.x, y, f.z); s.bodies.setMatrixAt(k, M4);
        M4.makeTranslation(f.x, y + 0.76, f.z); s.heads.setMatrixAt(k, M4);
        if (f.hat) M4.makeTranslation(f.x, y + 0.8, f.z); else M4.makeScale(0, 0, 0);
        s.hats.setMatrixAt(k, M4);
      });
      s.bodies.instanceMatrix.needsUpdate = s.heads.instanceMatrix.needsUpdate = s.hats.instanceMatrix.needsUpdate = true;
      for (const m of [s.bodies, s.heads, s.hats]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  function update(crowd, dt) {
    if (!crowd || !crowd.group.visible) return;
    crowd.t += dt;
    const was = crowd.excite;
    crowd.excite = Math.max(0, crowd.excite - dt * 0.35);
    if (was > 0 || Math.floor(crowd.t * 10) % 5 === 0) pose(crowd, crowd.t);
  }
  function cheer(crowd, level) { if (crowd) crowd.excite = Math.max(crowd.excite, level); }
  return { build, update, cheer };
})();
