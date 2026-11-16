// Ember Ridge — visual effects. Tracers, muzzle flashes, impact sparks
// and the plant glow all come from small fixed pools: nothing is
// allocated per shot, so the hot loop stays allocation-free.

import * as THREE from 'three';

export class Effects {
  constructor(scene, textures) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.flashes = [];
    // 24 tracer lines, reused in order.
    for (let i = 0; i < 24; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    // 160 spark points in one Points cloud, positions rewritten per burst.
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(160 * 3);
    this.sparkVel = new Float32Array(160 * 3);
    this.sparkLife = new Float32Array(160);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkPoints = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.14, transparent: true, opacity: 0.95, sizeAttenuation: true,
    }));
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);
    this.sparkCursor = 0;
    // Muzzle flash: one sprite, moved to the gun tip per shot.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glow, color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.flash.scale.set(0.9, 0.9, 1);
    scene.add(this.flash);
    this.flashLife = 0;
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  muzzle(at) {
    this.flash.position.copy(at);
    this.flash.material.opacity = 1;
    this.flashLife = 0.05;
    this.flash.scale.set(0.7 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 1);
  }

  burst(at, n = 12, color = 0xffc46b) {
    this.sparkPoints.material.color.setHex(color);
    for (let i = 0; i < n; i++) {
      const k = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % 160;
      this.sparkPos[k * 3] = at.x; this.sparkPos[k * 3 + 1] = at.y; this.sparkPos[k * 3 + 2] = at.z;
      this.sparkVel[k * 3] = (Math.random() - 0.5) * 5;
      this.sparkVel[k * 3 + 1] = Math.random() * 4 + 1;
      this.sparkVel[k * 3 + 2] = (Math.random() - 0.5) * 5;
      this.sparkLife[k] = 0.35 + Math.random() * 0.25;
    }
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.material.opacity = 0;
    }
    let any = false;
    for (let k = 0; k < 160; k++) {
      if (this.sparkLife[k] > 0) {
        any = true;
        this.sparkLife[k] -= dt;
        this.sparkPos[k * 3] += this.sparkVel[k * 3] * dt;
        this.sparkPos[k * 3 + 1] += this.sparkVel[k * 3 + 1] * dt;
        this.sparkPos[k * 3 + 2] += this.sparkVel[k * 3 + 2] * dt;
        this.sparkVel[k * 3 + 1] -= 12 * dt;
        if (this.sparkLife[k] <= 0) this.sparkPos[k * 3 + 1] = -100;
      }
    }
    if (any) this.sparkGeo.attributes.position.needsUpdate = true;
  }
}
