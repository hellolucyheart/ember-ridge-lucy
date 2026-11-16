// Ember Ridge — procedural textures. Every surface is drawn on a canvas
// at load time, so the game ships no image files and makes no network
// request. A tiny seeded RNG keeps the grain stable between runs.

import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Grey flagstones with warm dusk grout and speckle.
export function stoneTexture() {
  const r = rng(11);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#5a5a60'; g.fillRect(0, 0, s, s);
    const tile = 64;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = 82 + Math.floor(r() * 22);
        g.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
        g.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
        g.fillStyle = 'rgba(255,150,80,0.05)';
        g.fillRect(x * tile + 2, y * tile + 2, tile - 4, 6);
      }
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 2);
    }
  }, 10, 8);
}

// Dark cedar planks for the shrine deck and gates.
export function woodTexture() {
  const r = rng(23);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#4a3220'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) {
      const v = 58 + Math.floor(r() * 18);
      g.fillStyle = `rgb(${v + 22},${v},${v - 12})`;
      g.fillRect(0, y * 32 + 1, s, 30);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      for (let x = 0; x <= s; x += 16) {
        g.moveTo(x, y * 32 + 8 + r() * 14); g.lineTo(x + 8, y * 32 + 8 + r() * 14);
      }
      g.stroke();
    }
  }, 2, 2);
}

// Mossy hillside grass for the ground outside the courtyard.
export function grassTexture() {
  const r = rng(37);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#3d5230'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 52 + Math.floor(r() * 44);
      g.fillStyle = `rgba(${v - 6},${v + 14},${v - 18},0.7)`;
      const x = Math.floor(r() * s), y = Math.floor(r() * s);
      g.fillRect(x, y, 1, 3 + Math.floor(r() * 3));
    }
    for (let i = 0; i < 24; i++) {
      g.fillStyle = 'rgba(255,150,170,0.16)';
      g.beginPath(); g.arc(Math.floor(r() * s), Math.floor(r() * s), 2 + r() * 3, 0, 7); g.fill();
    }
  }, 12, 9);
}

// Warm paper for lanterns and the shrine's glowing panels.
export function paperTexture() {
  return canvasTexture(128, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffe9b8'); grad.addColorStop(0.55, '#ffcf8a'); grad.addColorStop(1, '#f7a95c');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,50,10,0.55)'; g.lineWidth = 3;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  });
}

// Soft radial glow used on sprites (muzzle flash, lantern halo, bomb light).
export function glowTexture(inner = 'rgba(255,200,120,1)', outer = 'rgba(255,120,40,0)') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeTextures() {
  return {
    stone: stoneTexture(),
    wood: woodTexture(),
    grass: grassTexture(),
    paper: paperTexture(),
    glow: glowTexture(),
    glowBlue: glowTexture('rgba(170,225,255,1)', 'rgba(60,140,220,0)'),
  };
}
