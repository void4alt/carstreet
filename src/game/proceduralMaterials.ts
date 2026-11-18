import * as THREE from 'three';
import { MapId } from './types';

function configureTexture(
  tex: THREE.CanvasTexture,
  renderer: THREE.WebGLRenderer,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

const _roadTextureCache = new Map<
  MapId,
  { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }
>();
const _textureCache = new Map<string, THREE.CanvasTexture>();

export function createRoadTexture(
  renderer: THREE.WebGLRenderer,
  mapId: MapId
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const cached = _roadTextureCache.get(mapId);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // 1. Base weathered Japanese touge asphalt slate (natural sun-aged charcoal grey, not flat plastic)
  ctx.fillStyle = mapId === 'mountain' ? '#2c3038' : '#2f2d37';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle macro tonal variation across the lane width (lighter crown, natural shoulder transition)
  const crownGrad = ctx.createLinearGradient(0, 0, 1024, 0);
  crownGrad.addColorStop(0, 'rgba(20, 22, 28, 0.22)');
  crownGrad.addColorStop(0.18, 'rgba(42, 46, 54, 0.06)');
  crownGrad.addColorStop(0.5, 'rgba(64, 68, 78, 0.12)');
  crownGrad.addColorStop(0.82, 'rgba(42, 46, 54, 0.06)');
  crownGrad.addColorStop(1, 'rgba(20, 22, 28, 0.22)');
  ctx.fillStyle = crownGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Subtle organic asphalt tonal variation & blended surface repairs (no harsh black boxes or stripes)
  const patches = [
    { x: 220, y: 180, rx: 95, ry: 140, col: 'rgba(36, 40, 48, 0.28)' },
    { x: 740, y: 420, rx: 110, ry: 165, col: 'rgba(48, 53, 62, 0.24)' },
    { x: 280, y: 740, rx: 105, ry: 150, col: 'rgba(34, 38, 46, 0.26)' },
    { x: 710, y: 830, rx: 95, ry: 125, col: 'rgba(44, 48, 57, 0.22)' },
  ];
  for (const p of patches) {
    const pGrad = ctx.createRadialGradient(p.x, p.y, 12, p.x, p.y, Math.max(p.rx, p.ry));
    pGrad.addColorStop(0, p.col);
    pGrad.addColorStop(0.7, p.col);
    pGrad.addColorStop(1, 'rgba(44, 48, 56, 0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Multi-scale crushed stone aggregate grain via direct ImageData pixel buffer (100% coverage in <3ms)
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const pxData = imgData.data;
  let prng = 0x5f3759df;
  for (let i = 0; i < pxData.length; i += 4) {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    const n1 = (prng & 0xff) - 128; // -128..127 fine grain
    const n2 = ((prng >>> 8) & 0x3f) - 32; // -32..31 coarse mineral speck
    const delta = ((n1 * 9) >> 6) + ((n2 * 7) >> 5);
    pxData[i] = Math.max(22, Math.min(98, pxData[i] + delta));
    pxData[i + 1] = Math.max(24, Math.min(100, pxData[i + 1] + delta));
    pxData[i + 2] = Math.max(28, Math.min(106, pxData[i + 2] + delta + 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // Macro quartzite & granite aggregate chips
  for (let i = 0; i < 3200; i++) {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    const x = (prng & 0x3ff);
    prng = (prng * 1664525 + 1013904223) >>> 0;
    const y = (prng & 0x3ff);
    const v = 58 + (prng & 0x27);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.48)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // 4. Subtle polished wheel-track sheen in both lanes (very gentle tonal polish, never black stripes)
  for (const rutX of [215, 345, 675, 805]) {
    const rutGrad = ctx.createLinearGradient(rutX - 48, 0, rutX + 48, 0);
    rutGrad.addColorStop(0, 'rgba(30, 33, 40, 0)');
    rutGrad.addColorStop(0.5, 'rgba(26, 29, 36, 0.14)');
    rutGrad.addColorStop(1, 'rgba(30, 33, 40, 0)');
    ctx.fillStyle = rutGrad;
    ctx.fillRect(rutX - 48, 0, 96, 1024);
  }

  // 5. Fine weathered micro-cracks (subtle slate tone, non-repetitive over 18.2m tile)
  ctx.strokeStyle = 'rgba(22, 25, 31, 0.42)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 14; c++) {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    let cx = 96 + (prng % 832);
    prng = (prng * 1664525 + 1013904223) >>> 0;
    let cy = prng % 920;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let seg = 0; seg < 5; seg++) {
      prng = (prng * 1664525 + 1013904223) >>> 0;
      cx += ((prng & 0x1f) - 15.5) * 1.6;
      cy += 12 + (prng & 0x17);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // 6. Concrete drainage gutters, cast-iron grates & Japanese Touge shoulder rumble curb strips
  ctx.fillStyle = '#3a3e48';
  ctx.fillRect(0, 0, 46, 1024);
  ctx.fillRect(978, 0, 46, 1024);

  // Subtle recessed drainage channel seam
  ctx.fillStyle = '#20232a';
  ctx.fillRect(42, 0, 5, 1024);
  ctx.fillRect(977, 0, 5, 1024);

  // Metal storm-drain grates along the concrete gutter (spaced naturally along 18m tile)
  for (let y = 128; y < 1024; y += 512) {
    ctx.fillStyle = '#1e2026';
    ctx.fillRect(14, y, 24, 44);
    ctx.fillRect(986, y, 24, 44);
    ctx.fillStyle = '#52525b';
    for (let slot = y + 6; slot < y + 38; slot += 8) {
      ctx.fillRect(16, slot, 20, 3);
      ctx.fillRect(988, slot, 20, 3);
    }
  }

  // Red & white painted rumble curb blocks on outer shoulder
  for (let y = 0; y < 1024; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? '#e2e8f0' : '#dc2626';
    ctx.fillRect(0, y, 14, 64);
    ctx.fillRect(1010, y, 14, 64);
  }

  // 7. Weathered reflective white outer shoulder lines
  ctx.fillStyle = 'rgba(232, 236, 242, 0.90)';
  ctx.fillRect(54, 0, 15, 1024);
  ctx.fillRect(955, 0, 15, 1024);

  // 8. Centerline markings
  if (mapId === 'mountain') {
    // Authentic Japanese Touge double amber-orange centerline with subtle wear
    ctx.fillStyle = 'rgba(245, 158, 11, 0.88)';
    ctx.fillRect(495, 0, 12, 1024);
    ctx.fillRect(517, 0, 12, 1024);
  } else {
    // Dashed white centerline for Blossom Drift
    ctx.fillStyle = 'rgba(243, 244, 246, 0.88)';
    for (let y = 0; y < 1024; y += 128) {
      ctx.fillRect(503, y + 20, 18, 76);
    }

    // Scattered Sakura petals along road shoulders
    for (let i = 0; i < 420; i++) {
      const edgeBias = Math.random() < 0.82;
      const px = edgeBias
        ? Math.random() < 0.5
          ? 34 + Math.random() * 145
          : 845 + Math.random() * 145
        : Math.random() * 1024;
      const py = Math.random() * 1024;
      const rx = 3.2 + Math.random() * 3.8;
      const ry = 1.8 + Math.random() * 2.4;
      const angle = Math.random() * Math.PI;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle =
        Math.random() < 0.3 ? '#fff1f2' : Math.random() < 0.6 ? '#fbcfe8' : '#f472b6';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 9. High-detail 512x512 Bump Map with stone aggregate relief
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bCtx.createImageData(512, 512);
  const bData = bumpImg.data;
  for (let i = 0; i < bData.length; i += 4) {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    const v = 96 + ((prng >>> 16) & 0x47);
    bData[i] = v;
    bData[i + 1] = v;
    bData[i + 2] = v;
    bData[i + 3] = 255;
  }
  bCtx.putImageData(bumpImg, 0, 0);

  // 10. Dedicated 512x512 Roughness Map (polished tire ruts have slightly lower roughness than raw stone)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rCtx = roughCanvas.getContext('2d')!;
  const roughImg = rCtx.createImageData(512, 512);
  const rData = roughImg.data;
  for (let i = 0; i < rData.length; i += 4) {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    const v = 190 + ((prng >>> 18) & 0x37);
    rData[i] = v;
    rData[i + 1] = v;
    rData[i + 2] = v;
    rData[i + 3] = 255;
  }
  rCtx.putImageData(roughImg, 0, 0);
  // Slightly smoother polished wheel tracks
  for (const rutX of [108, 172, 338, 402]) {
    const rg = rCtx.createLinearGradient(rutX - 24, 0, rutX + 24, 0);
    rg.addColorStop(0, 'rgba(175,175,175,0)');
    rg.addColorStop(0.5, 'rgba(148,148,148,0.45)');
    rg.addColorStop(1, 'rgba(175,175,175,0)');
    rCtx.fillStyle = rg;
    rCtx.fillRect(rutX - 24, 0, 48, 512);
  }

  // NOTE: buildRoadRibbonGeometry already scales V by accDist * 0.055 (1 unit per 18.18m),
  // so repeatY MUST be 1 for map/roughnessMap and 2 for bumpMap (not 36, which squashed 18m into 0.5m!)
  const result = {
    map: configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 1, 1),
    bumpMap: configureTexture(new THREE.CanvasTexture(bumpCanvas), renderer, false, 2, 2),
    roughnessMap: configureTexture(new THREE.CanvasTexture(roughCanvas), renderer, false, 1, 1),
  };
  _roadTextureCache.set(mapId, result);
  return result;
}

export function createPlazaTexture(
  renderer: THREE.WebGLRenderer,
  mapId: MapId
): THREE.CanvasTexture {
  const cacheKey = `plaza:${mapId}`;
  const cached = _textureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 'mountain') {
    ctx.fillStyle = '#26282e';
    ctx.fillRect(0, 0, 512, 512);

    // Parking bay markings & circular drift skid rings
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, 464, 464);

    // Donut skid marks in center
    ctx.strokeStyle = 'rgba(12, 12, 14, 0.45)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 120, 0, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 256, 142, 0.3, Math.PI * 2.1);
    ctx.stroke();

    // White parking stall lines along top/bottom
    ctx.strokeStyle = 'rgba(229, 231, 235, 0.7)';
    ctx.lineWidth = 3;
    for (let x = 64; x <= 448; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x, 76);
      ctx.moveTo(x, 488);
      ctx.lineTo(x, 436);
      ctx.stroke();
    }
  } else {
    // Traditional Japanese stone-paved courtyard with Sakura emblem & scattered petals
    ctx.fillStyle = '#353138';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle stone tile grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Concentric Hanami drift rings
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 175, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 256, 95, 0, Math.PI * 2);
    ctx.stroke();

    // Scattered pink petals across plaza
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = Math.random() < 0.4 ? '#fbcfe8' : '#f472b6';
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 2.2 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 1, 1);
  _textureCache.set(cacheKey, tex);
  return tex;
}

export function createChevronSignTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('chevron');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#dc2626';
  for (let x = -40; x < 280; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 64, 64);
    ctx.lineTo(x + 32, 128);
    ctx.lineTo(x, 128);
    ctx.lineTo(x + 32, 64);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 122);

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 1, 1);
  _textureCache.set('chevron', tex);
  return tex;
}

