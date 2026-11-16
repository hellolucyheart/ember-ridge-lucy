// Ember Ridge — the map. A hillside shrine courtyard at dusk: stone
// flags in the middle, grass banks at the edges, a Moon Gate (site A) in
// the north-west, an Ember Shrine (site B) in the north-east, and a
// lantern court between them. Three lanes connect the spawns to the
// sites: west wall, centre court, east wall. Every solid block registers
// an AABB collider that movement and line-of-sight both use.

import * as THREE from 'three';
import { MAP, SITES } from './state.js';

function box(mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
  g.fillStyle = '#14161f'; g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.2, 2.2, 1);
  return spr;
}

export function buildMap(scene, textures) {
  const colliders = [];
  // AABB colliders carry a height so hitscan can be blocked by cover.
  const addCollider = (x0, z0, x1, z1, h = 4.2) => colliders.push({ x0, z0, x1, z1, h });

  const stone = new THREE.MeshStandardMaterial({ map: textures.stone, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.85 });
  const grass = new THREE.MeshStandardMaterial({ map: textures.grass, roughness: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x27364f, roughness: 0.7, metalness: 0.15 });
  const paperMat = new THREE.MeshStandardMaterial({ map: textures.paper, emissive: 0xff9a3c, emissiveIntensity: 0.9, emissiveMap: textures.paper });
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xe88aa8, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 1 });

  // Ground: grass hillside, stone courtyard on top.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfX * 2 + 60, MAP.halfZ * 2 + 60), grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfX * 2, MAP.halfZ * 2), stone);
  court.rotation.x = -Math.PI / 2; court.position.y = 0.02; court.receiveShadow = true;
  scene.add(court);

  // Perimeter walls with a gap-free ring; the map is enclosed.
  const W = MAP.halfX, D = MAP.halfZ, H = MAP.wallH;
  const walls = [
    [0, -D, W * 2 + 2, 1], [0, D, W * 2 + 2, 1],
    [-W, 0, 1, D * 2 + 2], [W, 0, 1, D * 2 + 2],
  ];
  for (const [x, z, w, d] of walls) {
    scene.add(box(wallMat, w, H, d, x, H / 2, z));
    addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, H);
  }

  // Shrine buildings at both sites: raised wood deck, pillars, pitched roof.
  function shrine(site, accent) {
    const g = new THREE.Group();
    g.position.set(site.x, 0, site.z);
    g.add(box(wood, 9, 0.5, 7, 0, 0.25, 0));
    for (const [px, pz] of [[-3.6, -2.6], [3.6, -2.6], [-3.6, 2.6], [3.6, 2.6]]) {
      g.add(box(darkWood, 0.5, 3.4, 0.5, px, 2.2, pz));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.2, 4), roofMat);
    roof.position.y = 5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ map: textures.paper, emissive: accent, emissiveIntensity: 1.2, emissiveMap: textures.paper }),
    );
    glow.position.set(0, 1.6, 3.4);
    g.add(glow);
    // Site ring on the courtyard in front of the deck: where the Ember
    // Core is planted. The deck itself is walkable; only the four pillars
    // block movement, so a planter can always reach the ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.06, 4.8);
    g.add(ring);
    const label = labelSprite(site.id, '#ffd9a0');
    label.position.set(0, 6.4, 0);
    g.add(label);
    scene.add(g);
    for (const [px, pz] of [[-3.6, -2.6], [3.6, -2.6], [-3.6, 2.6], [3.6, 2.6]]) {
      addCollider(site.x + px - 0.3, site.z + pz - 0.3, site.x + px + 0.3, site.z + pz + 0.3, 3.4);
    }
    return g;
  }
  shrine(SITES.A, 0x6fd2f0);
  shrine(SITES.B, 0xff8a3c);

  // Centre court: a stone lantern well and a low altar block.
  scene.add(box(wallMat, 2.4, 1.1, 2.4, 0, 0.55, 0));
  addCollider(-1.2, -1.2, 1.2, 1.2, 1.1);
  const altar = box(stone, 3.4, 0.5, 1.6, 0, 0.25, -6);
  scene.add(altar); addCollider(-1.7, -6.8, 1.7, -5.2, 0.5);

  // Cover: wooden crates and stone blocks placed to make lanes and corners.
  const covers = [
    // [x, z, w, d, h, mat]
    [-12, 8, 2.2, 2.2, 1.4, wood], [-12, 10.2, 2.2, 1.0, 1.0, wood],
    [12, 8, 2.2, 2.2, 1.4, wood], [12, 10.2, 2.2, 1.0, 1.0, wood],
    [-24, 2, 3.0, 1.2, 1.3, wallMat], [24, 2, 3.0, 1.2, 1.3, wallMat],
    [-8, -8, 2.4, 2.4, 1.2, wood], [8, -8, 2.4, 2.4, 1.2, wood],
    [-26, -8, 1.6, 3.2, 1.5, wallMat], [26, -8, 1.6, 3.2, 1.5, wallMat],
    [-4, 12, 4.0, 1.0, 1.1, wallMat], [4, 12, 4.0, 1.0, 1.1, wallMat],
    [0, -12, 2.0, 2.0, 1.6, wood], [-16, 16, 2.0, 2.0, 1.2, wood], [16, 16, 2.0, 2.0, 1.2, wood],
  ];
  for (const [x, z, w, d, h, mat] of covers) {
    scene.add(box(mat, w, h, d, x, h / 2, z));
    addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h);
  }

  // Cherry trees along the east and west banks (trunk is solid, canopy is not).
  function cherry(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 3.4, 8), trunkMat);
    trunk.position.y = 1.7; trunk.castShadow = true; g.add(trunk);
    for (const [ox, oy, oz, r] of [[0, 4.1, 0, 2.1], [1.2, 3.5, 0.6, 1.5], [-1.1, 3.7, -0.5, 1.4]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), petalMat);
      puff.position.set(ox, oy, oz); puff.castShadow = true; g.add(puff);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    addCollider(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 3.4);
  }
  cherry(-28, 12); cherry(-28, -4); cherry(28, 12); cherry(28, -4); cherry(-14, -20); cherry(14, -20);

  // Lantern posts: warm paper boxes on dark posts, with a real point light
  // on four of them (the rest glow by emissive only, for performance).
  const lanternLights = [];
  const lanternSpots = [[-8, 4], [8, 4], [-8, -12], [8, -12], [-20, 14], [20, 14], [0, 18], [0, -18]];
  lanternSpots.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 6), darkWood);
    post.position.y = 1.3; g.add(post);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), paperMat);
    lamp.position.y = 2.9; g.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.5, 4), roofMat);
    cap.position.y = 3.6; cap.rotation.y = Math.PI / 4; g.add(cap);
    g.position.set(x, 0, z);
    scene.add(g);
    addCollider(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 2.6);
    if (i < 4) {
      const light = new THREE.PointLight(0xff9a3c, 18, 16, 1.8);
      light.position.set(x, 3, z);
      scene.add(light);
      lanternLights.push(light);
    }
  });

  // Distant ridge silhouettes outside the walls, for the skyline.
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x2c3a5e, roughness: 1 });
  for (const [x, z, w, h] of [[-40, -45, 60, 14], [30, -48, 70, 18], [-55, 10, 30, 10], [55, -10, 30, 12]]) {
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(w / 2, h, 4), ridgeMat);
    ridge.position.set(x, h / 2 - 1, z); ridge.rotation.y = Math.PI / 4;
    scene.add(ridge);
  }

  // The Ember Core: a small glowing octahedron, hidden until it is dropped.
  const coreMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45),
    new THREE.MeshStandardMaterial({ color: 0xff6a1f, emissive: 0xff5a00, emissiveIntensity: 2.2 }),
  );
  coreMesh.visible = false;
  scene.add(coreMesh);

  // Bomb (planted core) light + mesh, hidden until planted.
  const bombMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5),
    new THREE.MeshStandardMaterial({ color: 0xff3c1f, emissive: 0xff2a00, emissiveIntensity: 2.5 }),
  );
  bombMesh.visible = false;
  scene.add(bombMesh);
  const bombLight = new THREE.PointLight(0xff3c1f, 0, 12, 1.6);
  scene.add(bombLight);

  return {
    colliders,
    coreMesh,
    bombMesh,
    bombLight,
    lanternLights,
    spawns: {
      ember: [[-14, 19], [-5, 20], [5, 20], [14, 19], [0, 21]],
      moon: [[-14, -19], [-5, -20], [5, -20], [14, -19], [0, -21]],
    },
    // Waypoint routes: west lane, centre, east lane, then each site.
    routes: {
      emberToA: [[-14, 14], [-20, 6], [-24, -4], [-22, -9], [-20, -11.2]],
      emberToB: [[14, 14], [20, 6], [24, -4], [22, -9], [20, -11.2]],
      emberMid: [[0, 14], [0, 6], [0, -2], [-4, -8], [-12, -11]],
      moonToA: [[-14, -14], [-18, -8], [-20, -11.2]],
      moonToB: [[14, -14], [18, -8], [20, -11.2]],
      moonMid: [[0, -14], [0, -8], [-2, -2], [4, 4], [10, 10]],
      holdA: [[-24, -10], [-16, -12], [-20, -6]],
      holdB: [[24, -10], [16, -12], [20, -6]],
    },
  };
}