export function createJapaneseRoadSignTexture(
  renderer: THREE.WebGLRenderer,
  mapId: MapId
): THREE.CanvasTexture {
  const cacheKey = `sign:${mapId}`;
  const cached = _textureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 'mountain') {
    // Yellow diamond Japanese Touge Winding Road warning sign
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, 232, 232);

    // Winding arrow symbol
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 200);
    ctx.bezierCurveTo(70, 160, 186, 110, 128, 55);
    ctx.stroke();

    // Kanji label at bottom
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('急カーブ', 128, 228);
  } else {
    // Traditional Japanese Shrine / Sakura Sanctuary sign board
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 236, 236);

    ctx.fillStyle = '#fbcfe8';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('吉野桜', 128, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('SAKURA PASS', 128, 165);
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 1, 1);
  _textureCache.set(cacheKey, tex);
  return tex;
}

export function createBuildingWallTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('wall');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Warm cream plaster upper wall & dark cedar wainscoting
  ctx.fillStyle = '#f5ebe0';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#3e2723';
  ctx.fillRect(0, 140, 256, 116);

  // Timber pillars
  for (let x = 0; x <= 256; x += 64) {
    ctx.fillRect(x - 5, 0, 10, 256);
  }
  ctx.fillRect(0, 132, 256, 12);
  ctx.fillRect(0, 0, 256, 12);

  // Glowing Shoji screen windows
  for (let x = 14; x < 240; x += 64) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x, 32, 36, 86);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, 32, 36, 86);
    // Shoji lattice lines
    ctx.beginPath();
    ctx.moveTo(x + 18, 32);
    ctx.lineTo(x + 18, 118);
    ctx.moveTo(x, 60);
    ctx.lineTo(x + 36, 60);
    ctx.moveTo(x, 90);
    ctx.lineTo(x + 36, 90);
    ctx.stroke();
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 2, 1);
  _textureCache.set('wall', tex);
  return tex;
}

export function createRockBumpTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('rockBump');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Horizontal rocky strata & crags
  for (let i = 0; i < 180; i++) {
    const y = Math.random() * 256;
    const h = 4 + Math.random() * 14;
    const shade = 65 + Math.floor(Math.random() * 120);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.random() * 256, y, 30 + Math.random() * 90, h);
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, false, 8, 8);
  _textureCache.set('rockBump', tex);
  return tex;
}

export function createPineFoliageTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('pineFoliage');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep Japanese Sugi cedar green base
  ctx.fillStyle = '#1b3620';
  ctx.fillRect(0, 0, 256, 256);

  // Shadowed horizontal bough under-layers
  for (let y = 0; y < 256; y += 28) {
    ctx.fillStyle = 'rgba(8, 20, 11, 0.55)';
    ctx.fillRect(0, y, 256, 9);
  }

  // Thousands of overlapping pine/cedar needle sprays
  for (let i = 0; i < 3800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const shade = Math.random();
    if (shade < 0.25) {
      ctx.strokeStyle = '#0f2414';
    } else if (shade < 0.65) {
      ctx.strokeStyle = '#254a2b';
    } else if (shade < 0.9) {
      ctx.strokeStyle = '#336139';
    } else {
      ctx.strokeStyle = '#487a4b';
    }
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 9, y + 4 + Math.random() * 7);
    ctx.stroke();
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 3, 3);
  _textureCache.set('pineFoliage', tex);
  return tex;
}

export function createSakuraFoliageTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('sakuraFoliage');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e89bb8';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle dark woody branch crevices inside blossom canopy
  ctx.strokeStyle = 'rgba(74, 37, 51, 0.45)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    ctx.beginPath();
    const sx = Math.random() * 256;
    const sy = Math.random() * 256;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (Math.random() - 0.5) * 50, sy + (Math.random() - 0.5) * 50);
    ctx.stroke();
  }

  // Dense layered cherry blossom flower clusters
  const palette = ['#be185d', '#ec4899', '#f472b6', '#fbcfe8', '#fff1f2'];
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 1.8 + Math.random() * 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 3, 3);
  _textureCache.set('sakuraFoliage', tex);
  return tex;
}

export function createTreeBarkTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('treeBark');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3b2314';
  ctx.fillRect(0, 0, 128, 256);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() < 0.45 ? '#26150b' : '#52321e';
    ctx.fillRect(x, y, 2 + Math.random() * 3, 14 + Math.random() * 28);
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 2, 2);
  _textureCache.set('treeBark', tex);
  return tex;
}

export function createGraniteRockTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('graniteRock');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4b4844';
  ctx.fillRect(0, 0, 256, 256);

  // Craggy granite strata, dark crevices & subtle moss patches
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random();
    if (r < 0.3) {
      ctx.fillStyle = '#2d2b29';
    } else if (r < 0.75) {
      ctx.fillStyle = '#635f59';
    } else if (r < 0.92) {
      ctx.fillStyle = '#78736c';
    } else {
      ctx.fillStyle = '#364d32'; // mountain moss
    }
    ctx.fillRect(x, y, 3 + Math.random() * 8, 2 + Math.random() * 5);
  }

  // Deep rock fractures
  ctx.strokeStyle = 'rgba(18, 17, 16, 0.7)';
  ctx.lineWidth = 2;
  for (let c = 0; c < 18; c++) {
    ctx.beginPath();
    const sx = Math.random() * 256;
    const sy = Math.random() * 256;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (Math.random() - 0.5) * 65, sy + (Math.random() - 0.5) * 35);
    ctx.stroke();
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 2, 2);
  _textureCache.set('graniteRock', tex);
  return tex;
}

export function createTerrainDetailTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('terrainDetail');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Neutral mid-bright gray/green variation map that multiplies cleanly with vertexColors
  ctx.fillStyle = '#d6dad4';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 5500; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 165 + Math.floor(Math.random() * 85);
    ctx.fillStyle = `rgb(${v - 6},${v},${v - 8})`;
    ctx.fillRect(x, y, 2, 3);
  }

  const tex = configureTexture(new THREE.CanvasTexture(canvas), renderer, true, 42, 42);
  _textureCache.set('terrainDetail', tex);
  return tex;
}

/**
 * Generates a soft-edged, organic cloudy smoke puff alpha/color texture so tire smoke
 * renders as natural billowing vapor plumes rather than hard white spheres.
 */
export function createSoftSmokePuffTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cached = _textureCache.get('softSmoke');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);

  // Layer several overlapping soft radial gradient puffs for awispy, non-circular cloud silhouette
  const puffs = [
    { x: 64, y: 64, r: 54, a: 0.48 },
    { x: 50, y: 58, r: 38, a: 0.34 },
    { x: 78, y: 60, r: 36, a: 0.32 },
    { x: 60, y: 76, r: 36, a: 0.30 },
    { x: 68, y: 50, r: 34, a: 0.28 },
  ];

  for (const p of puffs) {
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, `rgba(232, 237, 244, ${p.a})`);
    grad.addColorStop(0.42, `rgba(214, 221, 232, ${p.a * 0.65})`);
    grad.addColorStop(0.75, `rgba(195, 203, 216, ${p.a * 0.22})`);
    grad.addColorStop(1, 'rgba(185, 195, 210, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  _textureCache.set('softSmoke', tex);
  return tex;
}

/**
 * Generates an authentic Japanese circular retroreflective speed limit sign (e.g. 40 or 50 km/h)
 * for mountain touge corner entries.
 */
export function createSpeedLimitSignTexture(
  renderer: THREE.WebGLRenderer,
  speedLimit = 40
): THREE.CanvasTexture {
  const cacheKey = `speedLimit:${speedLimit}`;
  const cached = _textureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // Outer metallic backing rim
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();

  // Retroreflective red border ring
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.fill();

  // White inner disk
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(128, 128, 82, 0, Math.PI * 2);
  ctx.fill();

  // Blue Japanese speed numerals
  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(speedLimit), 128, 132);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _textureCache.set(cacheKey, tex);
  return tex;
}


