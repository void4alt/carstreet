import * as THREE from 'three';
import { PaintFinishType, VehicleCustomization, VehicleSpec } from './types';
import { DetailedCarRig } from './carBuilder';

export interface PaintMaterialParameters {
  finishType: PaintFinishType;
  brightness: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColorHex: string;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThicknessRange: [number, number];
  reflectivity: number;
  envMapIntensity: number;
  useFlakeBump: boolean;
  bumpScale: number;
}

/**
 * Pure physically-based automotive paint shader parameter calculator for all 6 paint finishes:
 * 1. Glossy: Smooth high-reflection clearcoat over non-metallic pigment base
 * 2. Metallic: High-metallic aluminum micro-flake base + deep glossy clearcoat
 * 3. Matte: Flat non-glossy tactical/stealth finish with zero clearcoat
 * 4. Satin: Soft semi-matte silk sheen with diffused reflections
 * 5. Pearl: Multi-layer iridescent mica pearl with view-angle color shift
 * 6. Chrome: Mirror-polished metallic reflection
 */
export function computePaintMaterialParameters(
  finishType: PaintFinishType = 'metallic',
  paintHex = '#1165d8',
  custom?: Partial<VehicleCustomization>
): PaintMaterialParameters {
  const brightness = Math.max(0.55, Math.min(1.35, custom?.paintBrightness ?? 1.0));
  const hexLower = paintHex.toLowerCase();
  const isMidnightPurple = hexLower === '#2d1442' || hexLower === '#3b0764' || hexLower === '#581c87';

  let base: PaintMaterialParameters;

  switch (finishType) {
    case 'gloss':
      base = {
        finishType: 'gloss',
        brightness,
        metalness: 0.08,
        roughness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.025,
        sheen: 0.08,
        sheenRoughness: 0.25,
        sheenColorHex: '#ffffff',
        iridescence: 0.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
        reflectivity: 0.96,
        envMapIntensity: 1.28,
        useFlakeBump: false,
        bumpScale: 0.0,
      };
      break;

    case 'matte':
      base = {
        finishType: 'matte',
        brightness,
        metalness: 0.05,
        roughness: 0.78,
        clearcoat: 0.0,
        clearcoatRoughness: 0.85,
        sheen: 0.12,
        sheenRoughness: 0.8,
        sheenColorHex: '#94a3b8',
        iridescence: 0.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
        reflectivity: 0.25,
        envMapIntensity: 0.38,
        useFlakeBump: false,
        bumpScale: 0.0,
      };
      break;

    case 'satin':
      base = {
        finishType: 'satin',
        brightness,
        metalness: 0.34,
        roughness: 0.44,
        clearcoat: 0.28,
        clearcoatRoughness: 0.36,
        sheen: 0.62,
        sheenRoughness: 0.38,
        sheenColorHex: '#e2e8f0',
        iridescence: 0.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
        reflectivity: 0.64,
        envMapIntensity: 0.78,
        useFlakeBump: true,
        bumpScale: 0.00025,
      };
      break;

    case 'pearl':
      base = {
        finishType: 'pearl',
        brightness,
        metalness: isMidnightPurple ? 0.54 : 0.42,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        sheen: 0.72,
        sheenRoughness: 0.18,
        sheenColorHex: isMidnightPurple ? '#d97706' : '#60a5fa',
        iridescence: 0.92,
        iridescenceIOR: 1.52,
        iridescenceThicknessRange: [180, 480],
        reflectivity: 0.98,
        envMapIntensity: 1.42,
        useFlakeBump: true,
        bumpScale: 0.0004,
      };
      break;

    case 'chrome':
      base = {
        finishType: 'chrome',
        brightness: Math.min(1.35, brightness * 1.08),
        metalness: 1.0,
        roughness: 0.03,
        clearcoat: 1.0,
        clearcoatRoughness: 0.015,
        sheen: 0.0,
        sheenRoughness: 0.1,
        sheenColorHex: '#ffffff',
        iridescence: 0.08,
        iridescenceIOR: 1.6,
        iridescenceThicknessRange: [120, 320],
        reflectivity: 1.0,
        envMapIntensity: 1.85,
        useFlakeBump: false,
        bumpScale: 0.0,
      };
      break;

    case 'metallic':
    default:
      base = {
        finishType: 'metallic',
        brightness,
        metalness: 0.76,
        roughness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.035,
        sheen: 0.22,
        sheenRoughness: 0.22,
        sheenColorHex: '#cbd5e1',
        iridescence: 0.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
        reflectivity: 0.95,
        envMapIntensity: 1.36,
        useFlakeBump: true,
        bumpScale: 0.00055,
      };
      break;
  }

  const flakeSlider = custom?.metallicIntensity ?? custom?.paintMetallicFlake;
  const roughSlider = custom?.paintRoughness;

  if (typeof flakeSlider === 'number') {
    const f = Math.max(0.0, Math.min(1.0, flakeSlider));
    if (finishType === 'chrome') {
      base.metalness = Math.max(0.96, 0.96 + f * 0.04);
    } else if (finishType === 'metallic') {
      base.metalness = 0.55 + f * 0.42;
    } else if (finishType === 'pearl') {
      base.metalness = 0.32 + f * 0.35;
    } else if (finishType === 'satin') {
      base.metalness = 0.2 + f * 0.28;
    } else {
      // gloss or matte remain low-metallic pigment bases
      base.metalness = 0.04 + f * 0.14;
    }
  }

  if (typeof roughSlider === 'number') {
    const r = Math.max(0.02, Math.min(0.88, roughSlider));
    if (finishType === 'matte') {
      base.roughness = Math.max(0.64, 0.62 + r * 0.26);
    } else if (finishType === 'satin') {
      base.roughness = Math.max(0.32, Math.min(0.56, 0.32 + r * 0.28));
    } else if (finishType === 'chrome') {
      base.roughness = Math.min(0.07, 0.02 + r * 0.06);
    } else if (finishType === 'gloss') {
      base.roughness = Math.min(0.22, 0.06 + r * 0.2);
    } else {
      base.roughness = Math.min(0.28, 0.1 + r * 0.24);
    }
  }

  return base;
}

// ============================================================================
// SELF-CONTAINED PROCEDURAL AUTOMOTIVE MATERIALS & TEXTURES FOR R34 GT-R
// ============================================================================
let cachedMaterials: {
  carbonMat: THREE.MeshPhysicalMaterial;
  aluminumMat: THREE.MeshStandardMaterial;
  tireMat: THREE.MeshStandardMaterial;
  tireSidewallMat: THREE.MeshStandardMaterial;
  rotorMat: THREE.MeshStandardMaterial;
  intercoolerMat: THREE.MeshStandardMaterial;
  grilleMat: THREE.MeshStandardMaterial;
  recaroMat: THREE.MeshStandardMaterial;
  flakeBumpTex: THREE.CanvasTexture;
  mfdMat: THREE.MeshStandardMaterial;
  gaugeClusterMat: THREE.MeshStandardMaterial;
  jdmPlateMat: THREE.MeshStandardMaterial;
  defrosterGlassTex: THREE.CanvasTexture;
  contactShadowMat: THREE.MeshBasicMaterial;
  sharedMaterialSet: Set<THREE.Material>;
} | null = null;

function getR34ProceduralMaterials() {
  if (cachedMaterials) return cachedMaterials;

  // 1. Twill Carbon Fiber Weave
  const cfCanvas = document.createElement('canvas');
  cfCanvas.width = 64;
  cfCanvas.height = 64;
  const cfCtx = cfCanvas.getContext('2d')!;
  cfCtx.fillStyle = '#12151c';
  cfCtx.fillRect(0, 0, 64, 64);
  cfCtx.fillStyle = '#242a36';
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      const shift = (y / 8) % 2 === 0 ? 0 : 4;
      cfCtx.fillRect((x + shift) % 64, y, 4, 4);
      cfCtx.fillRect((x + shift + 2) % 64, y + 4, 4, 4);
    }
  }
  const cfTex = new THREE.CanvasTexture(cfCanvas);
  cfTex.wrapS = THREE.RepeatWrapping;
  cfTex.wrapT = THREE.RepeatWrapping;
  cfTex.repeat.set(14, 14);

  const carbonMat = new THREE.MeshPhysicalMaterial({
    map: cfTex,
    bumpMap: cfTex,
    bumpScale: 0.0015,
    color: 0x1e232d,
    roughness: 0.22,
    metalness: 0.38,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  });

  // 2. Brushed Aluminum
  const aluminumMat = new THREE.MeshStandardMaterial({
    color: 0xd8e2ed,
    metalness: 0.92,
    roughness: 0.18,
  });

  // 3. Semi-Slick Grooved Drift Tire Rubber (Directional V-Groove + Circumferential Channels)
  const tireCanvas = document.createElement('canvas');
  tireCanvas.width = 256;
  tireCanvas.height = 256;
  const tCtx = tireCanvas.getContext('2d')!;
  tCtx.fillStyle = '#181b20';
  tCtx.fillRect(0, 0, 256, 256);
  tCtx.fillStyle = '#0a0b0e';
  // Circumferential main water channels
  tCtx.fillRect(56, 0, 11, 256);
  tCtx.fillRect(122, 0, 12, 256);
  tCtx.fillRect(189, 0, 11, 256);
  // Directional semi-slick V-sipes & shoulder blocks
  tCtx.strokeStyle = '#090a0d';
  tCtx.lineWidth = 7;
  for (let y = -32; y < 288; y += 26) {
    tCtx.beginPath();
    tCtx.moveTo(6, y);
    tCtx.lineTo(116, y + 22);
    tCtx.stroke();
    tCtx.beginPath();
    tCtx.moveTo(250, y);
    tCtx.lineTo(140, y + 22);
    tCtx.stroke();
  }
  const tireTex = new THREE.CanvasTexture(tireCanvas);
  tireTex.wrapS = THREE.RepeatWrapping;
  tireTex.wrapT = THREE.RepeatWrapping;
  tireTex.repeat.set(1, 7);

  const tireMat = new THREE.MeshStandardMaterial({
    map: tireTex,
    bumpMap: tireTex,
    bumpScale: 0.016,
    color: 0x1a1d23,
    roughness: 0.78,
    metalness: 0.06,
  });

  // 3B. Molded Tire Sidewall Texture with Manufacturer Lettering & Radial Micro-Ribbing
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 512;
  swCanvas.height = 512;
  const swCtx = swCanvas.getContext('2d')!;
  swCtx.fillStyle = '#181b21';
  swCtx.fillRect(0, 0, 512, 512);

  // Concentric molded sidewall bands
  swCtx.strokeStyle = '#242933';
  swCtx.lineWidth = 2.5;
  for (const r of [158, 172, 226, 238]) {
    swCtx.beginPath();
    swCtx.arc(256, 256, r, 0, Math.PI * 2);
    swCtx.stroke();
  }

  // Fine radial knurling ribs in the outer shoulder band
  swCtx.strokeStyle = '#20252e';
  swCtx.lineWidth = 1.5;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    swCtx.beginPath();
    swCtx.moveTo(256 + Math.cos(a) * 226, 256 + Math.sin(a) * 226);
    swCtx.lineTo(256 + Math.cos(a) * 238, 256 + Math.sin(a) * 238);
    swCtx.stroke();
  }

  // Curved embossed sidewall lettering ("YOKOHAMA ADVAN NEOVA" & "265/35ZR18 97Y")
  const drawCurvedSidewallText = (text: string, startAngle: number, radius: number, fontSize: number, color: string) => {
    swCtx.save();
    swCtx.font = `900 ${fontSize}px sans-serif`;
    swCtx.fillStyle = color;
    swCtx.textAlign = 'center';
    swCtx.textBaseline = 'middle';
    const step = 0.062 * (fontSize / 18);
    for (let i = 0; i < text.length; i++) {
      const ang = startAngle + (i - text.length * 0.5) * step;
      swCtx.save();
      swCtx.translate(256 + Math.cos(ang) * radius, 256 + Math.sin(ang) * radius);
      swCtx.rotate(ang + Math.PI * 0.5);
      swCtx.fillText(text[i], 0, 0);
      swCtx.restore();
    }
    swCtx.restore();
  };

  drawCurvedSidewallText('YOKOHAMA  ADVAN  NEOVA', -Math.PI * 0.5, 198, 19, '#647084');
  drawCurvedSidewallText('AD09   265/35ZR18  97Y', Math.PI * 0.5, 198, 18, '#5a6578');
  drawCurvedSidewallText('SEMI-SLICK  RACING', 0.0, 198, 15, '#475161');
  drawCurvedSidewallText('ROTATION  >>>', Math.PI, 198, 15, '#475161');

  const swTex = new THREE.CanvasTexture(swCanvas);
  swTex.colorSpace = THREE.SRGBColorSpace;
  const tireSidewallMat = new THREE.MeshStandardMaterial({
    map: swTex,
    bumpMap: swTex,
    bumpScale: 0.008,
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  // 4. Cross-Drilled & Slotted Cast-Iron Brake Rotor Disc
  const rotorCanvas = document.createElement('canvas');
  rotorCanvas.width = 256;
  rotorCanvas.height = 256;
  const rCtx = rotorCanvas.getContext('2d')!;
  rCtx.fillStyle = '#9aa6b4';
  rCtx.fillRect(0, 0, 256, 256);
  // Concentric brushed machining grooves
  for (let r = 42; r < 124; r += 3) {
    rCtx.strokeStyle = r % 6 === 0 ? '#cbd5e1' : '#788596';
    rCtx.lineWidth = 1.5;
    rCtx.beginPath();
    rCtx.arc(128, 128, r, 0, Math.PI * 2);
    rCtx.stroke();
  }
  // Dark anodized center rotor hat + gold mounting bobbins
  rCtx.fillStyle = '#1e242d';
  rCtx.beginPath();
  rCtx.arc(128, 128, 46, 0, Math.PI * 2);
  rCtx.fill();
  rCtx.fillStyle = '#d97706';
  for (let i = 0; i < 10; i++) {
    const ba = (i / 10) * Math.PI * 2;
    rCtx.beginPath();
    rCtx.arc(128 + Math.cos(ba) * 45, 128 + Math.sin(ba) * 45, 2.6, 0, Math.PI * 2);
    rCtx.fill();
  }
  // Cross-drilled cooling holes & curved Brembo slots
  rCtx.fillStyle = '#1e242d';
  rCtx.strokeStyle = '#262e3a';
  rCtx.lineWidth = 2.5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rCtx.beginPath();
    rCtx.moveTo(128 + Math.cos(a) * 54, 128 + Math.sin(a) * 54);
    rCtx.lineTo(128 + Math.cos(a + 0.18) * 116, 128 + Math.sin(a + 0.18) * 116);
    rCtx.stroke();
    for (let rad = 62; rad <= 108; rad += 22) {
      const ha = a + 0.09 + (rad - 62) * 0.002;
      rCtx.beginPath();
      rCtx.arc(128 + Math.cos(ha) * rad, 128 + Math.sin(ha) * rad, 3.2, 0, Math.PI * 2);
      rCtx.fill();
    }
  }
  const rotorTex = new THREE.CanvasTexture(rotorCanvas);
  rotorTex.colorSpace = THREE.SRGBColorSpace;
  const rotorMat = new THREE.MeshStandardMaterial({
    map: rotorTex,
    bumpMap: rotorTex,
    bumpScale: 0.006,
    color: 0x647082,
    metalness: 0.85,
    roughness: 0.24,
  });

  // 5. Front-Mount Intercooler Core (Clean Brushed Aluminum & Gunmetal Finned Core)
  const icCanvas = document.createElement('canvas');
  icCanvas.width = 512;
  icCanvas.height = 256;
  const icCtx = icCanvas.getContext('2d')!;
  const icGrad = icCtx.createLinearGradient(0, 0, 0, 256);
  icGrad.addColorStop(0, '#475569');
  icGrad.addColorStop(0.5, '#94a3b8');
  icGrad.addColorStop(1, '#334155');
  icCtx.fillStyle = icGrad;
  icCtx.fillRect(0, 0, 512, 256);

  // Horizontal fin rows
  for (let y = 10; y < 246; y += 12) {
    icCtx.fillStyle = '#1e293b';
    icCtx.fillRect(12, y, 488, 5);
    icCtx.fillStyle = '#cbd5e1';
    icCtx.fillRect(12, y + 5, 488, 4);
  }
  // Vertical louver micro-texture
  icCtx.fillStyle = 'rgba(15,23,42,0.25)';
  for (let x = 18; x < 494; x += 8) {
    icCtx.fillRect(x, 10, 2, 236);
  }
  // Subtle stenciled core logo
  icCtx.fillStyle = 'rgba(15, 23, 42, 0.36)';
  icCtx.font = 'italic 900 54px sans-serif';
  icCtx.textAlign = 'center';
  icCtx.fillText('NISMO', 256, 146);
  // Dark gunmetal outer frame border
  icCtx.strokeStyle = '#1e293b';
  icCtx.lineWidth = 14;
  icCtx.strokeRect(7, 7, 498, 242);

  const icTex = new THREE.CanvasTexture(icCanvas);
  icTex.colorSpace = THREE.SRGBColorSpace;
  const intercoolerMat = new THREE.MeshStandardMaterial({
    map: icTex,
    bumpMap: icTex,
    bumpScale: 0.005,
    roughness: 0.26,
    metalness: 0.86,
  });

  // 6. Dark Honeycomb Mesh Grille
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 128;
  gCanvas.height = 128;
  const gCtx = gCanvas.getContext('2d')!;
  gCtx.fillStyle = '#05070a';
  gCtx.fillRect(0, 0, 128, 128);
  gCtx.strokeStyle = '#242c3a';
  gCtx.lineWidth = 2;
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      gCtx.strokeRect(x + ((y / 8) % 2) * 4, y, 6, 6);
    }
  }
  const gTex = new THREE.CanvasTexture(gCanvas);
  gTex.wrapS = THREE.RepeatWrapping;
  gTex.wrapT = THREE.RepeatWrapping;
  gTex.repeat.set(6, 2);
  const grilleMat = new THREE.MeshStandardMaterial({
    map: gTex,
    bumpMap: gTex,
    bumpScale: 0.008,
    color: 0x11151d,
    roughness: 0.64,
    metalness: 0.32,
  });

  // 7. Recaro Alcantara / JDM Micro-Suede Bucket Seat Fabric with Diamond Stitching
  const recCanvas = document.createElement('canvas');
  recCanvas.width = 128;
  recCanvas.height = 128;
  const recCtx = recCanvas.getContext('2d')!;
  recCtx.fillStyle = '#1a2333';
  recCtx.fillRect(0, 0, 128, 128);
  recCtx.strokeStyle = '#253147';
  recCtx.lineWidth = 1.5;
  for (let i = -128; i < 256; i += 16) {
    recCtx.beginPath();
    recCtx.moveTo(i, 0);
    recCtx.lineTo(i + 128, 128);
    recCtx.moveTo(i + 128, 0);
    recCtx.lineTo(i, 128);
    recCtx.stroke();
  }
  const recTex = new THREE.CanvasTexture(recCanvas);
  recTex.wrapS = THREE.RepeatWrapping;
  recTex.wrapT = THREE.RepeatWrapping;
  recTex.repeat.set(4, 4);
  const recaroMat = new THREE.MeshStandardMaterial({
    map: recTex,
    bumpMap: recTex,
    bumpScale: 0.004,
    color: 0x1e293b,
    roughness: 0.86,
    metalness: 0.04,
  });

  // 8. Dual-Scale Metallic Paint Micro-Flake & Subtle Clearcoat Orange-Peel Bump Map
  const flakeCanvas = document.createElement('canvas');
  flakeCanvas.width = 256;
  flakeCanvas.height = 256;
  const fCtx = flakeCanvas.getContext('2d')!;
  fCtx.fillStyle = '#808080';
  fCtx.fillRect(0, 0, 256, 256);
  // Subtle low-frequency clearcoat orange-peel wave
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const wave = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 6;
      const v = Math.round(128 + wave);
      fCtx.fillStyle = `rgb(${v},${v},${v})`;
      fCtx.fillRect(x, y, 4, 4);
    }
  }
  // High-frequency metallic aluminum pigment micro-flakes
  for (let i = 0; i < 2400; i++) {
    const fx = (i * 73) % 256;
    const fy = (i * 137) % 256;
    fCtx.fillStyle = i % 2 === 0 ? '#989898' : '#686868';
    fCtx.fillRect(fx, fy, 1, 1);
  }
  const flakeBumpTex = new THREE.CanvasTexture(flakeCanvas);
  flakeBumpTex.wrapS = THREE.RepeatWrapping;
  flakeBumpTex.wrapT = THREE.RepeatWrapping;
  flakeBumpTex.repeat.set(28, 28);

  // 9. Iconic R34 Center MFD Telemetry Display
  const mfdCanvas = document.createElement('canvas');
  mfdCanvas.width = 256;
  mfdCanvas.height = 128;
  const mCtx = mfdCanvas.getContext('2d')!;
  mCtx.fillStyle = '#07111e';
  mCtx.fillRect(0, 0, 256, 128);
  mCtx.strokeStyle = '#38bdf8';
  mCtx.lineWidth = 3;
  mCtx.strokeRect(8, 8, 240, 112);
  mCtx.fillStyle = '#38bdf8';
  mCtx.font = 'bold 16px monospace';
  mCtx.fillText('BOOST  1.2 BAR', 20, 36);
  mCtx.fillText('OIL T  92 C', 20, 68);
  mCtx.fillText('F/R TRQ 30:70', 20, 100);
  mCtx.fillStyle = '#f59e0b';
  mCtx.fillRect(158, 24, 72, 12);
  mCtx.fillStyle = '#22d3ee';
  mCtx.fillRect(158, 56, 58, 12);
  mCtx.fillRect(158, 88, 64, 12);
  const mfdTex = new THREE.CanvasTexture(mfdCanvas);
  mfdTex.colorSpace = THREE.SRGBColorSpace;
  const mfdMat = new THREE.MeshStandardMaterial({
    map: mfdTex,
    emissive: 0x38bdf8,
    emissiveMap: mfdTex,
    emissiveIntensity: 0.9,
    roughness: 0.15,
  });

  // 10. Illuminated JDM Instrument Cluster (Tachometer + Speedometer + Redline Zone)
  const gcCanvas = document.createElement('canvas');
  gcCanvas.width = 256;
  gcCanvas.height = 128;
  const gcCtx = gcCanvas.getContext('2d')!;
  gcCtx.fillStyle = '#070a10';
  gcCtx.fillRect(0, 0, 256, 128);
  [
    { cx: 82, cy: 66, r: 46, redStart: 0.65 },
    { cx: 174, cy: 66, r: 42, redStart: 0.85 },
  ].forEach((dial) => {
    gcCtx.strokeStyle = '#cbd5e1';
    gcCtx.lineWidth = 3;
    gcCtx.beginPath();
    gcCtx.arc(dial.cx, dial.cy, dial.r, Math.PI * 0.75, Math.PI * 2.25);
    gcCtx.stroke();
    gcCtx.strokeStyle = '#ef4444';
    gcCtx.lineWidth = 4;
    gcCtx.beginPath();
    gcCtx.arc(dial.cx, dial.cy, dial.r - 2, Math.PI * 1.85, Math.PI * 2.25);
    gcCtx.stroke();
    // Glowing red needle
    gcCtx.strokeStyle = '#f97316';
    gcCtx.lineWidth = 2.5;
    gcCtx.beginPath();
    gcCtx.moveTo(dial.cx, dial.cy);
    gcCtx.lineTo(dial.cx + dial.r * 0.55, dial.cy - dial.r * 0.45);
    gcCtx.stroke();
  });
  const gcTex = new THREE.CanvasTexture(gcCanvas);
  gcTex.colorSpace = THREE.SRGBColorSpace;
  const gaugeClusterMat = new THREE.MeshStandardMaterial({
    map: gcTex,
    emissive: 0xffffff,
    emissiveMap: gcTex,
    emissiveIntensity: 0.85,
    roughness: 0.18,
  });

  // 11. Authentic Japanese Touge License Plate ("群馬 330 つ 86-34")
  const lpCanvas = document.createElement('canvas');
  lpCanvas.width = 256;
  lpCanvas.height = 128;
  const lpCtx = lpCanvas.getContext('2d')!;
  lpCtx.fillStyle = '#f1f5f9';
  lpCtx.fillRect(0, 0, 256, 128);
  lpCtx.strokeStyle = '#0f172a';
  lpCtx.lineWidth = 6;
  lpCtx.strokeRect(4, 4, 248, 120);
  // Chrome mounting bolts
  lpCtx.fillStyle = '#64748b';
  lpCtx.beginPath();
  lpCtx.arc(44, 20, 5, 0, Math.PI * 2);
  lpCtx.arc(212, 20, 5, 0, Math.PI * 2);
  lpCtx.fill();
  // Dark JDM green typography
  lpCtx.fillStyle = '#064e3b';
  lpCtx.font = 'bold 24px sans-serif';
  lpCtx.textAlign = 'center';
  lpCtx.fillText('品川 330', 128, 38);
  lpCtx.font = 'bold 28px sans-serif';
  lpCtx.fillText('つ', 34, 92);
  lpCtx.font = '900 48px monospace';
  lpCtx.fillText('34-00', 144, 96);
  const lpTex = new THREE.CanvasTexture(lpCanvas);
  lpTex.colorSpace = THREE.SRGBColorSpace;
  const jdmPlateMat = new THREE.MeshStandardMaterial({
    map: lpTex,
    roughness: 0.28,
    metalness: 0.12,
  });

  // 12. Rear Window Defroster Grid & Ceramic Frit Perimeter Texture
  const defCanvas = document.createElement('canvas');
  defCanvas.width = 256;
  defCanvas.height = 256;
  const defCtx = defCanvas.getContext('2d')!;
  defCtx.fillStyle = '#0f172a';
  defCtx.fillRect(0, 0, 256, 256);
  // Subtle copper-amber horizontal rear defroster heating lines in rear window region
  defCtx.strokeStyle = 'rgba(217, 119, 6, 0.28)';
  defCtx.lineWidth = 1.5;
  for (let y = 18; y < 96; y += 8) {
    defCtx.beginPath();
    defCtx.moveTo(24, y);
    defCtx.lineTo(232, y);
    defCtx.stroke();
  }
  const defrosterGlassTex = new THREE.CanvasTexture(defCanvas);
  defrosterGlassTex.colorSpace = THREE.SRGBColorSpace;

  // 13. Shared Under-Car Ground Contact Shadow + 4-Tire Contact Patch AO Material
  const aoCanvas = document.createElement('canvas');
  aoCanvas.width = 256;
  aoCanvas.height = 256;
  const aoCtx = aoCanvas.getContext('2d')!;
  const bodyGrad = aoCtx.createRadialGradient(128, 128, 22, 128, 128, 120);
  bodyGrad.addColorStop(0, 'rgba(2, 6, 18, 0.86)');
  bodyGrad.addColorStop(0.55, 'rgba(4, 9, 24, 0.52)');
  bodyGrad.addColorStop(0.82, 'rgba(6, 12, 28, 0.18)');
  bodyGrad.addColorStop(1, 'rgba(6, 12, 28, 0.0)');
  aoCtx.fillStyle = bodyGrad;
  aoCtx.fillRect(0, 0, 256, 256);

  for (const [tx, ty] of [
    [54, 58],
    [202, 58],
    [54, 198],
    [202, 198],
  ]) {
    const tireGrad = aoCtx.createRadialGradient(tx, ty, 3, tx, ty, 28);
    tireGrad.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
    tireGrad.addColorStop(0.55, 'rgba(2, 6, 18, 0.48)');
    tireGrad.addColorStop(1, 'rgba(2, 6, 18, 0.0)');
    aoCtx.fillStyle = tireGrad;
    aoCtx.fillRect(tx - 30, ty - 30, 60, 60);
  }
  const aoTex = new THREE.CanvasTexture(aoCanvas);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const sharedMaterialSet = new Set<THREE.Material>([
    carbonMat,
    aluminumMat,
    tireMat,
    tireSidewallMat,
    rotorMat,
    intercoolerMat,
    grilleMat,
    recaroMat,
    mfdMat,
    gaugeClusterMat,
    jdmPlateMat,
    contactShadowMat,
  ]);

  cachedMaterials = {
    carbonMat,
    aluminumMat,
    tireMat,
    tireSidewallMat,
    rotorMat,
    intercoolerMat,
    grilleMat,
    recaroMat,
    flakeBumpTex,
    mfdMat,
    gaugeClusterMat,
    jdmPlateMat,
    defrosterGlassTex,
    contactShadowMat,
    sharedMaterialSet,
  };
  return cachedMaterials;
}

function getCarbonFiberMaterial() {
  return getR34ProceduralMaterials().carbonMat;
}
function getBrushedAluminumMaterial() {
  return getR34ProceduralMaterials().aluminumMat;
}
function getTireRubberMaterial() {
  return getR34ProceduralMaterials().tireMat;
}
function getTireSidewallMaterial() {
  return getR34ProceduralMaterials().tireSidewallMat;
}
function getDrilledRotorMaterial() {
  return getR34ProceduralMaterials().rotorMat;
}
function getIntercoolerMaterial() {
  return getR34ProceduralMaterials().intercoolerMat;
}
function getGrilleMeshMaterial() {
  return getR34ProceduralMaterials().grilleMat;
}
function getRecaroFabricMaterial() {
  return getR34ProceduralMaterials().recaroMat;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES FOR R34 HEADLIGHTS, TAILLIGHTS & BADGES
// ============================================================================
let cachedR34Textures: {
  headlightLeftTex: THREE.CanvasTexture;
  headlightRightTex: THREE.CanvasTexture;
  taillightLensTex: THREE.CanvasTexture;
  gtrBadgeTex: THREE.CanvasTexture;
  gtrShowPlateTex: THREE.CanvasTexture;
  nissanBadgeTex: THREE.CanvasTexture;
  nissanWordmarkTex: THREE.CanvasTexture;
  vspecBadgeTex: THREE.CanvasTexture;
  skylineEmbossedTex: THREE.CanvasTexture;
  silviaSpecRBadgeTex: THREE.CanvasTexture;
  silviaScriptTex: THREE.CanvasTexture;
  silviaKsBadgeTex: THREE.CanvasTexture;
  silviaLightningSTex: THREE.CanvasTexture;
} | null = null;

function createR34Textures() {
  if (cachedR34Textures) return cachedR34Textures;

  const makeHeadlightTex = (isLeft: boolean) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const ctx = c.getContext('2d')!;

    // Bright metallic chrome-silver multi-reflector inner housing
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 192);
    bgGrad.addColorStop(0, '#64748b');
    bgGrad.addColorStop(0.5, '#cbd5e1');
    bgGrad.addColorStop(1, '#475569');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 192);

    // Metallic chrome stepped inner bezel border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 502, 182);

    const drawProjector = (cx: number, cy: number, rOuter: number, rInner: number, isHighBeam: boolean) => {
      const bowlG = ctx.createRadialGradient(cx, cy, rInner * 0.15, cx, cy, rOuter);
      bowlG.addColorStop(0, '#ffffff');
      bowlG.addColorStop(0.45, '#d8e4f2');
      bowlG.addColorStop(0.76, '#64768c');
      bowlG.addColorStop(0.92, '#222a36');
      bowlG.addColorStop(1, '#94a6bc');
      ctx.fillStyle = bowlG;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * rInner * 0.7, cy + Math.sin(a) * rInner * 0.7);
        ctx.lineTo(cx + Math.cos(a) * (rOuter - 4), cy + Math.sin(a) * (rOuter - 4));
        ctx.stroke();
      }

      ctx.strokeStyle = '#e5eef7';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, rInner + 3, 0, Math.PI * 2);
      ctx.stroke();

      const lensG = ctx.createRadialGradient(cx - rInner * 0.22, cy - rInner * 0.22, 2, cx, cy, rInner);
      if (isHighBeam) {
        lensG.addColorStop(0, '#ffffff');
        lensG.addColorStop(0.55, '#d6ebff');
        lensG.addColorStop(0.88, '#4a6b8c');
        lensG.addColorStop(1, '#1c2838');
      } else {
        lensG.addColorStop(0, '#ffffff');
        lensG.addColorStop(0.45, '#b8e2ff');
        lensG.addColorStop(0.82, '#2b6cb0');
        lensG.addColorStop(1, '#10233b');
      }
      ctx.fillStyle = lensG;
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fill();
    };

    if (isLeft) {
      drawProjector(392, 102, 62, 34, true);
      drawProjector(232, 98, 72, 42, false);

      const turnG = ctx.createLinearGradient(14, 18, 128, 174);
      turnG.addColorStop(0, '#cfd8e3');
      turnG.addColorStop(0.5, '#9aa8b8');
      turnG.addColorStop(1, '#687788');
      ctx.fillStyle = turnG;
      ctx.fillRect(14, 18, 112, 156);

      const ambG = ctx.createRadialGradient(68, 102, 4, 68, 102, 48);
      ambG.addColorStop(0, '#fff4d4');
      ambG.addColorStop(0.42, '#f59e0b');
      ambG.addColorStop(0.82, 'rgba(217, 119, 6, 0.35)');
      ambG.addColorStop(1, 'rgba(217, 119, 6, 0)');
      ctx.fillStyle = ambG;
      ctx.beginPath();
      ctx.arc(68, 102, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (let y = 26; y < 170; y += 14) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(124, y);
        ctx.stroke();
      }
    } else {
      drawProjector(120, 102, 62, 34, true);
      drawProjector(280, 98, 72, 42, false);

      const turnG = ctx.createLinearGradient(384, 18, 498, 174);
      turnG.addColorStop(0, '#cfd8e3');
      turnG.addColorStop(0.5, '#9aa8b8');
      turnG.addColorStop(1, '#687788');
      ctx.fillStyle = turnG;
      ctx.fillRect(386, 18, 112, 156);

      const ambG = ctx.createRadialGradient(444, 102, 4, 444, 102, 48);
      ambG.addColorStop(0, '#fff4d4');
      ambG.addColorStop(0.42, '#f59e0b');
      ambG.addColorStop(0.82, 'rgba(217, 119, 6, 0.35)');
      ambG.addColorStop(1, 'rgba(217, 119, 6, 0)');
      ctx.fillStyle = ambG;
      ctx.beginPath();
      ctx.arc(444, 102, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (let y = 26; y < 170; y += 14) {
        ctx.beginPath();
        ctx.moveTo(388, y);
        ctx.lineTo(496, y);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const tailCanvas = document.createElement('canvas');
  tailCanvas.width = 256;
  tailCanvas.height = 256;
  const tctx = tailCanvas.getContext('2d')!;
  const radG = tctx.createRadialGradient(128, 128, 6, 128, 128, 122);
  radG.addColorStop(0, '#fff2d6');
  radG.addColorStop(0.26, '#ff6b4a');
  radG.addColorStop(0.48, '#e11d48');
  radG.addColorStop(0.76, '#dc2626');
  radG.addColorStop(0.92, '#7f1d1d');
  radG.addColorStop(1, '#1a0508');
  tctx.fillStyle = radG;
  tctx.fillRect(0, 0, 256, 256);

  tctx.strokeStyle = 'rgba(255, 220, 220, 0.38)';
  tctx.lineWidth = 2;
  for (let r = 24; r <= 112; r += 16) {
    tctx.beginPath();
    tctx.arc(128, 128, r, 0, Math.PI * 2);
    tctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    tctx.beginPath();
    tctx.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
    tctx.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
    tctx.stroke();
  }
  const taillightLensTex = new THREE.CanvasTexture(tailCanvas);
  taillightLensTex.colorSpace = THREE.SRGBColorSpace;

  const gtrCanvas = document.createElement('canvas');
  gtrCanvas.width = 256;
  gtrCanvas.height = 160;
  const gctx = gtrCanvas.getContext('2d')!;
  gctx.fillStyle = '#0f1318';
  gctx.fillRect(0, 0, 256, 160);
  gctx.strokeStyle = '#d4dde8';
  gctx.lineWidth = 8;
  gctx.strokeRect(6, 6, 244, 148);
  gctx.fillStyle = '#e2e8f0';
  gctx.font = 'italic 900 74px sans-serif';
  gctx.textAlign = 'center';
  gctx.fillText('GT', 128, 76);
  gctx.fillStyle = '#ef4444';
  gctx.font = 'italic 900 84px sans-serif';
  gctx.fillText('R', 132, 146);
  const gtrBadgeTex = new THREE.CanvasTexture(gtrCanvas);
  gtrBadgeTex.colorSpace = THREE.SRGBColorSpace;

  const nisCanvas = document.createElement('canvas');
  nisCanvas.width = 128;
  nisCanvas.height = 128;
  const nctx = nisCanvas.getContext('2d')!;
  nctx.clearRect(0, 0, 128, 128);
  nctx.strokeStyle = '#e2e8f0';
  nctx.lineWidth = 10;
  nctx.beginPath();
  nctx.arc(64, 64, 44, 0, Math.PI * 2);
  nctx.stroke();
  nctx.fillStyle = '#e2e8f0';
  nctx.fillRect(10, 50, 108, 28);
  nctx.fillStyle = '#0f172a';
  nctx.font = 'bold 18px sans-serif';
  nctx.textAlign = 'center';
  nctx.fillText('NISSAN', 64, 70);
  const nissanBadgeTex = new THREE.CanvasTexture(nisCanvas);
  nissanBadgeTex.colorSpace = THREE.SRGBColorSpace;

  const vsCanvas = document.createElement('canvas');
  vsCanvas.width = 256;
  vsCanvas.height = 64;
  const vctx = vsCanvas.getContext('2d')!;
  vctx.fillStyle = 'rgba(15, 23, 42, 0.0)';
  vctx.fillRect(0, 0, 256, 64);
  vctx.fillStyle = '#e2e8f0';
  vctx.font = 'italic bold 36px sans-serif';
  vctx.textAlign = 'center';
  vctx.fillText('V·spec II', 128, 44);
  const vspecBadgeTex = new THREE.CanvasTexture(vsCanvas);
  vspecBadgeTex.colorSpace = THREE.SRGBColorSpace;

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 64;
  const sctx = skyCanvas.getContext('2d')!;
  sctx.clearRect(0, 0, 512, 64);
  sctx.font = '900 34px sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  // Recessed shadow + highlight for embossed SKYLINE lettering
  sctx.fillStyle = 'rgba(4, 15, 38, 0.72)';
  sctx.fillText('S  K  Y  L  I  N  E', 256, 30);
  sctx.strokeStyle = 'rgba(191, 219, 254, 0.45)';
  sctx.lineWidth = 1.5;
  sctx.strokeText('S  K  Y  L  I  N  E', 256, 33);
  const skylineEmbossedTex = new THREE.CanvasTexture(skyCanvas);
  skylineEmbossedTex.colorSpace = THREE.SRGBColorSpace;

  const gtrPlateCanvas = document.createElement('canvas');
  gtrPlateCanvas.width = 256;
  gtrPlateCanvas.height = 128;
  const gpctx = gtrPlateCanvas.getContext('2d')!;
  gpctx.fillStyle = '#0b0e14';
  gpctx.fillRect(0, 0, 256, 128);
  gpctx.strokeStyle = '#64748b';
  gpctx.lineWidth = 5;
  gpctx.strokeRect(4, 4, 248, 120);
  gpctx.fillStyle = '#e2e8f0';
  gpctx.font = 'italic 900 44px sans-serif';
  gpctx.textAlign = 'center';
  gpctx.fillText('GT', 128, 56);
  gpctx.fillStyle = '#ef4444';
  gpctx.font = 'italic 900 54px sans-serif';
  gpctx.fillText('R', 130, 108);
  const gtrShowPlateTex = new THREE.CanvasTexture(gtrPlateCanvas);
  gtrShowPlateTex.colorSpace = THREE.SRGBColorSpace;

  const nwCanvas = document.createElement('canvas');
  nwCanvas.width = 256;
  nwCanvas.height = 64;
  const nwctx = nwCanvas.getContext('2d')!;
  nwctx.clearRect(0, 0, 256, 64);
  nwctx.fillStyle = '#e2e8f0';
  nwctx.font = '900 34px sans-serif';
  nwctx.textAlign = 'center';
  nwctx.textBaseline = 'middle';
  nwctx.fillText('N I S S A N', 128, 32);
  const nissanWordmarkTex = new THREE.CanvasTexture(nwCanvas);
  nissanWordmarkTex.colorSpace = THREE.SRGBColorSpace;

  // S15 "Silvia Spec-R" Trunk & Side Badge Texture ("Silvia" chrome script + "Spec-" silver + crimson "R")
  const s15BadgeCanvas = document.createElement('canvas');
  s15BadgeCanvas.width = 256;
  s15BadgeCanvas.height = 96;
  const s15ctx = s15BadgeCanvas.getContext('2d')!;
  s15ctx.clearRect(0, 0, 256, 96);
  s15ctx.fillStyle = '#cbd5e1';
  s15ctx.strokeStyle = '#1e293b';
  s15ctx.lineWidth = 3;
  s15ctx.font = 'italic bold 32px serif';
  s15ctx.textAlign = 'center';
  s15ctx.strokeText('Silvia', 128, 34);
  s15ctx.fillText('Silvia', 128, 34);
  s15ctx.font = 'italic 900 34px sans-serif';
  s15ctx.textAlign = 'right';
  s15ctx.strokeText('Spec-', 154, 76);
  s15ctx.fillStyle = '#94a3b8';
  s15ctx.fillText('Spec-', 154, 76);
  s15ctx.textAlign = 'left';
  s15ctx.font = 'italic 900 40px sans-serif';
  s15ctx.strokeText('R', 156, 78);
  s15ctx.fillStyle = '#dc2626';
  s15ctx.fillText('R', 156, 78);
  const silviaSpecRBadgeTex = new THREE.CanvasTexture(s15BadgeCanvas);
  silviaSpecRBadgeTex.colorSpace = THREE.SRGBColorSpace;

  // S14 Kouki "Silvia" Chrome Script Texture
  const silScriptCanvas = document.createElement('canvas');
  silScriptCanvas.width = 256;
  silScriptCanvas.height = 64;
  const ssctx = silScriptCanvas.getContext('2d')!;
  ssctx.clearRect(0, 0, 256, 64);
  ssctx.font = 'italic bold 40px serif';
  ssctx.textAlign = 'center';
  ssctx.textBaseline = 'middle';
  ssctx.strokeStyle = '#0f172a';
  ssctx.lineWidth = 3;
  ssctx.strokeText('Silvia', 128, 32);
  ssctx.fillStyle = '#e2e8f0';
  ssctx.fillText('Silvia', 128, 32);
  const silviaScriptTex = new THREE.CanvasTexture(silScriptCanvas);
  silviaScriptTex.colorSpace = THREE.SRGBColorSpace;

  // S14 Kouki "K's" Trunk & Quarter Emblem Texture
  const ksCanvas = document.createElement('canvas');
  ksCanvas.width = 160;
  ksCanvas.height = 64;
  const ksctx = ksCanvas.getContext('2d')!;
  ksctx.clearRect(0, 0, 160, 64);
  ksctx.font = 'italic 900 42px serif';
  ksctx.textAlign = 'center';
  ksctx.textBaseline = 'middle';
  ksctx.strokeStyle = '#0f172a';
  ksctx.lineWidth = 3;
  ksctx.strokeText("K's", 80, 34);
  ksctx.fillStyle = '#e2e8f0';
  ksctx.fillText("K's", 80, 34);
  const silviaKsBadgeTex = new THREE.CanvasTexture(ksCanvas);
  silviaKsBadgeTex.colorSpace = THREE.SRGBColorSpace;

  // S15 Iconic Silvia Lightning-Bolt "S" Hood Crest Texture
  const sCrestCanvas = document.createElement('canvas');
  sCrestCanvas.width = 128;
  sCrestCanvas.height = 128;
  const scctx = sCrestCanvas.getContext('2d')!;
  scctx.clearRect(0, 0, 128, 128);
  scctx.fillStyle = '#111827';
  scctx.beginPath();
  scctx.moveTo(64, 8);
  scctx.lineTo(106, 28);
  scctx.lineTo(94, 96);
  scctx.lineTo(64, 120);
  scctx.lineTo(34, 96);
  scctx.lineTo(22, 28);
  scctx.closePath();
  scctx.fill();
  scctx.strokeStyle = '#e2e8f0';
  scctx.lineWidth = 6;
  scctx.stroke();
  // Lightning "S" bolt inside crest
  scctx.fillStyle = '#dc2626';
  scctx.beginPath();
  scctx.moveTo(74, 22);
  scctx.lineTo(42, 66);
  scctx.lineTo(66, 66);
  scctx.lineTo(52, 106);
  scctx.lineTo(86, 58);
  scctx.lineTo(62, 58);
  scctx.closePath();
  scctx.fill();
  const silviaLightningSTex = new THREE.CanvasTexture(sCrestCanvas);
  silviaLightningSTex.colorSpace = THREE.SRGBColorSpace;

  cachedR34Textures = {
    headlightLeftTex: makeHeadlightTex(true),
    headlightRightTex: makeHeadlightTex(false),
    taillightLensTex,
    gtrBadgeTex,
    gtrShowPlateTex,
    nissanBadgeTex,
    nissanWordmarkTex,
    vspecBadgeTex,
    skylineEmbossedTex,
    silviaSpecRBadgeTex,
    silviaScriptTex,
    silviaKsBadgeTex,
    silviaLightningSTex,
  };
  return cachedR34Textures;
}

// ============================================================================
// SMOOTH CATMULL-ROM INTERPOLATION & ROUNDED AUTOMOTIVE GEOMETRY HELPERS
// ============================================================================
function catmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleCatmullRomChain(pts: number[], s: number): number {
  const n = pts.length;
  if (s <= 0) return pts[0];
  if (s >= 1) return pts[n - 1];
  const scaled = s * (n - 1);
  const idx = Math.min(n - 2, Math.floor(scaled));
  const localU = scaled - idx;
  const p0 = pts[Math.max(0, idx - 1)];
  const p1 = pts[idx];
  const p2 = pts[idx + 1];
  const p3 = pts[Math.min(n - 1, idx + 2)];
  return catmullRom1D(p0, p1, p2, p3, localU);
}

const roundedBoxCache = new Map<string, THREE.BufferGeometry>();

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.012,
  smoothness = 3
): THREE.BufferGeometry {
  const r = Math.min(radius, width * 0.35, height * 0.35, depth * 0.35);
  const key = `${width.toFixed(3)}_${height.toFixed(3)}_${depth.toFixed(3)}_${r.toFixed(3)}_${smoothness}`;
  const cached = roundedBoxCache.get(key);
  if (cached) return cached;

  const w = Math.max(0.002, width - r * 2);
  const h = Math.max(0.002, height - r * 2);
  const d = Math.max(0.002, depth - r * 2);

  const shape = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  shape.moveTo(-hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.quadraticCurveTo(hw + r, -hh - r, hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  shape.lineTo(-hw, hh + r);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw, -hh - r);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSegments: smoothness,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: smoothness * 2,
  });
  geom.center();
  geom.computeVertexNormals();
  roundedBoxCache.set(key, geom);
  return geom;
}

interface LongitudinalStation {
  t: number;
  bottomY: number;
  bumperOutY: number;
  shoulderY: number;
  fenderTopY: number;
  hoodCenterY: number;
  planScale: number;
  lowerWidthScale: number;
  archFlare: number;
  hoodDrop: number;
}

function sampleLongitudinalTable(table: LongitudinalStation[], t: number): LongitudinalStation {
  if (t <= table[0].t) return { ...table[0] };
  if (t >= table[table.length - 1].t) return { ...table[table.length - 1] };

  let idx = 0;
  for (let i = 0; i < table.length - 1; i++) {
    if (t >= table[i].t && t <= table[i + 1].t) {
      idx = i;
      break;
    }
  }

  const s0 = table[Math.max(0, idx - 1)];
  const s1 = table[idx];
  const s2 = table[Math.min(table.length - 1, idx + 1)];
  const s3 = table[Math.min(table.length - 1, idx + 2)];

  const span = Math.max(0.0001, s2.t - s1.t);
  const localU = Math.max(0, Math.min(1, (t - s1.t) / span));

  return {
    t,
    bottomY: catmullRom1D(s0.bottomY, s1.bottomY, s2.bottomY, s3.bottomY, localU),
    bumperOutY: catmullRom1D(s0.bumperOutY, s1.bumperOutY, s2.bumperOutY, s3.bumperOutY, localU),
    shoulderY: catmullRom1D(s0.shoulderY, s1.shoulderY, s2.shoulderY, s3.shoulderY, localU),
    fenderTopY: catmullRom1D(s0.fenderTopY, s1.fenderTopY, s2.fenderTopY, s3.fenderTopY, localU),
    hoodCenterY: catmullRom1D(s0.hoodCenterY, s1.hoodCenterY, s2.hoodCenterY, s3.hoodCenterY, localU),
    planScale: catmullRom1D(s0.planScale, s1.planScale, s2.planScale, s3.planScale, localU),
    lowerWidthScale: catmullRom1D(
      s0.lowerWidthScale,
      s1.lowerWidthScale,
      s2.lowerWidthScale,
      s3.lowerWidthScale,
      localU
    ),
    archFlare: Math.max(0, catmullRom1D(s0.archFlare, s1.archFlare, s2.archFlare, s3.archFlare, localU)),
    hoodDrop: catmullRom1D(s0.hoodDrop, s1.hoodDrop, s2.hoodDrop, s3.hoodDrop, localU),
  };
}

// ============================================================================
// 0B. SHARED LONGITUDINAL SPLINE STATION TABLE & TOP-SURFACE EVALUATOR
// ============================================================================
export function getVisualWheelRadius(spec: VehicleSpec): number {
  const sil = spec.silhouette;
  const isLowWedge =
    sil === 'f40_super_wedge' ||
    sil === 'nsx_mid_wedge' ||
    sil === 'rx7_fluid_coupe' ||
    sil === 's2000_roadster' ||
    sil === 'ae86_hatch_coupe';
  return spec.dimensions.wheelRadius * (isLowWedge ? 0.86 : 0.90);
}

export function buildVehicleControlStations(spec: VehicleSpec): LongitudinalStation[] {
  const baseStations: LongitudinalStation[] = [
    { t: -0.482, bottomY: 0.235, bumperOutY: 0.38, shoulderY: 0.72, fenderTopY: 0.792, hoodCenterY: 0.802, planScale: 0.920, lowerWidthScale: 0.88, archFlare: 0.0, hoodDrop: 0.005 },
    { t: -0.448, bottomY: 0.215, bumperOutY: 0.36, shoulderY: 0.75, fenderTopY: 0.808, hoodCenterY: 0.814, planScale: 0.940, lowerWidthScale: 0.90, archFlare: 0.02, hoodDrop: 0.008 },
    { t: -0.392, bottomY: 0.192, bumperOutY: 0.34, shoulderY: 0.77, fenderTopY: 0.822, hoodCenterY: 0.825, planScale: 0.950, lowerWidthScale: 0.92, archFlare: 0.045, hoodDrop: 0.01 },
    { t: -0.305, bottomY: 0.175, bumperOutY: 0.34, shoulderY: 0.78, fenderTopY: 0.836, hoodCenterY: 0.830, planScale: 0.955, lowerWidthScale: 0.93, archFlare: 0.068, hoodDrop: 0.014 },
    { t: -0.215, bottomY: 0.162, bumperOutY: 0.33, shoulderY: 0.77, fenderTopY: 0.828, hoodCenterY: 0.824, planScale: 0.945, lowerWidthScale: 0.92, archFlare: 0.035, hoodDrop: 0.014 },
    { t: -0.100, bottomY: 0.158, bumperOutY: 0.33, shoulderY: 0.765, fenderTopY: 0.822, hoodCenterY: 0.818, planScale: 0.935, lowerWidthScale: 0.92, archFlare: 0.0, hoodDrop: 0.01 },
    { t: 0.030, bottomY: 0.158, bumperOutY: 0.33, shoulderY: 0.765, fenderTopY: 0.820, hoodCenterY: 0.815, planScale: 0.935, lowerWidthScale: 0.92, archFlare: 0.0, hoodDrop: 0.01 },
    { t: 0.145, bottomY: 0.158, bumperOutY: 0.33, shoulderY: 0.758, fenderTopY: 0.812, hoodCenterY: 0.798, planScale: 0.945, lowerWidthScale: 0.93, archFlare: 0.02, hoodDrop: 0.012 },
    { t: 0.235, bottomY: 0.162, bumperOutY: 0.335, shoulderY: 0.748, fenderTopY: 0.796, hoodCenterY: 0.776, planScale: 0.955, lowerWidthScale: 0.935, archFlare: 0.05, hoodDrop: 0.014 },
    { t: 0.305, bottomY: 0.162, bumperOutY: 0.34, shoulderY: 0.732, fenderTopY: 0.778, hoodCenterY: 0.756, planScale: 0.955, lowerWidthScale: 0.935, archFlare: 0.068, hoodDrop: 0.014 },
    { t: 0.390, bottomY: 0.158, bumperOutY: 0.34, shoulderY: 0.708, fenderTopY: 0.746, hoodCenterY: 0.728, planScale: 0.948, lowerWidthScale: 0.915, archFlare: 0.038, hoodDrop: 0.010 },
    { t: 0.445, bottomY: 0.156, bumperOutY: 0.34, shoulderY: 0.668, fenderTopY: 0.704, hoodCenterY: 0.690, planScale: 0.932, lowerWidthScale: 0.895, archFlare: 0.012, hoodDrop: 0.008 },
    { t: 0.478, bottomY: 0.155, bumperOutY: 0.34, shoulderY: 0.628, fenderTopY: 0.658, hoodCenterY: 0.648, planScale: 0.905, lowerWidthScale: 0.875, archFlare: 0.0, hoodDrop: 0.005 },
  ];

  const vWheelR = getVisualWheelRadius(spec);
  const minSafeFenderY = vWheelR * 2 + 0.056;
  const minSafeHoodY = vWheelR * 2 + 0.036;

  if (spec.id === 'r34_gtr') {
    return baseStations;
  }

  if (spec.id === 'r33_gtr') {
    return baseStations.map((s) => {
      const st = { ...s };
      if (st.t > 0.22) {
        const nf = (st.t - 0.22) / 0.258;
        const curve = Math.pow(nf, 1.45);
        st.fenderTopY -= curve * 0.048;
        st.hoodCenterY -= curve * 0.052;
        st.shoulderY -= curve * 0.034;
        st.planScale -= curve * 0.032;
        st.lowerWidthScale -= curve * 0.028;
      }
      st.archFlare *= 1.06;
      return st;
    });
  }

  if (spec.id === 'r32_gtr') {
    return baseStations.map((s) => {
      const st = { ...s };
      if (st.t > 0.16) {
        const nf = (st.t - 0.16) / 0.318;
        const curve = Math.pow(nf, 1.35);
        st.fenderTopY -= curve * 0.068;
        st.hoodCenterY -= curve * 0.072;
        st.shoulderY -= curve * 0.052;
        st.planScale -= curve * 0.064;
        st.lowerWidthScale -= curve * 0.058;
      }
      if (st.t < -0.32) {
        const rf = (-0.32 - st.t) / 0.162;
        st.planScale -= rf * 0.024;
        st.lowerWidthScale -= rf * 0.022;
      }
      st.archFlare *= 0.88;
      return st;
    });
  }

  return baseStations.map((s) => {
    const st = { ...s };
    const sil = spec.silhouette;
    const frontFactor = Math.max(0, (st.t - 0.22) / 0.258);
    const rearFactor = Math.max(0, (-0.08 - st.t) / 0.40);
    const waistFactor = Math.max(0, 1 - Math.abs(st.t) / 0.22);

    if (sil === 'f40_super_wedge' || sil === 'nsx_mid_wedge') {
      const noseDrop = Math.pow(frontFactor, 1.35) * (sil === 'f40_super_wedge' ? 0.145 : 0.130);
      st.fenderTopY = st.fenderTopY * 0.96 - noseDrop + rearFactor * 0.025;
      st.hoodCenterY = st.hoodCenterY * 0.94 - noseDrop * 1.12 + rearFactor * 0.03;
      st.shoulderY = st.shoulderY * 0.94 - noseDrop * 0.85;
      st.planScale += rearFactor * 0.03 - waistFactor * 0.025;
      st.archFlare *= sil === 'f40_super_wedge' ? 1.35 : 1.15;
    } else if (sil === 'rx7_fluid_coupe') {
      const noseDrop = Math.pow(frontFactor, 1.35) * 0.105;
      st.fenderTopY = st.fenderTopY * 0.97 - noseDrop - rearFactor * 0.025;
      st.hoodCenterY = st.hoodCenterY * 0.96 - noseDrop * 1.12 - rearFactor * 0.020;
      st.shoulderY = st.shoulderY * 0.96 - noseDrop * 0.80;
      st.planScale -= waistFactor * 0.035;
      st.archFlare *= 1.28;
    } else if (sil === 'supra_aero_coupe') {
      const noseDrop = Math.pow(frontFactor, 1.4) * 0.072;
      st.fenderTopY = st.fenderTopY * 0.985 - noseDrop + (st.t < -0.2 && st.t > -0.42 ? 0.018 : 0);
      st.hoodCenterY = st.hoodCenterY * 0.975 - noseDrop * 1.06;
      st.shoulderY = st.shoulderY * 0.975 - noseDrop * 0.72;
      if (st.t < -0.15) st.archFlare *= 1.35;
    } else if (sil === 'ae86_hatch_coupe') {
      const noseDrop = Math.pow(frontFactor, 1.3) * 0.092;
      st.fenderTopY = st.fenderTopY * 0.96 - noseDrop - rearFactor * 0.02;
      st.hoodCenterY = st.hoodCenterY * 0.96 - noseDrop * 1.05;
      st.shoulderY = st.shoulderY * 0.96 - noseDrop * 0.78;
      st.archFlare *= spec.id === 'ae86_trueno' ? 0.85 : 1.10;
    } else if (sil === 's15_sleek_coupe') {
      const noseDrop = Math.pow(frontFactor, 1.35) * (spec.id === 'silvia_s15' ? 0.082 : 0.076);
      st.fenderTopY = st.fenderTopY * 0.962 - noseDrop - rearFactor * 0.018;
      st.hoodCenterY = st.hoodCenterY * 0.955 - noseDrop * 1.08;
      st.shoulderY = st.shoulderY * 0.962 - noseDrop * 0.72;
      if (st.t > 0.16) {
        const sFrontU = (st.t - 0.16) / 0.318;
        st.planScale *= 1.0 - 0.048 * Math.pow(sFrontU, 1.35);
      } else if (st.t < -0.30) {
        const sRearU = (-0.30 - st.t) / 0.178;
        st.planScale *= 1.0 - 0.036 * Math.pow(sRearU, 1.25);
      }
      st.archFlare *= 1.05;
    } else if (sil === 'z33_fastback') {
      const noseDrop = Math.pow(frontFactor, 1.35) * 0.062;
      st.fenderTopY = st.fenderTopY * 0.99 - noseDrop;
      st.hoodCenterY = st.hoodCenterY * 0.98 - noseDrop;
      st.shoulderY = st.shoulderY * 1.01 - noseDrop * 0.65;
      st.archFlare *= 1.30;
    } else if (sil === 's2000_roadster') {
      const noseDrop = Math.pow(frontFactor, 1.3) * (spec.id === 'mx5_miata' ? 0.098 : 0.070);
      st.fenderTopY = st.fenderTopY * 0.95 - noseDrop - rearFactor * 0.030;
      st.hoodCenterY = st.hoodCenterY * 0.94 - noseDrop * 1.06 - rearFactor * 0.025;
      st.shoulderY = st.shoulderY * 0.95 - noseDrop * 0.75;
      st.archFlare *= 1.12;
    } else if (sil === 'sti_rally_sedan' || sil === 'evo_aggressive_sedan') {
      st.fenderTopY = st.fenderTopY * 1.03 - Math.pow(frontFactor, 1.4) * 0.025;
      st.hoodCenterY = st.hoodCenterY * 1.03 - Math.pow(frontFactor, 1.4) * 0.025;
      st.shoulderY = st.shoulderY * 1.03;
      st.archFlare *= 1.20;
    } else if (sil === 'e46_euro_coupe') {
      st.fenderTopY = st.fenderTopY * 0.99 - Math.pow(frontFactor, 1.4) * 0.022;
      st.hoodCenterY = st.hoodCenterY * 1.01;
      st.archFlare *= 1.38;
    }

    // Smooth continuous clearance envelope (no abrupt step jump at axle stations)
    if (st.t < 0.34) {
      st.fenderTopY = Math.max(st.fenderTopY, minSafeFenderY);
      st.hoodCenterY = Math.max(st.hoodCenterY, minSafeHoodY);
    }
    return st;
  });
}

function evalStationTopPoint(
  controlStations: LongitudinalStation[],
  spec: VehicleSpec,
  t: number,
  lateralFrac: number
): {
  x: number;
  y: number;
  z: number;
  wFenderCrest: number;
  wShoulder: number;
  cY: number;
  topY: number;
} {
  const L = spec.dimensions.length;
  const W = spec.dimensions.width;
  const halfW = W * 0.5;
  const wheelbase = spec.dimensions.wheelbase;
  const vWheelR = getVisualWheelRadius(spec);
  const frontAxleT = (wheelbase * 0.5) / L;
  const rearAxleT = -(wheelbase * 0.5) / L;

  const st = sampleLongitudinalTable(controlStations, t);
  const df = Math.abs(t - frontAxleT);
  const dr = Math.abs(t - rearAxleT);
  const archRadiusT = (vWheelR + 0.044) / L;
  let archCircle = 0;
  let wheelArchLift = 0;
  let flareBell = 0;

  const archPeakY = vWheelR * 2 + 0.032;
  const maxArchLift = Math.max(0.28, archPeakY - st.bottomY);

  if (df < archRadiusT) {
    const norm = df / archRadiusT;
    archCircle = Math.sqrt(Math.max(0, 1 - norm * norm));
    wheelArchLift = archCircle * maxArchLift;
    flareBell = Math.pow(Math.cos(norm * Math.PI * 0.5), 1.15);
  } else if (dr < archRadiusT) {
    const norm = dr / archRadiusT;
    archCircle = Math.sqrt(Math.max(0, 1 - norm * norm));
    wheelArchLift = archCircle * maxArchLift;
    flareBell = Math.pow(Math.cos(norm * Math.PI * 0.5), 1.15);
  }

  let zBase = t * L;
  if (t > 0.42) {
    const noseFactor = (t - 0.42) / 0.058;
    zBase -= noseFactor * noseFactor * 0.042;
  } else if (t < -0.42) {
    const tailFactor = (-0.42 - t) / 0.062;
    zBase += tailFactor * tailFactor * 0.038;
  }

  const bY = st.bottomY + wheelArchLift;
  const shY = Math.max(st.shoulderY, bY + 0.016);
  const topY = Math.max(st.fenderTopY, shY + 0.025);
  const cY = st.hoodCenterY;

  const wBelly = halfW * st.planScale + st.archFlare * (0.45 + 0.55 * flareBell);
  const wBottom = halfW * st.lowerWidthScale + st.archFlare * 0.35 * flareBell;
  const wShoulder = halfW * (st.planScale - 0.015) + st.archFlare * 0.52 * (0.35 + 0.65 * flareBell);
  const wFenderCrest = halfW * (st.planScale - 0.085);
  const doorScallopMid =
    t > -0.18 && t < 0.15 ? -0.012 * Math.cos((t / 0.17) * Math.PI * 0.5) : 0;

  const innerLipX = wBottom * 0.78 * (1 - archCircle) + (wBottom - 0.022) * archCircle;
  const outerLipX = wBottom * 0.98 * (1 - archCircle) + wBottom * archCircle;

  const ctrlX = [
    innerLipX,
    outerLipX,
    wBottom + (wBelly - wBottom) * 0.65 + doorScallopMid,
    wBelly + doorScallopMid * 0.5,
    wShoulder,
    wFenderCrest + (wShoulder - wFenderCrest) * 0.26,
    wFenderCrest * 0.52,
    0.0,
  ];
  const ctrlY = [
    bY + 0.004 * archCircle,
    bY + 0.006,
    bY + (shY - bY) * 0.46,
    bY + (shY - bY) * 0.88,
    shY + (topY - shY) * 0.38,
    topY - 0.004,
    cY + (topY - cY) * 0.56 - st.hoodDrop * 0.6,
    cY,
  ];

  // Map lateralFrac in [-1, 1] (where ±1 is the hood/trunk shut-line at s = 0.755)
  const absLat = Math.min(1.0, Math.abs(lateralFrac));
  const s = 1.0 - absLat * 0.245;
  const sign = lateralFrac < 0 ? -1 : 1;
  const rx = absLat < 1e-4 ? 0 : Math.max(0, sampleCatmullRomChain(ctrlX, s));
  const y = sampleCatmullRomChain(ctrlY, s);
  let z = zBase;

  if (s > 0.72) {
    const loc = (s - 0.72) / 0.28;
    if (t > 0.39) {
      z += (1 - loc * loc) * ((t - 0.39) / 0.088) * 0.042;
    } else if (t < -0.39) {
      z -= (1 - loc * loc) * ((-0.39 - t) / 0.092) * 0.032;
    }
  }

  return { x: sign * rx, y, z, wFenderCrest, wShoulder, cY, topY };
}

export function sampleVehicleTopSurface(
  controlStations: LongitudinalStation[],
  spec: VehicleSpec,
  t: number,
  lateralFrac: number
): {
  x: number;
  y: number;
  z: number;
  pitchX: number;
  wFenderCrest: number;
  wShoulder: number;
  cY: number;
  topY: number;
} {
  const pt = evalStationTopPoint(controlStations, spec, t, lateralFrac);
  const dt = 0.014;
  const ptRear = evalStationTopPoint(controlStations, spec, Math.max(-0.48, t - dt), lateralFrac);
  const ptFront = evalStationTopPoint(controlStations, spec, Math.min(0.478, t + dt), lateralFrac);
  const dz = Math.max(0.01, ptFront.z - ptRear.z);
  const dy = ptRear.y - ptFront.y;
  const pitchX = Math.atan2(dy, dz);
  return { ...pt, pitchX };
}

// ============================================================================
// 1. CONTINUOUS SUBDIVISION-SMOOTH BODY SHELL (Exact BNR34 + 12 Distinct Silhouettes)
// ============================================================================
function buildSmoothSplineR34BodyGeometry(
  L: number,
  W: number,
  wheelbase: number,
  spec: VehicleSpec,
  controlStationsInput?: LongitudinalStation[],
  hasWidebody = false
): THREE.BufferGeometry {
  const halfW = W * 0.5;
  const vWheelR = getVisualWheelRadius(spec);
  const frontAxleT = (wheelbase * 0.5) / L;
  const rearAxleT = -(wheelbase * 0.5) / L;
  const controlStations = controlStationsInput ?? buildVehicleControlStations(spec);

  const numStations = 72;
  const halfCount = 24;
  // Total unique vertices per cross-section ring (no duplicate centerline vertex at x=0!)
  const ringPts = halfCount * 2 - 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < numStations; i++) {
    const u = i / (numStations - 1);
    const t = -0.482 + u * 0.960;
    const st = sampleLongitudinalTable(controlStations, t);

    const df = Math.abs(t - frontAxleT);
    const dr = Math.abs(t - rearAxleT);
    const archRadiusT = (vWheelR + 0.044) / L;
    let archCircle = 0;
    let wheelArchLift = 0;
    let flareBell = 0;

    const archPeakY = Math.min(st.fenderTopY - 0.026, vWheelR * 2 + 0.018);
    const maxArchLift = Math.max(0.24, archPeakY - st.bottomY);

    if (df < archRadiusT) {
      const norm = df / archRadiusT;
      archCircle = Math.sqrt(Math.max(0, 1 - norm * norm));
      wheelArchLift = archCircle * maxArchLift;
      flareBell = Math.pow(Math.cos(norm * Math.PI * 0.5), 1.25);
    } else if (dr < archRadiusT) {
      const norm = dr / archRadiusT;
      archCircle = Math.sqrt(Math.max(0, 1 - norm * norm));
      wheelArchLift = archCircle * maxArchLift;
      flareBell = Math.pow(Math.cos(norm * Math.PI * 0.5), 1.25);
    }

    let zBase = t * L;
    if (t > 0.42) {
      const noseFactor = (t - 0.42) / 0.058;
      zBase -= noseFactor * noseFactor * 0.042;
    } else if (t < -0.42) {
      const tailFactor = (-0.42 - t) / 0.062;
      zBase += tailFactor * tailFactor * 0.038;
    }

    const bY = st.bottomY + wheelArchLift;
    const topY = Math.max(st.fenderTopY, bY + 0.064);
    const shY = Math.max(st.shoulderY, bY + (topY - bY) * 0.58);
    const cY = st.hoodCenterY;

    const effectiveFlare = st.archFlare * (hasWidebody ? 1.24 : 1.0);
    const wBelly = halfW * st.planScale + effectiveFlare * (0.35 + 0.65 * flareBell);
    const wBottom = halfW * st.lowerWidthScale + effectiveFlare * (0.30 + 0.50 * flareBell);
    const wShoulder = halfW * (st.planScale - 0.015) + effectiveFlare * 0.46 * (0.30 + 0.70 * flareBell);
    const wFenderCrest = halfW * (st.planScale - 0.085);

    const doorScallopMid =
      t > -0.18 && t < 0.15 ? -0.012 * Math.cos((t / 0.17) * Math.PI * 0.5) : 0;

    // As the arch rises from rocker height (archCircle=0) to fender crest (archCircle=1),
    // the arch lip transitions smoothly to wBelly and tapers inward above the arch without bunching
    const wArchLip = wBottom * (1 - archCircle) + wBelly * archCircle;
    const innerLipX = wArchLip * 0.80 * (1 - archCircle) + (wArchLip - 0.012) * archCircle;
    const outerLipX = wArchLip * 0.98 * (1 - archCircle) + wArchLip * archCircle;
    const midLowerX =
      (wBottom + (wBelly - wBottom) * 0.65 + doorScallopMid) * (1 - archCircle) +
      (wArchLip * 0.88 + wShoulder * 0.12) * archCircle;
    const midUpperX =
      (wBelly + doorScallopMid * 0.5) * (1 - archCircle) +
      (wArchLip * 0.62 + wShoulder * 0.38) * archCircle;

    // Smooth 8-anchor Catmull-Rom cross-section profile (eliminates sharp C0 facet lines along the body!)
    const ctrlX = [
      innerLipX,
      outerLipX,
      midLowerX,
      midUpperX,
      wShoulder,
      wFenderCrest + (wShoulder - wFenderCrest) * 0.26,
      wFenderCrest * 0.52,
      0.0,
    ];
    const ctrlY = [
      bY,
      bY + (shY - bY) * 0.20,
      bY + (shY - bY) * 0.52,
      bY + (shY - bY) * 0.85,
      shY + (topY - shY) * 0.42,
      topY - 0.003,
      cY + (topY - cY) * 0.56 - st.hoodDrop * 0.6,
      cY,
    ];

    const rightSide: Array<[number, number, number]> = [];

    for (let k = 0; k < halfCount; k++) {
      const s = k / (halfCount - 1);
      const x = k === halfCount - 1 ? 0 : Math.max(0, sampleCatmullRomChain(ctrlX, s));
      const y = sampleCatmullRomChain(ctrlY, s);
      let z = zBase;

      if (s > 0.72) {
        const loc = (s - 0.72) / 0.28;
        if (t > 0.39) {
          z += (1 - loc * loc) * ((t - 0.39) / 0.088) * 0.042;
        } else if (t < -0.39) {
          z -= (1 - loc * loc) * ((-0.39 - t) / 0.092) * 0.032;
        }
      }

      if (t > 0.42) {
        const nf = (t - 0.42) / 0.058;
        if (y < 0.24) {
          z += nf * 0.018;
        }
      } else if (t < -0.41) {
        const rf = (-0.41 - t) / 0.072;
        if (y > 0.24 && y < 0.55) {
          z -= rf * 0.024;
        }
      }

      rightSide.push([x, y, z]);
    }

    // Left half including centerline (k = 0 .. halfCount - 1)
    for (let k = 0; k < halfCount; k++) {
      const [rx, ry, rz] = rightSide[k];
      positions.push(-rx, ry, rz);
      uvs.push(k / (ringPts - 1), u);
    }
    // Right half excluding centerline (k = halfCount - 2 .. 0) so x=0 is NEVER duplicated!
    for (let k = halfCount - 2; k >= 0; k--) {
      const [rx, ry, rz] = rightSide[k];
      positions.push(rx, ry, rz);
      uvs.push(1 - k / (ringPts - 1), u);
    }
  }

  for (let i = 0; i < numStations - 1; i++) {
    const rowA = i * ringPts;
    const rowB = (i + 1) * ringPts;
    for (let j = 0; j < ringPts - 1; j++) {
      const a = rowA + j;
      const b = rowB + j;
      const c = rowB + j + 1;
      const d = rowA + j + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ============================================================================
// 2. SILHOUETTE-ACCURATE GREENHOUSE, ROOFLINE, A/B/C PILLARS & DARK HEADLINER
// ============================================================================
function buildSmoothR34Greenhouse(
  chassisGroup: THREE.Group,
  L: number,
  W: number,
  H: number,
  bodyMat: THREE.Material,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  spec: VehicleSpec
) {
  const halfW = W * 0.5;
  const sil = spec.silhouette;
  const isR34 = spec.id === 'r34_gtr' || spec.id === 'r33_gtr' || spec.id === 'r32_gtr';
  const isFastback =
    sil === 'supra_aero_coupe' ||
    sil === 'rx7_fluid_coupe' ||
    sil === 'ae86_hatch_coupe' ||
    sil === 'z33_fastback';
  const isMidExotic = sil === 'f40_super_wedge' || sil === 'nsx_mid_wedge';
  const isSedan = sil === 'sti_rally_sedan' || sil === 'evo_aggressive_sedan';
  const isRoadster = sil === 's2000_roadster';

  const peakY =
    spec.id === 'r32_gtr'
      ? 1.196
      : isR34
        ? 1.212
        : Math.max(0.99, Math.min(1.29, H - 0.145));
  const beltY = isR34
    ? spec.id === 'r32_gtr'
      ? 0.812
      : 0.822
    : isMidExotic
      ? 0.745
      : isRoadster
        ? 0.760
        : isSedan
          ? 0.842
          : 0.798;

  const tRearEnd = isR34
    ? -0.365
    : isFastback
      ? -0.432
      : isMidExotic
        ? -0.415
        : isSedan
          ? -0.388
          : isRoadster
            ? -0.285
            : -0.365;
  const tFrontEnd = isR34
    ? 0.158
    : isMidExotic
      ? 0.225
      : isSedan
        ? 0.175
        : isRoadster
          ? 0.105
          : 0.150;
  const tRoofRear = isR34
    ? -0.210
    : isFastback
      ? -0.165
      : isMidExotic
        ? -0.140
        : isSedan
          ? -0.245
          : isRoadster
            ? -0.195
            : -0.205;
  const tRoofFront = isR34
    ? 0.015
    : isMidExotic
      ? 0.055
      : isSedan
        ? 0.025
        : isRoadster
          ? -0.025
          : 0.010;

  const stations = isR34
    ? [
        { t: -0.365, baseY: 0.825, topY: 0.838, baseW: 0.76, topW: 0.72, bowZ: -0.022 },
        { t: -0.302, baseY: 0.828, topY: 1.008, baseW: 0.79, topW: 0.68, bowZ: -0.016 },
        { t: -0.232, baseY: 0.828, topY: 1.158, baseW: 0.815, topW: 0.655, bowZ: -0.008 },
        { t: -0.185, baseY: 0.826, topY: 1.202, baseW: 0.825, topW: 0.648, bowZ: 0.0 },
        { t: -0.100, baseY: 0.822, topY: 1.212, baseW: 0.832, topW: 0.648, bowZ: 0.0 },
        { t: -0.015, baseY: 0.818, topY: 1.204, baseW: 0.828, topW: 0.648, bowZ: 0.006 },
        { t: 0.042, baseY: 0.814, topY: 1.095, baseW: 0.815, topW: 0.675, bowZ: 0.018 },
        { t: 0.100, baseY: 0.808, topY: 0.955, baseW: 0.80, topW: 0.715, bowZ: 0.026 },
        { t: 0.158, baseY: 0.798, topY: 0.810, baseW: 0.78, topW: 0.75, bowZ: 0.034 },
      ]
    : [
        { t: tRearEnd, baseY: beltY, topY: beltY + 0.015, baseW: 0.74, topW: 0.70, bowZ: -0.022 },
        {
          t: tRearEnd + (tRoofRear - tRearEnd) * 0.42,
          baseY: beltY + 0.004,
          topY: beltY + (peakY - beltY) * (isFastback ? 0.58 : 0.48),
          baseW: 0.79,
          topW: 0.67,
          bowZ: -0.015,
        },
        {
          t: tRoofRear - 0.025,
          baseY: beltY + 0.004,
          topY: beltY + (peakY - beltY) * 0.90,
          baseW: 0.815,
          topW: 0.65,
          bowZ: -0.006,
        },
        { t: tRoofRear, baseY: beltY + 0.002, topY: peakY - 0.008, baseW: 0.825, topW: 0.645, bowZ: 0.0 },
        {
          t: (tRoofRear + tRoofFront) * 0.5,
          baseY: beltY,
          topY: peakY,
          baseW: 0.832,
          topW: 0.645,
          bowZ: 0.0,
        },
        { t: tRoofFront, baseY: beltY - 0.004, topY: peakY - 0.006, baseW: 0.825, topW: 0.645, bowZ: 0.006 },
        {
          t: tRoofFront + (tFrontEnd - tRoofFront) * 0.38,
          baseY: beltY - 0.010,
          topY: beltY + (peakY - beltY) * 0.68,
          baseW: 0.81,
          topW: 0.675,
          bowZ: 0.018,
        },
        {
          t: tRoofFront + (tFrontEnd - tRoofFront) * 0.72,
          baseY: beltY - 0.016,
          topY: beltY + (peakY - beltY) * 0.34,
          baseW: 0.795,
          topW: 0.715,
          bowZ: 0.026,
        },
        { t: tFrontEnd, baseY: beltY - 0.024, topY: beltY - 0.010, baseW: 0.77, topW: 0.74, bowZ: 0.034 },
      ];

  const numSt = 48;
  const halfCount = 18;
  const ringPts = halfCount * 2 - 1;
  const positions: number[] = [];
  const indices: number[] = [];

  const evalGreenhouse = (t: number) => {
    let idx = 0;
    if (t <= stations[0].t) {
      idx = 0;
    } else if (t >= stations[stations.length - 1].t) {
      idx = stations.length - 2;
    } else {
      for (let i = 0; i < stations.length - 1; i++) {
        if (t >= stations[i].t && t <= stations[i + 1].t) {
          idx = i;
          break;
        }
      }
    }
    const s0 = stations[Math.max(0, idx - 1)];
    const s1 = stations[idx];
    const s2 = stations[Math.min(stations.length - 1, idx + 1)];
    const s3 = stations[Math.min(stations.length - 1, idx + 2)];
    const span = Math.max(0.0001, s2.t - s1.t);
    const u = Math.max(0, Math.min(1, (t - s1.t) / span));
    return {
      baseY: catmullRom1D(s0.baseY, s1.baseY, s2.baseY, s3.baseY, u),
      topY: catmullRom1D(s0.topY, s1.topY, s2.topY, s3.topY, u),
      baseW: catmullRom1D(s0.baseW, s1.baseW, s2.baseW, s3.baseW, u),
      topW: catmullRom1D(s0.topW, s1.topW, s2.topW, s3.topW, u),
      bowZ: catmullRom1D(s0.bowZ, s1.bowZ, s2.bowZ, s3.bowZ, u),
    };
  };

  const tSpan = tFrontEnd - tRearEnd;
  const uvs: number[] = [];
  for (let i = 0; i < numSt; i++) {
    const u = i / (numSt - 1);
    const t = tRearEnd + u * tSpan;
    const st = evalGreenhouse(t);

    const rightSide: Array<[number, number, number]> = [];
    for (let k = 0; k < halfCount; k++) {
      const s = k / (halfCount - 1);
      const sideWallRise = Math.min(1, s / 0.72);
      const roofSpanU = s > 0.72 ? (s - 0.72) / 0.28 : 0;
      const x =
        k === halfCount - 1
          ? 0
          : s <= 0.72
            ? halfW * (st.baseW * (1 - Math.pow(sideWallRise, 0.92)) + st.topW * Math.pow(sideWallRise, 0.92))
            : halfW * st.topW * (1 - roofSpanU);
      const crownCurve = s > 0.72 ? Math.sin(roofSpanU * Math.PI * 0.5) * 0.016 : 0;
      const y = st.baseY + (st.topY - st.baseY) * Math.pow(sideWallRise, 0.90) + crownCurve;
      const z = t * L + st.bowZ * Math.sin((1 - s) * Math.PI * 0.5);
      rightSide.push([x, y, z]);
    }

    for (let k = 0; k < halfCount; k++) {
      const [rx, ry, rz] = rightSide[k];
      positions.push(-rx, ry, rz);
      uvs.push(k / (ringPts - 1), u);
    }
    for (let k = halfCount - 2; k >= 0; k--) {
      const [rx, ry, rz] = rightSide[k];
      positions.push(rx, ry, rz);
      uvs.push(1 - k / (ringPts - 1), u);
    }
  }

  for (let i = 0; i < numSt - 1; i++) {
    const rA = i * ringPts;
    const rB = (i + 1) * ringPts;
    for (let j = 0; j < ringPts - 1; j++) {
      indices.push(rA + j, rB + j, rA + j + 1);
      indices.push(rB + j, rB + j + 1, rA + j + 1);
    }
  }

  const glassGeom = new THREE.BufferGeometry();
  glassGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  glassGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  glassGeom.setIndex(indices);
  glassGeom.computeVertexNormals();

  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  chassisGroup.add(glassMesh);

  // Contour-Matched 3D Rear Window Defroster Filament Lines on Coupes/Sedans
  if (!isRoadster) {
    const defrosterMat = new THREE.MeshBasicMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.45,
    });
    const numLines = 5;
    for (let dIdx = 1; dIdx <= numLines; dIdx++) {
      const uLine = dIdx / (numLines + 1);
      const tLine = tRearEnd + uLine * (tRoofRear - tRearEnd);
      const stD = evalGreenhouse(tLine);
      const lineSpanW = halfW * stD.topW * 1.68;
      const defLine = new THREE.Mesh(
        new THREE.BoxGeometry(lineSpanW, 0.0025, 0.003),
        defrosterMat
      );
      defLine.position.set(0, stD.topY + 0.002, tLine * L + stD.bowZ * 0.65);
      chassisGroup.add(defLine);
    }
  }

  // Front Windshield, Side Window Beltline & Rear Window Perimeter Rubber Weatherstrip Seals
  const stFrontBase = evalGreenhouse(tFrontEnd - 0.008);
  const frontCowlSeal = new THREE.Mesh(
    createRoundedBoxGeometry(halfW * stFrontBase.baseW * 1.72, 0.014, 0.022, 0.005, 2),
    darkTrimMat
  );
  frontCowlSeal.position.set(0, stFrontBase.baseY + 0.006, tFrontEnd * L + stFrontBase.bowZ * 0.65);
  chassisGroup.add(frontCowlSeal);

  // Left & Right Door Window Beltline Rubber Moulding Sills (seamless glass-to-door transition)
  const stBeltMid = evalGreenhouse((tRearEnd + tFrontEnd) * 0.5);
  const beltSpanLen = Math.max(0.55, (tFrontEnd - tRearEnd) * L * 0.86);
  [-1, 1].forEach((side) => {
    const beltSill = new THREE.Mesh(
      createRoundedBoxGeometry(0.014, 0.012, beltSpanLen, 0.004, 3),
      darkTrimMat
    );
    beltSill.position.set(
      side * (halfW * stBeltMid.baseW * 0.992),
      stBeltMid.baseY + 0.002,
      ((tRearEnd + tFrontEnd) * 0.5) * L
    );
    beltSill.rotation.x = 0.024;
    chassisGroup.add(beltSill);
  });

  const stFrontTop = evalGreenhouse(tRoofFront);
  const frontHeaderSeal = new THREE.Mesh(
    createRoundedBoxGeometry(halfW * stFrontTop.topW * 1.92, 0.012, 0.020, 0.004, 2),
    darkTrimMat
  );
  frontHeaderSeal.position.set(0, stFrontTop.topY + 0.006, tRoofFront * L + stFrontTop.bowZ * 0.75);
  chassisGroup.add(frontHeaderSeal);

  if (!isRoadster) {
    const stRearBase = evalGreenhouse(tRearEnd + 0.008);
    const rearDeckSeal = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * stRearBase.topW * 1.88, 0.014, 0.022, 0.005, 2),
      darkTrimMat
    );
    rearDeckSeal.position.set(0, stRearBase.topY + 0.005, tRearEnd * L + stRearBase.bowZ * 0.65);
    chassisGroup.add(rearDeckSeal);

    // Aerodynamic Roof Shark-Fin / JDM Radio Antenna at Rear Center of Roof (omitted on classic BNR32, S15 & S14)
    if (spec.id !== 'r32_gtr' && spec.id !== 'silvia_s15' && spec.id !== 'silvia_s14') {
      const stAntenna = evalGreenhouse(tRoofRear + 0.025);
      const antennaBase = new THREE.Mesh(
        createRoundedBoxGeometry(0.026, 0.036, 0.095, 0.008, 3),
        darkTrimMat
      );
      antennaBase.position.set(0, stAntenna.topY + 0.028, (tRoofRear + 0.025) * L);
      antennaBase.rotation.x = -0.22;
      chassisGroup.add(antennaBase);
    }
  }

  // Dark Matte Interior Cabin Tub, Parcel Shelf & Headliner
  const headlinerMat = new THREE.MeshStandardMaterial({
    color: 0x080b11,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const cabinParcelShelf = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.44, 0.04, L * 0.24),
    headlinerMat
  );
  cabinParcelShelf.position.set(0, beltY - 0.02, -L * 0.24);
  chassisGroup.add(cabinParcelShelf);

  const cabinFloorTub = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.48, 0.34, L * 0.42),
    headlinerMat
  );
  cabinFloorTub.position.set(0, 0.54, -L * 0.08);
  chassisGroup.add(cabinFloorTub);

  const roofCapMat =
    spec.id === 'nsx_na1' || spec.id === 'nissan_180sx' || spec.id === 'mx5_miata'
      ? darkTrimMat
      : bodyMat;

  // Sculpted High-Resolution Roof Cap
  const roofSt = 24;
  const roofCols = 19;
  const roofPos: number[] = [];
  const roofIdx: number[] = [];
  const rSpan = tRoofFront - tRoofRear;
  for (let i = 0; i < roofSt; i++) {
    const u = i / (roofSt - 1);
    const t = tRoofRear + u * rSpan;
    const st = evalGreenhouse(t);
    for (let j = 0; j < roofCols; j++) {
      const v = (j / (roofCols - 1)) * 2 - 1;
      const x = v * halfW * st.topW * 1.005;
      const dome =
        spec.id === 'rx7_fd'
          ? Math.sin(Math.abs(v) * Math.PI) * 0.022
          : Math.cos(v * Math.PI * 0.5) * 0.016;
      const y = st.topY + 0.002 + dome;
      const z = t * L + st.bowZ * (1 - Math.abs(v) * 0.5);
      roofPos.push(x, y, z);
    }
  }
  for (let i = 0; i < roofSt - 1; i++) {
    const rA = i * roofCols;
    const rB = (i + 1) * roofCols;
    for (let j = 0; j < roofCols - 1; j++) {
      roofIdx.push(rA + j, rB + j, rA + j + 1);
      roofIdx.push(rB + j, rB + j + 1, rA + j + 1);
    }
  }
  const roofGeom = new THREE.BufferGeometry();
  roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  roofGeom.setIndex(roofIdx);
  roofGeom.computeVertexNormals();
  chassisGroup.add(new THREE.Mesh(roofGeom, roofCapMat));

  // Factory Tinted Glass Sunroof / Moonroof Assembly on Silvia S15 Spec-R Aero & S14 K's Aero Kouki (matches Top View Blueprints)
  if (spec.id === 'silvia_s15' || spec.id === 'silvia_s14') {
    const tSunCenter = (tRoofRear + tRoofFront) * 0.5 + 0.016;
    const stSun = evalGreenhouse(tSunCenter);
    const sunW = halfW * stSun.topW * 1.24;
    const sunD = L * 0.108;
    const sunY = stSun.topY + 0.0185;
    const sunZ = tSunCenter * L + stSun.bowZ * 0.65;

    const sunroofSeal = new THREE.Mesh(
      createRoundedBoxGeometry(sunW + 0.024, 0.006, sunD + 0.024, 0.003, 3),
      darkTrimMat
    );
    sunroofSeal.position.set(0, sunY, sunZ);
    const sunroofGlass = new THREE.Mesh(
      createRoundedBoxGeometry(sunW, 0.007, sunD, 0.003, 3),
      new THREE.MeshPhysicalMaterial({
        color: 0x0b0f17,
        metalness: 0.25,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
      })
    );
    sunroofGlass.position.set(0, sunY + 0.001, sunZ);
    chassisGroup.add(sunroofSeal, sunroofGlass);
  }

  const innerHeadliner = new THREE.Mesh(roofGeom.clone(), headlinerMat);
  innerHeadliner.position.y = -0.016;
  innerHeadliner.scale.set(0.96, 1, 0.96);
  chassisGroup.add(innerHeadliner);

  // Sleek A-Pillars, Roof Rails, B-Pillars & Silhouette-Specific C-Pillars
  [-1, 1].forEach((side) => {
    const railSteps = 26;
    const railPos: number[] = [];
    const railIdx: number[] = [];
    for (let i = 0; i < railSteps; i++) {
      const u = i / (railSteps - 1);
      const t = tRoofRear + u * (tFrontEnd - tRoofRear);
      const st = evalGreenhouse(t);
      const xOuter = side * (halfW * st.topW + 0.012);
      const xInner = side * (halfW * st.topW - 0.022);
      const yTop = st.topY + 0.006;
      const yBot = Math.max(st.baseY, st.topY - 0.022);
      const z = t * L + st.bowZ * 0.45;
      railPos.push(xInner, yTop, z, xOuter, yBot, z);
    }
    for (let i = 0; i < railSteps - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side > 0) {
        railIdx.push(a, c, b, b, c, d);
      } else {
        railIdx.push(a, b, c, b, d, c);
      }
    }
    const railGeom = new THREE.BufferGeometry();
    railGeom.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
    railGeom.setIndex(railIdx);
    railGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(railGeom, roofCapMat));

    const cSteps = 18;
    const cPos: number[] = [];
    const cIdx: number[] = [];
    const cSpan = tRoofRear - tRearEnd;
    const cWidthChord = isR34 ? 0.25 : isFastback ? 0.165 : isMidExotic ? 0.180 : 0.155;
    for (let i = 0; i < cSteps; i++) {
      const v = i / (cSteps - 1);
      const tRear = tRearEnd + v * cSpan;
      const stR = evalGreenhouse(tRear);
      const vCurve = Math.pow(v, 0.92);
      const zRear = tRear * L;
      const zFront = zRear + cWidthChord * (1 - v * 0.35);
      const tFrontC = Math.min(tRoofRear, zFront / L);
      const stF = evalGreenhouse(tFrontC);
      const y = stR.topY + 0.001;
      // Rear edge hugs the lateral edge of the rear windshield (stR.topW) so no flaps stick out in Rear View
      const xRear = side * (halfW * stR.topW + 0.004);
      // Front edge follows the quarter window tumblehome slope from beltline (stF.baseW) up to roof rail (stF.topW)
      const wFront = stF.baseW * (1 - vCurve) + stF.topW * vCurve;
      const xFront = side * (halfW * wFront + 0.008);
      cPos.push(xRear, y, zRear, xFront, y, zFront);
    }
    for (let i = 0; i < cSteps - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side > 0) {
        cIdx.push(a, b, c, b, d, c);
      } else {
        cIdx.push(a, c, b, b, c, d);
      }
    }
    const cGeom = new THREE.BufferGeometry();
    cGeom.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    cGeom.setIndex(cIdx);
    cGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(cGeom, roofCapMat));

    // Rounded Matte-Black B-Pillar Window Divider (tilted INWARD matching side window tumblehome!)
    const bPillarsT = isSedan ? [-0.045, -0.225] : [-0.068];
    bPillarsT.forEach((bT) => {
      const stB = evalGreenhouse(bT);
      const bPillarH = (stB.topY - stB.baseY) * 0.94;
      const dx = halfW * (stB.baseW - stB.topW);
      const dy = Math.max(0.1, stB.topY - stB.baseY);
      const tumbleAngle = Math.atan2(dx, dy);
      const bPillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.018, bPillarH, 0.052, 0.005, 2),
        darkTrimMat
      );
      bPillar.position.set(
        side * (halfW * ((stB.baseW + stB.topW) * 0.5) + 0.003),
        stB.baseY + bPillarH * 0.49,
        bT * L
      );
      bPillar.rotation.z = side * tumbleAngle;
      chassisGroup.add(bPillar);
    });

    // Rounded Black Window Beltline Weatherstrip Molding
    const beltMolding = new THREE.Mesh(
      createRoundedBoxGeometry(0.022, 0.016, L * (tFrontEnd - tRearEnd) * 0.85, 0.005, 2),
      darkTrimMat
    );
    beltMolding.position.set(side * (halfW * 0.822), beltY, ((tFrontEnd + tRearEnd) * 0.5) * L);
    chassisGroup.add(beltMolding);
  });
}

// ============================================================================
// 3. SCULPTED FLAT-FACE FASCIA BAR HELPER
// ============================================================================
function buildSculptedFasciaBar(
  widthSpan: number,
  heightSpan: number,
  depthSpan: number,
  yCenter: number,
  zCenter: number,
  curveBackZ: number,
  endTaperY = 0.86,
  squareness = 0.24
): THREE.BufferGeometry {
  const cols = 42;
  const rows = 28;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < cols; i++) {
    const u = (i / (cols - 1)) * 2 - 1;
    const absU = Math.abs(u);
    const x = u * (widthSpan * 0.5);
    const zCurve = -Math.pow(absU, 2.0) * curveBackZ;
    const localH = heightSpan * (1 - (1 - endTaperY) * Math.pow(absU, 2.6));
    const endCapPinch = absU > 0.94 ? Math.max(0.08, Math.cos(((absU - 0.94) / 0.06) * Math.PI * 0.5)) : 1.0;

    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const angle = (v - 0.5) * Math.PI * 2;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      const yOff = Math.sign(sinA) * Math.pow(Math.abs(sinA), 0.72) * (localH * 0.5) * endCapPinch;
      const zOff = Math.sign(cosA) * Math.pow(Math.abs(cosA), squareness + 0.08) * depthSpan * endCapPinch;
      positions.push(x, yCenter + yOff, zCenter + zCurve + zOff);
    }
  }

  for (let i = 0; i < cols - 1; i++) {
    const rA = i * rows;
    const rB = (i + 1) * rows;
    for (let j = 0; j < rows - 1; j++) {
      indices.push(rA + j, rB + j, rA + j + 1);
      indices.push(rB + j, rB + j + 1, rA + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function evalFasciaCurveZ(
  x: number,
  zCenter: number,
  halfSpan: number,
  curveBackZ: number
): { z: number; yawY: number } {
  const u = Math.max(-1.05, Math.min(1.05, x / Math.max(0.1, halfSpan)));
  const z = zCenter - u * u * curveBackZ;
  const dzdx = (-2 * u * curveBackZ) / Math.max(0.1, halfSpan);
  const yawY = -Math.atan(dzdx);
  return { z, yawY };
}

function buildContouredLampClusterGeometry(
  width: number,
  height: number,
  depth: number,
  xCenter: number,
  yCenter: number,
  zCenter: number,
  halfSpan: number,
  curveBackZ: number,
  innerHeightScale = 1.0,
  outerHeightScale = 1.0,
  topBrowSlantY = 0.0,
  squareness = 0.28
): THREE.BufferGeometry {
  const cols = 24;
  const rows = 20;
  const positions: number[] = [];
  const indices: number[] = [];
  const side = xCenter >= 0 ? 1 : -1;

  for (let i = 0; i < cols; i++) {
    const uLoc = (i / (cols - 1)) * 2 - 1;
    const absULoc = Math.abs(uLoc);
    const x = xCenter + uLoc * (width * 0.5);
    const inOut = side > 0 ? (uLoc + 1) * 0.5 : (1 - uLoc) * 0.5;

    const uGlobal = Math.min(1.05, Math.abs(x) / Math.max(0.1, halfSpan));
    const zCurve = -Math.pow(uGlobal, 2.0) * curveBackZ;

    const hScale = innerHeightScale * (1 - inOut) + outerHeightScale * inOut;
    const cornerRound =
      absULoc > 0.82
        ? Math.max(0.10, Math.cos(((absULoc - 0.82) / 0.18) * Math.PI * 0.5))
        : 1.0;
    const localH = height * hScale * (0.25 + 0.75 * cornerRound);
    const localD = depth * (0.20 + 0.80 * cornerRound);
    const yShift = (inOut - 0.5) * topBrowSlantY;

    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const angle = (v - 0.5) * Math.PI * 2;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      const yOff =
        Math.sign(sinA) * Math.pow(Math.abs(sinA), 0.68) * (localH * 0.5);
      const zOff =
        Math.sign(cosA) * Math.pow(Math.abs(cosA), squareness) * (localD * 0.5);
      positions.push(x, yCenter + yShift + yOff, zCenter + zCurve + zOff);
    }
  }

  for (let i = 0; i < cols - 1; i++) {
    const rA = i * rows;
    const rB = (i + 1) * rows;
    for (let j = 0; j < rows - 1; j++) {
      indices.push(rA + j, rB + j, rA + j + 1);
      indices.push(rB + j, rB + j + 1, rA + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ============================================================================
// 3B. CONTOUR-MATCHED 3D AUTOMOTIVE HOOD PANEL, SHUT-LINES, COWL & VENTS
// ============================================================================
function buildContourMatchedHoodAssembly(
  chassisGroup: THREE.Group,
  spec: VehicleSpec,
  controlStations: LongitudinalStation[],
  bodyMat: THREE.Material,
  carbonMat: THREE.Material,
  darkTrimMat: THREE.Material,
  custom?: VehicleCustomization
) {
  const L = spec.dimensions.length;
  const W = spec.dimensions.width;
  const halfW = W * 0.5;
  const hoodStyle = custom?.hoodStyle ?? spec.defaultCustomization.hoodStyle ?? 'stock';
  const isCarbonHood = hoodStyle === 'carbon_vented';

  // High-gloss clearcoated carbon weave material for aftermarket carbon hood
  const carbonHoodMat = new THREE.MeshPhysicalMaterial({
    map: (carbonMat as THREE.MeshStandardMaterial).map ?? null,
    color: 0x181c24,
    metalness: 0.34,
    roughness: 0.22,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.82,
    side: THREE.DoubleSide,
  });

  const panelSeamMat = new THREE.MeshStandardMaterial({
    color: 0x0c1322,
    roughness: 0.75,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  // 1. Sculpted Parametric 3D Hood Panel Mesh (t = 0.160 at cowl to t = 0.464 at front grille brow)
  const tRear = 0.160;
  const tFront = 0.464;
  const hoodRows = 26;
  const hoodCols = 27;
  const hoodPositions: number[] = [];
  const hoodUvs: number[] = [];
  const hoodIndices: number[] = [];

  const isPowerDomeCar =
    spec.id === 'supra_mk4' ||
    spec.id === 'supra_mk5' ||
    spec.id === 'bmw_m3_e46' ||
    spec.id === 'bmw_m3_e30' ||
    spec.id === 'fairlady_350z' ||
    spec.id === 'nissan_370z' ||
    spec.id === 'honda_s2000';
  const isCenterVentCar =
    spec.id === 'r34_gtr' || spec.id === 'lancer_evo9' || spec.id === 'lancer_evo10';

  for (let i = 0; i < hoodRows; i++) {
    const u = i / (hoodRows - 1);
    const t = tRear + u * (tFront - tRear);
    const longBell = Math.sin(u * Math.PI);

    for (let j = 0; j < hoodCols; j++) {
      const v = (j / (hoodCols - 1)) * 2 - 1; // -1 (right hood seam) to +1 (left hood seam)
      const absV = Math.abs(v);
      const latFrac = v * 0.96;
      const surf = evalStationTopPoint(controlStations, spec, t, latFrac);

      // Rolled panel edge dip at outer shut-lines (|v| > 0.90) + front/rear edges for realistic manufactured panel relief
      const edgeRollLat = absV > 0.90 ? -0.0020 * Math.pow((absV - 0.90) / 0.10, 1.5) : 0;
      const edgeRollLong =
        u < 0.05
          ? -0.0016 * (1 - u / 0.05)
          : u > 0.94
            ? -0.0016 * ((u - 0.94) / 0.06)
            : 0;

      // Twin longitudinal character creases along |v| ≈ 0.54 flowing from A-pillars to grille corners
      const creaseDist = Math.abs(absV - 0.54);
      const characterCrease =
        creaseDist < 0.14
          ? Math.cos((creaseDist / 0.14) * Math.PI * 0.5) * 0.0045 * (0.35 + 0.65 * longBell)
          : 0;

      // Central power-dome bulge or central recessed louver bay
      let centerContour = 0;
      if (isCarbonHood) {
        if (absV < 0.46 && u > 0.18 && u < 0.82) {
          centerContour = 0.0045 * Math.cos((absV / 0.46) * Math.PI * 0.5) * longBell;
        }
      } else if (isPowerDomeCar && absV < 0.44 && u > 0.12 && u < 0.84) {
        centerContour = 0.0085 * Math.cos((absV / 0.44) * Math.PI * 0.5) * longBell;
      } else if (isCenterVentCar && absV < 0.42 && u > 0.22 && u < 0.72) {
        centerContour = 0.0038 * Math.cos((absV / 0.42) * Math.PI * 0.5) * longBell;
      } else if (absV < 0.48) {
        centerContour = 0.0028 * Math.cos((absV / 0.48) * Math.PI * 0.5) * longBell;
      }

      const baseLift = isCarbonHood ? 0.0028 : 0.0022;
      const y = surf.y + baseLift + edgeRollLat + edgeRollLong + characterCrease + centerContour;
      hoodPositions.push(surf.x, y, surf.z);
      hoodUvs.push((v + 1) * 0.5 * 3.0, u * 3.0);
    }
  }

  for (let i = 0; i < hoodRows - 1; i++) {
    const rA = i * hoodCols;
    const rB = (i + 1) * hoodCols;
    for (let j = 0; j < hoodCols - 1; j++) {
      hoodIndices.push(rA + j, rB + j, rA + j + 1);
      hoodIndices.push(rB + j, rB + j + 1, rA + j + 1);
    }
  }

  const hoodGeom = new THREE.BufferGeometry();
  hoodGeom.setAttribute('position', new THREE.Float32BufferAttribute(hoodPositions, 3));
  hoodGeom.setAttribute('uv', new THREE.Float32BufferAttribute(hoodUvs, 2));
  hoodGeom.setIndex(hoodIndices);
  hoodGeom.computeVertexNormals();

  const hoodMesh = new THREE.Mesh(hoodGeom, isCarbonHood ? carbonHoodMat : bodyMat);
  hoodMesh.castShadow = true;
  hoodMesh.receiveShadow = true;
  chassisGroup.add(hoodMesh);

  // 2. Continuous Ultra-Fine Hairline Left & Right Hood-to-Fender Shut-Line Panel Gaps (3.5mm realistic gap)
  [-1, 1].forEach((side) => {
    const seamPos: number[] = [];
    const seamIdx: number[] = [];
    for (let i = 0; i < hoodRows; i++) {
      const u = i / (hoodRows - 1);
      const t = tRear + u * (tFront - tRear);
      const innerPt = evalStationTopPoint(controlStations, spec, t, side * 0.958);
      const outerPt = evalStationTopPoint(controlStations, spec, t, side * 0.966);
      seamPos.push(
        innerPt.x,
        innerPt.y + 0.0012,
        innerPt.z,
        outerPt.x,
        outerPt.y + 0.0012,
        outerPt.z
      );
    }
    for (let i = 0; i < hoodRows - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side > 0) {
        seamIdx.push(a, c, b, b, c, d);
      } else {
        seamIdx.push(a, b, c, b, d, c);
      }
    }
    const seamGeom = new THREE.BufferGeometry();
    seamGeom.setAttribute('position', new THREE.Float32BufferAttribute(seamPos, 3));
    seamGeom.setIndex(seamIdx);
    seamGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(seamGeom, panelSeamMat));
  });

  // 3. Transverse Rear Cowl Shut-Line & Front Bumper Header Shut-Line (Eliminates Hood-to-Bumper Gaps!)
  [tRear, tFront].forEach((tSeam, idx) => {
    const transPos: number[] = [];
    const transIdx: number[] = [];
    const dtSeam = idx === 0 ? -0.0014 : 0.0014;
    for (let j = 0; j < hoodCols; j++) {
      const v = (j / (hoodCols - 1)) * 2 - 1;
      const p0 = evalStationTopPoint(controlStations, spec, tSeam, v * 0.962);
      const p1 = evalStationTopPoint(controlStations, spec, tSeam + dtSeam, v * 0.962);
      transPos.push(p0.x, p0.y + 0.0012, p0.z, p1.x, p1.y + 0.0012, p1.z);
    }
    for (let j = 0; j < hoodCols - 1; j++) {
      const a = j * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      transIdx.push(a, b, c, b, d, c);
    }
    const transGeom = new THREE.BufferGeometry();
    transGeom.setAttribute('position', new THREE.Float32BufferAttribute(transPos, 3));
    transGeom.setIndex(transIdx);
    transGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(transGeom, panelSeamMat));
  });

  // 4. Recessed Windshield Cowl Deck, Dual Washer Nozzles & Sculpted RHD JDM Wiper Blades
  const cowlCenter = sampleVehicleTopSurface(controlStations, spec, 0.150, 0);
  const cowlDeck = new THREE.Mesh(
    createRoundedBoxGeometry(cowlCenter.wFenderCrest * 1.82, 0.012, 0.068, 0.004, 2),
    darkTrimMat
  );
  cowlDeck.position.set(0, cowlCenter.y - 0.001, cowlCenter.z);
  cowlDeck.rotation.x = cowlCenter.pitchX;
  chassisGroup.add(cowlDeck);

  [-1, 1].forEach((side) => {
    const nozzleSurf = sampleVehicleTopSurface(controlStations, spec, 0.185, side * 0.34);
    const washerNozzle = new THREE.Mesh(
      createRoundedBoxGeometry(0.014, 0.007, 0.020, 0.003, 2),
      darkTrimMat
    );
    washerNozzle.position.set(nozzleSurf.x, nozzleSurf.y + 0.0035, nozzleSurf.z);
    washerNozzle.rotation.x = nozzleSurf.pitchX;
    chassisGroup.add(washerNozzle);

    // Sculpted Front Windshield Wiper Arm & Aero Blade resting in Cowl Valley
    const wiperX = side === -1 ? -halfW * 0.12 : halfW * 0.24;
    const wiperArm = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.44, 0.010, 0.014, 0.003, 2),
      darkTrimMat
    );
    wiperArm.position.set(wiperX, cowlCenter.y + 0.010, cowlCenter.z - 0.012);
    wiperArm.rotation.y = -0.08;
    wiperArm.rotation.z = -0.03 * side;
    chassisGroup.add(wiperArm);
  });

  // 5. MUTUALLY EXCLUSIVE HOOD VENT / SCOOP CONFIGURATIONS (Zero Stacking or Floating!)
  if (isCarbonHood) {
    // Contour-Matched Aftermarket Carbon-Fiber Twin Aerodynamic Louver Banks + Center NACA Extractor
    const centerVentSurf = sampleVehicleTopSurface(controlStations, spec, 0.315, 0);
    const centerCollector = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.42, 0.006, 0.16, 0.003, 2),
      darkTrimMat
    );
    centerCollector.position.set(0, centerVentSurf.y + 0.0032, centerVentSurf.z);
    centerCollector.rotation.x = centerVentSurf.pitchX;
    chassisGroup.add(centerCollector);

    [-1, 1].forEach((vSide) => {
      [0.235, 0.275, 0.315, 0.355].forEach((louverT, idx) => {
        const lSurf = sampleVehicleTopSurface(controlStations, spec, louverT, vSide * 0.46);
        const slotW = halfW * (0.28 - idx * 0.012);
        const ventPocket = new THREE.Mesh(
          createRoundedBoxGeometry(slotW, 0.004, 0.022, 0.002, 2),
          panelSeamMat
        );
        ventPocket.position.set(lSurf.x, lSurf.y + 0.0030, lSurf.z);
        ventPocket.rotation.x = lSurf.pitchX;
        ventPocket.rotation.z = -vSide * 0.05;
        chassisGroup.add(ventPocket);

        const carbonSlat = new THREE.Mesh(
          createRoundedBoxGeometry(slotW + 0.008, 0.005, 0.018, 0.002, 2),
          carbonHoodMat
        );
        carbonSlat.position.set(lSurf.x, lSurf.y + 0.0045, lSurf.z + 0.008);
        carbonSlat.rotation.x = lSurf.pitchX + 0.08;
        carbonSlat.rotation.z = -vSide * 0.05;
        chassisGroup.add(carbonSlat);
      });
    });
  } else if (hoodStyle === 'twin_duct') {
    // Custom Twin-Duct Aero Extractor Hood with Sculpted Dual Carbon-Fiber NACA Scoops & Central Power-Dome Rib
    [-1, 1].forEach((side) => {
      const ductSurf = sampleVehicleTopSurface(controlStations, spec, 0.305, side * 0.38);
      const ductOuter = new THREE.Mesh(
        createRoundedBoxGeometry(0.135, 0.016, 0.24, 0.006, 3),
        carbonHoodMat
      );
      ductOuter.position.set(ductSurf.x, ductSurf.y + 0.006, ductSurf.z);
      ductOuter.rotation.x = ductSurf.pitchX - 0.04;
      ductOuter.rotation.z = -side * 0.05;
      chassisGroup.add(ductOuter);

      const ductThroat = new THREE.Mesh(
        createRoundedBoxGeometry(0.095, 0.008, 0.175, 0.003, 2),
        panelSeamMat
      );
      ductThroat.position.set(ductSurf.x, ductSurf.y + 0.011, ductSurf.z - 0.014);
      ductThroat.rotation.x = ductSurf.pitchX - 0.04;
      ductThroat.rotation.z = -side * 0.05;
      chassisGroup.add(ductThroat);

      [-0.04, 0.03].forEach((zOff) => {
        const vane = new THREE.Mesh(
          createRoundedBoxGeometry(0.092, 0.006, 0.018, 0.002, 2),
          carbonHoodMat
        );
        vane.position.set(ductSurf.x, ductSurf.y + 0.013, ductSurf.z + zOff);
        vane.rotation.x = ductSurf.pitchX + 0.12;
        vane.rotation.z = -side * 0.05;
        chassisGroup.add(vane);
      });
    });

    const spineSurf = sampleVehicleTopSurface(controlStations, spec, 0.295, 0);
    const centerSpine = new THREE.Mesh(
      createRoundedBoxGeometry(0.036, 0.012, L * 0.19, 0.005, 3),
      carbonHoodMat
    );
    centerSpine.position.set(0, spineSurf.y + 0.006, spineSurf.z);
    centerSpine.rotation.x = spineSurf.pitchX;
    chassisGroup.add(centerSpine);
  } else {
    // OEM Factory Hood Features (Sampled 1:1 onto the vehicle's longitudinal spline contour!)
    if (spec.id === 'r34_gtr') {
      // Sculpted BNR34 V-Spec II Body-Colored Raised U-Frame Surround + 4 Body-Colored Louver Blades over Recessed Slots
      [-1, 1].forEach((side) => {
        const sideRailSurf = sampleVehicleTopSurface(controlStations, spec, 0.295, side * 0.24);
        const sideRail = new THREE.Mesh(
          createRoundedBoxGeometry(0.028, 0.009, L * 0.145, 0.004, 3),
          bodyMat
        );
        sideRail.position.set(side * (halfW * 0.245), sideRailSurf.y + 0.0055, sideRailSurf.z);
        sideRail.rotation.x = sideRailSurf.pitchX;
        sideRail.rotation.y = -side * 0.025;
        chassisGroup.add(sideRail);
      });

      const rearFrameSurf = sampleVehicleTopSurface(controlStations, spec, 0.224, 0);
      const rearFrameBar = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.52, 0.009, 0.028, 0.004, 3),
        bodyMat
      );
      rearFrameBar.position.set(0, rearFrameSurf.y + 0.0055, rearFrameSurf.z);
      rearFrameBar.rotation.x = rearFrameSurf.pitchX;
      chassisGroup.add(rearFrameBar);

      [0.246, 0.280, 0.314, 0.348].forEach((louverT, idx) => {
        const stH = sampleVehicleTopSurface(controlStations, spec, louverT, 0);
        const slitW = halfW * (0.45 - idx * 0.012);
        // Subtle dark recessed shadow slot tucked behind the painted louver blade
        const slitShadow = new THREE.Mesh(
          createRoundedBoxGeometry(slitW, 0.0035, 0.015, 0.001, 2),
          panelSeamMat
        );
        slitShadow.position.set(0, stH.y + 0.0035, stH.z - 0.004);
        slitShadow.rotation.x = stH.pitchX;
        chassisGroup.add(slitShadow);

        // Sculpted Bayside Blue (body-colored) aerodynamic louver blade shielding the slot from the front
        const louverRib = new THREE.Mesh(
          createRoundedBoxGeometry(slitW + 0.014, 0.0085, 0.024, 0.0035, 3),
          bodyMat
        );
        louverRib.position.set(0, stH.y + 0.0058, stH.z + 0.008);
        louverRib.rotation.x = stH.pitchX + 0.10;
        chassisGroup.add(louverRib);
      });

      // Iconic Asymmetric V-Spec II Right-Side Hood NACA Duct (car's right side = -X)
      const nacaSurf = sampleVehicleTopSurface(controlStations, spec, 0.258, -0.40);
      const nacaRim = new THREE.Mesh(
        createRoundedBoxGeometry(0.068, 0.006, 0.105, 0.003, 2),
        bodyMat
      );
      nacaRim.position.set(nacaSurf.x, nacaSurf.y + 0.0032, nacaSurf.z);
      nacaRim.rotation.x = nacaSurf.pitchX;
      nacaRim.rotation.y = 0.05;
      const nacaThroat = new THREE.Mesh(
        createRoundedBoxGeometry(0.044, 0.004, 0.082, 0.002, 2),
        panelSeamMat
      );
      nacaThroat.position.set(nacaSurf.x, nacaSurf.y + 0.0046, nacaSurf.z - 0.004);
      nacaThroat.rotation.x = nacaSurf.pitchX;
      nacaThroat.rotation.y = 0.05;
      chassisGroup.add(nacaRim, nacaThroat);
    } else if (spec.id === 'r32_gtr') {
      // Authentic 1994 BNR32 Skyline Front Nose Hood Emblem ("S" crest on leading edge above 3-slat grille)
      const hoodEmblemSurf = sampleVehicleTopSurface(controlStations, spec, 0.440, 0);
      const emblemBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.016, 0.004, 18),
        darkTrimMat
      );
      emblemBase.position.set(0, hoodEmblemSurf.y + 0.0032, hoodEmblemSurf.z);
      emblemBase.rotation.x = hoodEmblemSurf.pitchX;
      const emblemCrest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.005, 18),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.14 })
      );
      emblemCrest.position.set(0, hoodEmblemSurf.y + 0.0038, hoodEmblemSurf.z);
      emblemCrest.rotation.x = hoodEmblemSurf.pitchX;
      chassisGroup.add(emblemBase, emblemCrest);
    } else if (spec.id === 'silvia_s15' || spec.id === 'silvia_s14') {
      // Iconic Silvia S15 Lightning-Bolt "S" Shield Crest & S14 Kouki Hood Crest on Forward Hood Slope
      const texHood = createR34Textures();
      const sCrestSurf = sampleVehicleTopSurface(
        controlStations,
        spec,
        spec.id === 'silvia_s15' ? 0.432 : 0.436,
        0
      );
      if (spec.id === 'silvia_s15') {
        const s15CrestPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.026, 0.032),
          new THREE.MeshStandardMaterial({
            map: texHood.silviaLightningSTex,
            transparent: true,
            roughness: 0.22,
            metalness: 0.65,
          })
        );
        s15CrestPlane.rotation.x = -Math.PI * 0.5 + sCrestSurf.pitchX;
        s15CrestPlane.position.set(0, sCrestSurf.y + 0.0038, sCrestSurf.z);
        chassisGroup.add(s15CrestPlane);
      } else {
        const s14CrestBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.014, 0.004, 16),
          darkTrimMat
        );
        s14CrestBase.position.set(0, sCrestSurf.y + 0.0032, sCrestSurf.z);
        s14CrestBase.rotation.x = sCrestSurf.pitchX;
        const s14CrestTop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.010, 0.010, 0.005, 16),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.14 })
        );
        s14CrestTop.position.set(0, sCrestSurf.y + 0.0038, sCrestSurf.z);
        s14CrestTop.rotation.x = sCrestSurf.pitchX;
        chassisGroup.add(s14CrestBase, s14CrestTop);
      }
    } else if (spec.id === 'wrx_sti') {
      // Contoured Subaru WRX STI Rally Intercooler Hood Scoop seated flush on the spline hood
      const scoopSurf = sampleVehicleTopSurface(controlStations, spec, 0.255, 0);
      const scoopGroup = new THREE.Group();
      scoopGroup.position.set(0, scoopSurf.y + 0.028, scoopSurf.z);
      scoopGroup.rotation.x = scoopSurf.pitchX;

      const scoopBody = new THREE.Mesh(
        createRoundedBoxGeometry(0.46, 0.068, 0.38, 0.020, 4),
        bodyMat
      );
      const scoopThroat = new THREE.Mesh(
        createRoundedBoxGeometry(0.39, 0.046, 0.04, 0.008, 3),
        darkTrimMat
      );
      scoopThroat.position.set(0, 0.002, 0.175);
      const scoopSplitter = new THREE.Mesh(
        new THREE.BoxGeometry(0.37, 0.005, 0.042),
        bodyMat
      );
      scoopSplitter.position.set(0, 0.004, 0.176);
      scoopGroup.add(scoopBody, scoopThroat, scoopSplitter);
      chassisGroup.add(scoopGroup);
    } else if (spec.id === 'rx7_fc') {
      // Mazda RX-7 FC3S Offset Turbo II Intercooler Hood Scoop seated flush on the spline hood
      const fcSurf = sampleVehicleTopSurface(controlStations, spec, 0.265, -0.22);
      const fcGroup = new THREE.Group();
      fcGroup.position.set(fcSurf.x, fcSurf.y + 0.018, fcSurf.z);
      fcGroup.rotation.x = fcSurf.pitchX;

      const fcScoop = new THREE.Mesh(
        createRoundedBoxGeometry(0.26, 0.036, 0.24, 0.010, 3),
        bodyMat
      );
      const fcSlot = new THREE.Mesh(
        createRoundedBoxGeometry(0.22, 0.022, 0.03, 0.004, 2),
        darkTrimMat
      );
      fcSlot.position.set(0, 0.001, 0.11);
      fcGroup.add(fcScoop, fcSlot);
      chassisGroup.add(fcGroup);
    } else if (spec.id === 'lancer_evo9' || spec.id === 'lancer_evo10') {
      // Mitsubishi Lancer Evolution IX / X Recessed Heat-Extractor Hood Louver Bay
      const evoSurf = sampleVehicleTopSurface(controlStations, spec, 0.285, 0);
      const evoVentFrame = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.56, 0.008, 0.22, 0.004, 2),
        darkTrimMat
      );
      evoVentFrame.position.set(0, evoSurf.y + 0.002, evoSurf.z);
      evoVentFrame.rotation.x = evoSurf.pitchX;
      chassisGroup.add(evoVentFrame);

      if (spec.id === 'lancer_evo10') {
        [-1, 1].forEach((side) => {
          const nacaEvo = sampleVehicleTopSurface(controlStations, spec, 0.235, side * 0.36);
          const duct = new THREE.Mesh(
            createRoundedBoxGeometry(0.085, 0.007, 0.11, 0.003, 2),
            darkTrimMat
          );
          duct.position.set(nacaEvo.x, nacaEvo.y + 0.0025, nacaEvo.z);
          duct.rotation.x = nacaEvo.pitchX;
          chassisGroup.add(duct);
        });
      }
    } else if (spec.id === 'ferrari_f40') {
      // Ferrari F40 Twin Recessed NACA Hood Ducts seated flush on the low wedge hood
      [-1, 1].forEach((side) => {
        const f40Surf = sampleVehicleTopSurface(controlStations, spec, 0.315, side * 0.42);
        const naca = new THREE.Mesh(
          createRoundedBoxGeometry(0.068, 0.006, 0.125, 0.002, 2),
          darkTrimMat
        );
        naca.position.set(f40Surf.x, f40Surf.y + 0.002, f40Surf.z);
        naca.rotation.x = f40Surf.pitchX;
        chassisGroup.add(naca);
      });
    }
  }

  // 6. Contour-Matched Rear Trunk / Boot Lid Panel Shut-Lines (t = -0.358 to -0.468)
  const tTrunkFront = -0.358;
  const tTrunkRear = -0.468;
  const trunkRows = 14;
  [-1, 1].forEach((side) => {
    const tSeamPos: number[] = [];
    const tSeamIdx: number[] = [];
    for (let i = 0; i < trunkRows; i++) {
      const u = i / (trunkRows - 1);
      const t = tTrunkRear + u * (tTrunkFront - tTrunkRear);
      const innerPt = evalStationTopPoint(controlStations, spec, t, side * 0.840);
      const outerPt = evalStationTopPoint(controlStations, spec, t, side * 0.848);
      tSeamPos.push(
        innerPt.x,
        innerPt.y + 0.0014,
        innerPt.z,
        outerPt.x,
        outerPt.y + 0.0014,
        outerPt.z
      );
    }
    for (let i = 0; i < trunkRows - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side > 0) {
        tSeamIdx.push(a, c, b, b, c, d);
      } else {
        tSeamIdx.push(a, b, c, b, d, c);
      }
    }
    const trunkSeamGeom = new THREE.BufferGeometry();
    trunkSeamGeom.setAttribute('position', new THREE.Float32BufferAttribute(tSeamPos, 3));
    trunkSeamGeom.setIndex(tSeamIdx);
    trunkSeamGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(trunkSeamGeom, panelSeamMat));
  });

  // Transverse Rear Trunk-to-Rear-Glass & Trunk-to-Tail-Panel Shut-Lines
  [tTrunkFront, tTrunkRear].forEach((tSeam, idx) => {
    const transPos: number[] = [];
    const transIdx: number[] = [];
    const dtSeam = idx === 0 ? 0.0014 : -0.0014;
    const cols = 19;
    for (let j = 0; j < cols; j++) {
      const v = (j / (cols - 1)) * 2 - 1;
      const p0 = evalStationTopPoint(controlStations, spec, tSeam, v * 0.844);
      const p1 = evalStationTopPoint(controlStations, spec, tSeam + dtSeam, v * 0.844);
      transPos.push(p0.x, p0.y + 0.0014, p0.z, p1.x, p1.y + 0.0014, p1.z);
    }
    for (let j = 0; j < cols - 1; j++) {
      const a = j * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      transIdx.push(a, b, c, b, d, c);
    }
    const transGeom = new THREE.BufferGeometry();
    transGeom.setAttribute('position', new THREE.Float32BufferAttribute(transPos, 3));
    transGeom.setIndex(transIdx);
    transGeom.computeVertexNormals();
    chassisGroup.add(new THREE.Mesh(transGeom, panelSeamMat));
  });
}

// ============================================================================
// 3C. COMPLETE CONTOUR-MATCHED WIDEBODY OVERFENDERS, CANARDS & MODULAR AERO KIT
// ============================================================================
function buildWidebodyAeroKit(
  chassisGroup: THREE.Group,
  spec: VehicleSpec,
  controlStations: LongitudinalStation[],
  bodyMat: THREE.Material,
  carbonMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material,
  custom?: VehicleCustomization
) {
  const L = spec.dimensions.length;
  const W = spec.dimensions.width;
  const halfW = W * 0.5;
  const wheelbase = spec.dimensions.wheelbase;
  const vWheelR = getVisualWheelRadius(spec);
  const frontZAxle = wheelbase * 0.5;
  const rearZAxle = -wheelbase * 0.5;
  const frontZ = L * 0.476;
  const rearZ = -L * 0.478;

  const bodyKit = custom?.bodyKit ?? spec.defaultCustomization.bodyKit ?? 'stock';
  const frontSplitter = custom?.frontSplitter ?? spec.defaultCustomization.frontSplitter ?? 'stock';
  const rearDiffuser = custom?.rearDiffuser ?? spec.defaultCustomization.rearDiffuser ?? 'stock';
  const sideSkirt = custom?.sideSkirtStyle ?? spec.defaultCustomization.sideSkirtStyle ?? 'stock';
  const grilleStyle = custom?.grilleStyle ?? spec.defaultCustomization.grilleStyle ?? 'stock';

  const isWideOrTrack = bodyKit === 'widebody_aero' || bodyKit === 'track_gt';
  const isStreetAero = bodyKit === 'street_aero';
  const hasCanards =
    frontSplitter === 'twin_canard' || bodyKit === 'widebody_aero' || bodyKit === 'track_gt';
  const hasExtendedSplitter =
    frontSplitter === 'carbon_race' ||
    frontSplitter === 'twin_canard' ||
    bodyKit === 'street_aero' ||
    isWideOrTrack;
  const hasSideBlades =
    sideSkirt === 'aero_step' ||
    sideSkirt === 'carbon_blade' ||
    bodyKit === 'street_aero' ||
    isWideOrTrack;
  const hasRearDiffuserUpgrade =
    rearDiffuser === 'carbon_finned' ||
    rearDiffuser === 'time_attack' ||
    bodyKit === 'street_aero' ||
    isWideOrTrack;

  [-1, 1].forEach((side) => {
    // 1. Flush Widebody Front & Rear Fender Trailing Brake-Heat Extractor Vents & Overfender Seam Bolts
    if (isWideOrTrack) {
      const stFrontTrail = sampleLongitudinalTable(
        controlStations,
        (frontZAxle - vWheelR - 0.11) / L
      );
      const ventX = side * (halfW * stFrontTrail.planScale + stFrontTrail.archFlare * 0.72);
      const extractorSlot = new THREE.Mesh(
        createRoundedBoxGeometry(0.018, 0.21, 0.056, 0.005, 2),
        darkTrimMat
      );
      extractorSlot.position.set(ventX, 0.37, frontZAxle - vWheelR - 0.11);
      extractorSlot.rotation.x = -0.10;
      chassisGroup.add(extractorSlot);

      if (bodyKit === 'track_gt') {
        // Track GT Front Fender Louver Slats above wheel arch
        [-0.05, 0.0, 0.05].forEach((zOff) => {
          const fenderLouver = new THREE.Mesh(
            createRoundedBoxGeometry(0.068, 0.007, 0.024, 0.002, 2),
            carbonMat
          );
          fenderLouver.position.set(side * (halfW * 0.86), vWheelR * 2.08, frontZAxle + zOff);
          fenderLouver.rotation.z = -side * 0.18;
          fenderLouver.rotation.x = 0.14;
          chassisGroup.add(fenderLouver);
        });
      }
    }

    // 2. Dual Carbon-Fiber Front Bumper Dive-Plane Aero Canards (Upper & Lower Winglets)
    if (hasCanards) {
      [
        { y: 0.335, zOff: -0.052, w: 0.068, len: 0.165, pitch: -0.24 },
        { y: 0.245, zOff: -0.036, w: 0.078, len: 0.185, pitch: -0.20 },
      ].forEach((canardCfg) => {
        const canard = new THREE.Mesh(
          createRoundedBoxGeometry(canardCfg.w, 0.010, canardCfg.len, 0.003, 2),
          carbonMat
        );
        canard.position.set(
          side * (halfW * 0.855),
          canardCfg.y,
          frontZ + canardCfg.zOff
        );
        canard.rotation.y = side * 0.24;
        canard.rotation.x = canardCfg.pitch;
        canard.rotation.z = -side * 0.16;
        chassisGroup.add(canard);

        const canardEndFin = new THREE.Mesh(
          createRoundedBoxGeometry(0.008, 0.032, canardCfg.len * 0.78, 0.002, 2),
          carbonMat
        );
        canardEndFin.position.set(
          side * (halfW * 0.885),
          canardCfg.y + 0.012,
          frontZ + canardCfg.zOff
        );
        canardEndFin.rotation.y = side * 0.24;
        canardEndFin.rotation.x = canardCfg.pitch;
        chassisGroup.add(canardEndFin);
      });
    }

    // 3. Modular Side Skirt Blades & Rear Arch Aero Winglets
    if (hasSideBlades) {
      const skirtSpan = wheelbase - vWheelR * 2.15;
      const skirtMat = sideSkirt === 'aero_step' || isStreetAero ? bodyMat : carbonMat;
      const underBlade = new THREE.Mesh(
        createRoundedBoxGeometry(0.065, 0.018, skirtSpan, 0.005, 3),
        skirtMat
      );
      underBlade.position.set(
        side * (halfW * (isWideOrTrack ? 0.96 : 0.925)),
        0.148,
        (frontZAxle + rearZAxle) * 0.5
      );
      chassisGroup.add(underBlade);

      const skirtFin = new THREE.Mesh(
        createRoundedBoxGeometry(0.014, 0.078, 0.125, 0.004, 2),
        carbonMat
      );
      skirtFin.position.set(
        side * (halfW * (isWideOrTrack ? 0.975 : 0.945)),
        0.182,
        rearZAxle + vWheelR + 0.19
      );
      chassisGroup.add(skirtFin);
    }

    // 4. Rear Bumper Lower Carbon Aero Corner Apron / Diffuser Endplate
    if (hasRearDiffuserUpgrade) {
      const rearAeroSpat = new THREE.Mesh(
        createRoundedBoxGeometry(0.052, 0.072, 0.175, 0.010, 2),
        isStreetAero && rearDiffuser === 'stock' ? bodyMat : carbonMat
      );
      rearAeroSpat.position.set(
        side * (halfW * 0.855),
        0.205,
        rearZ + 0.085
      );
      rearAeroSpat.rotation.y = -side * 0.16;
      chassisGroup.add(rearAeroSpat);
    }

    // 5. Stainless-Steel Front Race Splitter Support Tie-Rods
    if (hasExtendedSplitter && (frontSplitter !== 'stock' || isWideOrTrack)) {
      const tieRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0045, 0.0045, 0.115, 8),
        chromeMat
      );
      tieRod.position.set(side * (halfW * 0.34), 0.195, frontZ + 0.048);
      tieRod.rotation.x = 0.26;
      chassisGroup.add(tieRod);
    }
  });

  // 6. Extended Front Under-Splitter Lip (Street Aero Body-Matched or Carbon Race)
  if (hasExtendedSplitter) {
    const splitterMat =
      isStreetAero && frontSplitter === 'stock' ? bodyMat : carbonMat;
    const splitterProtrusion =
      bodyKit === 'track_gt' || frontSplitter === 'twin_canard' ? 0.068 : 0.046;
    const raceSplitter = new THREE.Mesh(
      buildSculptedFasciaBar(
        halfW * (isWideOrTrack ? 1.84 : 1.76),
        0.022,
        0.098,
        0.132,
        frontZ + splitterProtrusion,
        0.092,
        0.92,
        0.24
      ),
      splitterMat
    );
    chassisGroup.add(raceSplitter);
  }

  // 7. Rear Underbody Venturi Diffuser Assembly (Carbon Finned or Time Attack)
  if (hasRearDiffuserUpgrade) {
    const diffTray = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 1.18, 0.022, 0.24, 0.006, 3),
      carbonMat
    );
    diffTray.position.set(0, 0.172, rearZ + 0.055);
    diffTray.rotation.x = 0.08;
    chassisGroup.add(diffTray);

    const finPositions =
      rearDiffuser === 'time_attack' || bodyKit === 'track_gt'
        ? [-0.36, -0.22, -0.08, 0.08, 0.22, 0.36]
        : [-0.28, -0.10, 0.10, 0.28];
    finPositions.forEach((fx) => {
      const vFin = new THREE.Mesh(
        createRoundedBoxGeometry(0.012, 0.068, 0.22, 0.004, 2),
        carbonMat
      );
      vFin.position.set(fx, 0.165, rearZ + 0.042);
      vFin.rotation.x = 0.10;
      chassisGroup.add(vFin);
    });
  }

  // 8. Front Grille & Intercooler Customization (Mesh Intercooler or Twin Sport Slat)
  if (grilleStyle === 'mesh_intercooler') {
    const icCore = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.76, 0.165, 0.032, 0.006, 2),
      chromeMat
    );
    icCore.position.set(0, 0.255, frontZ + 0.012);
    chassisGroup.add(icCore);

    [-1, 1].forEach((side) => {
      const icPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.14, 14),
        chromeMat
      );
      icPipe.rotation.z = Math.PI * 0.5;
      icPipe.position.set(side * (halfW * 0.42), 0.245, frontZ + 0.008);
      chassisGroup.add(icPipe);
    });
  } else if (grilleStyle === 'sport_slat') {
    [-0.022, 0.018].forEach((yOff) => {
      const slatBar = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.68, 0.014, 0.028, 0.004, 2),
        carbonMat
      );
      slatBar.position.set(0, 0.435 + yOff, frontZ + 0.014);
      chassisGroup.add(slatBar);
    });
  }
}

// ============================================================================
// 4. HYPER-DETAILED FRONT FASCIA (Exact BNR34 + Model-Specific Front Ends)
// ============================================================================
function buildDetailedR34FrontFascia(
  chassisGroup: THREE.Group,
  L: number,
  W: number,
  bodyMat: THREE.Material,
  carbonMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material,
  headlightGlassMat: THREE.Material,
  amberMat: THREE.Material,
  spec: VehicleSpec,
  controlStationsInput?: LongitudinalStation[]
) {
  const halfW = W * 0.5;
  const frontZ = L * 0.476;
  const tex = createR34Textures();
  const controlStations = controlStationsInput ?? buildVehicleControlStations(spec);

  // Refined 2002 Nissan Skyline GT-R V-Spec II (BNR34) matching Vehicle Inspection Blueprint
  if (spec.id === 'r34_gtr') {
    const backingCavity = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 1.38, 0.42, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.92 })
    );
    backingCavity.position.set(0, 0.41, frontZ - 0.11);
    chassisGroup.add(backingCavity);

    const centerHoodLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.82, 0.036, 0.052, 0.654, frontZ - 0.002, 0.088, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(centerHoodLip);

    const upperBumperBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.84, 0.078, 0.060, 0.504, frontZ + 0.004, 0.092, 0.94, 0.24),
      bodyMat
    );
    chassisGroup.add(upperBumperBar);

    const lowerBumperValance = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.78, 0.062, 0.060, 0.188, frontZ + 0.010, 0.088, 0.92, 0.24),
      bodyMat
    );
    chassisGroup.add(lowerBumperValance);

    [-1, 1].forEach((side) => {
      const grillePillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.058, 0.122, 0.068, 0.014, 3),
        bodyMat
      );
      grillePillar.position.set(side * (halfW * 0.335), 0.592, frontZ + 0.002);
      grillePillar.rotation.y = side * 0.08;
      chassisGroup.add(grillePillar);
    });

    const upperGrilleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.61, 0.088, 0.026),
      getGrilleMeshMaterial()
    );
    upperGrilleMesh.position.set(0, 0.592, frontZ - 0.012);
    chassisGroup.add(upperGrilleMesh);

    const upperGrilleFrame = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.64, 0.104, 0.022, 0.012, 2),
      darkTrimMat
    );
    upperGrilleFrame.position.set(0, 0.592, frontZ - 0.018);
    chassisGroup.add(upperGrilleFrame);

    const gtrPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.036, 0.016),
      new THREE.MeshStandardMaterial({
        map: tex.gtrBadgeTex,
        roughness: 0.22,
        metalness: 0.55,
      })
    );
    gtrPlate.position.set(0, 0.590, frontZ + 0.008);
    chassisGroup.add(gtrPlate);

    [-1, 1].forEach((side) => {
      const isLeft = side > 0;
      const hlGroup = new THREE.Group();
      hlGroup.position.set(side * (halfW * 0.585), 0.590, frontZ - 0.022);
      hlGroup.rotation.y = side * 0.155;
      hlGroup.rotation.z = -side * 0.022;

      const hlW = halfW * 0.456;
      const hlH = 0.096;

      const housingBox = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.016, hlH + 0.012, 0.056, 0.018, 3),
        chromeMat
      );
      housingBox.position.z = -0.024;
      hlGroup.add(housingBox);

      const reflectorFace = new THREE.Mesh(
        new THREE.PlaneGeometry(hlW * 0.96, hlH * 0.92),
        new THREE.MeshStandardMaterial({
          map: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          roughness: 0.12,
          metalness: 0.58,
          emissive: new THREE.Color(0xe0f2fe),
          emissiveMap: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          emissiveIntensity: 0.45,
        })
      );
      reflectorFace.position.z = 0.006;
      hlGroup.add(reflectorFace);

      const innerProjX = -side * (hlW * 0.25);
      const midProjX = -side * (-hlW * 0.05);
      [
        { x: innerProjX, r: 0.026 },
        { x: midProjX, r: 0.032 },
      ].forEach((p) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.0045, 12, 24), chromeMat);
        ring.position.set(p.x, -0.002, 0.010);
        hlGroup.add(ring);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 0.84, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            emissive: 0xbae6fd,
            emissiveIntensity: 0.80,
            roughness: 0.05,
            transmission: 0,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          })
        );
        dome.rotation.x = Math.PI * 0.5;
        dome.position.set(p.x, -0.002, 0.010);
        hlGroup.add(dome);
      });

      const outerGlass = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.004, hlH + 0.002, 0.016, 0.016, 3),
        headlightGlassMat
      );
      outerGlass.position.z = 0.016;
      hlGroup.add(outerGlass);

      const eyelid = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.020, 0.024, 0.044, 0.008, 3),
        bodyMat
      );
      eyelid.position.set(0, hlH * 0.5 + 0.005, 0.008);
      eyelid.rotation.z = -side * 0.042;
      hlGroup.add(eyelid);

      const outerHlCheek = new THREE.Mesh(
        createRoundedBoxGeometry(0.048, hlH + 0.028, 0.078, 0.014, 3),
        bodyMat
      );
      outerHlCheek.position.set(side * (hlW * 0.5 + 0.016), 0.002, -0.018);
      hlGroup.add(outerHlCheek);

      chassisGroup.add(hlGroup);
    });

    // Recessed Dark Gunmetal Surround Frame + Brushed Aluminum Intercooler Core with Full-Width Fin Texture
    const fmicFrame = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.78, 0.268, 0.048, 0.016, 3),
      darkTrimMat
    );
    fmicFrame.position.set(0, 0.332, frontZ - 0.018);
    chassisGroup.add(fmicFrame);

    const fmicCore = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.72, 0.236, 0.052),
      getIntercoolerMaterial()
    );
    fmicCore.position.set(0, 0.332, frontZ - 0.015);
    chassisGroup.add(fmicCore);

    [-1, 1].forEach((side) => {
      const innerPillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.068, 0.295, 0.072, 0.016, 3),
        bodyMat
      );
      innerPillar.position.set(side * (halfW * 0.435), 0.345, frontZ - 0.002);
      innerPillar.rotation.z = side * 0.06;
      innerPillar.rotation.y = side * 0.10;
      chassisGroup.add(innerPillar);

      const sideDuctMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(halfW * 0.30, 0.255),
        getGrilleMeshMaterial()
      );
      sideDuctMesh.position.set(side * (halfW * 0.605), 0.335, frontZ - 0.030);
      sideDuctMesh.rotation.y = side * 0.16;
      chassisGroup.add(sideDuctMesh);

      // Recessed Smoked/Amber Turn Signal Lamp in Upper Bumper Beam
      const smokedAmberMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        emissive: 0xb45309,
        emissiveIntensity: 0.32,
        roughness: 0.18,
        metalness: 0.25,
      });
      const amberLampHousing = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.165, 0.038, 0.032, 0.007, 2),
        darkTrimMat
      );
      amberLampHousing.position.set(side * (halfW * 0.575), 0.436, frontZ - 0.008);
      amberLampHousing.rotation.y = side * 0.14;
      chassisGroup.add(amberLampHousing);

      const amberLens = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.142, 0.026, 0.035, 0.005, 2),
        smokedAmberMat
      );
      amberLens.position.set(side * (halfW * 0.575), 0.436, frontZ - 0.006);
      amberLens.rotation.y = side * 0.14;
      chassisGroup.add(amberLens);

      // Single Horizontal Body-Colored Splitter Bar in Each Side Bumper Intake (creates 2 wide horizontal openings matching blueprint)
      const vane = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.295, 0.028, 0.052, 0.008, 2),
        bodyMat
      );
      vane.position.set(side * (halfW * 0.605), 0.312, frontZ - 0.012);
      vane.rotation.y = side * 0.16;
      chassisGroup.add(vane);

      const solidOuterCheek = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.135, 0.298, 0.112, 0.024, 3),
        bodyMat
      );
      solidOuterCheek.position.set(side * (halfW * 0.778), 0.345, frontZ - 0.056);
      solidOuterCheek.rotation.y = side * 0.24;
      chassisGroup.add(solidOuterCheek);

      const cornerSlot = new THREE.Mesh(
        createRoundedBoxGeometry(0.028, 0.185, 0.022, 0.006, 2),
        darkTrimMat
      );
      cornerSlot.position.set(side * (halfW * 0.784), 0.338, frontZ - 0.008);
      cornerSlot.rotation.y = side * 0.24;
      chassisGroup.add(cornerSlot);

      // Flush Side Fender Air Curtain Slot, Bumper Seam & Wrap-Around Headlight Corner (aligned inside tapered front nose!)
      const sideAirCurtainCavity = new THREE.Mesh(
        createRoundedBoxGeometry(0.022, 0.195, 0.072, 0.005, 2),
        darkTrimMat
      );
      sideAirCurtainCavity.position.set(side * (halfW * 0.892), 0.320, frontZ - 0.105);
      sideAirCurtainCavity.rotation.y = side * 0.14;
      chassisGroup.add(sideAirCurtainCavity);

      const sideHlWrap = new THREE.Mesh(
        createRoundedBoxGeometry(0.024, 0.082, 0.115, 0.008, 2),
        chromeMat
      );
      sideHlWrap.position.set(side * (halfW * 0.895), 0.590, frontZ - 0.072);
      sideHlWrap.rotation.y = side * 0.16;
      chassisGroup.add(sideHlWrap);

      const sideBumperSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.008, 0.24),
        darkTrimMat
      );
      sideBumperSeam.position.set(side * (halfW * 0.908), 0.512, frontZ - 0.135);
      sideBumperSeam.rotation.y = side * 0.12;
      chassisGroup.add(sideBumperSeam);
    });

    // Clean V-Spec II Lower Front Chin Splitter Diffuser (flush width, no sticking-out corner boxes)
    const carbonSplitter = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.026, 0.068, 0.150, frontZ + 0.018, 0.090, 0.90, 0.24),
      darkTrimMat
    );
    chassisGroup.add(carbonSplitter);

    const splitterUndertray = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 1.48, 0.016, 0.16, 0.005, 2),
      darkTrimMat
    );
    splitterUndertray.position.set(0, 0.136, frontZ - 0.020);
    chassisGroup.add(splitterUndertray);
    return;
  }

  // Dedicated 1997 Nissan Skyline GT-R V-Spec (BCNR33) matching Vehicle Inspection Blueprint
  if (spec.id === 'r33_gtr') {
    const backingCavity = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 1.42, 0.42, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.92 })
    );
    backingCavity.position.set(0, 0.39, frontZ - 0.11);
    chassisGroup.add(backingCavity);

    // Smooth Rounded BCNR33 Front Hood Brow
    const centerHoodLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.82, 0.034, 0.054, 0.626, frontZ - 0.004, 0.092, 0.92, 0.28),
      bodyMat
    );
    chassisGroup.add(centerHoodLip);

    // Main BCNR33 Front Bumper Bar (houses the signature twin Nismo/V-Spec rectangular cooling ducts)
    const upperBumperBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.84, 0.078, 0.062, 0.486, frontZ + 0.006, 0.094, 0.94, 0.28),
      bodyMat
    );
    chassisGroup.add(upperBumperBar);

    // Signature BCNR33 Twin Center Rectangular Air Ducts ("Active ducting, intercooler" on front bumper face)
    [-1, 1].forEach((side) => {
      const activeDuctRim = new THREE.Mesh(
        createRoundedBoxGeometry(0.198, 0.038, 0.026, 0.009, 3),
        bodyMat
      );
      activeDuctRim.position.set(side * 0.138, 0.486, frontZ + 0.058);
      activeDuctRim.rotation.y = side * 0.04;
      chassisGroup.add(activeDuctRim);

      const activeDuctFrame = new THREE.Mesh(
        createRoundedBoxGeometry(0.180, 0.026, 0.028, 0.005, 2),
        darkTrimMat
      );
      activeDuctFrame.position.set(side * 0.138, 0.486, frontZ + 0.060);
      activeDuctFrame.rotation.y = side * 0.04;
      chassisGroup.add(activeDuctFrame);

      const activeDuctCavity = new THREE.Mesh(
        new THREE.BoxGeometry(0.164, 0.016, 0.030),
        new THREE.MeshBasicMaterial({ color: 0x020305 })
      );
      activeDuctCavity.position.set(side * 0.138, 0.486, frontZ + 0.061);
      activeDuctCavity.rotation.y = side * 0.04;
      chassisGroup.add(activeDuctCavity);
    });

    // Lower BCNR33 Bumper Apron & Protruding V-Spec Lower Lip Spoiler (visible in Front & Side Elevation)
    const lowerBumperValance = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.78, 0.052, 0.062, 0.186, frontZ + 0.016, 0.092, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(lowerBumperValance);

    const vspecLowerLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.74, 0.038, 0.072, 0.148, frontZ + 0.034, 0.094, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(vspecLowerLip);

    const vspecLipChin = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.016, 0.074, 0.128, frontZ + 0.038, 0.094, 0.90, 0.26),
      darkTrimMat
    );
    chassisGroup.add(vspecLipChin);

    // Recessed Upper Mesh Grille with Tapered Inner Pillars, Body-Colored Lower Sill & Centered GT-R Emblem
    [-1, 1].forEach((side) => {
      const grillePillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.056, 0.104, 0.068, 0.014, 3),
        bodyMat
      );
      grillePillar.position.set(side * (halfW * 0.305), 0.572, frontZ + 0.006);
      grillePillar.rotation.z = -side * 0.14;
      grillePillar.rotation.y = side * 0.08;
      chassisGroup.add(grillePillar);
    });

    const grilleLowerSill = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.62, 0.022, 0.066, 0.006, 2),
      bodyMat
    );
    grilleLowerSill.position.set(0, 0.526, frontZ + 0.008);
    chassisGroup.add(grilleLowerSill);

    const upperGrilleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.56, 0.076, 0.026),
      getGrilleMeshMaterial()
    );
    upperGrilleMesh.position.set(0, 0.574, frontZ - 0.004);
    chassisGroup.add(upperGrilleMesh);

    const upperGrilleFrame = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.59, 0.090, 0.022, 0.012, 2),
      darkTrimMat
    );
    upperGrilleFrame.position.set(0, 0.574, frontZ - 0.010);
    chassisGroup.add(upperGrilleFrame);

    const gtrPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.036, 0.016),
      new THREE.MeshStandardMaterial({
        map: tex.gtrBadgeTex,
        roughness: 0.22,
        metalness: 0.55,
      })
    );
    gtrPlate.position.set(0, 0.574, frontZ + 0.016);
    chassisGroup.add(gtrPlate);

    // BCNR33 Multi-Reflector Chrome/Xenon Headlights with Flush Wrap-Around Clear Corner Lenses
    [-1, 1].forEach((side) => {
      const isLeft = side > 0;
      const hlGroup = new THREE.Group();
      hlGroup.position.set(side * (halfW * 0.568), 0.572, frontZ - 0.014);
      hlGroup.rotation.y = side * 0.165;
      hlGroup.rotation.z = -side * 0.014;

      const hlW = halfW * 0.472;
      const hlH = 0.086;

      const housingBox = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.014, hlH + 0.008, 0.062, 0.020, 3),
        chromeMat
      );
      housingBox.position.z = -0.024;
      hlGroup.add(housingBox);

      const reflectorFace = new THREE.Mesh(
        new THREE.PlaneGeometry(hlW * 0.95, hlH * 0.90),
        new THREE.MeshStandardMaterial({
          map: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          roughness: 0.10,
          metalness: 0.62,
          emissive: new THREE.Color(0xe0f2fe),
          emissiveMap: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          emissiveIntensity: 0.52,
        })
      );
      reflectorFace.position.z = 0.006;
      hlGroup.add(reflectorFace);

      // Dual Circular Multi-Reflector Xenon Lamps + Flush Outer Clear Corner Indicator
      const innerProjX = -side * (hlW * 0.26);
      const midProjX = -side * (hlW * 0.02);
      [
        { x: innerProjX, r: 0.026 },
        { x: midProjX, r: 0.031 },
      ].forEach((p) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.0045, 12, 24), chromeMat);
        ring.position.set(p.x, -0.002, 0.010);
        hlGroup.add(ring);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 0.84, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            emissive: 0xbae6fd,
            emissiveIntensity: 0.85,
            roughness: 0.05,
            transmission: 0,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          })
        );
        dome.rotation.x = Math.PI * 0.5;
        dome.position.set(p.x, -0.002, 0.010);
        hlGroup.add(dome);
      });

      // Integrated Outer Clear Corner Marker with Subtle Warm Bulb Reflection
      const cornerBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 10),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.45,
          roughness: 0.2,
        })
      );
      cornerBulb.position.set(side * (hlW * 0.34), -0.004, 0.008);
      hlGroup.add(cornerBulb);

      const outerGlass = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.004, hlH + 0.002, 0.018, 0.020, 3),
        headlightGlassMat
      );
      outerGlass.position.z = 0.016;
      hlGroup.add(outerGlass);

      // Wrap-around clear corner indicator lens along outer edge (visible in Side Elevation, flush in Front View!)
      const wrapCornerLens = new THREE.Mesh(
        createRoundedBoxGeometry(0.036, hlH * 0.92, 0.095, 0.012, 3),
        chromeMat
      );
      wrapCornerLens.position.set(side * (hlW * 0.48), -0.001, -0.034);
      wrapCornerLens.rotation.y = side * 0.14;
      hlGroup.add(wrapCornerLens);

      // Upper Body-Colored Headlight Brow / Eyelid blending smoothly into hood
      const eyelid = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.024, 0.022, 0.052, 0.008, 3),
        bodyMat
      );
      eyelid.position.set(0, hlH * 0.5 + 0.004, 0.004);
      eyelid.rotation.z = -side * 0.022;
      hlGroup.add(eyelid);

      // Smooth Flush Outer Fender Cheek sealing the corner to the front fender
      const outerHlCheek = new THREE.Mesh(
        createRoundedBoxGeometry(0.056, hlH + 0.032, 0.115, 0.018, 3),
        bodyMat
      );
      outerHlCheek.position.set(side * (hlW * 0.5 + 0.016), -0.004, -0.048);
      hlGroup.add(outerHlCheek);

      chassisGroup.add(hlGroup);
    });

    // Central Front-Mount Intercooler Opening with Full-Width Horizontal Fin Texture
    const fmicFrame = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.78, 0.236, 0.048, 0.018, 3),
      darkTrimMat
    );
    fmicFrame.position.set(0, 0.316, frontZ - 0.012);
    chassisGroup.add(fmicFrame);

    const fmicCore = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.72, 0.208, 0.052),
      getIntercoolerMaterial()
    );
    fmicCore.position.set(0, 0.316, frontZ - 0.008);
    chassisGroup.add(fmicCore);

    // Side Bumper Intakes with Recessed Round Amber Fog/Turn Lamps & V-Spec Lower Lip Brake Ducts
    const smokedAmberMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xb45309,
      emissiveIntensity: 0.48,
      roughness: 0.16,
      metalness: 0.25,
    });

    [-1, 1].forEach((side) => {
      const innerPillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.066, 0.275, 0.076, 0.018, 3),
        bodyMat
      );
      innerPillar.position.set(side * (halfW * 0.425), 0.332, frontZ + 0.006);
      innerPillar.rotation.z = side * 0.05;
      innerPillar.rotation.y = side * 0.10;
      chassisGroup.add(innerPillar);

      const sideDuctMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(halfW * 0.31, 0.240),
        getGrilleMeshMaterial()
      );
      sideDuctMesh.position.set(side * (halfW * 0.595), 0.322, frontZ - 0.016);
      sideDuctMesh.rotation.y = side * 0.16;
      chassisGroup.add(sideDuctMesh);

      // Recessed Circular Amber Fog / Turn Lamp inside Upper Side Bumper Duct ("Signature GT-R")
      const roundFogBezel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.030, 0.028, 20),
        darkTrimMat
      );
      roundFogBezel.rotation.x = Math.PI * 0.5;
      roundFogBezel.position.set(side * (halfW * 0.590), 0.366, frontZ + 0.010);
      roundFogBezel.rotation.z = -side * 0.16;
      chassisGroup.add(roundFogBezel);

      const roundFogLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.030, 20),
        smokedAmberMat
      );
      roundFogLens.rotation.x = Math.PI * 0.5;
      roundFogLens.position.set(side * (halfW * 0.590), 0.366, frontZ + 0.012);
      roundFogLens.rotation.z = -side * 0.16;
      chassisGroup.add(roundFogLens);

      // Horizontal Body-Colored Splitter Bar in Side Bumper Intake
      const vane = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.295, 0.026, 0.056, 0.008, 2),
        bodyMat
      );
      vane.position.set(side * (halfW * 0.595), 0.298, frontZ + 0.008);
      vane.rotation.y = side * 0.16;
      chassisGroup.add(vane);

      // V-Spec Lower Lip Brake-Cooling Duct Cutout (flush on front face of V-Spec lower lip)
      const lowerLipDuctFrame = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.22, 0.032, 0.028, 0.007, 2),
        darkTrimMat
      );
      lowerLipDuctFrame.position.set(side * (halfW * 0.555), 0.150, frontZ + 0.072);
      lowerLipDuctFrame.rotation.y = side * 0.16;
      chassisGroup.add(lowerLipDuctFrame);

      const lowerLipDuct = new THREE.Mesh(
        new THREE.BoxGeometry(halfW * 0.19, 0.020, 0.030),
        new THREE.MeshBasicMaterial({ color: 0x020305 })
      );
      lowerLipDuct.position.set(side * (halfW * 0.555), 0.150, frontZ + 0.073);
      lowerLipDuct.rotation.y = side * 0.16;
      chassisGroup.add(lowerLipDuct);

      const solidOuterCheek = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.165, 0.295, 0.135, 0.028, 3),
        bodyMat
      );
      solidOuterCheek.position.set(side * (halfW * 0.785), 0.340, frontZ - 0.052);
      solidOuterCheek.rotation.y = side * 0.22;
      chassisGroup.add(solidOuterCheek);

      const sideBumperSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.020, 0.007, 0.24),
        darkTrimMat
      );
      sideBumperSeam.position.set(side * (halfW * 0.865), 0.500, frontZ - 0.120);
      sideBumperSeam.rotation.y = side * 0.12;
      chassisGroup.add(sideBumperSeam);
    });
    return;
  }

  // Dedicated 1994 Nissan Skyline GT-R V-Spec II (BNR32) matching Vehicle Inspection Blueprint & Studio Turnaround
  if (spec.id === 'r32_gtr') {
    const backingCavity = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 1.40, 0.40, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.92 })
    );
    backingCavity.position.set(0, 0.37, frontZ - 0.11);
    chassisGroup.add(backingCavity);

    // 1. Sleek Sloped BNR32 Front Hood Leading Brow
    const centerHoodLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.76, 0.030, 0.048, 0.594, frontZ - 0.008, 0.090, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(centerHoodLip);

    // 2. Stepped BNR32 Main Front Bumper Beam (projects forward below headlights & grille)
    const upperBumperBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.82, 0.074, 0.062, 0.452, frontZ + 0.012, 0.092, 0.94, 0.26),
      bodyMat
    );
    chassisGroup.add(upperBumperBar);

    // 3. Signature BNR32 Dual Rectangular N1 / V-Spec II Cooling Ducts recessed into upperBumperBar
    [-1, 1].forEach((side) => {
      const n1Rim = new THREE.Mesh(
        createRoundedBoxGeometry(0.184, 0.038, 0.024, 0.007, 3),
        bodyMat
      );
      n1Rim.position.set(side * 0.144, 0.452, frontZ + 0.064);
      n1Rim.rotation.y = side * 0.04;
      chassisGroup.add(n1Rim);

      const n1Bezel = new THREE.Mesh(
        createRoundedBoxGeometry(0.168, 0.026, 0.026, 0.004, 2),
        darkTrimMat
      );
      n1Bezel.position.set(side * 0.144, 0.452, frontZ + 0.066);
      n1Bezel.rotation.y = side * 0.04;
      chassisGroup.add(n1Bezel);

      const n1Throat = new THREE.Mesh(
        new THREE.BoxGeometry(0.152, 0.016, 0.028),
        new THREE.MeshBasicMaterial({ color: 0x020305 })
      );
      n1Throat.position.set(side * 0.144, 0.452, frontZ + 0.068);
      n1Throat.rotation.y = side * 0.04;
      chassisGroup.add(n1Throat);
    });

    // 4. Lower BNR32 Bumper Chin Apron & Dark Charcoal V-Spec II Front Lip Spoiler
    const lowerBumperValance = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.76, 0.048, 0.060, 0.188, frontZ + 0.014, 0.090, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(lowerBumperValance);

    const r32LipMat = new THREE.MeshStandardMaterial({
      color: 0x1c2026,
      roughness: 0.46,
      metalness: 0.28,
    });
    const vspecLowerLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.72, 0.036, 0.068, 0.148, frontZ + 0.026, 0.092, 0.90, 0.26),
      r32LipMat
    );
    chassisGroup.add(vspecLowerLip);

    // 5. Recessed 3-Slat Open Gun Grey Metallic Front Grille between Headlights
    [-1, 1].forEach((side) => {
      const grillePillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.046, 0.092, 0.058, 0.010, 3),
        bodyMat
      );
      grillePillar.position.set(side * (halfW * 0.305), 0.542, frontZ - 0.002);
      grillePillar.rotation.z = -side * 0.08;
      grillePillar.rotation.y = side * 0.06;
      chassisGroup.add(grillePillar);
    });

    const upperGrilleCavity = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.58, 0.078, 0.026),
      new THREE.MeshBasicMaterial({ color: 0x030508 })
    );
    upperGrilleCavity.position.set(0, 0.542, frontZ - 0.014);
    chassisGroup.add(upperGrilleCavity);

    [-0.022, 0.0, 0.022].forEach((gy) => {
      const slat = new THREE.Mesh(
        buildSculptedFasciaBar(halfW * 0.57, 0.010, 0.022, 0.542 + gy, frontZ + 0.002, 0.016, 0.96, 0.24),
        bodyMat
      );
      chassisGroup.add(slat);
    });

    // 6. BNR32 Multi-Reflector / Projector Headlights + Wrap-Around Amber Corner Blinkers
    const bnrAmberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.72,
      roughness: 0.18,
      metalness: 0.15,
    });

    [-1, 1].forEach((side) => {
      const isLeft = side > 0;
      const hlGroup = new THREE.Group();
      hlGroup.position.set(side * (halfW * 0.558), 0.542, frontZ - 0.014);
      hlGroup.rotation.y = side * 0.155;
      hlGroup.rotation.z = -side * 0.012;

      const hlW = halfW * 0.455;
      const hlH = 0.082;

      // Bright metallic chrome-silver inner headlight housing
      const housingBox = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.012, hlH + 0.008, 0.056, 0.016, 3),
        chromeMat
      );
      housingBox.position.z = -0.022;
      hlGroup.add(housingBox);

      const reflectorFace = new THREE.Mesh(
        new THREE.PlaneGeometry(hlW * 0.94, hlH * 0.88),
        new THREE.MeshStandardMaterial({
          map: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          roughness: 0.10,
          metalness: 0.65,
          emissive: new THREE.Color(0xe0f2fe),
          emissiveMap: isLeft ? tex.headlightLeftTex : tex.headlightRightTex,
          emissiveIntensity: 0.48,
        })
      );
      reflectorFace.position.z = 0.005;
      hlGroup.add(reflectorFace);

      // Inner round high-beam reflector bowl + outer round projector lens
      const innerProjX = -side * (hlW * 0.28);
      const midProjX = -side * (hlW * 0.02);
      [
        { x: innerProjX, r: 0.026 },
        { x: midProjX, r: 0.030 },
      ].forEach((p) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.0042, 12, 24), chromeMat);
        ring.position.set(p.x, -0.001, 0.009);
        hlGroup.add(ring);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            emissive: 0xbae6fd,
            emissiveIntensity: 0.78,
            roughness: 0.05,
            transmission: 0,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          })
        );
        dome.rotation.x = Math.PI * 0.5;
        dome.position.set(p.x, -0.001, 0.009);
        hlGroup.add(dome);
      });

      // Front-facing outer amber corner indicator chamber
      const frontAmberCorner = new THREE.Mesh(
        createRoundedBoxGeometry(hlW * 0.27, hlH * 0.90, 0.022, 0.008, 3),
        bnrAmberMat
      );
      frontAmberCorner.position.set(side * (hlW * 0.35), 0.0, 0.008);
      hlGroup.add(frontAmberCorner);

      // Flush clear polycarbonate outer headlight lens
      const outerGlass = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.004, hlH + 0.002, 0.016, 0.016, 3),
        headlightGlassMat
      );
      outerGlass.position.z = 0.015;
      hlGroup.add(outerGlass);

      // Wrap-around side amber corner blinker lens (extends along outer front fender corner so it's 100% visible in Side, 3/4 & Top Views!)
      const wrapAmberLens = new THREE.Mesh(
        createRoundedBoxGeometry(0.042, hlH * 0.90, 0.125, 0.012, 3),
        bnrAmberMat
      );
      wrapAmberLens.position.set(side * (hlW * 0.48), 0.0, -0.044);
      wrapAmberLens.rotation.y = side * 0.14;
      hlGroup.add(wrapAmberLens);

      // Upper body-colored headlight brow blending smoothly into the hood
      const eyelid = new THREE.Mesh(
        createRoundedBoxGeometry(hlW + 0.022, 0.020, 0.048, 0.007, 3),
        bodyMat
      );
      eyelid.position.set(0, hlH * 0.5 + 0.004, 0.004);
      eyelid.rotation.z = -side * 0.018;
      hlGroup.add(eyelid);

      chassisGroup.add(hlGroup);
    });

    // 7. Central Front-Mount Intercooler Opening with Recessed Gunmetal Core & Centered GT-R Show Plate
    const fmicFrame = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.74, 0.224, 0.048, 0.014, 3),
      darkTrimMat
    );
    fmicFrame.position.set(0, 0.308, frontZ - 0.014);
    chassisGroup.add(fmicFrame);

    const r32IcMat = getIntercoolerMaterial().clone();
    r32IcMat.color = new THREE.Color(0x687280);
    const fmicCore = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 0.68, 0.194, 0.048),
      r32IcMat
    );
    fmicCore.position.set(0, 0.304, frontZ - 0.022);
    chassisGroup.add(fmicCore);

    // Centered dark anthracite "GT-R" show plate mounted on the upper bumper beam overhang
    const r32PlateBracket = new THREE.Mesh(
      createRoundedBoxGeometry(0.228, 0.098, 0.018, 0.006, 2),
      darkTrimMat
    );
    r32PlateBracket.position.set(0, 0.362, frontZ + 0.056);
    const r32PlateFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.216, 0.088),
      new THREE.MeshStandardMaterial({
        map: tex.gtrShowPlateTex,
        roughness: 0.26,
        metalness: 0.32,
      })
    );
    r32PlateFace.position.set(0, 0.362, frontZ + 0.066);
    chassisGroup.add(r32PlateBracket, r32PlateFace);

    // 8. Lower Vertical Bumper Pillars & Twin-Slot Horizontal Side Brake Cooling Ducts
    [-1, 1].forEach((side) => {
      // Strictly bounded between lowerBumperValance (0.188) and upperBumperBar (0.452)
      const innerPillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.060, 0.254, 0.072, 0.014, 3),
        bodyMat
      );
      innerPillar.position.set(side * (halfW * 0.405), 0.318, frontZ + 0.010);
      innerPillar.rotation.z = side * 0.04;
      innerPillar.rotation.y = side * 0.08;
      chassisGroup.add(innerPillar);

      const sideDuctMesh = new THREE.Mesh(
        new THREE.BoxGeometry(halfW * 0.30, 0.215, 0.024),
        new THREE.MeshBasicMaterial({ color: 0x030508 })
      );
      sideDuctMesh.position.set(side * (halfW * 0.585), 0.316, frontZ - 0.012);
      sideDuctMesh.rotation.y = side * 0.16;
      chassisGroup.add(sideDuctMesh);

      // Horizontal body-colored splitter bar dividing each side intake into twin slots
      const vane = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.295, 0.026, 0.058, 0.007, 2),
        bodyMat
      );
      vane.position.set(side * (halfW * 0.585), 0.316, frontZ + 0.012);
      vane.rotation.y = side * 0.16;
      chassisGroup.add(vane);

      // Outer bumper cheek & side wing wrapping cleanly back to the front wheel arch
      const solidOuterCheek = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.155, 0.278, 0.145, 0.026, 3),
        bodyMat
      );
      solidOuterCheek.position.set(side * (halfW * 0.775), 0.326, frontZ - 0.054);
      solidOuterCheek.rotation.y = side * 0.22;
      chassisGroup.add(solidOuterCheek);

      const sideBumperWing = new THREE.Mesh(
        createRoundedBoxGeometry(0.042, 0.265, 0.32, 0.014, 3),
        bodyMat
      );
      sideBumperWing.position.set(side * (halfW * 0.848), 0.326, frontZ - 0.205);
      sideBumperWing.rotation.y = side * 0.06;
      chassisGroup.add(sideBumperWing);

      const sideLipExtension = new THREE.Mesh(
        createRoundedBoxGeometry(0.044, 0.036, 0.34, 0.008, 2),
        r32LipMat
      );
      sideLipExtension.position.set(side * (halfW * 0.845), 0.148, frontZ - 0.205);
      sideLipExtension.rotation.y = side * 0.06;
      chassisGroup.add(sideLipExtension);

      const sideBumperSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.020, 0.006, 0.34),
        darkTrimMat
      );
      sideBumperSeam.position.set(side * (halfW * 0.862), 0.478, frontZ - 0.200);
      sideBumperSeam.rotation.y = side * 0.06;
      chassisGroup.add(sideBumperSeam);
    });
    return;
  }

  // ==========================================================================
  // DEDICATED 2001 NISSAN SILVIA SPEC-R AERO (S15) & 1998 SILVIA K'S AERO KOUKI (S14) FRONT FASCIA
  // ==========================================================================
  if (spec.id === 'silvia_s15' || spec.id === 'silvia_s14') {
    const isS15 = spec.id === 'silvia_s15';
    const noseTopY = isS15 ? 0.562 : 0.576;
    const midBarY = isS15 ? 0.436 : 0.448;
    const hlCenterY = (noseTopY + midBarY) * 0.5 + 0.004;
    const hlH = noseTopY - midBarY - 0.012;
    const hlW = halfW * (isS15 ? 0.46 : 0.45);
    const noseHalfSpan = halfW * 0.88;
    const noseCurveZ = isS15 ? 0.096 : 0.084;
    const hlBaseZ = frontZ - 0.014;

    const sProjLensMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      emissive: 0xbae6fd,
      emissiveIntensity: 0.78,
      roughness: 0.05,
      transmission: 0,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    // 1. Dark recessed engine / radiator cavity behind bumper openings
    const backingCavity = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 1.48, 0.42, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: 0.95 })
    );
    backingCavity.position.set(0, 0.36, frontZ - 0.10);
    chassisGroup.add(backingCavity);

    // 2. Sloped Hood Leading Brow & Upper Nose Center (Grill-less Aero Nose on S15, Recessed Mesh Grille on S14 Kouki)
    const centerHoodLip = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.72, 0.026, 0.032, noseTopY, frontZ - 0.016, noseCurveZ, 0.90, 0.24),
      bodyMat
    );
    chassisGroup.add(centerHoodLip);

    const hoodShutSeam = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 0.68, 0.005, 0.034, noseTopY - 0.013, frontZ - 0.014, 0.028, 0.96, 0.24),
      darkTrimMat
    );
    chassisGroup.add(hoodShutSeam);

    if (isS15) {
      // S15 Spec-R Aero Smooth Grill-less Pearl White Nose Panel between the Swept-Back Headlights
      const s15SmoothNose = new THREE.Mesh(
        buildSculptedFasciaBar(
          halfW * 0.64,
          hlH + 0.016,
          0.046,
          hlCenterY,
          frontZ - 0.004,
          0.028,
          0.95,
          0.26
        ),
        bodyMat
      );
      chassisGroup.add(s15SmoothNose);
    } else {
      // S14 K's Aero Kouki Recessed Dark Honeycomb Mesh Grille + Emerald Green Lower Trim Bar
      const s14GrilleRecess = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.62, hlH * 0.82, 0.028, 0.006, 2),
        getGrilleMeshMaterial()
      );
      s14GrilleRecess.position.set(0, hlCenterY + 0.004, hlBaseZ - 0.006);
      chassisGroup.add(s14GrilleRecess);

      const s14LowerGrilleBar = new THREE.Mesh(
        buildSculptedFasciaBar(
          halfW * 0.64,
          0.018,
          0.036,
          midBarY + 0.014,
          hlBaseZ + 0.004,
          0.024,
          0.96,
          0.24
        ),
        bodyMat
      );
      chassisGroup.add(s14LowerGrilleBar);

      [-1, 1].forEach((gSide) => {
        const grillePillar = new THREE.Mesh(
          createRoundedBoxGeometry(0.038, hlH + 0.014, 0.042, 0.008, 2),
          bodyMat
        );
        grillePillar.position.set(gSide * (halfW * 0.318), hlCenterY, hlBaseZ + 0.002);
        chassisGroup.add(grillePillar);
      });
    }

    // 3. Main Front Bumper Beam & Integrated Aero Lower Chin Lip Spoiler
    const upperBumperBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.76, 0.068, 0.052, midBarY, frontZ + 0.008, noseCurveZ, 0.92, 0.24),
      bodyMat
    );
    chassisGroup.add(upperBumperBar);

    // Centered Front License Plate Pocket / Body-Colored Show Plate on Main Bumper Beam
    const frontPlateBlock = new THREE.Mesh(
      createRoundedBoxGeometry(0.285, 0.088, 0.022, 0.006, 2),
      bodyMat
    );
    frontPlateBlock.position.set(0, midBarY - 0.008, frontZ + 0.048);
    const frontPlateRecessLine = new THREE.Mesh(
      createRoundedBoxGeometry(0.292, 0.094, 0.018, 0.006, 2),
      darkTrimMat
    );
    frontPlateRecessLine.position.set(0, midBarY - 0.008, frontZ + 0.044);
    chassisGroup.add(frontPlateRecessLine, frontPlateBlock);

    // Lower Aero Bumper Chin Valance & Integrated Spec-R / K's Aero Lip Spoiler
    const lowerAeroChin = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.74, 0.052, 0.056, 0.172, frontZ + 0.016, noseCurveZ, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(lowerAeroChin);

    // Dark recessed center under-lip splitter tray between the outer body-colored aero lip fangs
    const centerUnderTray = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 0.84, 0.024, 0.058, 0.005, 2),
      darkTrimMat
    );
    centerUnderTray.position.set(0, 0.146, frontZ + 0.026);
    chassisGroup.add(centerUnderTray);

    [-1, 1].forEach((side) => {
      // Outer Body-Colored Aero Front Lip Fangs (signature S15 Spec-R Aero & S14 K's Aero lower corner splitters)
      const aeroCornerLip = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.44, 0.036, 0.072, 0.010, 3),
        bodyMat
      );
      const lipPt = evalFasciaCurveZ(side * (halfW * 0.62), frontZ + 0.032, noseHalfSpan, noseCurveZ);
      aeroCornerLip.position.set(side * (halfW * 0.62), 0.154, lipPt.z);
      aeroCornerLip.rotation.y = lipPt.yawY;
      chassisGroup.add(aeroCornerLip);
    });

    // 4. Bespoke Headlight Assemblies (S15 Dark-Bezel Swept Teardrop Projectors vs S14 Kouki Angry-Eye Chrome Crystal)
    [-1, 1].forEach((side) => {
      const hlX = side * (halfW * 0.565);
      const innerScale = isS15 ? 0.56 : 0.68;
      const outerScale = isS15 ? 1.15 : 1.04;
      const browSlant = isS15 ? 0.020 : 0.024;
      const sqFactor = isS15 ? 0.44 : 0.22;

      const housingMat = isS15
        ? new THREE.MeshStandardMaterial({ color: 0x151922, metalness: 0.55, roughness: 0.28 })
        : chromeMat;

      const hlHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW,
          hlH,
          0.044,
          hlX,
          hlCenterY,
          hlBaseZ + 0.004,
          noseHalfSpan,
          noseCurveZ,
          innerScale,
          outerScale,
          browSlant,
          sqFactor
        ),
        housingMat
      );
      chassisGroup.add(hlHousing);

      // Inner & Outer Projector/Reflector Optics inside each Headlight
      const innerOpticX = hlX - side * (hlW * 0.20);
      const outerOpticX = hlX + side * (hlW * 0.08);

      [
        { x: innerOpticX, r: isS15 ? 0.022 : 0.024, isMainProj: false },
        { x: outerOpticX, r: isS15 ? 0.029 : 0.026, isMainProj: true },
      ].forEach((opt) => {
        const pt = evalFasciaCurveZ(opt.x, hlBaseZ + 0.022, noseHalfSpan, noseCurveZ);
        const opticGroup = new THREE.Group();
        opticGroup.position.set(opt.x, hlCenterY - 0.002, pt.z);
        opticGroup.rotation.y = pt.yawY;

        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(opt.r * 1.12, opt.r * 0.72, 0.022, 20, 1, true),
          chromeMat
        );
        bowl.rotation.x = Math.PI * 0.5;
        bowl.position.z = -0.007;
        opticGroup.add(bowl);

        // Prominent Metallic Shroud Ring around S15 Spec-R Outer Bi-Xenon Projector
        const shroudRing = new THREE.Mesh(
          new THREE.TorusGeometry(opt.r, isS15 && opt.isMainProj ? 0.0052 : 0.0036, 12, 24),
          chromeMat
        );
        shroudRing.position.z = 0.002;
        opticGroup.add(shroudRing);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(opt.r * 0.84, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          sProjLensMat
        );
        dome.rotation.x = Math.PI * 0.5;
        dome.position.z = 0.002;
        opticGroup.add(dome);

        chassisGroup.add(opticGroup);
      });

      // Outer Corner Lamp Chamber & Wrap-Around Fender Corner Lens
      const cornerX = hlX + side * (hlW * 0.34);
      const cornerPt = evalFasciaCurveZ(cornerX, hlBaseZ + 0.022, noseHalfSpan, noseCurveZ);
      const cornerChamber = new THREE.Mesh(
        createRoundedBoxGeometry(hlW * 0.18, hlH * 0.72, 0.016, 0.006, 2),
        isS15 ? amberMat : chromeMat
      );
      cornerChamber.position.set(cornerX, hlCenterY + 0.002, cornerPt.z);
      cornerChamber.rotation.y = cornerPt.yawY;
      chassisGroup.add(cornerChamber);

      // Flush Curved Polycarbonate Headlight Cover Lens
      const hlGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW + 0.008,
          hlH + 0.004,
          0.014,
          hlX,
          hlCenterY,
          hlBaseZ + 0.026,
          noseHalfSpan,
          noseCurveZ,
          innerScale,
          outerScale,
          browSlant,
          sqFactor
        ),
        headlightGlassMat
      );
      chassisGroup.add(hlGlass);

      // Overhanging Slanted Upper Hood Eyelid / Brow
      const hlEyelid = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW + 0.012,
          0.018,
          0.034,
          hlX,
          hlCenterY + hlH * 0.48,
          hlBaseZ + 0.012,
          noseHalfSpan,
          noseCurveZ,
          1.0,
          1.0,
          browSlant,
          0.22
        ),
        bodyMat
      );
      chassisGroup.add(hlEyelid);
    });

    // 5. Central SR20DET Front-Mount Intercooler + Center Vertical Splitter Post (matches S15 & S14 Blueprints!)
    const icWidth = halfW * 0.74;
    const icHeight = 0.178;
    const icMat = new THREE.MeshStandardMaterial({
      color: 0x333b48,
      metalness: 0.78,
      roughness: 0.32,
    });
    const fmicCore = new THREE.Mesh(
      createRoundedBoxGeometry(icWidth, icHeight, 0.036, 0.008, 2),
      icMat
    );
    fmicCore.position.set(0, 0.285, frontZ - 0.006);
    chassisGroup.add(fmicCore);

    [-0.06, -0.03, 0.0, 0.03, 0.06].forEach((fy) => {
      const finBar = new THREE.Mesh(
        new THREE.BoxGeometry(icWidth * 0.94, 0.006, 0.042),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.25 })
      );
      finBar.position.set(0, 0.285 + fy, frontZ - 0.004);
      chassisGroup.add(finBar);
    });

    // Signature Vertical Center Intake Divider Post bisecting the central intercooler mouth
    const centerMouthPost = new THREE.Mesh(
      createRoundedBoxGeometry(0.020, icHeight + 0.024, 0.034, 0.005, 2),
      darkTrimMat
    );
    centerMouthPost.position.set(0, 0.288, frontZ + 0.022);
    chassisGroup.add(centerMouthPost);

    // 6. Side Bumper Pillars, Side Intakes, S14 Kouki Amber Bumper Turn Strips & S15 Outer Vertical Extraction Slots
    [-1, 1].forEach((side) => {
      // Sculpted Aero Bumper Pillar separating center intercooler mouth from side intakes
      const aeroPillar = new THREE.Mesh(
        createRoundedBoxGeometry(0.062, 0.245, 0.056, 0.014, 3),
        bodyMat
      );
      aeroPillar.position.set(side * (halfW * 0.415), 0.298, frontZ + 0.018);
      aeroPillar.rotation.y = side * 0.08;
      aeroPillar.rotation.z = -side * (isS15 ? 0.10 : 0.06);
      chassisGroup.add(aeroPillar);

      // Recessed Dark Side Intake Mouth
      const sideDuctMouth = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.29, 0.165, 0.028, 0.014, 3),
        new THREE.MeshBasicMaterial({ color: 0x04060a })
      );
      sideDuctMouth.position.set(side * (halfW * 0.595), 0.285, frontZ - 0.010);
      sideDuctMouth.rotation.y = side * 0.18;
      chassisGroup.add(sideDuctMouth);

      if (!isS15) {
        // S14 K's Aero Kouki Signature Wide Horizontal Amber Bumper Turn-Signal + Inner Fog Lamp Bar
        const s14TurnX = side * (halfW * 0.625);
        const s14TurnPt = evalFasciaCurveZ(s14TurnX, frontZ + 0.034, noseHalfSpan, noseCurveZ);
        const s14AmberBar = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.22, 0.038, 0.022, 0.006, 2),
          amberMat
        );
        s14AmberBar.position.set(s14TurnX, 0.342, s14TurnPt.z);
        s14AmberBar.rotation.y = s14TurnPt.yawY;
        chassisGroup.add(s14AmberBar);

        const s14FogX = side * (halfW * 0.485);
        const s14FogPt = evalFasciaCurveZ(s14FogX, frontZ + 0.034, noseHalfSpan, noseCurveZ);
        const s14FogLens = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.09, 0.038, 0.022, 0.005, 2),
          sProjLensMat
        );
        s14FogLens.position.set(s14FogX, 0.342, s14FogPt.z);
        s14FogLens.rotation.y = s14FogPt.yawY;
        chassisGroup.add(s14FogLens);

        // Horizontal splitter vane below the S14 Kouki amber turn bar
        const s14DuctVane = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.29, 0.020, 0.048, 0.005, 2),
          bodyMat
        );
        s14DuctVane.position.set(side * (halfW * 0.595), 0.312, s14TurnPt.z - 0.008);
        s14DuctVane.rotation.y = side * 0.18;
        chassisGroup.add(s14DuctVane);
      } else {
        // S15 Spec-R Aero Vertical Outer Bumper Extraction Vent Slot (ahead of front wheel arch, visible in 45°/90°/Side Blueprint)
        const s15SideVent = new THREE.Mesh(
          createRoundedBoxGeometry(0.026, 0.135, 0.038, 0.006, 2),
          new THREE.MeshBasicMaterial({ color: 0x04060a })
        );
        s15SideVent.position.set(side * (halfW * 0.815), 0.285, frontZ - 0.068);
        s15SideVent.rotation.y = side * 0.32;
        s15SideVent.rotation.x = 0.12;
        chassisGroup.add(s15SideVent);
      }

      // Outer bumper cheek & full-depth side bumper wing wrapping cleanly back to the front wheel arch
      const solidOuterCheek = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.155, 0.265, 0.145, 0.026, 3),
        bodyMat
      );
      solidOuterCheek.position.set(side * (halfW * 0.775), 0.312, frontZ - 0.056);
      solidOuterCheek.rotation.y = side * 0.22;
      chassisGroup.add(solidOuterCheek);

      const sideBumperWing = new THREE.Mesh(
        createRoundedBoxGeometry(0.042, 0.255, 0.32, 0.014, 3),
        bodyMat
      );
      sideBumperWing.position.set(side * (halfW * 0.848), 0.312, frontZ - 0.205);
      sideBumperWing.rotation.y = side * 0.06;
      chassisGroup.add(sideBumperWing);

      const sideLipExtension = new THREE.Mesh(
        createRoundedBoxGeometry(0.044, 0.036, 0.34, 0.008, 2),
        bodyMat
      );
      sideLipExtension.position.set(side * (halfW * 0.845), 0.154, frontZ - 0.205);
      sideLipExtension.rotation.y = side * 0.06;
      chassisGroup.add(sideLipExtension);
    });
    return;
  }

  // ==========================================================================
  // MODEL-SPECIFIC FRONT FASCIAS & HEADLIGHTS FOR ALL OTHER 21 ICONIC VEHICLES
  // ==========================================================================
  const sil = spec.silhouette;
  const hasPopUps = Boolean(spec.hasPopUpHeadlights);
  const isMidExotic = sil === 'f40_super_wedge' || sil === 'nsx_mid_wedge';
  const isLowNose =
    isMidExotic || sil === 'rx7_fluid_coupe' || sil === 'ae86_hatch_coupe' || spec.id === 'mx5_miata';
  const isCoupeNose =
    sil === 'supra_aero_coupe' || sil === 's15_sleek_coupe' || sil === 'z33_fastback' || sil === 's2000_roadster';

  // Sample exact front spline station height so hood lip, bumper & headlights lock 100% flush with the hood!
  const stNose = sampleLongitudinalTable(controlStations, 0.470);
  const defaultNoseY = isMidExotic ? 0.468 : isLowNose ? 0.542 : isCoupeNose ? 0.595 : 0.648;
  const noseTopY = Math.min(0.658, Math.max(0.465, stNose.hoodCenterY * 0.88 + defaultNoseY * 0.12));
  const midBarY = Math.max(0.365, noseTopY - (hasPopUps ? 0.108 : 0.134));
  const bumperMainMat = spec.isTwoTonePanda ? darkTrimMat : bodyMat;
  const isR32Gtr = spec.id === 'r32_gtr';

  // Recessed dark radiator / engine bay backing plane
  const backingCavity = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.38, noseTopY - 0.16, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.92 })
  );
  backingCavity.position.set(0, (noseTopY + 0.16) * 0.5, frontZ - 0.11);
  chassisGroup.add(backingCavity);

  // Sculpted Hood Front Brow at each car's exact nose height (tucked cleanly into hood leading edge on BNR32)
  const centerHoodLip = new THREE.Mesh(
    buildSculptedFasciaBar(
      halfW * (isR32Gtr ? 1.76 : 1.80),
      0.030,
      isR32Gtr ? 0.028 : 0.050,
      noseTopY,
      frontZ - (isR32Gtr ? 0.020 : 0.002),
      0.088,
      0.92,
      0.28
    ),
    bodyMat
  );
  chassisGroup.add(centerHoodLip);

  // Main Front Bumper Bar (projects forward below headlights on BNR32 for authentic stepped bumper profile)
  const upperBumperBar = new THREE.Mesh(
    buildSculptedFasciaBar(
      halfW * 1.84,
      0.072,
      isR32Gtr ? 0.048 : 0.060,
      midBarY,
      frontZ + 0.004,
      0.095,
      0.94,
      0.28
    ),
    bumperMainMat
  );
  chassisGroup.add(upperBumperBar);

  // Lower Front Bumper Chin Valance
  const lowerBumperValance = new THREE.Mesh(
    buildSculptedFasciaBar(
      halfW * 1.76,
      0.054,
      isR32Gtr ? 0.046 : 0.056,
      0.184,
      frontZ + (isR32Gtr ? 0.004 : 0.008),
      0.088,
      0.92,
      0.28
    ),
    bumperMainMat
  );
  chassisGroup.add(lowerBumperValance);

  // Smooth Rounded Outer Bumper Cheeks connecting nose to wheel arches (tucked cleanly into curved bumper profile)
  [-1, 1].forEach((side) => {
    const cheekH = midBarY - 0.17;
    const solidOuterCheek = new THREE.Mesh(
      createRoundedBoxGeometry(isR32Gtr ? halfW * 0.105 : halfW * 0.145, cheekH, 0.105, 0.024, 3),
      bumperMainMat
    );
    solidOuterCheek.position.set(
      side * (halfW * (isR32Gtr ? 0.745 : 0.772)),
      0.17 + cheekH * 0.5,
      frontZ - (isR32Gtr ? 0.078 : 0.058)
    );
    solidOuterCheek.rotation.y = side * 0.28;
    chassisGroup.add(solidOuterCheek);
  });

  const projectorLensMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    emissive: 0xbae6fd,
    emissiveIntensity: 0.85,
    roughness: 0.05,
    transmission: 0,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.4,
    roughness: 0.1,
  });

  const yellowFogMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 1.8,
    roughness: 0.12,
  });

  // --------------------------------------------------------------------------
  // A. POP-UP HEADLIGHT CARS (RX-7 FD/FC, AE86, 180SX, NSX, F40, Miata)
  //    CRITICAL: NO fixed upper headlights here -> ZERO duplicate headlights!
  // --------------------------------------------------------------------------
  if (hasPopUps) {
    const sleekNoseFill = new THREE.Mesh(
      buildSculptedFasciaBar(
        halfW * 1.78,
        noseTopY - midBarY + 0.02,
        0.048,
        (noseTopY + midBarY) * 0.5,
        frontZ - 0.006,
        0.092,
        0.92,
        0.30
      ),
      spec.isTwoTonePanda ? darkTrimMat : bodyMat
    );
    chassisGroup.add(sleekNoseFill);

    const noseHalfSpan = halfW * 0.92;
    const noseCurveZ = 0.095;

    // Flush retracted pop-up headlight hood lid shut-line seams on the sloped front hood
    [-1, 1].forEach((side) => {
      const lidSurf = sampleVehicleTopSurface(controlStations, spec, 0.434, side * 0.58);
      const lidW = halfW * 0.36;
      const lidD = 0.175;
      // 3.5mm perimeter shut-line around retracted pop-up headlight door (contour-matched to hood pitch & lateral roll)
      const lidFrameGroup = new THREE.Group();
      lidFrameGroup.position.set(lidSurf.x, lidSurf.y + 0.0018, lidSurf.z);
      lidFrameGroup.rotation.x = lidSurf.pitchX;
      lidFrameGroup.rotation.z = -side * 0.042;

      [-1, 1].forEach((sEdge) => {
        const fbSeam = new THREE.Mesh(
          new THREE.BoxGeometry(lidW, 0.0022, 0.0038),
          darkTrimMat
        );
        fbSeam.position.set(0, 0, sEdge * (lidD * 0.5));
        const lrSeam = new THREE.Mesh(
          new THREE.BoxGeometry(0.0038, 0.0022, lidD),
          darkTrimMat
        );
        lrSeam.position.set(sEdge * (lidW * 0.5), 0, 0);
        lidFrameGroup.add(fbSeam, lrSeam);
      });
      chassisGroup.add(lidFrameGroup);

      if (spec.id === 'ferrari_f40') {
        // Ferrari F40 Contoured Recessed Driving / Fog Buckets under Flush Clear Lexan Covers
        const f40X = side * (halfW * 0.56);
        const f40Y = midBarY + 0.022;
        const f40Bucket = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            halfW * 0.38,
            0.050,
            0.036,
            f40X,
            f40Y,
            frontZ - 0.002,
            noseHalfSpan,
            noseCurveZ,
            0.84,
            1.04,
            0.006,
            0.26
          ),
          darkTrimMat
        );
        chassisGroup.add(f40Bucket);

        const fogPos = evalFasciaCurveZ(
          side * (halfW * 0.49),
          frontZ + 0.008,
          noseHalfSpan,
          noseCurveZ
        );
        const f40Reflector = new THREE.Mesh(
          new THREE.CylinderGeometry(0.020, 0.014, 0.016, 20, 1, true),
          chromeMat
        );
        f40Reflector.rotation.x = Math.PI * 0.5;
        f40Reflector.rotation.z = -fogPos.yawY;
        f40Reflector.position.set(side * (halfW * 0.49), f40Y, fogPos.z - 0.003);
        const f40Fog = new THREE.Mesh(
          new THREE.SphereGeometry(0.017, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          projectorLensMat
        );
        f40Fog.rotation.x = Math.PI * 0.5;
        f40Fog.position.set(side * (halfW * 0.49), f40Y, fogPos.z);

        const turnPos = evalFasciaCurveZ(
          side * (halfW * 0.63),
          frontZ + 0.008,
          noseHalfSpan,
          noseCurveZ
        );
        const f40Turn = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.12, 0.030, 0.016, 0.005, 2),
          amberMat
        );
        f40Turn.position.set(side * (halfW * 0.63), f40Y, turnPos.z);
        f40Turn.rotation.y = turnPos.yawY;

        const f40Lexan = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            halfW * 0.386,
            0.052,
            0.012,
            f40X,
            f40Y,
            frontZ + 0.014,
            noseHalfSpan,
            noseCurveZ,
            0.84,
            1.04,
            0.006,
            0.26
          ),
          headlightGlassMat
        );
        chassisGroup.add(f40Reflector, f40Fog, f40Turn, f40Lexan);
      } else if (spec.id === 'rx7_fc') {
        // Mazda RX-7 FC3S Upper Nose "Flash-to-Pass" Smoked Lenses + Lower Bumper Turn Signal Bars
        const ftpX = side * (halfW * 0.46);
        const ftpY = (noseTopY + midBarY) * 0.5 + 0.004;
        const ftpLens = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            halfW * 0.24,
            0.030,
            0.018,
            ftpX,
            ftpY,
            frontZ + 0.012,
            noseHalfSpan,
            0.092,
            0.95,
            0.95,
            0.0,
            0.24
          ),
          darkTrimMat
        );
        const ftpGlass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            halfW * 0.22,
            0.024,
            0.012,
            ftpX,
            ftpY,
            frontZ + 0.018,
            noseHalfSpan,
            0.092,
            0.95,
            0.95,
            0.0,
            0.24
          ),
          headlightGlassMat
        );
        chassisGroup.add(ftpLens, ftpGlass);
      }

      if (spec.id !== 'ferrari_f40') {
        // Contoured 3D Front Bumper Combination Position / Turn Signal Assemblies
        const turnLampW =
          spec.id === 'nsx_na1'
            ? halfW * 0.44
            : spec.id === 'rx7_fd'
              ? halfW * 0.32
              : halfW * 0.28;
        const turnLampH =
          spec.id === 'rx7_fd' || spec.id === 'mx5_miata' ? 0.044 : 0.036;
        const turnX = side * (halfW * 0.54);
        const turnY = midBarY - 0.010;
        const isOvalCapsule =
          spec.id === 'rx7_fd' || spec.id === 'mx5_miata' || spec.id === 'nissan_180sx';

        const turnHousing = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            turnLampW + 0.014,
            turnLampH + 0.010,
            0.028,
            turnX,
            turnY,
            frontZ + 0.016,
            noseHalfSpan,
            noseCurveZ,
            isOvalCapsule ? 0.82 : 0.96,
            isOvalCapsule ? 0.94 : 0.98,
            0.0,
            isOvalCapsule ? 0.55 : 0.24
          ),
          darkTrimMat
        );
        chassisGroup.add(turnHousing);

        // Internal 3D Amber Turn Reflector + White Position Dome
        const outerOpticX = side * (halfW * 0.54 + turnLampW * 0.22);
        const innerOpticX = side * (halfW * 0.54 - turnLampW * 0.22);
        const outerCurve = evalFasciaCurveZ(
          outerOpticX,
          frontZ + 0.026,
          noseHalfSpan,
          noseCurveZ
        );
        const innerCurve = evalFasciaCurveZ(
          innerOpticX,
          frontZ + 0.026,
          noseHalfSpan,
          noseCurveZ
        );

        const turnAmberChamber = new THREE.Mesh(
          createRoundedBoxGeometry(turnLampW * 0.44, turnLampH * 0.80, 0.014, 0.006, 2),
          amberMat
        );
        turnAmberChamber.position.set(outerOpticX, turnY, outerCurve.z);
        turnAmberChamber.rotation.y = outerCurve.yawY;
        chassisGroup.add(turnAmberChamber);

        const posDome = new THREE.Mesh(
          new THREE.SphereGeometry(turnLampH * 0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          projectorLensMat
        );
        posDome.rotation.x = Math.PI * 0.5;
        posDome.position.set(innerOpticX, turnY, innerCurve.z);
        chassisGroup.add(posDome);

        const turnCoverGlass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            turnLampW + 0.004,
            turnLampH + 0.002,
            0.012,
            turnX,
            turnY,
            frontZ + 0.028,
            noseHalfSpan,
            noseCurveZ,
            isOvalCapsule ? 0.82 : 0.96,
            isOvalCapsule ? 0.94 : 0.98,
            0.0,
            isOvalCapsule ? 0.55 : 0.24
          ),
          headlightGlassMat
        );
        chassisGroup.add(turnCoverGlass);
      }
    });

    // Model-specific lower intakes for Pop-Up cars
    if (spec.id === 'ae86_trueno') {
      const truenoSlot = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.56, 0.028, 0.025, 0.006, 2),
        darkTrimMat
      );
      truenoSlot.position.set(0, (noseTopY + midBarY) * 0.5, frontZ + 0.012);
      chassisGroup.add(truenoSlot);

      const lowerGrille = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.88, 0.135, 0.035, 0.012, 2),
        getGrilleMeshMaterial()
      );
      lowerGrille.position.set(0, 0.285, frontZ - 0.008);
      chassisGroup.add(lowerGrille);

      // Kouki AE86 Recessed Yellow JDM Fog Lamps flanking lower grille
      [-1, 1].forEach((side) => {
        const fogBezel = new THREE.Mesh(
          createRoundedBoxGeometry(0.082, 0.048, 0.024, 0.006, 2),
          darkTrimMat
        );
        fogBezel.position.set(side * (halfW * 0.36), 0.305, frontZ + 0.006);
        const fogLens = new THREE.Mesh(
          createRoundedBoxGeometry(0.068, 0.038, 0.026, 0.005, 2),
          yellowFogMat
        );
        fogLens.position.set(side * (halfW * 0.36), 0.305, frontZ + 0.008);
        chassisGroup.add(fogBezel, fogLens);
      });
    } else if (spec.id === 'mx5_miata') {
      const ovalMouth = new THREE.Mesh(
        buildSculptedFasciaBar(halfW * 0.92, 0.145, 0.035, 0.295, frontZ - 0.004, 0.04, 0.45, 0.65),
        getGrilleMeshMaterial()
      );
      chassisGroup.add(ovalMouth);
    } else if (spec.id === 'ferrari_f40' || spec.id === 'nsx_na1') {
      const exoticMouth = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 1.15, 0.145, 0.035, 0.016, 2),
        getGrilleMeshMaterial()
      );
      exoticMouth.position.set(0, 0.275, frontZ - 0.010);
      chassisGroup.add(exoticMouth);
    } else {
      const icMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.24,
      });
      const fmic = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.70, 0.172, 0.042, 0.012, 2),
        icMat
      );
      fmic.position.set(0, 0.295, frontZ - 0.016);
      chassisGroup.add(fmic);

      [-0.06, -0.03, 0, 0.03, 0.06].forEach((fy) => {
        const finTube = new THREE.Mesh(
          new THREE.BoxGeometry(halfW * 0.66, 0.008, 0.048),
          chromeMat
        );
        finTube.position.set(0, 0.295 + fy, frontZ - 0.014);
        chassisGroup.add(finTube);
      });

      [-1, 1].forEach((side) => {
        const sideDuct = new THREE.Mesh(
          createRoundedBoxGeometry(
            halfW * 0.28,
            0.142,
            0.035,
            spec.id === 'rx7_fd' ? 0.032 : 0.012,
            3
          ),
          getGrilleMeshMaterial()
        );
        sideDuct.position.set(side * (halfW * 0.58), 0.295, frontZ - 0.012);
        sideDuct.rotation.y = side * 0.16;
        chassisGroup.add(sideDuct);
      });
    }
  } else {
    // ------------------------------------------------------------------------
    // B. FIXED-HEADLIGHT VEHICLES (Contoured 3D Housings, Reflector Bowls & Projectors)
    // ------------------------------------------------------------------------
    const hlCenterY = (noseTopY + midBarY) * 0.5 + 0.006;
    const hlH = Math.max(0.078, noseTopY - midBarY - 0.014);
    const hlW = halfW * 0.445;
    const noseHalfSpan = halfW * 0.92;
    const noseCurveZ = 0.090;
    const hlBaseZ = isR32Gtr ? frontZ - 0.018 : frontZ;

    // 1. Center Upper Grille / Nose Design
    if (spec.manufacturer === 'BMW') {
      if (spec.id === 'bmw_m3_e30') {
        const e30GrilleBar = new THREE.Mesh(
          buildSculptedFasciaBar(
            halfW * 1.68,
            hlH + 0.014,
            0.036,
            hlCenterY,
            frontZ - 0.004,
            noseCurveZ,
            0.96,
            0.22
          ),
          darkTrimMat
        );
        chassisGroup.add(e30GrilleBar);
      }
      [-1, 1].forEach((side) => {
        const kW = spec.id === 'bmw_m3_e30' ? halfW * 0.14 : halfW * 0.24;
        const kX = spec.id === 'bmw_m3_e30' ? side * (halfW * 0.085) : side * (halfW * 0.15);
        const kidneyFrame = new THREE.Mesh(
          createRoundedBoxGeometry(kW, hlH + 0.01, 0.034, 0.012, 3),
          chromeMat
        );
        kidneyFrame.position.set(kX, hlCenterY, frontZ + 0.004);
        const kidneyCore = new THREE.Mesh(
          createRoundedBoxGeometry(kW * 0.84, hlH - 0.012, 0.038, 0.008, 2),
          darkTrimMat
        );
        kidneyCore.position.set(kX, hlCenterY, frontZ + 0.006);
        chassisGroup.add(kidneyFrame, kidneyCore);
      });
    } else if (
      spec.id === 'supra_mk4' ||
      spec.id === 'supra_mk5' ||
      spec.id === 'fairlady_350z' ||
      spec.id === 'nissan_370z' ||
      spec.id === 'toyota_gr86' ||
      spec.id === 'honda_s2000'
    ) {
      const closedNose = new THREE.Mesh(
        buildSculptedFasciaBar(
          halfW * 0.68,
          hlH + 0.018,
          0.048,
          hlCenterY,
          frontZ - 0.002,
          0.025,
          0.95,
          0.26
        ),
        bodyMat
      );
      chassisGroup.add(closedNose);

      if (spec.id === 'supra_mk5') {
        const f1NoseCone = new THREE.Mesh(
          createRoundedBoxGeometry(0.14, 0.19, 0.075, 0.025, 3),
          bodyMat
        );
        f1NoseCone.position.set(0, midBarY - 0.05, frontZ + 0.018);
        chassisGroup.add(f1NoseCone);
      }

      const badgeColor =
        spec.id === 'honda_s2000'
          ? new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.5, roughness: 0.2 })
          : chromeMat;
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.012, 16), badgeColor);
      badge.rotation.x = Math.PI * 0.5;
      badge.position.set(0, hlCenterY + 0.01, frontZ + 0.018);
      chassisGroup.add(badge);
    } else if (spec.id === 'lancer_evo10') {
      const mawFrame = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.82, 0.36, 0.042, 0.016, 3),
        chromeMat
      );
      mawFrame.position.set(0, 0.41, frontZ + 0.004);
      const mawCore = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.76, 0.33, 0.046, 0.012, 2),
        getGrilleMeshMaterial()
      );
      mawCore.position.set(0, 0.41, frontZ + 0.006);
      chassisGroup.add(mawFrame, mawCore);
    } else if (spec.id === 'wrx_sti') {
      const centerWingFrame = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.24, hlH + 0.032, 0.044, 0.014, 3),
        bodyMat
      );
      centerWingFrame.position.set(0, hlCenterY - 0.006, frontZ + 0.006);
      const centerWingMesh = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.20, hlH + 0.010, 0.048, 0.010, 2),
        getGrilleMeshMaterial()
      );
      centerWingMesh.position.set(0, hlCenterY - 0.006, frontZ + 0.008);
      chassisGroup.add(centerWingFrame, centerWingMesh);

      [-1, 1].forEach((side) => {
        const sideWingMesh = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.18, hlH * 0.78, 0.036, 0.008, 2),
          getGrilleMeshMaterial()
        );
        sideWingMesh.position.set(side * (halfW * 0.22), hlCenterY - 0.004, frontZ - 0.002);
        chassisGroup.add(sideWingMesh);
      });
    } else {
      [-1, 1].forEach((side) => {
        const grillePillar = new THREE.Mesh(
          createRoundedBoxGeometry(0.052, hlH + 0.02, 0.052, 0.010, 2),
          bodyMat
        );
        grillePillar.position.set(side * (halfW * 0.335), hlCenterY, hlBaseZ + 0.002);
        chassisGroup.add(grillePillar);
      });

      const upperGrille = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.62, hlH, 0.030, 0.008, 2),
        getGrilleMeshMaterial()
      );
      upperGrille.position.set(0, hlCenterY, hlBaseZ - 0.010);
      chassisGroup.add(upperGrille);

      if (spec.id === 'r32_gtr') {
        // Signature 1994 BNR32 3-Slat Open Gun Grey Front Grille
        [-0.024, 0, 0.024].forEach((gy) => {
          const slat = new THREE.Mesh(
            buildSculptedFasciaBar(
              halfW * 0.61,
              0.011,
              0.018,
              hlCenterY + gy,
              hlBaseZ + 0.010,
              0.018,
              0.96,
              0.24
            ),
            bodyMat
          );
          chassisGroup.add(slat);
        });

        // Iconic BNR32 N1 / V-Spec II Dual Rectangular Cooling Slots on the outer face of upperBumperBar (z = frontZ + 0.052)
        [-1, 1].forEach((nSide) => {
          const slotX = nSide * (halfW * 0.165);
          const slotPt = evalFasciaCurveZ(slotX, frontZ + 0.052, noseHalfSpan, 0.095);
          const slotGroup = new THREE.Group();
          slotGroup.position.set(slotX, midBarY + 0.002, slotPt.z);
          slotGroup.rotation.y = slotPt.yawY;

          const slotBezel = new THREE.Mesh(
            createRoundedBoxGeometry(halfW * 0.21, 0.032, 0.014, 0.005, 2),
            darkTrimMat
          );
          const slotThroat = new THREE.Mesh(
            createRoundedBoxGeometry(halfW * 0.185, 0.020, 0.016, 0.003, 2),
            new THREE.MeshBasicMaterial({ color: 0x04060a })
          );
          slotThroat.position.z = 0.002;
          slotGroup.add(slotBezel, slotThroat);
          chassisGroup.add(slotGroup);
        });
      } else if (spec.id === 'lancer_evo9') {
        const evoNoseTri = new THREE.Mesh(
          createRoundedBoxGeometry(0.11, hlH, 0.038, 0.012, 2),
          bodyMat
        );
        evoNoseTri.position.set(0, hlCenterY, frontZ + 0.002);
        chassisGroup.add(evoNoseTri);
      } else if (spec.id === 'civic_typer') {
        const wingBar = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.64, 0.028, 0.038, 0.006, 2),
          darkTrimMat
        );
        wingBar.position.set(0, hlCenterY + 0.012, frontZ + 0.004);
        const redH = new THREE.Mesh(
          createRoundedBoxGeometry(0.044, 0.038, 0.018, 0.004, 2),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4, roughness: 0.2 })
        );
        redH.position.set(0, hlCenterY + 0.012, frontZ + 0.012);
        chassisGroup.add(wingBar, redH);
      } else if (spec.id === 'chaser_jzx100') {
        const tourerBar = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.60, 0.014, 0.036, 0.004, 2),
          chromeMat
        );
        tourerBar.position.set(0, hlCenterY, frontZ + 0.002);
        chassisGroup.add(tourerBar);
      }
    }

    // Helper to add a 3D recessed reflector cup + chrome ring + spherical glass projector dome on the curved nose
    const addCurvedProjectorOptic = (
      xPos: number,
      yPos: number,
      radius: number,
      lensMat: THREE.Material,
      withReflectorBowl = true
    ) => {
      const pt = evalFasciaCurveZ(xPos, hlBaseZ + 0.026, noseHalfSpan, noseCurveZ);
      const opticGroup = new THREE.Group();
      opticGroup.position.set(xPos, yPos, pt.z);
      opticGroup.rotation.y = pt.yawY;

      if (withReflectorBowl) {
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.12, radius * 0.72, 0.024, 20, 1, true),
          chromeMat
        );
        bowl.rotation.x = Math.PI * 0.5;
        bowl.position.z = -0.008;
        opticGroup.add(bowl);
      }

      const bezelRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.0038, 12, 24),
        chromeMat
      );
      bezelRing.position.z = 0.002;
      opticGroup.add(bezelRing);

      const lensDome = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        lensMat
      );
      lensDome.rotation.x = Math.PI * 0.5;
      lensDome.position.z = 0.002;
      opticGroup.add(lensDome);

      chassisGroup.add(opticGroup);
    };

    // 2. Bespoke Model-Specific 3D Contoured Headlight Assemblies
    [-1, 1].forEach((side) => {
      const hlX = side * (halfW * 0.575);

      // Flush outer fender cheek bridging headlight outer corner to the front wheel arch
      const outerCheekPt = evalFasciaCurveZ(
        side * (halfW * 0.81),
        hlBaseZ + 0.006,
        noseHalfSpan,
        noseCurveZ
      );
      const outerHlCheek = new THREE.Mesh(
        createRoundedBoxGeometry(0.056, hlH + 0.022, 0.095, 0.016, 3),
        bodyMat
      );
      outerHlCheek.position.set(side * (halfW * 0.81), hlCenterY, outerCheekPt.z - 0.028);
      outerHlCheek.rotation.y = outerCheekPt.yawY;
      chassisGroup.add(outerHlCheek);

      if (spec.id === 'bmw_m3_e30') {
        // BMW E30 Quad Round Sealed-Beam Glass Headlights recessed into the dark E30 grille bar
        [0.44, 0.65].forEach((rx) => {
          addCurvedProjectorOptic(side * (halfW * rx), hlCenterY, 0.036, projectorLensMat, true);
        });
        // E30 Recessed Front Bumper Amber Turn Signal
        const e30TurnPt = evalFasciaCurveZ(
          side * (halfW * 0.58),
          frontZ + 0.042,
          noseHalfSpan,
          noseCurveZ
        );
        const e30Turn = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.24, 0.028, 0.018, 0.005, 2),
          amberMat
        );
        e30Turn.position.set(side * (halfW * 0.58), midBarY, e30TurnPt.z);
        e30Turn.rotation.y = e30TurnPt.yawY;
        chassisGroup.add(e30Turn);
        return;
      }

      if (spec.id === 'supra_mk4') {
        // Toyota Supra JZA80: Contoured Rounded-Stadium Graphite Housing with 3 Graduated Projector Pods
        const jzaHousing = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 0.98,
            hlH + 0.008,
            0.048,
            hlX,
            hlCenterY + 0.002,
            frontZ + 0.008,
            noseHalfSpan,
            noseCurveZ,
            0.84,
            1.04,
            0.008,
            0.52
          ),
          darkTrimMat
        );
        chassisGroup.add(jzaHousing);

        [-0.27, 0.0, 0.27].forEach((px, idx) => {
          const r = idx === 1 ? 0.027 : 0.022;
          addCurvedProjectorOptic(
            hlX - side * (hlW * px),
            hlCenterY + 0.002,
            r,
            projectorLensMat,
            true
          );
        });

        const jzaGlass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 1.00,
            hlH + 0.010,
            0.018,
            hlX,
            hlCenterY + 0.002,
            frontZ + 0.032,
            noseHalfSpan,
            noseCurveZ,
            0.84,
            1.04,
            0.008,
            0.52
          ),
          headlightGlassMat
        );
        chassisGroup.add(jzaGlass);

        // Contoured JZA80 Lower Bumper Combination Turn/Aux Lamp Strip
        const auxStrip = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 0.62,
            0.028,
            0.020,
            side * (halfW * 0.61),
            midBarY - 0.014,
            frontZ + 0.038,
            noseHalfSpan,
            noseCurveZ,
            0.90,
            0.95,
            0.0,
            0.38
          ),
          amberMat
        );
        chassisGroup.add(auxStrip);
        return;
      }

      if (spec.id === 'supra_mk5') {
        // Toyota GR Supra A90: Contoured Teardrop 6-LED Matrix Cluster + Lower L-Blade DRL
        const a90Housing = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 1.04,
            hlH * 0.90,
            0.046,
            hlX,
            hlCenterY,
            frontZ + 0.008,
            noseHalfSpan,
            noseCurveZ,
            0.58,
            1.08,
            0.014,
            0.34
          ),
          darkTrimMat
        );
        chassisGroup.add(a90Housing);

        [-0.26, 0.0, 0.26].forEach((px, idx) => {
          const podX = hlX + side * (hlW * px);
          const podY = hlCenterY + px * 0.006;
          addCurvedProjectorOptic(
            podX,
            podY,
            idx === 2 ? 0.022 : 0.019,
            projectorLensMat,
            true
          );
        });

        const drlBlade = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 1.08,
            0.013,
            0.016,
            hlX - side * 0.015,
            hlCenterY - hlH * 0.34,
            frontZ + 0.034,
            noseHalfSpan,
            noseCurveZ,
            0.85,
            1.0,
            0.012,
            0.25
          ),
          ledStripMat
        );
        const a90Glass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 1.05,
            hlH * 0.92,
            0.016,
            hlX,
            hlCenterY,
            frontZ + 0.032,
            noseHalfSpan,
            noseCurveZ,
            0.58,
            1.08,
            0.014,
            0.34
          ),
          headlightGlassMat
        );
        chassisGroup.add(drlBlade, a90Glass);
        return;
      }

      if (
        spec.id === 'fairlady_350z' ||
        spec.id === 'nissan_370z' ||
        spec.id === 'toyota_gr86'
      ) {
        // Fender-Contoured Swept-Back Headlights (aligned to actual fender spline surface, never sticking out!)
        const zHlX = side * (halfW * 0.61);
        const zInnerH = spec.id === 'toyota_gr86' ? 0.72 : 0.78;
        const zOuterH = spec.id === 'nissan_370z' ? 1.18 : 1.08;
        const zSlant = spec.id === 'nissan_370z' ? 0.022 : 0.014;

        const zHousing = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 0.92,
            hlH * 0.96,
            0.052,
            zHlX,
            hlCenterY + 0.004,
            frontZ + 0.004,
            noseHalfSpan,
            noseCurveZ,
            zInnerH,
            zOuterH,
            zSlant,
            0.38
          ),
          spec.id === 'fairlady_350z' ? chromeMat : darkTrimMat
        );
        chassisGroup.add(zHousing);

        // Main Bi-Xenon Projector + Inner High-Beam / Turn Element following curved housing
        addCurvedProjectorOptic(
          zHlX + side * (hlW * 0.10),
          hlCenterY + 0.008,
          0.025,
          projectorLensMat,
          true
        );
        addCurvedProjectorOptic(
          zHlX - side * (hlW * 0.18),
          hlCenterY - 0.006,
          0.019,
          spec.id === 'fairlady_350z' ? amberMat : projectorLensMat,
          true
        );

        if (spec.id === 'nissan_370z' || spec.id === 'toyota_gr86') {
          const drlStrip = new THREE.Mesh(
            buildContouredLampClusterGeometry(
              hlW * 0.86,
              0.014,
              0.016,
              zHlX,
              hlCenterY - hlH * 0.34,
              frontZ + 0.032,
              noseHalfSpan,
              noseCurveZ,
              0.9,
              1.1,
              0.018,
              0.28
            ),
            ledStripMat
          );
          chassisGroup.add(drlStrip);
        }

        const zGlass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 0.94,
            hlH * 0.98,
            0.018,
            zHlX,
            hlCenterY + 0.004,
            frontZ + 0.030,
            noseHalfSpan,
            noseCurveZ,
            zInnerH,
            zOuterH,
            zSlant,
            0.38
          ),
          headlightGlassMat
        );
        chassisGroup.add(zGlass);
        return;
      }

      // Vehicle-Specific Silhouette Taper Parameters for Front-Facing Sculpted Headlights
      const innerScale =
        spec.id === 'silvia_s15'
          ? 0.66
          : spec.id === 'silvia_s14'
            ? 0.72
            : spec.id === 'wrx_sti'
              ? 0.76
              : spec.id === 'honda_s2000' || spec.id === 'civic_typer'
                ? 0.78
                : spec.id === 'lancer_evo10'
                  ? 0.82
                  : 0.92;
      const outerScale =
        spec.id === 'silvia_s15' || spec.id === 'wrx_sti'
          ? 1.12
          : spec.id === 'silvia_s14' || spec.id === 'lancer_evo10' || spec.id === 'civic_typer'
            ? 1.06
            : 1.00;
      const browSlant =
        spec.id === 'silvia_s15' || spec.id === 'silvia_s14'
          ? 0.018
          : spec.id === 'lancer_evo10' || spec.id === 'civic_typer' || spec.id === 'wrx_sti'
            ? 0.014
            : 0.004;
      const shapeSquareness =
        spec.id === 'silvia_s15' || spec.id === 'wrx_sti' || spec.id === 'honda_s2000'
          ? 0.44
          : 0.26;
      const housingMat =
        spec.id === 'chaser_jzx100' || spec.id === 'wrx_sti' || spec.id === 'r32_gtr'
          ? chromeMat
          : darkTrimMat;

      // 3D Contoured Recessed Headlight Housing (curves smoothly along the nose)
      const contouredHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW + 0.010,
          hlH + 0.006,
          0.048,
          hlX,
          hlCenterY,
          hlBaseZ + 0.006,
          noseHalfSpan,
          noseCurveZ,
          innerScale,
          outerScale,
          browSlant,
          shapeSquareness
        ),
        housingMat
      );
      chassisGroup.add(contouredHousing);

      if (spec.id === 'bmw_m3_e46') {
        // Iconic BMW M3 E46 Dual Glowing Angel-Eye Halo Rings + Xenon Projectors + Corner Blinker
        [-0.18, 0.12].forEach((px) => {
          const haloX = hlX - side * (hlW * px);
          const pt = evalFasciaCurveZ(haloX, frontZ + 0.028, noseHalfSpan, noseCurveZ);
          const haloGroup = new THREE.Group();
          haloGroup.position.set(haloX, hlCenterY, pt.z);
          haloGroup.rotation.y = pt.yawY;

          const bowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.018, 0.022, 20, 1, true),
            darkTrimMat
          );
          bowl.rotation.x = Math.PI * 0.5;
          bowl.position.z = -0.008;
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.025, 0.0042, 12, 24),
            yellowFogMat
          );
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
            projectorLensMat
          );
          core.rotation.x = Math.PI * 0.5;
          haloGroup.add(bowl, halo, core);
          chassisGroup.add(haloGroup);
        });

        const turnX = hlX + side * (hlW * 0.37);
        const turnPt = evalFasciaCurveZ(turnX, frontZ + 0.026, noseHalfSpan, noseCurveZ);
        const cornerTurn = new THREE.Mesh(
          createRoundedBoxGeometry(hlW * 0.21, hlH * 0.84, 0.016, 0.006, 2),
          amberMat
        );
        cornerTurn.position.set(turnX, hlCenterY, turnPt.z);
        cornerTurn.rotation.y = turnPt.yawY;
        chassisGroup.add(cornerTurn);
      } else if (spec.id === 'civic_typer') {
        // Civic Type R FK8 Multi-Element Jewel-Eye LED Array + Upper LED DRL Blade
        [-0.28, -0.08, 0.12].forEach((px) => {
          const jX = hlX - side * (hlW * px);
          const pt = evalFasciaCurveZ(jX, frontZ + 0.028, noseHalfSpan, noseCurveZ);
          const jewelBezel = new THREE.Mesh(
            createRoundedBoxGeometry(0.034, 0.030, 0.016, 0.004, 2),
            chromeMat
          );
          jewelBezel.position.set(jX, hlCenterY - 0.003, pt.z - 0.002);
          jewelBezel.rotation.y = pt.yawY;
          const jewel = new THREE.Mesh(
            createRoundedBoxGeometry(0.028, 0.024, 0.016, 0.004, 2),
            projectorLensMat
          );
          jewel.position.set(jX, hlCenterY - 0.003, pt.z);
          jewel.rotation.y = pt.yawY;
          chassisGroup.add(jewelBezel, jewel);
        });
        const ledBrow = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            hlW * 0.94,
            0.011,
            0.016,
            hlX,
            hlCenterY + hlH * 0.34,
            frontZ + 0.032,
            noseHalfSpan,
            noseCurveZ,
            0.9,
            1.05,
            browSlant,
            0.25
          ),
          ledStripMat
        );
        chassisGroup.add(ledBrow);
      } else if (spec.id === 'silvia_s13') {
        // Iconic Nissan Silvia S13 (PS13) Triple-Projector Brick Headlights + Outer Amber Corner Lamp
        [-0.24, -0.02, 0.18].forEach((px, idx) => {
          const pX = hlX - side * (hlW * px);
          const pt = evalFasciaCurveZ(pX, frontZ + 0.026, noseHalfSpan, noseCurveZ);
          const lensMat = idx === 0 ? yellowFogMat : projectorLensMat;
          const sqBezel = new THREE.Mesh(
            createRoundedBoxGeometry(0.036, 0.042, 0.016, 0.006, 2),
            chromeMat
          );
          sqBezel.position.set(pX, hlCenterY - 0.002, pt.z - 0.002);
          sqBezel.rotation.y = pt.yawY;
          const projDome = new THREE.Mesh(
            new THREE.SphereGeometry(0.017, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
            lensMat
          );
          projDome.rotation.x = Math.PI * 0.5;
          projDome.position.set(pX, hlCenterY - 0.002, pt.z + 0.002);
          chassisGroup.add(sqBezel, projDome);
        });
        const s13TurnX = hlX + side * (hlW * 0.37);
        const s13TurnPt = evalFasciaCurveZ(s13TurnX, frontZ + 0.026, noseHalfSpan, noseCurveZ);
        const s13CornerAmber = new THREE.Mesh(
          createRoundedBoxGeometry(hlW * 0.21, hlH * 0.84, 0.016, 0.006, 2),
          amberMat
        );
        s13CornerAmber.position.set(s13TurnX, hlCenterY, s13TurnPt.z);
        s13CornerAmber.rotation.y = s13TurnPt.yawY;
        chassisGroup.add(s13CornerAmber);
      } else {
        // Twin Sculpted 3D Parabolic Reflector Bowls + Projector Domes + Outer Corner Turn Chamber
        const innerX = hlX - side * (hlW * 0.24);
        const midX = hlX + side * (hlW * 0.06);
        const outerX = hlX + side * (hlW * 0.35);

        const innerMat =
          spec.id === 'lancer_evo9' || spec.id === 'chaser_jzx100'
            ? yellowFogMat
            : projectorLensMat;

        addCurvedProjectorOptic(innerX, hlCenterY - 0.003, 0.024, innerMat, true);
        addCurvedProjectorOptic(midX, hlCenterY - 0.001, 0.029, projectorLensMat, true);

        const turnPt = evalFasciaCurveZ(outerX, hlBaseZ + 0.026, noseHalfSpan, noseCurveZ);
        const turnPod = new THREE.Mesh(
          createRoundedBoxGeometry(
            spec.id === 'r32_gtr' ? hlW * 0.24 : hlW * 0.19,
            hlH * (spec.id === 'r32_gtr' ? 0.88 : 0.72) * outerScale,
            0.018,
            0.008,
            3
          ),
          amberMat
        );
        turnPod.position.set(outerX, hlCenterY + browSlant * 0.25, turnPt.z);
        turnPod.rotation.y = turnPt.yawY;
        chassisGroup.add(turnPod);

        if (spec.id === 'r32_gtr') {
          // Wrap-around side amber corner turn signal lens visible from Side & 3/4 Views (matches 1994 BNR32 blueprint)
          const sideWrapAmber = new THREE.Mesh(
            createRoundedBoxGeometry(0.032, hlH * 0.86, 0.115, 0.010, 3),
            amberMat
          );
          sideWrapAmber.position.set(side * (halfW * 0.808), hlCenterY - 0.002, turnPt.z - 0.042);
          sideWrapAmber.rotation.y = side * 0.28;
          chassisGroup.add(sideWrapAmber);
        }
      }

      // Flush Curved Polycarbonate Outer Headlight Lens
      const contouredGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW + 0.014,
          hlH + 0.008,
          0.016,
          hlX,
          hlCenterY,
          hlBaseZ + 0.030,
          noseHalfSpan,
          noseCurveZ,
          innerScale,
          outerScale,
          browSlant,
          shapeSquareness
        ),
        headlightGlassMat
      );
      chassisGroup.add(contouredGlass);

      // Contour-Matched Upper Body-Colored Headlight Brow / Eyelid blending into the hood edge
      const contouredEyelid = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          hlW + 0.018,
          0.020,
          0.038,
          hlX,
          hlCenterY + hlH * 0.48,
          hlBaseZ + 0.014,
          noseHalfSpan,
          noseCurveZ,
          1.0,
          1.0,
          browSlant,
          0.24
        ),
        bodyMat
      );
      chassisGroup.add(contouredEyelid);
    });

    // 3. Lower Bumper Intake & Intercooler Layout for Fixed-Headlight Vehicles
    const centerMouth = new THREE.Mesh(
      createRoundedBoxGeometry(
        halfW * (spec.id === 'toyota_gr86' ? 1.08 : 0.86),
        0.210,
        0.040,
        spec.id === 'supra_mk4' ? 0.035 : 0.014,
        3
      ),
      getGrilleMeshMaterial()
    );
    centerMouth.position.set(0, 0.315, frontZ - 0.012);
    chassisGroup.add(centerMouth);

    if (spec.soundType.includes('turbo') && spec.id !== 'wrx_sti') {
      const cleanIcMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.24,
      });
      const fmic = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.66, 0.180, 0.042, 0.010, 2),
        cleanIcMat
      );
      fmic.position.set(0, 0.312, frontZ - 0.012);
      chassisGroup.add(fmic);

      [-0.064, -0.032, 0, 0.032, 0.064].forEach((fy) => {
        const finTube = new THREE.Mesh(
          new THREE.BoxGeometry(halfW * 0.62, 0.008, 0.048),
          chromeMat
        );
        finTube.position.set(0, 0.312 + fy, frontZ - 0.010);
        chassisGroup.add(finTube);
      });
    }

    [-1, 1].forEach((side) => {
      if (spec.id === 'wrx_sti') {
        const fogCover = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.30, 0.145, 0.042, 0.014, 3),
          bodyMat
        );
        fogCover.position.set(side * (halfW * 0.58), 0.315, frontZ - 0.004);
        fogCover.rotation.y = side * 0.16;
        chassisGroup.add(fogCover);
      } else {
        const sideDuct = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.28, 0.175, 0.032, 0.018, 3),
          getGrilleMeshMaterial()
        );
        sideDuct.position.set(side * (halfW * 0.60), 0.315, frontZ - 0.018);
        sideDuct.rotation.y = side * 0.16;
        chassisGroup.add(sideDuct);

        if (spec.id === 'r32_gtr') {
          // BNR32 Vertical Bumper Pillar separating central intercooler mouth from twin-slot side brake ducts
          const verticalPillarPt = evalFasciaCurveZ(
            side * (halfW * 0.405),
            frontZ + 0.038,
            halfW * 0.92,
            0.092
          );
          const intakePillar = new THREE.Mesh(
            createRoundedBoxGeometry(0.056, midBarY - 0.18, 0.036, 0.010, 3),
            bodyMat
          );
          intakePillar.position.set(
            side * (halfW * 0.405),
            (midBarY + 0.18) * 0.5,
            verticalPillarPt.z
          );
          intakePillar.rotation.y = verticalPillarPt.yawY;
          chassisGroup.add(intakePillar);

          // BNR32 Twin-Slot Horizontal Brake Cooling Duct Splitter Bar (mounted on outer bumper curve so it's 100% visible)
          const ductPt = evalFasciaCurveZ(
            side * (halfW * 0.585),
            frontZ + 0.036,
            halfW * 0.92,
            0.092
          );
          const ductDivider = new THREE.Mesh(
            createRoundedBoxGeometry(halfW * 0.295, 0.024, 0.032, 0.006, 2),
            bodyMat
          );
          ductDivider.position.set(side * (halfW * 0.585), 0.305, ductPt.z);
          ductDivider.rotation.y = ductPt.yawY;
          chassisGroup.add(ductDivider);
        }
      }
    });

    if (spec.id === 'r32_gtr') {
      // Centered BNR32 Dark "GT-R" Front Show Plate mounted flush on the upper intercooler mouth
      const r32PlateBracket = new THREE.Mesh(
        createRoundedBoxGeometry(0.245, 0.108, 0.016, 0.006, 2),
        darkTrimMat
      );
      r32PlateBracket.position.set(0, 0.348, frontZ + 0.044);
      const r32PlateFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.232, 0.098),
        new THREE.MeshStandardMaterial({
          map: tex.gtrShowPlateTex,
          roughness: 0.26,
          metalness: 0.32,
        })
      );
      r32PlateFace.position.set(0, 0.348, frontZ + 0.053);
      chassisGroup.add(r32PlateBracket, r32PlateFace);
    }
  }

  // Contoured Front Chin Splitter Lip
  const splitterMat =
    spec.isTwoTonePanda || spec.defaultCustomization.bodyKit === 'stock' ? darkTrimMat : carbonMat;
  const carbonSplitter = new THREE.Mesh(
    buildSculptedFasciaBar(halfW * 1.68, 0.032, 0.078, 0.148, frontZ + 0.032, 0.095, 0.88, 0.28),
    splitterMat
  );
  chassisGroup.add(carbonSplitter);

  // Anodized Red Front Racing Tow Hook & Offset JDM Front License Plate Bracket (omitted on stock BNR32 for clean OEM look)
  if (spec.id !== 'r32_gtr') {
    const towHookMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.85,
      roughness: 0.20,
    });
    const frontTowBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.012, 0.055),
      towHookMat
    );
    frontTowBracket.position.set(-halfW * 0.44, 0.205, frontZ + 0.048);
    const frontTowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.0055, 10, 20),
      towHookMat
    );
    frontTowRing.rotation.x = Math.PI * 0.35;
    frontTowRing.position.set(-halfW * 0.44, 0.198, frontZ + 0.076);
    chassisGroup.add(frontTowBracket, frontTowRing);
  }

  if (spec.id !== 'ferrari_f40' && spec.id !== 'r34_gtr' && spec.id !== 'r33_gtr' && spec.id !== 'r32_gtr') {
    const procMatsFront = getR34ProceduralMaterials();
    const frontPlateFrame = new THREE.Mesh(
      createRoundedBoxGeometry(0.245, 0.106, 0.012, 0.006, 2),
      darkTrimMat
    );
    frontPlateFrame.position.set(halfW * 0.42, 0.315, frontZ + 0.036);
    frontPlateFrame.rotation.y = 0.14;
    const frontPlateFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.232, 0.096),
      procMatsFront.jdmPlateMat
    );
    frontPlateFace.position.set(halfW * 0.42 + 0.001, 0.315, frontZ + 0.043);
    frontPlateFace.rotation.y = 0.14;
    chassisGroup.add(frontPlateFrame, frontPlateFace);
  }
}

// ============================================================================
// 5. HYPER-DETAILED REAR FASCIA, TAILLIGHTS & EXHAUSTS (All 26 Vehicles)
// ============================================================================
function buildDetailedR34RearFascia(
  chassisGroup: THREE.Group,
  L: number,
  W: number,
  bodyMat: THREE.Material,
  carbonMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material,
  tailRunningMat: THREE.Material,
  brakeLightMat: THREE.Material,
  reverseLightMat: THREE.Material,
  turnSignalLeftMat: THREE.Material,
  turnSignalRightMat: THREE.Material,
  spec: VehicleSpec,
  custom?: VehicleCustomization
) {
  const halfW = W * 0.5;
  const rearZ = -L * 0.478;
  const tex = createR34Textures();
  const procMats = getR34ProceduralMaterials();
  const isSkyline = spec.id === 'r34_gtr' || spec.id === 'r33_gtr' || spec.id === 'r32_gtr';
  const isF40 = spec.id === 'ferrari_f40';
  const rearBumperMat = spec.isTwoTonePanda ? darkTrimMat : bodyMat;

  // Transparent Outer Polycarbonate Lenses (depthWrite: false + polygonOffset so internal reflectors/emitters never occlude)
  const clearLensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.035,
    transmission: 0,
    transparent: true,
    opacity: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide,
  });

  const redLensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    metalness: 0.08,
    roughness: 0.04,
    transmission: 0,
    transparent: true,
    opacity: 0.42,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide,
  });

  const smokedLensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    metalness: 0.14,
    roughness: 0.04,
    transmission: 0,
    transparent: true,
    opacity: 0.36,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide,
  });

  // Faceted Chrome-Silver Internal Parabolic Reflector Cavity Material (visible when lights are OFF)
  const reflectorBowlMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ee,
    metalness: 0.92,
    roughness: 0.16,
    side: THREE.DoubleSide,
  });

  // Unlit Ruby-Red Reflector Backing (gives authentic crimson depth when lights are OFF)
  const unlitRubyReflectorMat = new THREE.MeshStandardMaterial({
    map: tex.taillightLensTex,
    color: 0x991b1b,
    metalness: 0.48,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });

  const rearBackingCavity = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.24, 0.42, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.92 })
  );
  rearBackingCavity.position.set(0, 0.50, rearZ + 0.11);
  chassisGroup.add(rearBackingCavity);

  // Upper Rear Taillight Panel (Black honeycomb engine grille on Ferrari F40, painted bodyMat on others)
  const upperTailPanel = new THREE.Mesh(
    buildSculptedFasciaBar(halfW * 1.84, 0.225, 0.054, 0.672, rearZ - 0.004, -0.068, 0.94, 0.24),
    isF40 ? darkTrimMat : bodyMat
  );
  chassisGroup.add(upperTailPanel);

  // Integrated Trunk Decklid Lip (on BNR32, S15 & S14, the model-specific OEM aero spoiler sits directly on the trunk decklid)
  if (spec.id !== 'r32_gtr' && spec.id !== 'silvia_s15' && spec.id !== 'silvia_s14') {
    const trunkLipSpoiler = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.72, 0.032, 0.044, 0.796, rearZ - 0.008, -0.055, 0.90, 0.26),
      bodyMat
    );
    chassisGroup.add(trunkLipSpoiler);
  }

  // Center High-Mount Stop Lamp (CHMSL) wired directly to brakeLightMat
  if (spec.id !== 'r33_gtr' && spec.id !== 'r32_gtr' && spec.id !== 'silvia_s15') {
    const chmslBezel = new THREE.Mesh(
      createRoundedBoxGeometry(0.195, 0.018, 0.018, 0.004, 2),
      darkTrimMat
    );
    chmslBezel.position.set(0, 0.766, rearZ - 0.048);
    chassisGroup.add(chmslBezel);

    const chmslStrip = new THREE.Mesh(
      createRoundedBoxGeometry(0.180, 0.012, 0.020, 0.003, 2),
      brakeLightMat
    );
    chmslStrip.position.set(0, 0.766, rearZ - 0.050);
    chassisGroup.add(chmslStrip);
  }

  const bumperSeamGroove = new THREE.Mesh(
    buildSculptedFasciaBar(halfW * 1.85, 0.012, 0.056, 0.554, rearZ - 0.005, -0.070, 0.95, 0.24),
    darkTrimMat
  );
  chassisGroup.add(bumperSeamGroove);

  const midRearBumper = new THREE.Mesh(
    buildSculptedFasciaBar(halfW * 1.84, 0.220, 0.064, 0.448, rearZ - 0.010, -0.055, 0.96, 0.24),
    rearBumperMat
  );
  chassisGroup.add(midRearBumper);

  const lowerRearValance = new THREE.Mesh(
    buildSculptedFasciaBar(halfW * 1.78, 0.135, 0.060, 0.312, rearZ - 0.008, -0.045, 0.95, 0.24),
    rearBumperMat
  );
  chassisGroup.add(lowerRearValance);

  // --------------------------------------------------------------------------
  // BESPOKE MODEL-SPECIFIC 3D CONTOURED TAILLIGHT ASSEMBLIES FOR ALL 26 VEHICLES
  // Each assembly includes:
  // 1. Recessed dark housing / bezel
  // 2. Internal parabolic or multi-chamber chrome/ruby reflector cavity (detailed when lights OFF)
  // 3. Dedicated running-light emitter (tailRunningMat)
  // 4. Dedicated high-intensity brake emitter (brakeLightMat)
  // 5. Left/Right independent amber turn indicator emitter (turnSignalLeftMat / turnSignalRightMat)
  // 6. Dedicated crystal-white reverse emitter (reverseLightMat)
  // 7. Translucent clearcoat outer polycarbonate lens cover
  // --------------------------------------------------------------------------
  const rearHalfSpan = halfW * 0.92;
  const rearCurveZ = -0.068;
  const tailSurfaceZ = rearZ - 0.058;
  const getTurnMat = (side: number) => (side > 0 ? turnSignalLeftMat : turnSignalRightMat);

  // Helper to construct a deeply recessed circular lamp with parabolic reflector bowl, inner brake bulb, outer running ring, and domed glass lens
  const buildCircularAfterburnerLamp = (
    radius: number,
    ringMat: THREE.Material,
    coreMat: THREE.Material,
    lensMat: THREE.Material,
    hasLedDots = false,
    centerJewelMat?: THREE.Material
  ) => {
    const group = new THREE.Group();

    // 1. Deep cylindrical dark housing tunnel
    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.009, radius + 0.012, 0.030, 32),
      darkTrimMat
    );
    bezel.rotation.x = Math.PI * 0.5;
    bezel.position.z = 0.003;
    group.add(bezel);

    // 2. Stepped parabolic metallic reflector bowl inside cavity
    const reflectorBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.94, radius * 0.62, 0.018, 28),
      reflectorBowlMat
    );
    reflectorBowl.rotation.x = Math.PI * 0.5;
    reflectorBowl.position.z = -0.002;
    group.add(reflectorBowl);

    // 3. Chrome outer trim ring
    const chromeRim = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.001, 0.0038, 12, 32),
      chromeMat
    );
    chromeRim.position.z = -0.012;
    group.add(chromeRim);

    // 4. Faceted unlit reflector disc backing
    const backingDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.008, 28),
      unlitRubyReflectorMat
    );
    backingDisc.rotation.x = Math.PI * 0.5;
    backingDisc.position.z = -0.006;
    group.add(backingDisc);

    // 5. Outer Position / Running Light Ring
    const runningRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.72, 0.0068, 12, 32),
      ringMat
    );
    runningRing.position.z = -0.015;
    group.add(runningRing);

    if (hasLedDots) {
      const dotCount = 14;
      for (let d = 0; d < dotCount; d++) {
        const ang = (d / dotCount) * Math.PI * 2;
        const ledNode = new THREE.Mesh(
          new THREE.SphereGeometry(0.0036, 8, 8),
          ringMat
        );
        ledNode.position.set(
          Math.cos(ang) * (radius * 0.72),
          Math.sin(ang) * (radius * 0.72),
          -0.017
        );
        group.add(ledNode);
      }
    }

    // 6. Central High-Intensity Brake Bulb / Core (or Center Turn Jewel)
    const innerCore = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * (centerJewelMat ? 0.52 : 0.44),
        radius * (centerJewelMat ? 0.52 : 0.44),
        0.014,
        24
      ),
      coreMat
    );
    innerCore.rotation.x = Math.PI * 0.5;
    innerCore.position.z = -0.011;
    group.add(innerCore);

    if (centerJewelMat) {
      const jewelCore = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, 0.018, 20),
        centerJewelMat
      );
      jewelCore.rotation.x = Math.PI * 0.5;
      jewelCore.position.z = -0.013;
      group.add(jewelCore);
    }

    // 7. Translucent outer polycarbonate lens cap
    const glassCap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.002, radius + 0.002, 0.006, 32),
      lensMat
    );
    glassCap.rotation.x = Math.PI * 0.5;
    glassCap.position.z = -0.020;
    group.add(glassCap);

    return group;
  };

  if (isSkyline) {
    // ========================================================================
    // 1–3. NISSAN SKYLINE GT-R (BNR34 / BCNR33 / BNR32): Iconic Quad Round Lamps
    // - R34: Larger outer (0.068m) + smaller lower inner (0.052m) with stove-burner LED rings & inner amber core
    // - R33: Equal-proportioned round lamps (0.056m / 0.054m) + lower smoked turn/reverse strip
    // - R32: Four equal deeply recessed circular lamps (0.058m) + lower bumper plate-flanking reverse lamps
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const seamX = side * (halfW * 0.505);
      const seamPt = evalFasciaCurveZ(seamX, tailSurfaceZ - 0.004, rearHalfSpan, rearCurveZ);
      const trunkVerticalSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.006, 0.215, 0.016),
        darkTrimMat
      );
      trunkVerticalSeam.position.set(seamX, 0.675, seamPt.z);
      trunkVerticalSeam.rotation.y = seamPt.yawY;
      chassisGroup.add(trunkVerticalSeam);

      const outerX = side * (halfW * 0.61);
      const outerY = 0.684;
      const outerPt = evalFasciaCurveZ(outerX, tailSurfaceZ - 0.006, rearHalfSpan, rearCurveZ);
      const outerR = spec.id === 'r34_gtr' ? 0.068 : spec.id === 'r33_gtr' ? 0.056 : 0.058;

      const outerGroup = buildCircularAfterburnerLamp(
        outerR,
        tailRunningMat,
        brakeLightMat,
        redLensGlassMat,
        spec.id === 'r34_gtr'
      );
      outerGroup.position.set(outerX, outerY, outerPt.z);
      outerGroup.rotation.y = outerPt.yawY;
      chassisGroup.add(outerGroup);

      const innerX = side * (halfW * 0.415);
      const innerY = spec.id === 'r34_gtr' ? 0.666 : 0.684;
      const innerPt = evalFasciaCurveZ(innerX, tailSurfaceZ - 0.006, rearHalfSpan, rearCurveZ);
      const innerR = spec.id === 'r34_gtr' ? 0.052 : spec.id === 'r33_gtr' ? 0.054 : 0.058;

      const innerGroup = buildCircularAfterburnerLamp(
        innerR,
        tailRunningMat,
        brakeLightMat,
        redLensGlassMat,
        spec.id === 'r34_gtr',
        spec.id === 'r34_gtr' ? turnMat : undefined
      );
      innerGroup.position.set(innerX, innerY, innerPt.z);
      innerGroup.rotation.y = innerPt.yawY;
      chassisGroup.add(innerGroup);

      if (spec.id === 'r34_gtr') {
        // BNR34 Outer Pinpoint Amber Turn-Signal / Side-Marker Jewel
        const dotX = side * (halfW * 0.735);
        const dotPt = evalFasciaCurveZ(dotX, tailSurfaceZ - 0.006, rearHalfSpan, rearCurveZ);
        const amberDot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.022, 16),
          turnMat
        );
        amberDot.rotation.x = Math.PI * 0.5;
        amberDot.position.set(dotX, 0.642, dotPt.z);
        amberDot.rotation.y = dotPt.yawY;
        chassisGroup.add(amberDot);
      } else if (spec.id === 'r33_gtr') {
        // BCNR33 Recessed Smoked Horizontal Turn/Reverse Combination Strip directly below each pair
        const stripX = side * (halfW * 0.515);
        const stripY = 0.596;
        const stripW = halfW * 0.43;

        const stripBezel = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            stripW,
            0.032,
            0.028,
            stripX,
            stripY,
            tailSurfaceZ - 0.004,
            rearHalfSpan,
            rearCurveZ,
            1.0,
            1.0,
            0,
            0.25
          ),
          darkTrimMat
        );
        const amberOuterStrip = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            stripW * 0.46,
            0.020,
            0.022,
            stripX + side * (stripW * 0.24),
            stripY,
            tailSurfaceZ - 0.011,
            rearHalfSpan,
            rearCurveZ,
            1.0,
            1.0,
            0,
            0.22
          ),
          turnMat
        );
        const clearInnerStrip = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            stripW * 0.44,
            0.020,
            0.022,
            stripX - side * (stripW * 0.24),
            stripY,
            tailSurfaceZ - 0.011,
            rearHalfSpan,
            rearCurveZ,
            1.0,
            1.0,
            0,
            0.22
          ),
          reverseLightMat
        );
        const stripGlass = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            stripW * 0.98,
            0.028,
            0.008,
            stripX,
            stripY,
            tailSurfaceZ - 0.019,
            rearHalfSpan,
            rearCurveZ,
            1.0,
            1.0,
            0,
            0.25
          ),
          smokedLensGlassMat
        );
        chassisGroup.add(stripBezel, amberOuterStrip, clearInnerStrip, stripGlass);
      } else if (spec.id === 'r32_gtr') {
        // BNR32 Outer Corner Amber Indicator Segment integrated alongside the outer circular lamp housing
        const indX = side * (halfW * 0.725);
        const indPt = evalFasciaCurveZ(indX, tailSurfaceZ - 0.008, rearHalfSpan, rearCurveZ);
        const r32TurnPod = new THREE.Mesh(
          createRoundedBoxGeometry(0.042, 0.058, 0.022, 0.008, 2),
          turnMat
        );
        r32TurnPod.position.set(indX, 0.684, indPt.z);
        r32TurnPod.rotation.y = indPt.yawY;
        chassisGroup.add(r32TurnPod);
      }
    });
  } else if (isF40) {
    // ========================================================================
    // 26. FERRARI F40 COMPETIZIONE: Individual Circular Lamps in Black Rear Grille
    // - Outer circular lamp: Red Running Ring + High-Intensity Brake Bulb
    // - Inner circular lamp: Amber Turn-Signal Ring + Center White Reverse Core
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const outerX = side * (halfW * 0.61);
      const outerPt = evalFasciaCurveZ(outerX, tailSurfaceZ - 0.006, rearHalfSpan, rearCurveZ);
      const outerLamp = buildCircularAfterburnerLamp(
        0.056,
        tailRunningMat,
        brakeLightMat,
        redLensGlassMat,
        false
      );
      outerLamp.position.set(outerX, 0.684, outerPt.z);
      outerLamp.rotation.y = outerPt.yawY;
      chassisGroup.add(outerLamp);

      const innerX = side * (halfW * 0.42);
      const innerPt = evalFasciaCurveZ(innerX, tailSurfaceZ - 0.006, rearHalfSpan, rearCurveZ);
      const innerLamp = buildCircularAfterburnerLamp(
        0.056,
        turnMat,
        turnMat,
        clearLensGlassMat,
        false,
        reverseLightMat
      );
      innerLamp.position.set(innerX, 0.684, innerPt.z);
      innerLamp.rotation.y = innerPt.yawY;
      chassisGroup.add(innerLamp);
    });
  } else if (spec.id === 'nissan_180sx') {
    // ========================================================================
    // 7. NISSAN 180SX TYPE X (RPS13 KOUKI): Full-Width Black Carbon/Smoked Garnish
    // Housing Twin Recessed Circular Red Lamps inside Square-Beveled Type X Pods
    // + Lower Horizontal Amber Turn & White Reverse Bar + Center "180SX" Garnish
    // ========================================================================
    const koukiGarnish = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.70, 0.148, 0.026, 0.668, tailSurfaceZ + 0.004, rearCurveZ, 0.94, 0.20),
      darkTrimMat
    );
    chassisGroup.add(koukiGarnish);

    // Center "180SX" recessed garnish visor plate between the circular lamp pairs
    const centerVisor = new THREE.Mesh(
      buildContouredLampClusterGeometry(
        halfW * 0.56,
        0.088,
        0.022,
        0,
        0.692,
        tailSurfaceZ - 0.008,
        rearHalfSpan,
        rearCurveZ,
        1.0,
        1.0,
        0,
        0.16
      ),
      smokedLensGlassMat
    );
    chassisGroup.add(centerVisor);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      // Square-beveled Type X twin-circle recess surround
      const podCenterX = side * (halfW * 0.515);
      const podW = halfW * 0.42;
      const typeXPodFrame = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          podW,
          0.098,
          0.028,
          podCenterX,
          0.694,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.22
        ),
        darkTrimMat
      );
      chassisGroup.add(typeXPodFrame);

      // Two equal Type X circular lamps (0.044m radius) per side
      [0.605, 0.425].forEach((rx) => {
        const lx = side * (halfW * rx);
        const pt = evalFasciaCurveZ(lx, tailSurfaceZ - 0.008, rearHalfSpan, rearCurveZ);
        const lamp = buildCircularAfterburnerLamp(
          0.044,
          tailRunningMat,
          brakeLightMat,
          redLensGlassMat,
          false
        );
        lamp.position.set(lx, 0.694, pt.z);
        lamp.rotation.y = pt.yawY;
        chassisGroup.add(lamp);
      });

      // Lower Type X Rectangular Turn Signal (outer) & Reverse (inner) Bar
      const lowerBarX = side * (halfW * 0.515);
      const lowerBarW = halfW * 0.41;
      const lowerBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          lowerBarW,
          0.030,
          0.026,
          lowerBarX,
          0.608,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          1.0,
          1.0,
          0,
          0.18
        ),
        darkTrimMat
      );
      const amberTurnSeg = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          lowerBarW * 0.46,
          0.020,
          0.022,
          lowerBarX + side * (lowerBarW * 0.25),
          0.608,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          1.0,
          1.0,
          0,
          0.18
        ),
        turnMat
      );
      const clearRevSeg = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          lowerBarW * 0.46,
          0.020,
          0.022,
          lowerBarX - side * (lowerBarW * 0.25),
          0.608,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          1.0,
          1.0,
          0,
          0.18
        ),
        reverseLightMat
      );
      const lowerGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          lowerBarW * 0.98,
          0.026,
          0.008,
          lowerBarX,
          0.608,
          tailSurfaceZ - 0.019,
          rearHalfSpan,
          rearCurveZ,
          1.0,
          1.0,
          0,
          0.18
        ),
        clearLensGlassMat
      );
      chassisGroup.add(lowerBezel, amberTurnSeg, clearRevSeg, lowerGlass);
    });
  } else if (spec.id === 'supra_mk4') {
    // ========================================================================
    // 10. TOYOTA SUPRA RZ MK4 (JZA80): Rounded Graphite Stadium Housings with
    // 4 Distinct Circular Reflector Pods per Side under a Clear Outer Lens
    // (Outer = Amber Turn, Middle 2 = Red Running Rings + Brake Bulbs, Inner = White Reverse)
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const podCenterX = side * (halfW * 0.53);
      const podW = halfW * 0.53;
      const podH = 0.108;
      const podHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          podW,
          podH,
          0.028,
          podCenterX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.88,
          0.92,
          0.004,
          0.45
        ),
        darkTrimMat
      );
      const podGlassCover = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          podW * 0.98,
          podH * 0.94,
          0.008,
          podCenterX,
          0.678,
          tailSurfaceZ - 0.023,
          rearHalfSpan,
          rearCurveZ,
          0.88,
          0.92,
          0.004,
          0.45
        ),
        clearLensGlassMat
      );
      chassisGroup.add(podHousing, podGlassCover);

      [-0.36, -0.12, 0.12, 0.36].forEach((relX, idx) => {
        const lampX = podCenterX + relX * podW;
        const pt = evalFasciaCurveZ(lampX, tailSurfaceZ - 0.010, rearHalfSpan, rearCurveZ);
        const isOuter = (side > 0 && idx === 3) || (side < 0 && idx === 0);
        const isInner = (side > 0 && idx === 0) || (side < 0 && idx === 3);

        const lampGroup = new THREE.Group();
        lampGroup.position.set(lampX, 0.678, pt.z);
        lampGroup.rotation.y = pt.yawY;

        // Parabolic chrome reflector bowl
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.030, 0.020, 0.014, 24),
          reflectorBowlMat
        );
        bowl.rotation.x = Math.PI * 0.5;
        bowl.position.z = 0.002;

        // Chrome trim ring around each of the 4 circular cavities
        const podRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.031, 0.0032, 10, 24),
          chromeMat
        );
        podRim.position.z = -0.008;

        // Outer ring (running light on middle 2 pods)
        const outerRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.0045, 10, 24),
          isOuter ? turnMat : isInner ? reverseLightMat : tailRunningMat
        );
        outerRing.position.z = -0.009;

        // Central bulb emitter (high-intensity brake on middle 2 pods)
        const centerBulb = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.016, 20),
          isOuter ? turnMat : isInner ? reverseLightMat : brakeLightMat
        );
        centerBulb.rotation.x = Math.PI * 0.5;
        centerBulb.position.z = -0.005;

        // Individual inner colored lens dome
        const innerDome = new THREE.Mesh(
          new THREE.CylinderGeometry(0.029, 0.029, 0.005, 24),
          isOuter || isInner ? clearLensGlassMat : redLensGlassMat
        );
        innerDome.rotation.x = Math.PI * 0.5;
        innerDome.position.z = -0.011;

        lampGroup.add(bowl, podRim, outerRing, centerBulb, innerDome);
        chassisGroup.add(lampGroup);
      });
    });
  } else if (spec.id === 'supra_mk5') {
    // ========================================================================
    // 11. TOYOTA GR SUPRA MK5 (A90): Sculpted Teardrop Wrap-Around Taillights
    // with 3D C-Ring LED Running Blade, Inner Brake Core, Amber Turn Strip,
    // and Lower Center F1 Diffuser Reverse / Rear Fog Triangle
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const a90X = side * (halfW * 0.55);
      const a90W = halfW * 0.50;

      const a90Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          a90W,
          0.086,
          0.028,
          a90X,
          0.684,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.52,
          1.08,
          0.016,
          0.42
        ),
        darkTrimMat
      );
      // Outer sculpted 3D C-Ring LED Running Blade
      const a90RunningRing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          a90W * 0.90,
          0.062,
          0.021,
          a90X,
          0.684,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          0.52,
          1.06,
          0.015,
          0.42
        ),
        tailRunningMat
      );
      // Inner High-Intensity Brake LED Core
      const a90BrakeCore = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          a90W * 0.56,
          0.036,
          0.023,
          a90X - side * (a90W * 0.08),
          0.684,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.56,
          0.96,
          0.012,
          0.38
        ),
        brakeLightMat
      );
      // Outer Horizontal Amber Turn-Signal Strip
      const a90Turn = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          a90W * 0.36,
          0.016,
          0.025,
          a90X + side * (a90W * 0.24),
          0.684,
          tailSurfaceZ - 0.016,
          rearHalfSpan,
          rearCurveZ,
          0.75,
          1.0,
          0.008,
          0.30
        ),
        turnMat
      );
      const a90Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          a90W * 0.98,
          0.082,
          0.008,
          a90X,
          0.684,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.52,
          1.08,
          0.016,
          0.42
        ),
        redLensGlassMat
      );
      chassisGroup.add(a90Housing, a90RunningRing, a90BrakeCore, a90Turn, a90Glass);
    });

    // A90 Lower Center Diffuser F1-Style Reverse & Rear Fog Cluster
    const f1ClusterBezel = new THREE.Mesh(
      createRoundedBoxGeometry(0.115, 0.052, 0.022, 0.008, 2),
      darkTrimMat
    );
    f1ClusterBezel.position.set(0, 0.265, rearZ - 0.062);
    const f1ReverseBar = new THREE.Mesh(
      createRoundedBoxGeometry(0.092, 0.018, 0.024, 0.004, 2),
      reverseLightMat
    );
    f1ReverseBar.position.set(0, 0.276, rearZ - 0.064);
    const f1BrakeDots = new THREE.Mesh(
      createRoundedBoxGeometry(0.064, 0.016, 0.024, 0.004, 2),
      brakeLightMat
    );
    f1BrakeDots.position.set(0, 0.254, rearZ - 0.064);
    chassisGroup.add(f1ClusterBezel, f1ReverseBar, f1BrakeDots);
  } else if (spec.id === 'rx7_fd') {
    // ========================================================================
    // 15. MAZDA RX-7 SPIRIT R (FD3S 99-SPEC KOUKI): Full-Width Smoked Acrylic Visor
    // Housing Recessed Circular Twin-Ring Red Lamps + Outer Amber Circle + Inner White Reverse Circle
    // ========================================================================
    const visorBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.106, 0.020, 0.678, tailSurfaceZ - 0.002, rearCurveZ, 0.94, 0.24),
      darkTrimMat
    );
    const visorGlass = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.104, 0.008, 0.678, tailSurfaceZ - 0.024, rearCurveZ, 0.94, 0.24),
      smokedLensGlassMat
    );
    chassisGroup.add(visorBar, visorGlass);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      // 99-Spec FD3S: Inner Reverse (0.34), Inner Brake/Running Circle (0.46), Main Brake/Running Circle (0.58), Outer Amber Turn Circle (0.71)
      [
        { rx: 0.34, r: 0.021, kind: 'rev' },
        { rx: 0.46, r: 0.030, kind: 'tail' },
        { rx: 0.58, r: 0.032, kind: 'tail' },
        { rx: 0.71, r: 0.026, kind: 'turn' },
      ].forEach(({ rx, r, kind }) => {
        const lx = side * (halfW * rx);
        const pt = evalFasciaCurveZ(lx, tailSurfaceZ - 0.012, rearHalfSpan, rearCurveZ);
        const elemGroup = new THREE.Group();
        elemGroup.position.set(lx, 0.678, pt.z);
        elemGroup.rotation.y = pt.yawY;

        const bucket = new THREE.Mesh(
          new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.016, 24),
          reflectorBowlMat
        );
        bucket.rotation.x = Math.PI * 0.5;
        bucket.position.z = 0.002;
        elemGroup.add(bucket);

        if (kind === 'tail') {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r * 0.78, 0.0055, 12, 24),
            tailRunningMat
          );
          ring.position.z = -0.008;
          const brakeCore = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.016, 20),
            brakeLightMat
          );
          brakeCore.rotation.x = Math.PI * 0.5;
          brakeCore.position.z = -0.005;
          elemGroup.add(ring, brakeCore);
        } else {
          const emitter = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.016, 20),
            kind === 'turn' ? turnMat : reverseLightMat
          );
          emitter.rotation.x = Math.PI * 0.5;
          emitter.position.z = -0.006;
          elemGroup.add(emitter);
        }
        chassisGroup.add(elemGroup);
      });
    });
  } else if (spec.id === 'rx7_fc') {
    // ========================================================================
    // 16. MAZDA RX-7 SAVANNA (FC3S S5 KOUKI): Black Ribbed Trim Surround with
    // 3 Distinct Rounded-Rectangular Recessed Chambers per Side
    // ========================================================================
    const fcSurround = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.112, 0.022, 0.678, tailSurfaceZ - 0.002, rearCurveZ, 0.94, 0.18),
      darkTrimMat
    );
    const fcGlass = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.108, 0.008, 0.678, tailSurfaceZ - 0.023, rearCurveZ, 0.94, 0.18),
      smokedLensGlassMat
    );
    chassisGroup.add(fcSurround, fcGlass);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      // Inner Reverse (0.34), Wide Center Twin-Bulb Brake/Tail (0.51), Outer Amber Turn (0.69)
      const revX = side * (halfW * 0.34);
      const revPt = evalFasciaCurveZ(revX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
      const revChamber = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.12, 0.066, 0.018, 0.010, 2),
        reverseLightMat
      );
      revChamber.position.set(revX, 0.678, revPt.z);
      revChamber.rotation.y = revPt.yawY;
      chassisGroup.add(revChamber);

      const midX = side * (halfW * 0.515);
      const midPt = evalFasciaCurveZ(midX, tailSurfaceZ - 0.012, rearHalfSpan, rearCurveZ);
      const midRunningFrame = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.19, 0.068, 0.016, 0.012, 2),
        tailRunningMat
      );
      midRunningFrame.position.set(midX, 0.678, midPt.z);
      midRunningFrame.rotation.y = midPt.yawY;
      const midBrakeCore = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.14, 0.044, 0.020, 0.008, 2),
        brakeLightMat
      );
      midBrakeCore.position.set(midX, 0.678, midPt.z - 0.002);
      midBrakeCore.rotation.y = midPt.yawY;
      chassisGroup.add(midRunningFrame, midBrakeCore);

      const turnX = side * (halfW * 0.69);
      const turnPt = evalFasciaCurveZ(turnX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
      const turnChamber = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.13, 0.066, 0.018, 0.010, 2),
        turnMat
      );
      turnChamber.position.set(turnX, 0.678, turnPt.z);
      turnChamber.rotation.y = turnPt.yawY;
      chassisGroup.add(turnChamber);
    });
  } else if (spec.id === 'nsx_na1') {
    // ========================================================================
    // 18. HONDA NSX TYPE R (NA1): Full-Width Continuous Rectangular Rear Lamp Bar
    // Integrated Seamlessly Below the Rear Wing with Multi-Ribbed Red Running Array,
    // Quad Recessed Brake Chambers, Outer Amber Indicators, and Inner Reverse Lamps
    // ========================================================================
    const nsxHousing = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.72, 0.108, 0.024, 0.678, tailSurfaceZ - 0.002, rearCurveZ, 0.96, 0.14),
      darkTrimMat
    );
    // Full-width horizontal ribbed red position/running light bar
    const nsxRunningBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.66, 0.086, 0.018, 0.678, tailSurfaceZ - 0.009, rearCurveZ, 0.96, 0.14),
      tailRunningMat
    );
    // Center dark-red garnish panel between inner reverse lamps
    const nsxCenterGarnish = new THREE.Mesh(
      buildContouredLampClusterGeometry(
        halfW * 0.42,
        0.052,
        0.021,
        0,
        0.678,
        tailSurfaceZ - 0.013,
        rearHalfSpan,
        rearCurveZ,
        1.0,
        1.0,
        0,
        0.12
      ),
      unlitRubyReflectorMat
    );
    const nsxOuterLens = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.70, 0.102, 0.008, 0.678, tailSurfaceZ - 0.023, rearCurveZ, 0.96, 0.14),
      redLensGlassMat
    );
    chassisGroup.add(nsxHousing, nsxRunningBar, nsxCenterGarnish, nsxOuterLens);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      // Inner White Reverse Strip flanking center garnish
      const revX = side * (halfW * 0.29);
      const revPt = evalFasciaCurveZ(revX, tailSurfaceZ - 0.015, rearHalfSpan, rearCurveZ);
      const revBox = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.11, 0.044, 0.018, 0.004, 2),
        reverseLightMat
      );
      revBox.position.set(revX, 0.678, revPt.z);
      revBox.rotation.y = revPt.yawY;
      chassisGroup.add(revBox);

      // Dual Rectangular High-Intensity Brake Chambers + Upper/Lower Horizontal Running Ribs per side
      const runRib = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.27, 0.014, 0.019, 0.003, 2),
        tailRunningMat
      );
      const runRibPt = evalFasciaCurveZ(side * (halfW * 0.51), tailSurfaceZ - 0.015, rearHalfSpan, rearCurveZ);
      runRib.position.set(side * (halfW * 0.51), 0.712, runRibPt.z);
      runRib.rotation.y = runRibPt.yawY;
      chassisGroup.add(runRib);

      [0.44, 0.58].forEach((bx) => {
        const brakeX = side * (halfW * bx);
        const brakePt = evalFasciaCurveZ(brakeX, tailSurfaceZ - 0.015, rearHalfSpan, rearCurveZ);
        const brakeChamber = new THREE.Mesh(
          createRoundedBoxGeometry(halfW * 0.115, 0.058, 0.018, 0.005, 2),
          brakeLightMat
        );
        brakeChamber.position.set(brakeX, 0.678, brakePt.z);
        brakeChamber.rotation.y = brakePt.yawY;
        chassisGroup.add(brakeChamber);
      });

      // Outer Corner Amber Indicator Block
      const turnX = side * (halfW * 0.73);
      const turnPt = evalFasciaCurveZ(turnX, tailSurfaceZ - 0.015, rearHalfSpan, rearCurveZ);
      const turnBox = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.13, 0.064, 0.018, 0.006, 2),
        turnMat
      );
      turnBox.position.set(turnX, 0.678, turnPt.z);
      turnBox.rotation.y = turnPt.yawY;
      chassisGroup.add(turnBox);
    });
  } else if (spec.id === 'fairlady_350z') {
    // ========================================================================
    // 8. NISSAN FAIRLADY Z 350Z (Z33): Vertical Triangular / Blade LED Rear Lamps
    // Extending Up the Rear Hatch Quarters with 3-Tier LED Reflector Bays
    // + Separate Lower Bumper Turn & Reverse Strips
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const zX = side * (halfW * 0.63);
      const zW = halfW * 0.34;
      const zH = 0.162;

      const zHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW,
          zH,
          0.028,
          zX,
          0.712,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.62,
          1.14,
          0.028,
          0.32
        ),
        darkTrimMat
      );
      const zReflectorBacking = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.90,
          zH * 0.90,
          0.018,
          zX,
          0.712,
          tailSurfaceZ - 0.008,
          rearHalfSpan,
          rearCurveZ,
          0.62,
          1.12,
          0.028,
          0.32
        ),
        unlitRubyReflectorMat
      );
      // 3-Tier Vertical-Stack LED Running & Brake Blades inside the Z33 triangular housing
      [-0.038, 0.0, 0.038].forEach((tierDy, tIdx) => {
        const tierRunning = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            zW * (0.82 - tIdx * 0.08),
            0.026,
            0.022,
            zX + side * (tIdx * 0.008),
            0.712 + tierDy,
            tailSurfaceZ - 0.012,
            rearHalfSpan,
            rearCurveZ,
            0.70,
            1.05,
            0.014,
            0.28
          ),
          tailRunningMat
        );
        const tierBrake = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            zW * (0.58 - tIdx * 0.06),
            0.018,
            0.024,
            zX + side * (tIdx * 0.008),
            0.712 + tierDy,
            tailSurfaceZ - 0.014,
            rearHalfSpan,
            rearCurveZ,
            0.70,
            1.05,
            0.014,
            0.28
          ),
          brakeLightMat
        );
        chassisGroup.add(tierRunning, tierBrake);
      });

      const zOuterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.98,
          zH * 0.96,
          0.008,
          zX,
          0.712,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.62,
          1.14,
          0.028,
          0.32
        ),
        redLensGlassMat
      );
      chassisGroup.add(zHousing, zReflectorBacking, zOuterGlass);

      // Z33 Separate Lower Bumper Vertical-Slit Turn Signal & Reverse Pod
      const lowerPodX = side * (halfW * 0.65);
      const lowerPt = evalFasciaCurveZ(lowerPodX, rearZ - 0.064, rearHalfSpan, -0.055);
      const lowerPodGroup = new THREE.Group();
      lowerPodGroup.position.set(lowerPodX, 0.515, lowerPt.z);
      lowerPodGroup.rotation.y = lowerPt.yawY;

      const lowerBezel = new THREE.Mesh(
        createRoundedBoxGeometry(0.082, 0.044, 0.020, 0.006, 2),
        darkTrimMat
      );
      const lowerTurn = new THREE.Mesh(
        createRoundedBoxGeometry(0.036, 0.032, 0.022, 0.004, 2),
        turnMat
      );
      lowerTurn.position.x = side * 0.019;
      const lowerRev = new THREE.Mesh(
        createRoundedBoxGeometry(0.036, 0.032, 0.022, 0.004, 2),
        reverseLightMat
      );
      lowerRev.position.x = -side * 0.019;
      lowerPodGroup.add(lowerBezel, lowerTurn, lowerRev);
      chassisGroup.add(lowerPodGroup);
    });
  } else if (spec.id === 'nissan_370z') {
    // ========================================================================
    // 9. NISSAN FAIRLADY Z 370Z NISMO (Z34): Iconic Boomerang Rear Lamps
    // with Upper & Lower Forward-Swept Prongs, Red LED Light-Tube, Dual Round Brake Optics,
    // and Side-Wrapping Quarter Boomerang Tips
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const zX = side * (halfW * 0.61);
      const zW = halfW * 0.40;

      // Upper Boomerang Prong sweeping upward & outward
      const upperProngBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.92,
          0.056,
          0.028,
          zX + side * (zW * 0.04),
          0.742,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.54,
          1.15,
          0.026,
          0.32
        ),
        darkTrimMat
      );
      const upperProngLed = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.84,
          0.038,
          0.022,
          zX + side * (zW * 0.04),
          0.742,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.54,
          1.12,
          0.026,
          0.32
        ),
        tailRunningMat
      );

      // Inner Boomerang Vertex Spine connecting upper and lower prongs
      const vertexBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.56,
          0.138,
          0.028,
          zX - side * (zW * 0.16),
          0.702,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.72,
          1.04,
          0.012,
          0.30
        ),
        darkTrimMat
      );
      const vertexBrakeCore = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.46,
          0.108,
          0.023,
          zX - side * (zW * 0.14),
          0.702,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.72,
          1.02,
          0.012,
          0.30
        ),
        brakeLightMat
      );

      // Lower Boomerang Prong sweeping outward into rear fender flare
      const lowerProngBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.96,
          0.058,
          0.028,
          zX + side * (zW * 0.05),
          0.662,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.68,
          1.18,
          -0.016,
          0.32
        ),
        darkTrimMat
      );
      const lowerProngLed = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.62,
          0.038,
          0.022,
          zX - side * (zW * 0.08),
          0.662,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.68,
          1.06,
          -0.012,
          0.30
        ),
        tailRunningMat
      );
      const z34TurnWedge = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.34,
          0.036,
          0.024,
          zX + side * (zW * 0.28),
          0.662,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          0.85,
          1.14,
          -0.012,
          0.28
        ),
        turnMat
      );
      const z34ReverseWedge = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          zW * 0.28,
          0.028,
          0.024,
          zX - side * (zW * 0.26),
          0.654,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          0.75,
          0.95,
          0,
          0.25
        ),
        reverseLightMat
      );

      // Side-wrapping Z34 boomerang forward fang on rear quarter panel
      const sideFang = new THREE.Mesh(
        createRoundedBoxGeometry(0.030, 0.042, 0.135, 0.008, 3),
        tailRunningMat
      );
      sideFang.position.set(side * (halfW * 0.852), 0.738, rearZ + 0.062);
      sideFang.rotation.y = -side * 0.18;
      sideFang.rotation.x = 0.14;

      chassisGroup.add(
        upperProngBezel,
        upperProngLed,
        vertexBezel,
        vertexBrakeCore,
        lowerProngBezel,
        lowerProngLed,
        z34TurnWedge,
        z34ReverseWedge,
        sideFang
      );
    });
  } else if (spec.id === 'honda_s2000') {
    // ========================================================================
    // 19. HONDA S2000 (AP1/AP2): Dark-Chrome Rounded-Trapezoid Housings with
    // 3 Distinct Circular Jewel Lamps per Side under a Flush Clear Outer Cover
    // (Outer = Large Red LED Ring + Central Brake Core, Middle = Amber Turn Circle, Inner = White Reverse Circle)
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const capX = side * (halfW * 0.55);
      const capW = halfW * 0.46;
      const capH = 0.104;

      const capHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          capW,
          capH,
          0.028,
          capX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.80,
          0.98,
          0.008,
          0.46
        ),
        darkTrimMat
      );
      const capOuterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          capW * 0.98,
          capH * 0.94,
          0.008,
          capX,
          0.678,
          tailSurfaceZ - 0.023,
          rearHalfSpan,
          rearCurveZ,
          0.80,
          0.98,
          0.008,
          0.46
        ),
        clearLensGlassMat
      );
      chassisGroup.add(capHousing, capOuterGlass);

      [
        { relOut: 0.30, r: 0.032, kind: 'brake' },
        { relOut: -0.02, r: 0.025, kind: 'turn' },
        { relOut: -0.31, r: 0.023, kind: 'rev' },
      ].forEach(({ relOut, r, kind }) => {
        const lx = capX + side * (relOut * capW);
        const pt = evalFasciaCurveZ(lx, tailSurfaceZ - 0.012, rearHalfSpan, rearCurveZ);
        const lampGroup = new THREE.Group();
        lampGroup.position.set(lx, 0.678, pt.z);
        lampGroup.rotation.y = pt.yawY;

        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(r + 0.001, 0.0032, 10, 24),
          chromeMat
        );
        rim.position.z = -0.008;
        lampGroup.add(rim);

        if (kind === 'brake') {
          const ledRing = new THREE.Mesh(
            new THREE.TorusGeometry(r * 0.76, 0.0052, 10, 24),
            tailRunningMat
          );
          ledRing.position.z = -0.009;
          const brakeCore = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.50, r * 0.50, 0.016, 20),
            brakeLightMat
          );
          brakeCore.rotation.x = Math.PI * 0.5;
          brakeCore.position.z = -0.005;
          lampGroup.add(ledRing, brakeCore);
        } else {
          const jewel = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.016, 20),
            kind === 'turn' ? turnMat : reverseLightMat
          );
          jewel.rotation.x = Math.PI * 0.5;
          jewel.position.z = -0.006;
          lampGroup.add(jewel);
        }
        chassisGroup.add(lampGroup);
      });
    });
  } else if (spec.id === 'mx5_miata') {
    // ========================================================================
    // 17. MAZDA MX-5 MIATA (NA): Iconic Compact Oval / Rounded-Capsule Taillights
    // with Circular Red Brake/Running Bowl, Oval Amber Turn Lens, and Circular White Reverse Lens
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const capX = side * (halfW * 0.56);
      const capW = halfW * 0.42;
      const capH = 0.102;

      const capBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          capW,
          capH,
          0.026,
          capX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          0.92,
          0.006,
          0.52
        ),
        darkTrimMat
      );
      const capRedBacking = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          capW * 0.94,
          capH * 0.90,
          0.018,
          capX,
          0.678,
          tailSurfaceZ - 0.009,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          0.92,
          0.006,
          0.52
        ),
        unlitRubyReflectorMat
      );
      const capGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          capW * 0.98,
          capH * 0.94,
          0.008,
          capX,
          0.678,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          0.92,
          0.006,
          0.52
        ),
        redLensGlassMat
      );
      chassisGroup.add(capBezel, capRedBacking, capGlass);

      // Outer Circular Red Running & Brake Bowl
      const brakeX = capX + side * (capW * 0.18);
      const brakePt = evalFasciaCurveZ(brakeX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
      const miataBrakeGroup = new THREE.Group();
      miataBrakeGroup.position.set(brakeX, 0.678, brakePt.z);
      miataBrakeGroup.rotation.y = brakePt.yawY;
      const miataRunningRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.026, 0.0055, 10, 24),
        tailRunningMat
      );
      miataRunningRing.position.z = -0.006;
      const miataBrakeCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.016, 20),
        brakeLightMat
      );
      miataBrakeCore.rotation.x = Math.PI * 0.5;
      miataBrakeCore.position.z = -0.004;
      miataBrakeGroup.add(miataRunningRing, miataBrakeCore);
      chassisGroup.add(miataBrakeGroup);

      // Inner Upper Amber Turn Oval & Inner Lower Circular White Reverse
      const innerX = capX - side * (capW * 0.22);
      const innerPt = evalFasciaCurveZ(innerX, tailSurfaceZ - 0.014, rearHalfSpan, rearCurveZ);
      const innerGroup = new THREE.Group();
      innerGroup.position.set(innerX, 0.678, innerPt.z);
      innerGroup.rotation.y = innerPt.yawY;

      const miataTurn = new THREE.Mesh(
        createRoundedBoxGeometry(0.046, 0.026, 0.016, 0.010, 2),
        turnMat
      );
      miataTurn.position.set(0, 0.016, -0.004);
      const miataRev = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.016, 20),
        reverseLightMat
      );
      miataRev.rotation.x = Math.PI * 0.5;
      miataRev.position.set(0, -0.018, -0.004);
      innerGroup.add(miataTurn, miataRev);
      chassisGroup.add(innerGroup);
    });
  } else if (spec.id === 'bmw_m3_e46') {
    // ========================================================================
    // 24. BMW M3 GTR (E46): Iconic L-Shaped Rear-Light Assembly
    // Lower Horizontal Red Running LED Matrix + Outer Vertical Red L-Leg & Brake Core
    // + Upper Outer Amber Turn Block + Upper Inner Trunk Crystal-White Reverse Block
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const e46X = side * (halfW * 0.54);
      const e46W = halfW * 0.50;

      const e46Bezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W,
          0.122,
          0.028,
          e46X,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.02,
          0.004,
          0.20
        ),
        darkTrimMat
      );
      // Lower Horizontal Red L-Bar (Running Lights)
      const lowerLRunning = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W * 0.94,
          0.054,
          0.021,
          e46X,
          0.650,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          0.90,
          1.02,
          0.002,
          0.18
        ),
        tailRunningMat
      );
      // Dedicated Outer & Inner High-Intensity Brake Chambers inside the red L-section
      const e46BrakeChamber = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W * 0.52,
          0.044,
          0.023,
          e46X + side * (e46W * 0.18),
          0.650,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.92,
          1.02,
          0.002,
          0.18
        ),
        brakeLightMat
      );
      // Upper Outer Amber Turn-Signal Block
      const upperOuterAmber = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W * 0.45,
          0.048,
          0.022,
          e46X + side * (e46W * 0.24),
          0.708,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.95,
          1.02,
          0.002,
          0.18
        ),
        turnMat
      );
      // Upper Inner Crystal-White Reverse Block on Trunk Lid
      const upperInnerClear = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W * 0.45,
          0.048,
          0.022,
          e46X - side * (e46W * 0.24),
          0.708,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          0.95,
          0.002,
          0.18
        ),
        reverseLightMat
      );
      const e46OuterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          e46W * 0.98,
          0.118,
          0.008,
          e46X,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.02,
          0.004,
          0.20
        ),
        clearLensGlassMat
      );
      chassisGroup.add(
        e46Bezel,
        lowerLRunning,
        e46BrakeChamber,
        upperOuterAmber,
        upperInnerClear,
        e46OuterGlass
      );
    });
  } else if (spec.id === 'bmw_m3_e30') {
    // ========================================================================
    // 25. BMW M3 SPORT EVOLUTION (E30): Classic Horizontally Ribbed Rectangular
    // Rear Lamps with 4 Vertical Chambers per Side (Outer Amber Turn, Brake, Running, Inner Reverse)
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.56);
      const clW = halfW * 0.48;
      const clH = 0.104;

      const e30Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.10
        ),
        darkTrimMat
      );
      chassisGroup.add(e30Housing);

      // 4 Vertical Chambers from Outer to Inner: Turn (0.36), Brake (0.12), Running (-0.12), Reverse (-0.36)
      [
        { relOut: 0.36, wFrac: 0.23, mat: turnMat },
        { relOut: 0.12, wFrac: 0.23, mat: brakeLightMat },
        { relOut: -0.12, wFrac: 0.23, mat: tailRunningMat },
        { relOut: -0.36, wFrac: 0.21, mat: reverseLightMat },
      ].forEach(({ relOut, wFrac, mat }) => {
        const segMesh = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            clW * wFrac,
            clH * 0.84,
            0.022,
            clX + side * (clW * relOut),
            0.678,
            tailSurfaceZ - 0.012,
            rearHalfSpan,
            rearCurveZ,
            0.98,
            0.98,
            0,
            0.08
          ),
          mat
        );
        chassisGroup.add(segMesh);
      });

      // Signature E30 Horizontal Black Ribbed Lens Grooves
      [-0.028, 0.0, 0.028].forEach((ribDy) => {
        const ribBar = new THREE.Mesh(
          buildContouredLampClusterGeometry(
            clW * 0.96,
            0.005,
            0.025,
            clX,
            0.678 + ribDy,
            tailSurfaceZ - 0.014,
            rearHalfSpan,
            rearCurveZ,
            0.98,
            0.98,
            0,
            0.08
          ),
          darkTrimMat
        );
        chassisGroup.add(ribBar);
      });

      const e30Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.94,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.10
        ),
        clearLensGlassMat
      );
      chassisGroup.add(e30Glass);
    });
  } else if (spec.id === 'lancer_evo9') {
    // ========================================================================
    // 21. MITSUBISHI LANCER EVOLUTION IX MR (CT9A): Dark-Smoked Altezza Vertical-Stack
    // Rear Lamps with Large Upper Round Red Brake/Tail Bowl & Lower Round Amber/Clear Bowls
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const rallyX = side * (halfW * 0.62);
      const rallyW = halfW * 0.36;
      const rallyH = 0.150;

      const evo9Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW,
          rallyH,
          0.028,
          rallyX,
          0.686,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.82,
          1.06,
          0.010,
          0.24
        ),
        darkTrimMat
      );
      const evo9Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW * 0.98,
          rallyH * 0.96,
          0.008,
          rallyX,
          0.686,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.82,
          1.06,
          0.010,
          0.24
        ),
        smokedLensGlassMat
      );
      chassisGroup.add(evo9Housing, evo9Glass);

      const pt = evalFasciaCurveZ(rallyX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
      const opticsGroup = new THREE.Group();
      opticsGroup.position.set(rallyX, 0.686, pt.z);
      opticsGroup.rotation.y = pt.yawY;

      // Upper Large Chrome-Rimmed Red Running Ring + Central Brake Bulb
      const upperBowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.026, 0.016, 24),
        reflectorBowlMat
      );
      upperBowl.rotation.x = Math.PI * 0.5;
      upperBowl.position.set(-side * 0.010, 0.024, 0.002);

      const upperChromeRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.036, 0.0032, 10, 24),
        chromeMat
      );
      upperChromeRim.position.set(-side * 0.010, 0.024, -0.007);

      const upperRunningRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.027, 0.0055, 10, 24),
        tailRunningMat
      );
      upperRunningRing.position.set(-side * 0.010, 0.024, -0.008);

      const upperBrakeBulb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.019, 0.019, 0.016, 20),
        brakeLightMat
      );
      upperBrakeBulb.rotation.x = Math.PI * 0.5;
      upperBrakeBulb.position.set(-side * 0.010, 0.024, -0.004);

      // Lower Outer Circular Amber Turn Bowl & Lower Inner White Reverse Bowl
      const lowerTurnCircle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.016, 20),
        turnMat
      );
      lowerTurnCircle.rotation.x = Math.PI * 0.5;
      lowerTurnCircle.position.set(side * 0.026, -0.036, -0.004);

      const lowerRevCircle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.020, 0.020, 0.016, 20),
        reverseLightMat
      );
      lowerRevCircle.rotation.x = Math.PI * 0.5;
      lowerRevCircle.position.set(-side * 0.028, -0.036, -0.004);

      opticsGroup.add(
        upperBowl,
        upperChromeRim,
        upperRunningRing,
        upperBrakeBulb,
        lowerTurnCircle,
        lowerRevCircle
      );
      chassisGroup.add(opticsGroup);
    });
  } else if (spec.id === 'wrx_sti') {
    // ========================================================================
    // 23. SUBARU IMPREZA WRX STI (GDB HAWKEYE): Vertical-Rectangular Cluster
    // with Upper Ruby Housing, Lower Crystal Section, and Signature Circular Red
    // Brake/Running Ring Protruding into the Lower Clear Section
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const rallyX = side * (halfW * 0.62);
      const rallyW = halfW * 0.37;
      const rallyH = 0.148;

      const stiHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW,
          rallyH,
          0.028,
          rallyX,
          0.684,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.04,
          0.006,
          0.22
        ),
        darkTrimMat
      );
      // Upper Ruby-Red Housing Backing
      const stiUpperRed = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW * 0.92,
          rallyH * 0.56,
          0.018,
          rallyX,
          0.684 + rallyH * 0.18,
          tailSurfaceZ - 0.009,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.02,
          0.004,
          0.20
        ),
        unlitRubyReflectorMat
      );
      // Lower Crystal-Chrome Backing
      const stiLowerClear = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW * 0.92,
          rallyH * 0.38,
          0.018,
          rallyX,
          0.684 - rallyH * 0.24,
          tailSurfaceZ - 0.009,
          rearHalfSpan,
          rearCurveZ,
          0.88,
          1.02,
          0.002,
          0.20
        ),
        reflectorBowlMat
      );
      const stiOuterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          rallyW * 0.98,
          rallyH * 0.96,
          0.008,
          rallyX,
          0.684,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.04,
          0.006,
          0.22
        ),
        clearLensGlassMat
      );
      chassisGroup.add(stiHousing, stiUpperRed, stiLowerClear, stiOuterGlass);

      const pt = evalFasciaCurveZ(rallyX, tailSurfaceZ - 0.014, rearHalfSpan, rearCurveZ);
      const opticsGroup = new THREE.Group();
      opticsGroup.position.set(rallyX, 0.684, pt.z);
      opticsGroup.rotation.y = pt.yawY;

      // Signature GDB Hawkeye Prominent Circular Red Ring overlapping into the lower crystal section
      const gdbRingChrome = new THREE.Mesh(
        new THREE.TorusGeometry(0.039, 0.0038, 12, 28),
        chromeMat
      );
      gdbRingChrome.position.set(0, 0.012, -0.006);

      const gdbRunningRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.031, 0.0065, 12, 28),
        tailRunningMat
      );
      gdbRunningRing.position.set(0, 0.012, -0.008);

      const gdbBrakeCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.016, 22),
        brakeLightMat
      );
      gdbBrakeCore.rotation.x = Math.PI * 0.5;
      gdbBrakeCore.position.set(0, 0.012, -0.004);

      const lowerTurn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.020, 0.020, 0.016, 20),
        turnMat
      );
      lowerTurn.rotation.x = Math.PI * 0.5;
      lowerTurn.position.set(side * 0.030, -0.038, -0.004);

      const lowerRev = new THREE.Mesh(
        new THREE.CylinderGeometry(0.019, 0.019, 0.016, 20),
        reverseLightMat
      );
      lowerRev.rotation.x = Math.PI * 0.5;
      lowerRev.position.set(-side * 0.030, -0.038, -0.004);

      opticsGroup.add(gdbRingChrome, gdbRunningRing, gdbBrakeCore, lowerTurn, lowerRev);
      chassisGroup.add(opticsGroup);
    });
  } else if (spec.id === 'silvia_s15') {
    // ========================================================================
    // 4. NISSAN SILVIA SPEC-R AERO (S15): Elongated Wrap-Around Almond Wedge
    // Upper Smoked-Amber Turn Brow + Lower Ruby-Red Running & Dual Brake Bowls
    // + Inner Crystal-White Reverse Wedge + Side-Wrapping Quarter Lens
    // ========================================================================
    const s15InnerScale = 0.58;
    const s15OuterScale = 1.12;
    const s15BrowSlant = 0.016;
    const s15Sq = 0.38;

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.575);
      const clW = halfW * 0.45;
      const clH = 0.106;

      // 1. Recessed Dark Taillight Housing Bezel
      const clusterBezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          s15InnerScale,
          s15OuterScale,
          s15BrowSlant,
          s15Sq
        ),
        darkTrimMat
      );
      // 2. Signature S15 Upper Amber/Orange Turn-Signal Brow Band
      const amberUpperBand = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.90,
          clH * 0.36,
          0.022,
          clX + side * (clW * 0.02),
          0.678 + clH * 0.24,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          s15InnerScale * 0.95,
          s15OuterScale,
          s15BrowSlant * 0.85,
          s15Sq
        ),
        turnMat
      );
      // 3. Lower Main Ruby-Red Position / Running Chamber
      const redLowerRunning = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.92,
          clH * 0.50,
          0.020,
          clX,
          0.678 - clH * 0.18,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          s15InnerScale,
          s15OuterScale,
          s15BrowSlant * 0.35,
          s15Sq
        ),
        tailRunningMat
      );
      // 4. Dedicated High-Intensity S15 Outer/Middle Brake Reflector Core inside Lower Chamber
      const s15BrakeCore = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.58,
          clH * 0.42,
          0.023,
          clX + side * (clW * 0.12),
          0.678 - clH * 0.18,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.80,
          s15OuterScale * 0.96,
          s15BrowSlant * 0.35,
          s15Sq
        ),
        brakeLightMat
      );
      // 5. Inner Lower Crystal-White Reverse Lamp Chamber adjacent to trunk opening
      const reverseInner = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.28,
          clH * 0.34,
          0.024,
          clX - side * (clW * 0.30),
          0.678 - clH * 0.14,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          s15InnerScale,
          0.84,
          0.004,
          0.32
        ),
        reverseLightMat
      );
      // 6. Translucent Ruby/Clear Outer Polycarbonate Glaze
      const outerClusterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          s15InnerScale,
          s15OuterScale,
          s15BrowSlant,
          s15Sq
        ),
        redLensGlassMat
      );
      // 7. Side-Wrapping Rear Quarter Taillight Lens
      const wrapRedSide = new THREE.Mesh(
        createRoundedBoxGeometry(0.032, 0.056, 0.115, 0.010, 3),
        tailRunningMat
      );
      wrapRedSide.position.set(side * (halfW * 0.852), 0.660, rearZ + 0.048);
      wrapRedSide.rotation.y = -side * 0.18;
      const wrapAmberSide = new THREE.Mesh(
        createRoundedBoxGeometry(0.032, 0.036, 0.105, 0.008, 3),
        turnMat
      );
      wrapAmberSide.position.set(side * (halfW * 0.852), 0.702, rearZ + 0.044);
      wrapAmberSide.rotation.y = -side * 0.18;

      chassisGroup.add(
        clusterBezel,
        amberUpperBand,
        redLowerRunning,
        s15BrakeCore,
        reverseInner,
        outerClusterGlass,
        wrapRedSide,
        wrapAmberSide
      );
    });
  } else if (spec.id === 'silvia_s14') {
    // ========================================================================
    // 5. NISSAN SILVIA K'S AERO KOUKI (S14): Sharp Horizontal Rear-Light Geometry
    // Dark Smoked Center Garnish with Twin Square White Reverse Lamps
    // + Horizontal Segmented Running Bar + Recessed Brake Core + Outer Amber Corner
    // ========================================================================
    const s14CenterGarnish = new THREE.Mesh(
      buildContouredLampClusterGeometry(
        halfW * 0.62,
        0.096,
        0.026,
        0,
        0.678,
        tailSurfaceZ - 0.004,
        rearHalfSpan,
        rearCurveZ,
        1.0,
        1.0,
        0,
        0.16
      ),
      darkTrimMat
    );
    chassisGroup.add(s14CenterGarnish);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      // Twin Square Crystal-White Reverse Light Lenses inside the dark S14 Kouki center garnish
      const revX = side * (halfW * 0.185);
      const revPt = evalFasciaCurveZ(revX, tailSurfaceZ - 0.015, rearHalfSpan, rearCurveZ);
      const revSquare = new THREE.Mesh(
        createRoundedBoxGeometry(0.062, 0.056, 0.018, 0.004, 2),
        reverseLightMat
      );
      revSquare.position.set(revX, 0.678, revPt.z);
      revSquare.rotation.y = revPt.yawY;
      chassisGroup.add(revSquare);

      const clX = side * (halfW * 0.565);
      const clW = halfW * 0.48;
      const clH = 0.096;

      const s14Bezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.92,
          0.004,
          0.18
        ),
        darkTrimMat
      );
      // Inner/Middle Horizontal Ruby-Red Running Bar
      const s14RunningBar = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.66,
          clH * 0.84,
          0.020,
          clX - side * (clW * 0.14),
          0.678,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.96,
          0.002,
          0.18
        ),
        tailRunningMat
      );
      // Dedicated High-Intensity Inner Brake Core
      const s14BrakeCore = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.44,
          clH * 0.62,
          0.023,
          clX - side * (clW * 0.12),
          0.678,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.96,
          0.002,
          0.16
        ),
        brakeLightMat
      );
      // Outer Corner Amber Turn-Signal Section
      const s14AmberCorner = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.28,
          clH * 0.82,
          0.022,
          clX + side * (clW * 0.34),
          0.678,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.96,
          0.92,
          0.004,
          0.18
        ),
        turnMat
      );
      const s14OuterGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.92,
          0.004,
          0.18
        ),
        redLensGlassMat
      );
      const s14WrapSide = new THREE.Mesh(
        createRoundedBoxGeometry(0.032, 0.076, 0.105, 0.010, 3),
        turnMat
      );
      s14WrapSide.position.set(side * (halfW * 0.852), 0.676, rearZ + 0.044);
      s14WrapSide.rotation.y = -side * 0.18;

      chassisGroup.add(
        s14Bezel,
        s14RunningBar,
        s14BrakeCore,
        s14AmberCorner,
        s14OuterGlass,
        s14WrapSide
      );
    });
  } else if (spec.id === 'silvia_s13') {
    // ========================================================================
    // 6. NISSAN SILVIA K'S (S13 COUPE): Classic Horizontal Rectangular 3-Chamber
    // Smoked/Red/Amber Rear Lamps with Dark Center Garnish
    // ========================================================================
    const s13Garnish = new THREE.Mesh(
      buildContouredLampClusterGeometry(
        halfW * 0.56,
        0.098,
        0.024,
        0,
        0.678,
        tailSurfaceZ - 0.004,
        rearHalfSpan,
        rearCurveZ,
        1.0,
        1.0,
        0,
        0.12
      ),
      darkTrimMat
    );
    chassisGroup.add(s13Garnish);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.55);
      const clW = halfW * 0.49;
      const clH = 0.098;

      const s13Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        darkTrimMat
      );
      // Upper Outer Smoked-Amber Turn Bar
      const s13UpperTurn = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.52,
          clH * 0.38,
          0.022,
          clX + side * (clW * 0.21),
          0.678 + clH * 0.22,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        turnMat
      );
      // Upper Inner Crystal-White Reverse Bar
      const s13UpperRev = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.40,
          clH * 0.38,
          0.022,
          clX - side * (clW * 0.26),
          0.678 + clH * 0.22,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        reverseLightMat
      );
      // Lower Full-Width Ruby Running Bar + Dual Brake Cores
      const s13LowerRunning = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.94,
          clH * 0.44,
          0.020,
          clX,
          0.678 - clH * 0.22,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        tailRunningMat
      );
      const s13LowerBrake = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.64,
          clH * 0.36,
          0.023,
          clX + side * (clW * 0.08),
          0.678 - clH * 0.22,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        brakeLightMat
      );
      const s13Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.12
        ),
        smokedLensGlassMat
      );
      chassisGroup.add(s13Housing, s13UpperTurn, s13UpperRev, s13LowerRunning, s13LowerBrake, s13Glass);
    });
  } else if (spec.id === 'ae86_trueno') {
    // ========================================================================
    // 12. TOYOTA SPRINTER TRUENO GT-APEX (AE86 KOUKI "REDLINE"):
    // Full-Width Upper Redline Trim Bar + Dark Smoked Center License Garnish
    // + 3 Distinct Horizontal Square Chambers per Side (Outer Amber Turn, Middle Red Brake/Tail, Inner White Reverse)
    // ========================================================================
    const ae86CenterGarnish = new THREE.Mesh(
      buildContouredLampClusterGeometry(
        halfW * 0.56,
        0.102,
        0.024,
        0,
        0.678,
        tailSurfaceZ - 0.004,
        rearHalfSpan,
        rearCurveZ,
        1.0,
        1.0,
        0,
        0.10
      ),
      darkTrimMat
    );
    // Signature AE86 Kouki Full-Width Upper "Redline" Pinstripe Bar spanning across the entire tail panel
    const koukiRedlineBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.66, 0.020, 0.022, 0.720, tailSurfaceZ - 0.011, rearCurveZ, 0.96, 0.10),
      tailRunningMat
    );
    chassisGroup.add(ae86CenterGarnish, koukiRedlineBar);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.55);
      const clW = halfW * 0.49;
      const clH = 0.102;

      const ae86Bezel = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.10
        ),
        darkTrimMat
      );
      // Outer Square Chamber: Amber Turn Signal
      const outerAmber = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.30,
          clH * 0.58,
          0.022,
          clX + side * (clW * 0.32),
          0.664,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.08
        ),
        turnMat
      );
      // Middle Square Chamber: Red Running Surround + High-Intensity Brake Core
      const middleRunning = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.34,
          clH * 0.58,
          0.020,
          clX,
          0.664,
          tailSurfaceZ - 0.011,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.08
        ),
        tailRunningMat
      );
      const middleBrake = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.24,
          clH * 0.44,
          0.023,
          clX,
          0.664,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.08
        ),
        brakeLightMat
      );
      // Inner Square Chamber: Crystal-White Reverse Lamp
      const innerRev = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.26,
          clH * 0.58,
          0.022,
          clX - side * (clW * 0.33),
          0.664,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.08
        ),
        reverseLightMat
      );
      const ae86Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.94,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.021,
          rearHalfSpan,
          rearCurveZ,
          0.98,
          0.98,
          0,
          0.10
        ),
        clearLensGlassMat
      );
      chassisGroup.add(ae86Bezel, outerAmber, middleRunning, middleBrake, innerRev, ae86Glass);
    });
  } else if (spec.id === 'toyota_gr86') {
    // ========================================================================
    // 13. TOYOTA GR86 (ZN8): Modern 3D Sculpted C-Shaped Rear-Light Blades
    // Connected by a Black Trunk Garnish Trim Bar, with Inner Brake Chamber & Amber Strip
    // ========================================================================
    const gr86CenterBar = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.18, 0.028, 0.024, 0.694, tailSurfaceZ - 0.006, rearCurveZ, 0.95, 0.20),
      darkTrimMat
    );
    chassisGroup.add(gr86CenterBar);

    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.57);
      const clW = halfW * 0.46;
      const clH = 0.102;

      const gr86Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.684,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          1.10,
          0.014,
          0.34
        ),
        darkTrimMat
      );
      // Protruding 3D C-Blade Red LED Running Light Guide
      const cBladeRunning = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.92,
          clH * 0.76,
          0.022,
          clX,
          0.686,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          1.08,
          0.014,
          0.34
        ),
        tailRunningMat
      );
      // Inner High-Intensity Red Brake Core
      const gr86BrakeCore = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.56,
          clH * 0.46,
          0.024,
          clX + side * (clW * 0.08),
          0.692,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          0.74,
          1.04,
          0.010,
          0.30
        ),
        brakeLightMat
      );
      // Central Horizontal Amber Turn Strip
      const gr86TurnStrip = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.52,
          0.020,
          0.025,
          clX + side * (clW * 0.14),
          0.662,
          tailSurfaceZ - 0.015,
          rearHalfSpan,
          rearCurveZ,
          0.80,
          1.04,
          0.006,
          0.26
        ),
        turnMat
      );
      // Inner Lower Reverse Wedge
      const gr86Rev = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.30,
          0.024,
          0.024,
          clX - side * (clW * 0.26),
          0.662,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          0.70,
          0.92,
          0.004,
          0.24
        ),
        reverseLightMat
      );
      const gr86Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.684,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          1.10,
          0.014,
          0.34
        ),
        clearLensGlassMat
      );
      chassisGroup.add(gr86Housing, cBladeRunning, gr86BrakeCore, gr86TurnStrip, gr86Rev, gr86Glass);
    });
  } else if (spec.id === 'chaser_jzx100') {
    // ========================================================================
    // 14. TOYOTA CHASER TOURER V (JZX100 KOUKI): Wide Horizontal Wrap-Around
    // Two-Tone Red/Clear Rear Clusters with Dual Internal Circular Red Reflector Bowls
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.54);
      const clW = halfW * 0.54;
      const clH = 0.110;

      const jzxHousing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.678,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.90,
          1.02,
          0.004,
          0.18
        ),
        darkTrimMat
      );
      // Upper Ruby-Red Lens Section
      const jzxUpperRed = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.94,
          clH * 0.58,
          0.018,
          clX,
          0.678 + clH * 0.16,
          tailSurfaceZ - 0.009,
          rearHalfSpan,
          rearCurveZ,
          0.90,
          1.02,
          0.004,
          0.18
        ),
        unlitRubyReflectorMat
      );
      // Lower Clear/Smoked Strip: Outer Amber Turn + Inner Crystal Reverse
      const jzxTurnBar = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.46,
          clH * 0.30,
          0.022,
          clX + side * (clW * 0.24),
          0.678 - clH * 0.28,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.94,
          1.02,
          0.002,
          0.16
        ),
        turnMat
      );
      const jzxRevBar = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.44,
          clH * 0.30,
          0.022,
          clX - side * (clW * 0.24),
          0.678 - clH * 0.28,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.90,
          0.96,
          0.002,
          0.16
        ),
        reverseLightMat
      );
      const jzxGlass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.678,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.90,
          1.02,
          0.004,
          0.18
        ),
        clearLensGlassMat
      );
      chassisGroup.add(jzxHousing, jzxUpperRed, jzxTurnBar, jzxRevBar, jzxGlass);

      // Dual Circular Internal Reflector Bowls inside Upper Red Section (Signature JZX100 Kouki Tourer V look)
      [-0.20, 0.20].forEach((relX) => {
        const bowlX = clX + relX * clW;
        const pt = evalFasciaCurveZ(bowlX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
        const bowlGroup = new THREE.Group();
        bowlGroup.position.set(bowlX, 0.678 + clH * 0.15, pt.z);
        bowlGroup.rotation.y = pt.yawY;

        const chromeRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.027, 0.0028, 10, 22),
          chromeMat
        );
        chromeRim.position.z = -0.006;
        const runRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.020, 0.005, 10, 22),
          tailRunningMat
        );
        runRing.position.z = -0.007;
        const brakeBulb = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.016, 18),
          brakeLightMat
        );
        brakeBulb.rotation.x = Math.PI * 0.5;
        brakeBulb.position.z = -0.004;
        bowlGroup.add(chromeRim, runRing, brakeBulb);
        chassisGroup.add(bowlGroup);
      });
    });
  } else if (spec.id === 'lancer_evo10') {
    // ========================================================================
    // 22. MITSUBISHI LANCER EVOLUTION X (CZ4A): Sharp Inward-Slanted Trapezoidal
    // Rear Lamps Extending onto the Trunk Lid with Dual Internal Circular LED Rings
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.55);
      const clW = halfW * 0.50;
      const clH = 0.098;

      const evo10Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.684,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.60,
          1.08,
          0.018,
          0.26
        ),
        darkTrimMat
      );
      const evo10Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.684,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.60,
          1.08,
          0.018,
          0.26
        ),
        redLensGlassMat
      );
      // Inner Trunk-Side White Reverse Bar
      const evo10Rev = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.32,
          0.024,
          0.023,
          clX - side * (clW * 0.28),
          0.668,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.68,
          0.88,
          0.006,
          0.22
        ),
        reverseLightMat
      );
      // Outer Corner Amber Turn Wedge
      const evo10Turn = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.26,
          0.036,
          0.023,
          clX + side * (clW * 0.34),
          0.684,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.92,
          1.08,
          0.012,
          0.24
        ),
        turnMat
      );
      chassisGroup.add(evo10Housing, evo10Rev, evo10Turn, evo10Glass);

      // Dual Circular Internal Red Rings + Brake Cores inside Evo X housing
      [-0.06, 0.16].forEach((relOut, idx) => {
        const ringX = clX + side * (relOut * clW);
        const r = idx === 1 ? 0.028 : 0.024;
        const pt = evalFasciaCurveZ(ringX, tailSurfaceZ - 0.013, rearHalfSpan, rearCurveZ);
        const ringGroup = new THREE.Group();
        ringGroup.position.set(ringX, 0.686 + idx * 0.004, pt.z);
        ringGroup.rotation.y = pt.yawY;

        const runRing = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.0048, 10, 22),
          tailRunningMat
        );
        runRing.position.z = -0.006;
        const brakeCore = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.016, 18),
          brakeLightMat
        );
        brakeCore.rotation.x = Math.PI * 0.5;
        brakeCore.position.z = -0.004;
        ringGroup.add(runRing, brakeCore);
        chassisGroup.add(ringGroup);
      });
    });
  } else {
    // ========================================================================
    // 20. HONDA CIVIC TYPE R (FK8): Aggressive C-Shaped / Boomerang Rear-Light
    // Design Wrapping Around the Hatch Corners with 3D LED Light-Bars & Inner Wedges
    // ========================================================================
    [-1, 1].forEach((side) => {
      const turnMat = getTurnMat(side);
      const clX = side * (halfW * 0.56);
      const clW = halfW * 0.48;
      const clH = 0.128;

      const fk8Housing = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW,
          clH,
          0.028,
          clX,
          0.692,
          tailSurfaceZ - 0.004,
          rearHalfSpan,
          rearCurveZ,
          0.56,
          1.14,
          0.020,
          0.32
        ),
        darkTrimMat
      );
      // Upper C-Blade LED Light Bar
      const fk8UpperBlade = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.90,
          0.032,
          0.022,
          clX + side * (clW * 0.04),
          0.734,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.60,
          1.12,
          0.018,
          0.28
        ),
        tailRunningMat
      );
      // Lower C-Blade LED Light Bar
      const fk8LowerBlade = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.92,
          0.032,
          0.022,
          clX + side * (clW * 0.04),
          0.652,
          tailSurfaceZ - 0.012,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          1.12,
          -0.012,
          0.28
        ),
        tailRunningMat
      );
      // Outer Vertical C-Spine & High-Intensity Brake Cluster
      const fk8BrakeCluster = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.46,
          0.088,
          0.024,
          clX + side * (clW * 0.24),
          0.692,
          tailSurfaceZ - 0.014,
          rearHalfSpan,
          rearCurveZ,
          0.86,
          1.12,
          0.008,
          0.30
        ),
        brakeLightMat
      );
      // Inner Tailgate Amber Turn Wedge & White Reverse Wedge
      const fk8TurnWedge = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.42,
          0.026,
          0.023,
          clX - side * (clW * 0.20),
          0.704,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          0.94,
          0.006,
          0.24
        ),
        turnMat
      );
      const fk8RevWedge = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.42,
          0.026,
          0.023,
          clX - side * (clW * 0.20),
          0.678,
          tailSurfaceZ - 0.013,
          rearHalfSpan,
          rearCurveZ,
          0.64,
          0.94,
          -0.004,
          0.24
        ),
        reverseLightMat
      );
      const fk8Glass = new THREE.Mesh(
        buildContouredLampClusterGeometry(
          clW * 0.98,
          clH * 0.96,
          0.008,
          clX,
          0.692,
          tailSurfaceZ - 0.022,
          rearHalfSpan,
          rearCurveZ,
          0.56,
          1.14,
          0.020,
          0.32
        ),
        clearLensGlassMat
      );
      chassisGroup.add(
        fk8Housing,
        fk8UpperBlade,
        fk8LowerBlade,
        fk8BrakeCluster,
        fk8TurnWedge,
        fk8RevWedge,
        fk8Glass
      );
    });
  }


  // --------------------------------------------------------------------------
  // MANUFACTURER-ACCURATE 3D REAR TRUNK EMBLEMS & BADGES
  // --------------------------------------------------------------------------
  if (spec.manufacturer === 'Nissan' && !isSkyline) {
    const nissanY = spec.id === 'silvia_s15' ? 0.724 : 0.678;
    const nissanZ = spec.id === 'silvia_s14' ? rearZ - 0.068 : rearZ - 0.058;
    const nissanRing = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0034, 12, 24), chromeMat);
    nissanRing.position.set(0, nissanY, nissanZ);
    const nissanBar = new THREE.Mesh(
      createRoundedBoxGeometry(0.048, 0.010, 0.008, 0.003, 2),
      chromeMat
    );
    nissanBar.position.set(0, nissanY, nissanZ - 0.002);
    chassisGroup.add(nissanRing, nissanBar);

    if (spec.id === 'silvia_s15') {
      // S15 Center Trunk "Silvia Spec-R" Emblem + Right Trunk Keyhole (matches S15 Rear Blueprint)
      const s15TrunkBadge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.145, 0.054),
        new THREE.MeshStandardMaterial({
          map: tex.silviaSpecRBadgeTex,
          transparent: true,
          roughness: 0.24,
          metalness: 0.55,
        })
      );
      s15TrunkBadge.position.set(0, 0.654, rearZ - 0.058);
      s15TrunkBadge.rotation.y = Math.PI;
      chassisGroup.add(s15TrunkBadge);

      const s15Keyhole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 14),
        chromeMat
      );
      s15Keyhole.rotation.x = Math.PI * 0.5;
      s15Keyhole.position.set(-0.175, 0.658, rearZ - 0.058);
      chassisGroup.add(s15Keyhole);
    } else if (spec.id === 'silvia_s14') {
      // S14 Kouki Top-Left "Silvia" Chrome Script & Top-Right "K's" Trunk Emblem above Taillights
      const s14LeftScript = new THREE.Mesh(
        new THREE.PlaneGeometry(0.115, 0.028),
        new THREE.MeshStandardMaterial({
          map: tex.silviaScriptTex,
          transparent: true,
          roughness: 0.22,
          metalness: 0.72,
        })
      );
      s14LeftScript.position.set(halfW * 0.54, 0.742, rearZ - 0.056);
      s14LeftScript.rotation.y = Math.PI;

      const s14RightKs = new THREE.Mesh(
        new THREE.PlaneGeometry(0.068, 0.028),
        new THREE.MeshStandardMaterial({
          map: tex.silviaKsBadgeTex,
          transparent: true,
          roughness: 0.22,
          metalness: 0.72,
        })
      );
      s14RightKs.position.set(-halfW * 0.56, 0.742, rearZ - 0.056);
      s14RightKs.rotation.y = Math.PI;
      chassisGroup.add(s14LeftScript, s14RightKs);
    }
  } else if (spec.manufacturer === 'Toyota' || spec.manufacturer === 'Subaru' || spec.manufacturer === 'Mazda') {
    const ovalEmblem = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0038, 12, 24), chromeMat);
    ovalEmblem.scale.set(1.35, 0.92, 1);
    ovalEmblem.position.set(0, 0.725, rearZ - 0.056);
    chassisGroup.add(ovalEmblem);
  } else if (spec.manufacturer === 'Honda') {
    const hMat =
      spec.id === 'civic_typer' || spec.id === 'nsx_na1'
        ? new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4, roughness: 0.2 })
        : chromeMat;
    const hBadge = new THREE.Mesh(
      createRoundedBoxGeometry(0.038, 0.032, 0.010, 0.004, 2),
      hMat
    );
    hBadge.position.set(0, 0.725, rearZ - 0.056);
    chassisGroup.add(hBadge);
  } else if (spec.manufacturer === 'BMW') {
    const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 20), chromeMat);
    roundel.rotation.x = Math.PI * 0.5;
    roundel.position.set(0, 0.725, rearZ - 0.056);
    chassisGroup.add(roundel);
  }

  if (isSkyline) {
    const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 14), chromeMat);
    keyhole.rotation.x = Math.PI * 0.5;
    keyhole.position.set(0, spec.id === 'r32_gtr' ? 0.708 : 0.632, rearZ - 0.058);
    chassisGroup.add(keyhole);

    if (spec.id === 'r33_gtr') {
      // Recessed Center Garnish Bezel between lower taillight strips on BCNR33
      const r33GarnishBar = new THREE.Mesh(
        createRoundedBoxGeometry(halfW * 0.54, 0.036, 0.022, 0.006, 2),
        darkTrimMat
      );
      r33GarnishBar.position.set(0, 0.592, rearZ - 0.050);
      chassisGroup.add(r33GarnishBar);
    }

    // Embossed "S K Y L I N E" Rear Center Garnish across Trunk Panel
    const skylineGarnish = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.048),
      new THREE.MeshStandardMaterial({
        map: tex.skylineEmbossedTex,
        transparent: true,
        roughness: 0.24,
        metalness: 0.35,
      })
    );
    skylineGarnish.position.set(0, spec.id === 'r32_gtr' ? 0.654 : 0.592, rearZ - 0.058);
    skylineGarnish.rotation.y = Math.PI;
    chassisGroup.add(skylineGarnish);

    const rearGtrBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.050, 0.034, 0.012),
      new THREE.MeshStandardMaterial({
        map: tex.gtrBadgeTex,
        roughness: 0.25,
        metalness: 0.55,
      })
    );
    rearGtrBadge.position.set(
      spec.id === 'r32_gtr' ? -halfW * 0.28 : -halfW * 0.26,
      spec.id === 'r32_gtr' ? 0.688 : 0.648,
      rearZ - 0.058
    );
    rearGtrBadge.rotation.y = Math.PI;
    chassisGroup.add(rearGtrBadge);

    if (spec.id === 'r32_gtr') {
      // Top-Left "NISSAN" Chrome Wordmark above Left Outer Taillight (matches BNR32 Inspection Blueprint)
      const nissanWordmark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.098, 0.024),
        new THREE.MeshStandardMaterial({
          map: tex.nissanWordmarkTex,
          transparent: true,
          roughness: 0.22,
          metalness: 0.75,
        })
      );
      nissanWordmark.position.set(halfW * 0.58, 0.752, rearZ - 0.056);
      nissanWordmark.rotation.y = Math.PI;
      chassisGroup.add(nissanWordmark);
    }

    const vspecDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.095, 0.024),
      new THREE.MeshStandardMaterial({
        map: tex.vspecBadgeTex,
        transparent: true,
        roughness: 0.3,
      })
    );
    // On BNR32 & BCNR33, V-spec II decal sits on the upper-right trunk edge above the right outer taillight
    vspecDecal.position.set(
      spec.id === 'r34_gtr' ? -halfW * 0.61 : -halfW * 0.57,
      spec.id === 'r34_gtr' ? 0.582 : 0.752,
      rearZ - 0.056
    );
    vspecDecal.rotation.y = Math.PI;
    chassisGroup.add(vspecDecal);
  }

  // Recessed Center Rear License Plate Pocket (rounded edges)
  const isSilviaAero = spec.id === 'silvia_s15' || spec.id === 'silvia_s14';
  const platePocketMat = new THREE.MeshStandardMaterial({
    color:
      spec.id === 'r34_gtr'
        ? 0x09357a
        : spec.id === 'r33_gtr'
          ? 0x1e0d2e
          : spec.id === 'r32_gtr'
            ? 0x262b33
            : spec.id === 'silvia_s15'
              ? 0xd6d3cb
              : spec.id === 'silvia_s14'
                ? 0x063d31
                : 0x0f141d,
    roughness: 0.45,
    metalness: 0.35,
  });
  const platePocket = new THREE.Mesh(
    createRoundedBoxGeometry(spec.id === 'r32_gtr' ? 0.54 : 0.44, 0.168, 0.034, 0.014, 2),
    platePocketMat
  );
  platePocket.position.set(0, 0.390, rearZ - 0.062);
  chassisGroup.add(platePocket);

  [-1, 1].forEach((side) => {
    if (spec.id !== 'r33_gtr' && spec.id !== 'r32_gtr') {
      const pocketRib = new THREE.Mesh(
        createRoundedBoxGeometry(0.036, 0.172, 0.042, 0.010, 2),
        rearBumperMat
      );
      pocketRib.position.set(side * 0.232, 0.390, rearZ - 0.062);
      chassisGroup.add(pocketRib);
    }

    if (spec.id === 'r32_gtr') {
      // Iconic BNR32 Smoked-Clear Rectangular Reverse Light Lenses flanking the rear license plate pocket
      const r32RevBezel = new THREE.Mesh(
        createRoundedBoxGeometry(0.082, 0.038, 0.018, 0.005, 2),
        darkTrimMat
      );
      r32RevBezel.position.set(side * 0.198, 0.376, rearZ - 0.068);
      const r32RevLens = new THREE.Mesh(
        createRoundedBoxGeometry(0.070, 0.028, 0.020, 0.004, 2),
        reverseLightMat
      );
      r32RevLens.position.set(side * 0.198, 0.376, rearZ - 0.070);
      const r32RevGlass = new THREE.Mesh(
        createRoundedBoxGeometry(0.074, 0.030, 0.006, 0.004, 2),
        clearLensGlassMat
      );
      r32RevGlass.position.set(side * 0.198, 0.376, rearZ - 0.078);
      chassisGroup.add(r32RevBezel, r32RevLens, r32RevGlass);
    } else if (spec.id === 'r34_gtr') {
      // JDM BNR34 Asymmetric Rear Bumper Lamps: Left (side > 0) = White Reverse, Right (side < 0) = Red Rear Fog
      const lampBezel = new THREE.Mesh(
        createRoundedBoxGeometry(0.118, 0.038, 0.018, 0.006, 2),
        darkTrimMat
      );
      lampBezel.position.set(side * 0.295, 0.448, rearZ - 0.068);
      chassisGroup.add(lampBezel);

      const lampLens = new THREE.Mesh(
        createRoundedBoxGeometry(0.104, 0.028, 0.020, 0.005, 2),
        side > 0 ? reverseLightMat : tailRunningMat
      );
      lampLens.position.set(side * 0.295, 0.448, rearZ - 0.070);
      chassisGroup.add(lampLens);
    }
  });

  const plateFrame = new THREE.Mesh(
    createRoundedBoxGeometry(0.285, 0.122, 0.014, 0.008, 2),
    darkTrimMat
  );
  plateFrame.position.set(0, 0.368, rearZ - 0.074);
  chassisGroup.add(plateFrame);

  const plateBody = new THREE.Mesh(
    createRoundedBoxGeometry(0.272, 0.112, 0.016, 0.006, 2),
    isSilviaAero
      ? bodyMat
      : new THREE.MeshStandardMaterial({
          color: spec.id === 'r32_gtr' ? 0x0b0e14 : 0xf8fafc,
          roughness: 0.32,
          metalness: 0.12,
        })
  );
  plateBody.position.set(0, 0.368, rearZ - 0.076);
  chassisGroup.add(plateBody);

  if (!isSilviaAero) {
    const rearPlateFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.262, 0.104),
      spec.id === 'r32_gtr'
        ? new THREE.MeshStandardMaterial({
            map: tex.gtrShowPlateTex,
            roughness: 0.26,
            metalness: 0.32,
          })
        : procMats.jdmPlateMat
    );
    rearPlateFace.position.set(0, 0.368, rearZ - 0.085);
    rearPlateFace.rotation.y = Math.PI;
    chassisGroup.add(rearPlateFace);
  }

  // Dual LED License Plate Illumination Lamps tucked into the upper plate pocket overhang
  const plateLedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  [-0.085, 0.085].forEach((plX) => {
    const plateLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.008, 0.014),
      plateLedMat
    );
    plateLamp.position.set(plX, 0.442, rearZ - 0.074);
    chassisGroup.add(plateLamp);
  });

  // 4 Flush Ultrasonic Rear Bumper Parking Sensors (omitted on classic 90s BNR32, BCNR33, S15 & S14)
  if (spec.id !== 'r32_gtr' && spec.id !== 'r33_gtr' && !isSilviaAero) {
    [-0.64, -0.28, 0.28, 0.64].forEach((sxRel) => {
      const sx = sxRel * halfW;
      const sPt = evalFasciaCurveZ(sx, rearZ - 0.072, rearHalfSpan, -0.055);
      const sensorRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.006, 12),
        darkTrimMat
      );
      sensorRing.rotation.x = Math.PI * 0.5;
      sensorRing.position.set(sx, 0.485, sPt.z);
      sensorRing.rotation.y = sPt.yawY;
      chassisGroup.add(sensorRing);
    });
  }

  if (spec.id !== 'r32_gtr' && !isSilviaAero) {
    [-1, 1].forEach((side) => {
      const refX = side * (halfW * 0.72);
      const refPt = evalFasciaCurveZ(refX, rearZ - 0.066, rearHalfSpan, -0.045);
      const rearReflector = new THREE.Mesh(
        createRoundedBoxGeometry(0.095, 0.018, 0.010, 0.003, 2),
        unlitRubyReflectorMat
      );
      rearReflector.position.set(refX, 0.288, refPt.z);
      rearReflector.rotation.y = refPt.yawY;
      chassisGroup.add(rearReflector);
    });

    // Anodized Red Rear Racing Tow Hook protruding cleanly below the rear diffuser
    const rearTowMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.85,
      roughness: 0.20,
    });
    const rearTowBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.012, 0.065),
      rearTowMat
    );
    rearTowBracket.position.set(-0.24, 0.195, rearZ - 0.058);
    const rearTowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.0055, 10, 20),
      rearTowMat
    );
    rearTowRing.rotation.x = -Math.PI * 0.32;
    rearTowRing.position.set(-0.24, 0.188, rearZ - 0.092);
    chassisGroup.add(rearTowBracket, rearTowRing);
  }

  // Underbody Rear Diffuser / Apron (Smooth rounded body-colored lower apron + Aero corner spats on BCNR33, BNR32, S15 & S14)
  if (spec.id === 'r33_gtr' || spec.id === 'r32_gtr' || isSilviaAero) {
    const r33LowerApron = new THREE.Mesh(
      buildSculptedFasciaBar(halfW * 1.68, 0.072, 0.056, 0.235, rearZ - 0.008, -0.048, 0.92, 0.26),
      bodyMat
    );
    chassisGroup.add(r33LowerApron);

    [-1, 1].forEach((side) => {
      const rearCornerSpat = new THREE.Mesh(
        createRoundedBoxGeometry(isSilviaAero ? 0.22 : 0.18, isSilviaAero ? 0.056 : 0.048, 0.105, 0.014, 2),
        bodyMat
      );
      rearCornerSpat.position.set(
        side * (halfW * (isSilviaAero ? 0.72 : 0.74)),
        isSilviaAero ? 0.225 : 0.235,
        rearZ - 0.032
      );
      rearCornerSpat.rotation.y = -side * 0.18;
      chassisGroup.add(rearCornerSpat);

      if (spec.id === 'r32_gtr' || isSilviaAero) {
        // Full-depth rear bumper side wrap & lower rear quarter Aero spat extending forward to the rear wheel arch
        const rearSideWing = new THREE.Mesh(
          createRoundedBoxGeometry(0.044, 0.295, 0.38, 0.016, 3),
          bodyMat
        );
        rearSideWing.position.set(side * (halfW * 0.855), 0.352, rearZ + 0.215);
        rearSideWing.rotation.y = -side * 0.05;
        chassisGroup.add(rearSideWing);

        const rearSideSpat = new THREE.Mesh(
          createRoundedBoxGeometry(0.052, 0.054, 0.38, 0.012, 2),
          bodyMat
        );
        rearSideSpat.position.set(side * (halfW * 0.858), 0.184, rearZ + 0.215);
        rearSideSpat.rotation.y = -side * 0.05;
        chassisGroup.add(rearSideSpat);
      }
    });

    if (spec.id === 'r32_gtr' || isSilviaAero) {
      // Visible angled stainless-steel exhaust tailpipe routing from center diff to left muffler canister
      const angledUnderPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.030, 0.030, 0.44, 16),
        getBrushedAluminumMaterial()
      );
      angledUnderPipe.rotation.z = Math.PI * 0.5 - 0.16;
      angledUnderPipe.rotation.y = 0.26;
      angledUnderPipe.position.set(0.20, 0.195, rearZ + 0.14);
      chassisGroup.add(angledUnderPipe);
    }
  } else {
    const diffuserValance = new THREE.Mesh(
      createRoundedBoxGeometry(halfW * 1.38, 0.086, 0.14, 0.016, 2),
      carbonMat
    );
    diffuserValance.position.set(0, 0.215, rearZ - 0.015);
    chassisGroup.add(diffuserValance);

    [-0.48, -0.18, 0.18, 0.48].forEach((finX) => {
      const fin = new THREE.Mesh(
        createRoundedBoxGeometry(0.016, 0.090, 0.17, 0.004, 2),
        carbonMat
      );
      fin.position.set(finX, 0.205, rearZ - 0.025);
      chassisGroup.add(fin);
    });
  }

  // Model-Accurate Exhaust Pipe Layouts (returns active exhaust X positions for backfire alignment)
  const burntTiMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x1e3a8a,
    emissiveIntensity: 0.4,
    metalness: 0.95,
    roughness: 0.12,
  });
  const boreDarkMat = new THREE.MeshBasicMaterial({ color: 0x030407 });

  const isTripleCenter = spec.id === 'ferrari_f40' || spec.id === 'civic_typer';
  const isDualSymmetrical =
    spec.id === 'supra_mk5' ||
    spec.id === 'fairlady_350z' ||
    spec.id === 'nissan_370z' ||
    spec.id === 'toyota_gr86' ||
    spec.id === 'honda_s2000' ||
    spec.id === 'nsx_na1' ||
    spec.id === 'rx7_fc' ||
    spec.id === 'lancer_evo10';
  const isQuadBmw = spec.id === 'bmw_m3_e46';

  const exStyle = custom?.exhaustStyle ?? spec.defaultCustomization.exhaustStyle ?? 'stock';
  const isSingleLargeGtr =
    exStyle === 'titanium_cannon' ||
    (exStyle === 'stock' &&
      (spec.id === 'r34_gtr' || spec.id === 'r33_gtr' || spec.id === 'r32_gtr' || spec.id === 'silvia_s15'));
  const isS14TwinLeft = exStyle === 'stock' && spec.id === 'silvia_s14';

  const exhaustXPositions =
    exStyle === 'quad_race'
      ? [-0.46, -0.355, 0.355, 0.46]
      : exStyle === 'dual_blast'
        ? [-0.44, 0.44]
        : exStyle === 'titanium_cannon'
          ? [0.412]
          : isSingleLargeGtr
            ? [0.412]
            : isS14TwinLeft
              ? [0.382, 0.446]
              : isTripleCenter
                ? [-0.085, 0.0, 0.085]
                : isQuadBmw
                  ? [-0.46, -0.36, 0.36, 0.46]
                  : isDualSymmetrical
                    ? [-0.44, 0.44]
                    : [0.42];

  if (isSingleLargeGtr || isS14TwinLeft || exStyle === 'dual_blast' || exStyle === 'quad_race') {
    const cutoutXs =
      exStyle === 'dual_blast' || exStyle === 'quad_race' ? [-0.41, 0.41] : [0.414];
    cutoutXs.forEach((cx) => {
      if (spec.id !== 'r32_gtr') {
        const exhaustCutout = new THREE.Mesh(
          createRoundedBoxGeometry(
            exStyle === 'quad_race' ? 0.26 : 0.22,
            0.095,
            0.080,
            0.018,
            3
          ),
          darkTrimMat
        );
        exhaustCutout.position.set(cx, 0.242, rearZ - 0.044);
        chassisGroup.add(exhaustCutout);
      }

      const mufflerCanister = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.072, 0.24, 24),
        getBrushedAluminumMaterial()
      );
      mufflerCanister.rotation.x = Math.PI * 0.5;
      if (exStyle === 'titanium_cannon' || spec.id === 'r32_gtr' || spec.id === 'silvia_s15') {
        mufflerCanister.rotation.z = -0.08;
      }
      mufflerCanister.position.set(cx, 0.228, rearZ + 0.045);
      chassisGroup.add(mufflerCanister);
    });
  }

  const pipeRadius =
    exStyle === 'titanium_cannon'
      ? 0.068
      : exStyle === 'quad_race'
        ? 0.040
        : isSingleLargeGtr
          ? 0.062
          : isS14TwinLeft
            ? 0.032
            : exStyle === 'dual_blast'
              ? 0.054
              : exhaustXPositions.length === 1
                ? 0.056
                : isTripleCenter || isQuadBmw
                  ? 0.036
                  : 0.046;

  exhaustXPositions.forEach((exX) => {
    const isBurntFinish =
      exStyle === 'titanium_cannon' ||
      exStyle === 'dual_blast' ||
      exStyle === 'quad_race' ||
      (!isSingleLargeGtr && !isS14TwinLeft && exStyle !== 'stock');
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius, pipeRadius + 0.002, 0.18, 28),
      getBrushedAluminumMaterial()
    );
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(exX, 0.228, rearZ - 0.024);
    chassisGroup.add(barrel);

    const tipRim = new THREE.Mesh(
      new THREE.TorusGeometry(
        pipeRadius - 0.003,
        isSingleLargeGtr ? 0.0085 : 0.0055,
        14,
        28
      ),
      isBurntFinish ? burntTiMat : chromeMat
    );
    tipRim.position.set(exX, 0.228, rearZ - 0.114);
    chassisGroup.add(tipRim);

    const innerBore = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius - 0.009, pipeRadius - 0.009, 0.184, 24),
      boreDarkMat
    );
    innerBore.rotation.x = Math.PI * 0.5;
    innerBore.position.set(exX, 0.228, rearZ - 0.026);
    chassisGroup.add(innerBore);
  });

  return exhaustXPositions;
}

// ============================================================================
// 6. HIGH-MOUNT CARBON FIBER GT WING WITH SCULPTED SWAN-NECK PEDESTALS
// ============================================================================
function buildBlueprintGTWing(
  spoilerGroup: THREE.Group,
  L: number,
  W: number,
  carbonMat: THREE.Material,
  _darkTrimMat: THREE.Material,
  deckY: number = 0.808
) {
  const wingZ = -L * 0.435;
  const wingY = deckY + 0.345;
  const wingSpan = W * 0.98;

  const wingCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x12161f,
    roughness: 0.42,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });

  const chordShape = new THREE.Shape();
  chordShape.moveTo(0, 0);
  chordShape.quadraticCurveTo(0.11, -0.024, 0.24, 0.012);
  chordShape.lineTo(0.26, 0.038);
  chordShape.quadraticCurveTo(0.12, 0.012, 0, 0.016);
  chordShape.closePath();

  const bladeGeom = new THREE.ExtrudeGeometry(chordShape, {
    depth: wingSpan,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  });
  bladeGeom.center();
  const blade = new THREE.Mesh(bladeGeom, wingCarbonMat);
  blade.rotation.y = Math.PI * 0.5;
  blade.rotation.x = 0.10;
  blade.position.set(0, wingY, wingZ);
  spoilerGroup.add(blade);

  const uprightH = wingY - deckY;
  [-1, 1].forEach((side) => {
    const px = side * (W * 0.255);
    const frontStrut = new THREE.Mesh(new THREE.BoxGeometry(0.022, uprightH, 0.072), wingCarbonMat);
    frontStrut.position.set(px, deckY + uprightH * 0.5, wingZ + 0.025);
    frontStrut.rotation.x = -0.16;
    spoilerGroup.add(frontStrut);

    const rearStrut = new THREE.Mesh(new THREE.BoxGeometry(0.020, uprightH * 0.94, 0.046), wingCarbonMat);
    rearStrut.position.set(px, deckY + uprightH * 0.47, wingZ - 0.052);
    rearStrut.rotation.x = 0.14;
    spoilerGroup.add(rearStrut);

    const footPad = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.020, 0.170), wingCarbonMat);
    footPad.position.set(px, deckY + 0.004, wingZ - 0.01);
    spoilerGroup.add(footPad);

    const endplateShape = new THREE.Shape();
    endplateShape.moveTo(-0.15, -0.078);
    endplateShape.lineTo(0.14, -0.052);
    endplateShape.lineTo(0.18, 0.088);
    endplateShape.lineTo(-0.12, 0.068);
    endplateShape.closePath();

    const epGeom = new THREE.ExtrudeGeometry(endplateShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    });
    epGeom.center();
    const endplate = new THREE.Mesh(epGeom, carbonMat);
    endplate.rotation.y = Math.PI * 0.5;
    endplate.position.set(side * (wingSpan * 0.5 + 0.005), wingY + 0.005, wingZ - 0.01);
    spoilerGroup.add(endplate);
  });
}

// ============================================================================
// 7. FORGED JDM WHEELS (TE37 6-Spoke, Advan GT 5-Spoke, BBS LM Mesh, Watanabe 8-Spoke)
// ============================================================================
function buildTE37Wheel(
  wheelR: number,
  tireW: number,
  side: number,
  rimMat: THREE.Material,
  caliperMat: THREE.Material,
  rimStyle: string = 'te37_6spoke'
): { knuckleGroup: THREE.Group; spinGroup: THREE.Group } {
  const knuckleGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  knuckleGroup.add(spinGroup);

  const tireMat = getTireRubberMaterial();
  const rotorMat = getDrilledRotorMaterial();
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.15,
    side: THREE.DoubleSide,
  });

  // Rim radius sits at 67% of total tire outer radius for realistic JDM low-profile sidewall aspect ratio
  const rimR = wheelR * 0.67;
  const halfT = tireW * 0.5;

  // 1. Watertight, Continuous 3D LatheGeometry Tire Profile (Rounded Sidewalls, Rim-Protector Bead, Crowned Tread)
  // In LatheGeometry (before rotating Z by -PI/2): vector.x = radial distance from axle, vector.y = axial X offset
  const beadR = rimR - 0.003;
  const midSidewallR = rimR + (wheelR - rimR) * 0.48;
  const upperSidewallR = rimR + (wheelR - rimR) * 0.84;
  const shoulderR = wheelR - 0.008;

  const tireProfile: THREE.Vector2[] = [
    new THREE.Vector2(beadR, -halfT * 0.88),
    new THREE.Vector2(rimR + 0.005, -halfT * 0.94),
    new THREE.Vector2(midSidewallR, -halfT * 1.00),
    new THREE.Vector2(upperSidewallR, -halfT * 0.97),
    new THREE.Vector2(shoulderR, -halfT * 0.86),
    new THREE.Vector2(wheelR - 0.002, -halfT * 0.68),
    new THREE.Vector2(wheelR, -halfT * 0.35),
    new THREE.Vector2(wheelR + 0.001, 0.0),
    new THREE.Vector2(wheelR, halfT * 0.35),
    new THREE.Vector2(wheelR - 0.002, halfT * 0.68),
    new THREE.Vector2(shoulderR, halfT * 0.86),
    new THREE.Vector2(upperSidewallR, halfT * 0.97),
    new THREE.Vector2(midSidewallR, halfT * 1.00),
    new THREE.Vector2(rimR + 0.005, halfT * 0.94),
    new THREE.Vector2(beadR, halfT * 0.88),
  ];

  const tireGeom = new THREE.LatheGeometry(tireProfile, 48);
  tireGeom.rotateZ(-Math.PI * 0.5);
  tireGeom.computeVertexNormals();

  const tireMesh = new THREE.Mesh(tireGeom, tireMat);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  spinGroup.add(tireMesh);

  // Molded sidewall performance lettering ("YOKOHAMA ADVAN NEOVA AD09 265/35ZR18") & radial ribs
  const sidewallMat = getTireSidewallMaterial();
  const sidewallRingGeom = new THREE.RingGeometry(
    rimR + (wheelR - rimR) * 0.14,
    rimR + (wheelR - rimR) * 0.88,
    48,
    2
  );
  const outerSidewallRib = new THREE.Mesh(sidewallRingGeom, sidewallMat);
  outerSidewallRib.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  outerSidewallRib.position.x = side * (halfT * 0.994);
  spinGroup.add(outerSidewallRib);

  const innerSidewallRib = new THREE.Mesh(sidewallRingGeom, sidewallMat);
  innerSidewallRib.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
  innerSidewallRib.position.x = -side * (halfT * 0.994);
  spinGroup.add(innerSidewallRib);

  // 2. Continuous 3D LatheGeometry Forged Alloy Wheel Barrel & Stepped Outer Rim Flange
  // Built in positive outward coords then flipped if side < 0 so outer dish always faces outward
  const usePolishedSteppedLip = rimStyle === 'bbs_mesh' || rimStyle === 'watanabe_8spoke';
  const barrelProfile: THREE.Vector2[] = [
    new THREE.Vector2(rimR + 0.005, -halfT * 0.88),
    new THREE.Vector2(rimR * 0.86, -halfT * 0.82),
    new THREE.Vector2(rimR * 0.85, halfT * 0.36),
    new THREE.Vector2(rimR * 0.90, halfT * 0.54),
    new THREE.Vector2(rimR * 0.95, halfT * 0.74),
    new THREE.Vector2(rimR + 0.004, halfT * 0.85),
    new THREE.Vector2(rimR + 0.007, halfT * 0.91),
    new THREE.Vector2(rimR - 0.004, halfT * 0.92),
    new THREE.Vector2(rimR * 0.92, halfT * 0.74),
    new THREE.Vector2(rimR * 0.87, halfT * 0.54),
  ];

  const barrelGeom = new THREE.LatheGeometry(barrelProfile, 48);
  barrelGeom.rotateZ(side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
  barrelGeom.computeVertexNormals();

  const barrelMesh = new THREE.Mesh(
    barrelGeom,
    usePolishedSteppedLip ? chromeMat : rimMat
  );
  spinGroup.add(barrelMesh);

  // Inner dark shadow barrel & inboard backing plate so background never shows through spokes
  const innerDarkDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.845, rimR * 0.845, tireW * 0.62, 36, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0x0b0e14,
      roughness: 0.78,
      metalness: 0.35,
      side: THREE.DoubleSide,
    })
  );
  innerDarkDrum.rotation.z = Math.PI * 0.5;
  innerDarkDrum.position.x = -side * (tireW * 0.14);
  spinGroup.add(innerDarkDrum);

  // 3. Rim Spokes (Perfectly Seated into the Stepped Rim Barrel at rimR * 0.88)
  const spokeLen = rimR * 0.85;
  if (rimStyle === 'bbs_mesh') {
    // Iconic 17-inch BBS RG Forged Cross-Mesh Lace Pattern (16 Split Y-Spokes + Forged Center Waffle Ring + Perimeter Rivets)
    const yCount = 16;
    for (let i = 0; i < yCount; i++) {
      const ang = (i / yCount) * Math.PI * 2;
      const spokeHolder = new THREE.Group();
      spokeHolder.rotation.x = ang;

      [-0.24, 0.24].forEach((forkAngle) => {
        const yBranch = new THREE.Mesh(
          createRoundedBoxGeometry(0.010, spokeLen * 0.76, 0.0095, 0.002, 2),
          rimMat
        );
        yBranch.position.set(
          side * (tireW * 0.31),
          spokeLen * 0.52 + 0.022,
          Math.sin(forkAngle) * (spokeLen * 0.21)
        );
        yBranch.rotation.x = forkAngle;
        yBranch.rotation.z = -side * 0.06;
        spokeHolder.add(yBranch);
      });

      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 6), chromeMat);
      rivet.position.set(side * (tireW * 0.35), rimR * 0.86, 0);
      spokeHolder.add(rivet);
      spinGroup.add(spokeHolder);
    }

    // BBS Forged Inner Hub Waffle Ring connecting the 16 Y-spokes
    const bbsInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(rimR * 0.31, 0.009, 10, 32),
      rimMat
    );
    bbsInnerRing.rotation.y = Math.PI * 0.5;
    bbsInnerRing.position.x = side * (tireW * 0.318);
    spinGroup.add(bbsInnerRing);
  } else if (rimStyle === 'watanabe_8spoke') {
    // Classic RS Watanabe 8-Spoke Deep-Dish Rounded Banana Spokes
    const spokeCount = 8;
    for (let i = 0; i < spokeCount; i++) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const spokeHolder = new THREE.Group();
      spokeHolder.rotation.x = ang;

      const bananaSpoke = new THREE.Mesh(
        createRoundedBoxGeometry(0.024, spokeLen * 0.86, 0.032, 0.008, 3),
        rimMat
      );
      bananaSpoke.position.set(side * (tireW * 0.30), spokeLen * 0.46 + 0.024, 0);
      bananaSpoke.rotation.z = -side * 0.14;
      spokeHolder.add(bananaSpoke);
      spinGroup.add(spokeHolder);
    }
  } else {
    // Volk Racing TE37 6-Spoke or Yokohama Advan GT 5-Spoke Deep-Concave Forged Monoblock
    const spokeCount = rimStyle === 'advan_5spoke' ? 5 : 6;
    const spokeW = rimStyle === 'advan_5spoke' ? 0.040 : 0.035;
    const concaveAngle = rimStyle === 'advan_5spoke' ? 0.15 : 0.11;

    for (let i = 0; i < spokeCount; i++) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const spokeHolder = new THREE.Group();
      spokeHolder.rotation.x = ang;

      const spokeMesh = new THREE.Mesh(
        createRoundedBoxGeometry(0.022, spokeLen, spokeW, 0.004, 2),
        rimMat
      );
      spokeMesh.position.set(side * (tireW * 0.33), spokeLen * 0.50 + 0.020, 0);
      spokeMesh.rotation.z = -side * concaveAngle;
      spokeHolder.add(spokeMesh);

      if (i === 0 && rimStyle === 'te37_6spoke') {
        const volkSticker = new THREE.Mesh(
          new THREE.BoxGeometry(0.004, spokeLen * 0.46, spokeW * 0.40),
          new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.25, metalness: 0.2 })
        );
        volkSticker.position.set(side * (tireW * 0.344), spokeLen * 0.54 + 0.020, 0);
        volkSticker.rotation.z = -side * concaveAngle;
        spokeHolder.add(volkSticker);
      }

      spinGroup.add(spokeHolder);
    }
  }

  // Anodized Red Racing Valve Stem
  const valveStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.022, 8),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.85, roughness: 0.2 })
  );
  valveStem.position.set(side * (tireW * 0.38), -rimR * 0.88 + 0.018, 0.022);
  spinGroup.add(valveStem);

  // Center Hub, Cap & 5 Racing Lug Nuts (Forged Silver Center Waffle Cap on BBS Mesh)
  const hubCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.060, 0.048, 24),
    rimMat
  );
  hubCyl.rotation.z = Math.PI * 0.5;
  hubCyl.position.x = side * (tireW * 0.31);
  spinGroup.add(hubCyl);

  const centerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(
      rimStyle === 'bbs_mesh' ? 0.022 : 0.030,
      rimStyle === 'bbs_mesh' ? 0.026 : 0.030,
      0.054,
      18
    ),
    rimStyle === 'bbs_mesh'
      ? rimMat
      : new THREE.MeshStandardMaterial({ color: 0x11151c, metalness: 0.85, roughness: 0.18 })
  );
  centerCap.rotation.z = Math.PI * 0.5;
  centerCap.position.x = side * (tireW * 0.32);
  spinGroup.add(centerCap);

  if (rimStyle === 'bbs_mesh') {
    const bbsLogoCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.056, 16),
      new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: 0.85, roughness: 0.20 })
    );
    bbsLogoCap.rotation.z = Math.PI * 0.5;
    bbsLogoCap.position.x = side * (tireW * 0.322);
    spinGroup.add(bbsLogoCap);
  }

  const centerCapRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.024, 0.0022, 8, 18),
    chromeMat
  );
  centerCapRing.rotation.y = Math.PI * 0.5;
  centerCapRing.position.x = side * (tireW * 0.348);
  spinGroup.add(centerCapRing);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.024, 8), chromeMat);
    lug.rotation.z = Math.PI * 0.5;
    lug.position.set(
      side * (tireW * 0.34),
      Math.cos(a) * 0.042,
      Math.sin(a) * 0.042
    );
    spinGroup.add(lug);
  }

  // Cross-Drilled Ventilated Brake Rotor, Bell Hat & Brembo Monoblock Caliper with Hardware
  const brakeRotor = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.74, rimR * 0.74, 0.024, 32),
    rotorMat
  );
  brakeRotor.rotation.z = Math.PI * 0.5;
  brakeRotor.position.x = side * (tireW * 0.18);
  knuckleGroup.add(brakeRotor);

  const rotorBellHat = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.32, rimR * 0.35, 0.036, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.85, roughness: 0.28 })
  );
  rotorBellHat.rotation.z = Math.PI * 0.5;
  rotorBellHat.position.x = side * (tireW * 0.21);
  knuckleGroup.add(rotorBellHat);

  const caliperBody = new THREE.Mesh(
    createRoundedBoxGeometry(0.048, 0.108, 0.062, 0.010, 3),
    caliperMat
  );
  caliperBody.position.set(side * (tireW * 0.23), 0.026, rimR * 0.46);
  caliperBody.rotation.x = -0.22;
  knuckleGroup.add(caliperBody);

  const caliperLogo = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.052, 0.015),
    chromeMat
  );
  caliperLogo.position.set(side * (tireW * 0.256), 0.026, rimR * 0.46);
  caliperLogo.rotation.x = -0.22;
  knuckleGroup.add(caliperLogo);

  // Caliper bridge bolts & bleeder hardware
  [-0.038, 0.0, 0.038].forEach((boltY) => {
    const bridgeBolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.058, 8),
      chromeMat
    );
    bridgeBolt.rotation.z = Math.PI * 0.5;
    bridgeBolt.position.set(side * (tireW * 0.24), 0.032 + boltY, rimR * 0.52);
    knuckleGroup.add(bridgeBolt);
  });

  // Visible Coilover Suspension Strut, Helical Spring & Lower Control Arm inside Wheel Well
  const strutDamper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, wheelR * 0.92, 12),
    chromeMat
  );
  strutDamper.position.set(-side * (tireW * 0.34), wheelR * 0.32, -0.025);
  strutDamper.rotation.z = side * 0.14;
  knuckleGroup.add(strutDamper);

  const springMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    metalness: 0.65,
    roughness: 0.25,
  });
  for (let sc = 0; sc < 5; sc++) {
    const coilRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.0055, 8, 16),
      springMat
    );
    coilRing.rotation.x = Math.PI * 0.5 + 0.12;
    coilRing.position.set(
      -side * (tireW * 0.34 + sc * 0.004),
      wheelR * 0.18 + sc * 0.034,
      -0.025
    );
    knuckleGroup.add(coilRing);
  }

  const lowerControlArm = new THREE.Mesh(
    createRoundedBoxGeometry(tireW * 0.65, 0.020, 0.048, 0.005, 2),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.32 })
  );
  lowerControlArm.position.set(-side * (tireW * 0.22), -0.045, 0);
  knuckleGroup.add(lowerControlArm);

  return { knuckleGroup, spinGroup };
}

// ============================================================================
// MAIN EXPORT: BUILD ALL 26 ICONIC JDM & EXOTIC SHOWPIECE MODELS
// ============================================================================
export function buildR34BlueprintModel(
  spec: VehicleSpec,
  custom?: VehicleCustomization,
  _isSoftwareGl?: boolean
): DetailedCarRig {
  const root = new THREE.Group();
  root.name = `car_${spec.id}`;

  const chassisGroup = new THREE.Group();
  if (custom?.rideHeightOffset) {
    chassisGroup.position.y = custom.rideHeightOffset;
  }
  root.add(chassisGroup);

  const L = spec.dimensions.length;
  const W = spec.dimensions.width;
  const H = spec.dimensions.height;
  const halfW = W * 0.5;
  const wheelbase = spec.dimensions.wheelbase;
  const vWheelR = getVisualWheelRadius(spec);
  const tireW = 0.255;
  const activeBodyKit = custom?.bodyKit ?? spec.defaultCustomization.bodyKit ?? 'stock';
  const hasWidebody = activeBodyKit === 'widebody_aero' || activeBodyKit === 'track_gt';

  const paintHex = custom?.paintColor ?? '#0047b8';
  const finishType = custom?.paintFinish ?? 'metallic';
  const procMats = getR34ProceduralMaterials();
  const tex = createR34Textures();

  const paintParams = computePaintMaterialParameters(finishType, paintHex, custom);
  const bodyColor = new THREE.Color(paintHex).multiplyScalar(paintParams.brightness);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    metalness: paintParams.metalness,
    roughness: paintParams.roughness,
    bumpMap: paintParams.useFlakeBump ? procMats.flakeBumpTex : null,
    bumpScale: paintParams.bumpScale,
    clearcoat: paintParams.clearcoat,
    clearcoatRoughness: paintParams.clearcoatRoughness,
    sheen: paintParams.sheen,
    sheenRoughness: paintParams.sheenRoughness,
    sheenColor: new THREE.Color(paintParams.sheenColorHex),
    iridescence: paintParams.iridescence,
    iridescenceIOR: paintParams.iridescenceIOR,
    reflectivity: paintParams.reflectivity,
    envMapIntensity: paintParams.envMapIntensity,
    side: THREE.DoubleSide,
  });

  const rimHex = custom?.rimColor ?? '#7c5c36';
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(rimHex),
    metalness: 0.88,
    roughness: 0.16,
    clearcoat: 0.72,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.24,
    side: THREE.DoubleSide,
  });

  const caliperMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(custom?.caliperColor ?? '#1d4ed8'),
    metalness: 0.65,
    roughness: 0.20,
    clearcoat: 0.85,
  });

  const carbonMat = getCarbonFiberMaterial();
  carbonMat.side = THREE.DoubleSide;
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    roughness: 0.52,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.10,
  });

  const windowTintVal = Math.max(0.05, Math.min(0.85, custom?.windowTint ?? spec.defaultCustomization.windowTint ?? 0.35));
  const windowGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b0f17,
    metalness: 0.28,
    roughness: 0.025,
    transmission: 0,
    transparent: true,
    opacity: Math.min(0.95, 0.72 + windowTintVal * 0.24),
    depthWrite: false,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 0.98,
    envMapIntensity: 1.42,
  });

  const headlightGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    metalness: 0.08,
    roughness: 0.04,
    transmission: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    clearcoat: 1.0,
  });

  // Independent Physically-Based Rear Lighting Materials:
  // 1. tailRunningMaterial: Position / running light rings & light bars
  const tailRunningMaterial = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xc8101c,
    emissiveIntensity: 1.65,
    roughness: 0.14,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  // 2. brakeLightMaterial (aliased as tailLightMaterial): Dedicated high-intensity brake bulbs, cores & CHMSL
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    emissive: 0xff111e,
    emissiveIntensity: 0.65,
    roughness: 0.14,
    metalness: 0.24,
    side: THREE.DoubleSide,
  });
  const tailLightMaterial = brakeLightMaterial;

  // 3. reverseLightMaterial: Crystal-white reverse chambers & bulbs (0 emissive when not reversing)
  const reverseLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0xffffff,
    emissiveIntensity: 0.0,
    roughness: 0.16,
    metalness: 0.32,
    side: THREE.DoubleSide,
  });

  // 4. Front/side amber marker material + independent Left & Right Rear Turn Signal materials
  const amberMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.85,
    roughness: 0.20,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  const turnSignalLeftMaterial = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0xff8c00,
    emissiveIntensity: 0.0,
    roughness: 0.18,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });

  const turnSignalRightMaterial = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0xff8c00,
    emissiveIntensity: 0.0,
    roughness: 0.18,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });

  // Shared Longitudinal Control Stations for 1:1 Spline Surface Alignment across Body, Hood, Bumpers & Wings
  const controlStations = buildVehicleControlStations(spec);

  // 1. Continuous Subdivision-Smooth Body Shell (Exact BNR34 or Silhouette-Shaped)
  const bodyGeom = buildSmoothSplineR34BodyGeometry(L, W, wheelbase, spec, controlStations, hasWidebody);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  chassisGroup.add(bodyMesh);

  // 1B. Contour-Matched Automotive Hood Panel Assembly (Shut-Lines, Power Dome, Wipers, and OEM vs Carbon Vented Louvers)
  buildContourMatchedHoodAssembly(
    chassisGroup,
    spec,
    controlStations,
    bodyMaterial,
    carbonMat,
    darkTrimMat,
    custom
  );

  const underbodyFloor = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.72, 0.04, L * 0.84),
    new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.92 })
  );
  underbodyFloor.position.set(0, 0.19, 0);
  chassisGroup.add(underbodyFloor);

  const frontZAxle = wheelbase * 0.5;
  const rearZAxle = -wheelbase * 0.5;

  // Underbody Mechanical Details: Front Aluminum Skid Plate, Exhaust Mid-Pipe & Finned Rear Differential
  const skidPlate = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.44, 0.012, L * 0.16),
    getBrushedAluminumMaterial()
  );
  skidPlate.position.set(0, 0.168, frontZAxle + 0.05);
  chassisGroup.add(skidPlate);

  const exhaustMidPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, wheelbase * 0.96, 12),
    getBrushedAluminumMaterial()
  );
  exhaustMidPipe.rotation.x = Math.PI * 0.5;
  exhaustMidPipe.position.set(0.12, 0.165, -0.08);
  chassisGroup.add(exhaustMidPipe);

  const rearDiffHousing = new THREE.Mesh(
    createRoundedBoxGeometry(0.24, 0.14, 0.22, 0.018, 2),
    getBrushedAluminumMaterial()
  );
  rearDiffHousing.position.set(0, 0.225, rearZAxle);
  chassisGroup.add(rearDiffHousing);

  const wellMat = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  // Recessed circular inner wheelhouse backing discs + 3D Rolled Wheel-Arch Inner Lip Flanges
  [frontZAxle, rearZAxle].forEach((zAxle) => {
    [-1, 1].forEach((side) => {
      const innerBulkhead = new THREE.Mesh(
        new THREE.CylinderGeometry(vWheelR * 0.88, vWheelR * 0.88, 0.02, 32),
        wellMat
      );
      innerBulkhead.rotation.z = Math.PI * 0.5;
      innerBulkhead.position.set(side * (halfW * 0.45), vWheelR, zAxle);
      chassisGroup.add(innerBulkhead);

      // 3D Rolled Wheel-Arch Lip Flange (gives realistic stamped sheet-metal thickness around the wheel arch opening)
      const archLipSegments = 20;
      const archCutR = vWheelR + 0.036;
      const lipPos: number[] = [];
      const lipIdx: number[] = [];
      for (let k = 0; k <= archLipSegments; k++) {
        const theta = Math.PI * 0.08 + (k / archLipSegments) * Math.PI * 0.84;
        const zPt = zAxle + Math.cos(theta) * archCutR;
        const yPt = vWheelR * 0.90 + Math.sin(theta) * archCutR;
        const stLip = sampleLongitudinalTable(controlStations, zPt / L);
        const flareScale = hasWidebody ? 1.48 : 1.0;
        const xOuter = side * (halfW * stLip.planScale + stLip.archFlare * flareScale * 0.96);
        const xInner = xOuter - side * 0.034;
        lipPos.push(xOuter, yPt, zPt, xInner, yPt - 0.004, zPt);
      }
      for (let k = 0; k < archLipSegments; k++) {
        const a = k * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (side > 0) {
          lipIdx.push(a, c, b, b, c, d);
        } else {
          lipIdx.push(a, b, c, b, d, c);
        }
      }
      const archLipGeom = new THREE.BufferGeometry();
      archLipGeom.setAttribute('position', new THREE.Float32BufferAttribute(lipPos, 3));
      archLipGeom.setIndex(lipIdx);
      archLipGeom.computeVertexNormals();
      chassisGroup.add(new THREE.Mesh(archLipGeom, darkTrimMat));
    });
  });

  // 2. Silhouette-Accurate Greenhouse, Roof, Pillars & Window Trim
  buildSmoothR34Greenhouse(chassisGroup, L, W, H, bodyMaterial, windowGlassMat, darkTrimMat, spec);

  // 3. Detailed RHD JDM / Euro Interior Cockpit (scaled cleanly to cabin roof height H)
  const interiorGroup = new THREE.Group();
  const cabinHeightRatio = Math.min(1.0, Math.max(0.76, (H - 0.08) / 1.28));
  interiorGroup.scale.set(1, cabinHeightRatio, 1);
  chassisGroup.add(interiorGroup);

  const dashBoard = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.21, 0.38), darkTrimMat);
  dashBoard.position.set(0, 0.70, L * 0.10);
  interiorGroup.add(dashBoard);

  if (spec.id === 'r34_gtr') {
    const mfdHood = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.095, 0.18), darkTrimMat);
    mfdHood.position.set(0, 0.835, L * 0.09);
    interiorGroup.add(mfdHood);

    const mfdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.072), procMats.mfdMat);
    mfdScreen.position.set(0, 0.832, L * 0.09 - 0.092);
    mfdScreen.rotation.y = Math.PI;
    interiorGroup.add(mfdScreen);
  }

  const gaugeBinnacle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.082, 0.15, 16, 1, false, 0, Math.PI),
    darkTrimMat
  );
  gaugeBinnacle.rotation.z = Math.PI * 0.5;
  gaugeBinnacle.rotation.y = Math.PI * 0.5;
  gaugeBinnacle.position.set(-0.35, 0.80, L * 0.09);
  interiorGroup.add(gaugeBinnacle);

  // Illuminated Twin-Dial Instrument Cluster Face inside Gauge Binnacle
  const gaugeDialFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.145, 0.072),
    procMats.gaugeClusterMat
  );
  gaugeDialFace.position.set(-0.35, 0.805, L * 0.09 - 0.068);
  gaugeDialFace.rotation.y = Math.PI;
  interiorGroup.add(gaugeDialFace);

  // Left & Right Sculpted Interior Door Panels / Cards with Armrests & Speaker Grilles
  [-1, 1].forEach((dSide) => {
    const doorCardInner = new THREE.Mesh(
      createRoundedBoxGeometry(0.036, 0.34, L * 0.26, 0.008, 2),
      darkTrimMat
    );
    doorCardInner.position.set(dSide * (W * 0.365), 0.54, -0.02);
    interiorGroup.add(doorCardInner);

    const doorArmrest = new THREE.Mesh(
      createRoundedBoxGeometry(0.055, 0.036, 0.34, 0.008, 2),
      getRecaroFabricMaterial()
    );
    doorArmrest.position.set(dSide * (W * 0.35), 0.56, -0.04);
    interiorGroup.add(doorArmrest);
  });

  // Drilled Aluminum Footwell Pedals (Throttle, Brake, Clutch)
  [-0.28, -0.35, -0.42].forEach((px, pIdx) => {
    const pedalPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, pIdx === 0 ? 0.078 : 0.056, 0.008),
      chromeMat
    );
    pedalPad.position.set(px, 0.44, L * 0.16);
    pedalPad.rotation.x = -0.42;
    interiorGroup.add(pedalPad);
  });

  const recaroMat = getRecaroFabricMaterial();
  const harnessMat = new THREE.MeshStandardMaterial({
    color: custom?.caliperColor ?? '#dc2626',
    roughness: 0.58,
    metalness: 0.12,
  });
  const seatZOffset = spec.silhouette === 'f40_super_wedge' || spec.silhouette === 'nsx_mid_wedge' ? 0.10 : 0.05;
  [-0.35, 0.35].forEach((sx) => {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.42), recaroMat);
    seatBase.position.set(sx, 0.40, -0.08 + seatZOffset);
    interiorGroup.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.09), recaroMat);
    seatBack.position.set(sx, 0.68, -0.24 + seatZOffset);
    seatBack.rotation.x = -0.16;
    interiorGroup.add(seatBack);

    [-0.08, 0.08].forEach((slotOff) => {
      const harnessSlot = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.030, 0.10), darkTrimMat);
      harnessSlot.position.set(sx + slotOff, 0.86, -0.27 + seatZOffset);
      harnessSlot.rotation.x = -0.16;
      interiorGroup.add(harnessSlot);

      // 4-Point Racing Seatbelt Harness Straps draping over the Recaro bucket seat
      const harnessStrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.044, 0.42, 0.012),
        harnessMat
      );
      harnessStrap.position.set(sx + slotOff * 0.82, 0.67, -0.185 + seatZOffset);
      harnessStrap.rotation.x = -0.16;
      harnessStrap.rotation.z = slotOff > 0 ? 0.08 : -0.08;
      interiorGroup.add(harnessStrap);
    });

    const harnessBuckle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.014, 12),
      chromeMat
    );
    harnessBuckle.rotation.x = Math.PI * 0.5 - 0.16;
    harnessBuckle.position.set(sx, 0.50, -0.155 + seatZOffset);
    interiorGroup.add(harnessBuckle);

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.085), recaroMat);
    headrest.position.set(sx, 0.96, -0.28 + seatZOffset);
    interiorGroup.add(headrest);

    // 2+2 Rear Sculpted Bucket Seats for Coupes/Sedans (visible through rear glass in Top & Rear views)
    if (spec.silhouette !== 's2000_roadster' && spec.silhouette !== 'f40_super_wedge' && spec.silhouette !== 'nsx_mid_wedge') {
      const rearSeatBack = new THREE.Mesh(
        createRoundedBoxGeometry(0.34, 0.36, 0.08, 0.018, 2),
        recaroMat
      );
      rearSeatBack.position.set(sx * 0.88, 0.68, -0.68);
      rearSeatBack.rotation.x = -0.20;
      interiorGroup.add(rearSeatBack);
    }

    // Roadster Roll Hoops behind headrests on S2000 & MX-5 Miata
    if (spec.silhouette === 's2000_roadster') {
      const rollHoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.105, 0.016, 10, 20, Math.PI),
        chromeMat
      );
      rollHoop.position.set(sx, 0.92, -0.36 + seatZOffset);
      interiorGroup.add(rollHoop);
    }
  });

  if (
    spec.id === 'r34_gtr' ||
    spec.id === 'r33_gtr' ||
    spec.id === 'r32_gtr' ||
    spec.id === 'silvia_s15' ||
    spec.id === 'silvia_s14'
  ) {
    // Rear Windshield Wiper Arm & Blade hugging the lower rear glass flush
    const rearWiperPivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.018, 12),
      darkTrimMat
    );
    rearWiperPivot.rotation.x = Math.PI * 0.35;
    rearWiperPivot.position.set(0, 0.822, -L * 0.355);
    chassisGroup.add(rearWiperPivot);

    const rearWiperArm = new THREE.Mesh(
      createRoundedBoxGeometry(0.30, 0.010, 0.014, 0.003, 2),
      darkTrimMat
    );
    rearWiperArm.position.set(-0.14, 0.832, -L * 0.348);
    rearWiperArm.rotation.z = -0.05;
    rearWiperArm.rotation.y = 0.06;
    chassisGroup.add(rearWiperArm);
  }

  const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.68), darkTrimMat);
  centerConsole.position.set(0, 0.48, -0.02);
  interiorGroup.add(centerConsole);

  const shiftStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.11, 8), chromeMat);
  shiftStalk.position.set(0, 0.61, L * 0.03);
  const shiftBall = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), chromeMat);
  shiftBall.position.set(0, 0.67, L * 0.03);
  interiorGroup.add(shiftStalk, shiftBall);

  // Handbrake / Drift E-Brake Lever on Center Console
  const handbrakeGrip = new THREE.Mesh(
    createRoundedBoxGeometry(0.022, 0.024, 0.16, 0.006, 2),
    darkTrimMat
  );
  handbrakeGrip.position.set(-0.045, 0.605, -0.06);
  handbrakeGrip.rotation.x = 0.28;
  const handbrakeButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.018, 8),
    chromeMat
  );
  handbrakeButton.rotation.x = Math.PI * 0.5 + 0.28;
  handbrakeButton.position.set(-0.045, 0.628, 0.018);
  interiorGroup.add(handbrakeGrip, handbrakeButton);

  const steeringWheelMesh = new THREE.Group();
  steeringWheelMesh.position.set(-0.36, 0.78, L * 0.02);
  steeringWheelMesh.rotation.x = -0.32;
  const swRim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 10, 24), darkTrimMat);
  steeringWheelMesh.add(swRim);
  const swHub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.025, 12), darkTrimMat);
  swHub.rotation.x = Math.PI * 0.5;
  steeringWheelMesh.add(swHub);
  [-0.85, 0.85, Math.PI].forEach((spAng) => {
    const swSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.13, 0.012), chromeMat);
    swSpoke.rotation.z = spAng;
    swSpoke.position.set(-Math.sin(spAng) * 0.065, Math.cos(spAng) * 0.065, 0);
    steeringWheelMesh.add(swSpoke);
  });
  interiorGroup.add(steeringWheelMesh);

  const rearViewMirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.03), darkTrimMat);
  rearViewMirror.position.set(0, Math.min(1.14, H - 0.19), L * 0.02);
  interiorGroup.add(rearViewMirror);

  // 4. Side Profile Details (Model-accurate side skirts, fender badges, 2-door vs 4-door handles & mirrors)
  const isSkylineGtr = spec.id === 'r34_gtr' || spec.id === 'r33_gtr' || spec.id === 'r32_gtr';
  const isSedan = spec.silhouette === 'sti_rally_sedan' || spec.silhouette === 'evo_aggressive_sedan';

  // Complete 3D Widebody Overfenders, Front Splitters/Canards, Side Skirts, Grilles & Rear Diffusers
  buildWidebodyAeroKit(
    chassisGroup,
    spec,
    controlStations,
    bodyMaterial,
    carbonMat,
    darkTrimMat,
    chromeMat,
    custom
  );

  // Tubular 6-Point JDM Touge Roll Cage inside Cabin (for widebody aero or drift builds)
  if (hasWidebody || spec.id === 'bmw_m3_e46' || spec.id === 'ferrari_f40') {
    const cageMat = new THREE.MeshStandardMaterial({
      color: custom?.caliperColor ?? '#38bdf8',
      metalness: 0.72,
      roughness: 0.24,
    });
    const hoopTopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, W * 0.62, 10), cageMat);
    hoopTopBar.rotation.z = Math.PI * 0.5;
    hoopTopBar.position.set(0, 1.05, -0.44);
    const diagBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.76, 10), cageMat);
    diagBrace.rotation.z = 0.76;
    diagBrace.position.set(0, 0.76, -0.44);
    interiorGroup.add(hoopTopBar, diagBrace);
    [-1, 1].forEach((cSide) => {
      const bPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 10), cageMat);
      bPost.position.set(cSide * (W * 0.31), 0.76, -0.44);
      bPost.rotation.z = cSide * 0.08;
      interiorGroup.add(bPost);
    });
  }

  // Optional Custom Touge Livery Stripes / Door Number Plate (Contour-Matched to Hood & Rocker Panels)
  if (custom?.liveryStyle === 'touge_stripe') {
    const livMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.25,
    });
    [-1, 1].forEach((lSide) => {
      const rockerStripe = new THREE.Mesh(
        createRoundedBoxGeometry(0.024, 0.048, wheelbase * 0.76, 0.006, 3),
        livMat
      );
      rockerStripe.position.set(lSide * (halfW * 0.948), 0.34, 0);
      chassisGroup.add(rockerStripe);

      // Contour-matched twin hood racing stripes sampled along the actual hood spline
      const stripeSamples = 6;
      for (let sIdx = 0; sIdx < stripeSamples; sIdx++) {
        const tMid = 0.175 + ((sIdx + 0.5) / stripeSamples) * 0.275;
        const segLen = (L * 0.275) / stripeSamples + 0.004;
        const stSample = sampleVehicleTopSurface(controlStations, spec, tMid, 0.26);
        const hoodStripeSeg = new THREE.Mesh(
          createRoundedBoxGeometry(0.072, 0.004, segLen, 0.001, 2),
          livMat
        );
        hoodStripeSeg.position.set(lSide * (halfW * 0.22), stSample.y + 0.0045, tMid * L);
        hoodStripeSeg.rotation.x = stSample.pitchX;
        chassisGroup.add(hoodStripeSeg);
      }
    });
  } else if (custom?.liveryStyle === 'door_number') {
    const numCardMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
    });
    [-1, 1].forEach((lSide) => {
      const doorCard = new THREE.Mesh(
        createRoundedBoxGeometry(0.022, 0.22, 0.32, 0.008, 2),
        numCardMat
      );
      doorCard.position.set(lSide * (halfW * 0.946), 0.46, 0.04);
      chassisGroup.add(doorCard);
    });
  }

  // Sculpted Fuel Filler Door / Cap on Right Rear Quarter Panel (authentic manufactured panel detail)
  const fuelDoorRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.042, 0.0028, 8, 24),
    darkTrimMat
  );
  fuelDoorRing.rotation.y = Math.PI * 0.5;
  fuelDoorRing.position.set(-halfW * 0.935, 0.655, -L * 0.245);
  chassisGroup.add(fuelDoorRing);

  [-1, 1].forEach((side) => {
    const isFlushStockGtr =
      !hasWidebody &&
      (spec.id === 'r32_gtr' || spec.id === 'r33_gtr' || spec.id === 'silvia_s15' || spec.id === 'silvia_s14');
    const sideSkirtUpper = new THREE.Mesh(
      createRoundedBoxGeometry(
        isFlushStockGtr ? 0.058 : 0.088,
        isFlushStockGtr ? 0.102 : 0.118,
        wheelbase * 0.74,
        0.022,
        5
      ),
      spec.isTwoTonePanda ? darkTrimMat : bodyMaterial
    );
    sideSkirtUpper.position.set(
      side * (halfW * (isFlushStockGtr ? 0.916 : 0.935)),
      isFlushStockGtr ? 0.205 : 0.215,
      0
    );
    chassisGroup.add(sideSkirtUpper);

    if (!isFlushStockGtr) {
      const sideSkirtRecess = new THREE.Mesh(
        createRoundedBoxGeometry(0.028, 0.032, wheelbase * 0.68, 0.008, 4),
        darkTrimMat
      );
      sideSkirtRecess.position.set(
        side * (halfW * 0.968),
        0.208,
        0
      );
      chassisGroup.add(sideSkirtRecess);
    }

    const sideSkirtCarbonLip = new THREE.Mesh(
      createRoundedBoxGeometry(
        isFlushStockGtr ? 0.064 : 0.098,
        0.024,
        wheelbase * 0.76,
        0.006,
        4
      ),
      isFlushStockGtr ? bodyMaterial : carbonMat
    );
    sideSkirtCarbonLip.position.set(
      side * (halfW * (isFlushStockGtr ? 0.924 : 0.958)),
      0.152,
      0
    );
    chassisGroup.add(sideSkirtCarbonLip);

    // Lower Rear Quarter Panel "Spec-R" (S15) & "Silvia K's" (S14) Side Badges ahead of Rear Wheel Arch
    if (spec.id === 'silvia_s15' || spec.id === 'silvia_s14') {
      const sideSilviaBadge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.088, 0.028),
        new THREE.MeshStandardMaterial({
          map: spec.id === 'silvia_s15' ? tex.silviaSpecRBadgeTex : tex.silviaScriptTex,
          transparent: true,
          roughness: 0.24,
          metalness: 0.65,
        })
      );
      sideSilviaBadge.position.set(
        side * (halfW * 0.946),
        0.315,
        rearZAxle + vWheelR + 0.14
      );
      sideSilviaBadge.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      chassisGroup.add(sideSilviaBadge);
    }

    const shoulderCrease = new THREE.Mesh(
      createRoundedBoxGeometry(0.014, 0.012, wheelbase * 0.92, 0.004, 3),
      bodyMaterial
    );
    shoulderCrease.position.set(side * (halfW * 0.928), 0.678, -0.04);
    chassisGroup.add(shoulderCrease);

    if (spec.id === 'r34_gtr') {
      const fenderVentSlot = new THREE.Mesh(
        createRoundedBoxGeometry(0.035, 0.22, 0.068, 0.008, 4),
        darkTrimMat
      );
      fenderVentSlot.position.set(side * (halfW * 0.955), 0.38, frontZAxle - vWheelR - 0.11);
      fenderVentSlot.rotation.x = -0.14;
      chassisGroup.add(fenderVentSlot);
    }

    if (isSkylineGtr) {
      const fenderGtrBadge = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.022, 0.036),
        new THREE.MeshStandardMaterial({
          map: tex.gtrBadgeTex,
          roughness: 0.22,
          metalness: 0.65,
        })
      );
      const badgeY = spec.id === 'r33_gtr' ? 0.365 : 0.612;
      fenderGtrBadge.position.set(side * (halfW * 0.954), badgeY, frontZAxle - vWheelR - 0.12);
      chassisGroup.add(fenderGtrBadge);
    }

    const sideMarker = new THREE.Mesh(
      createRoundedBoxGeometry(0.018, 0.020, 0.048, 0.006, 4),
      amberMaterial
    );
    sideMarker.position.set(side * (halfW * 0.955), 0.565, frontZAxle - vWheelR - 0.12);
    chassisGroup.add(sideMarker);

    // Manufactured Front & Rear Bumper-to-Fender Seam Shut-Lines
    const frontBumperSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.005, L * 0.11),
      darkTrimMat
    );
    frontBumperSeam.position.set(side * (halfW * 0.928), 0.485, frontZAxle + vWheelR + 0.055);
    frontBumperSeam.rotation.x = 0.08;
    chassisGroup.add(frontBumperSeam);

    const rearBumperSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.005, L * 0.12),
      darkTrimMat
    );
    rearBumperSeam.position.set(side * (halfW * 0.928), 0.515, rearZAxle - vWheelR - 0.065);
    rearBumperSeam.rotation.x = -0.06;
    chassisGroup.add(rearBumperSeam);

    // Door shutlines & handles (2-door coupe vs 4-door sedan)
    const doorSeamsZ = isSedan ? [L * 0.155, -L * 0.035, -L * 0.225] : [L * 0.145, -L * 0.105];
    doorSeamsZ.forEach((seamZ) => {
      const doorSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.44, 0.005),
        darkTrimMat
      );
      doorSeam.position.set(side * (halfW * 0.938), 0.52, seamZ);
      chassisGroup.add(doorSeam);
    });

    const handlePositionsZ = isSedan ? [-L * 0.005, -L * 0.195] : [-L * 0.055];
    handlePositionsZ.forEach((hz) => {
      const doorHandle = new THREE.Mesh(createRoundedBoxGeometry(0.024, 0.028, 0.135, 0.008, 4), bodyMaterial);
      doorHandle.position.set(side * (halfW * 0.935), 0.725, hz);
      chassisGroup.add(doorHandle);

      const handlePocket = new THREE.Mesh(createRoundedBoxGeometry(0.016, 0.034, 0.142, 0.007, 4), darkTrimMat);
      handlePocket.position.set(side * (halfW * 0.928), 0.725, hz);
      chassisGroup.add(handlePocket);
    });

    // Aerodynamic Door Mirrors (Body-colored Bayside Blue on BNR34 matching inspection blueprint)
    const mirrorY = spec.silhouette === 'f40_super_wedge' || spec.silhouette === 'nsx_mid_wedge' ? 0.775 : 0.845;
    const mirrorMat = bodyMaterial;
    const mirrorBaseTriangle = new THREE.Mesh(createRoundedBoxGeometry(0.045, 0.075, 0.12, 0.012, 4), darkTrimMat);
    mirrorBaseTriangle.position.set(side * (halfW * 0.81), mirrorY, L * 0.115);
    chassisGroup.add(mirrorBaseTriangle);

    const mirrorStalk = new THREE.Mesh(createRoundedBoxGeometry(0.12, 0.034, 0.058, 0.010, 4), mirrorMat);
    mirrorStalk.position.set(side * (halfW * 0.87), mirrorY + 0.007, L * 0.112);
    mirrorStalk.rotation.z = side * 0.18;
    chassisGroup.add(mirrorStalk);

    const mirrorHousing = new THREE.Mesh(
      new THREE.SphereGeometry(0.074, 16, 14),
      mirrorMat
    );
    mirrorHousing.scale.set(1.42, 0.78, 0.88);
    mirrorHousing.position.set(side * (halfW * 0.965), mirrorY + 0.023, L * 0.108);
    mirrorHousing.rotation.y = -side * 0.16;
    chassisGroup.add(mirrorHousing);

    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.115, 0.068),
      chromeMat
    );
    mirrorGlass.position.set(side * (halfW * 0.965), mirrorY + 0.023, L * 0.108 - 0.058);
    mirrorGlass.rotation.y = Math.PI - side * 0.16;
    chassisGroup.add(mirrorGlass);
  });

  // 5. Front & Rear Hyper-Detailed Fascias
  buildDetailedR34FrontFascia(
    chassisGroup,
    L,
    W,
    bodyMaterial,
    carbonMat,
    darkTrimMat,
    chromeMat,
    headlightGlassMat,
    amberMaterial,
    spec
  );

  const activeExhaustXPositions = buildDetailedR34RearFascia(
    chassisGroup,
    L,
    W,
    bodyMaterial,
    carbonMat,
    darkTrimMat,
    chromeMat,
    tailRunningMaterial,
    brakeLightMaterial,
    reverseLightMaterial,
    turnSignalLeftMaterial,
    turnSignalRightMaterial,
    spec,
    custom
  );

  // 6. Configurable & Model-Specific Rear Wing / Spoiler (Sampled directly on trunk deck spline)
  const spoilerGroup = new THREE.Group();
  chassisGroup.add(spoilerGroup);
  const spStyle = custom?.spoilerStyle ?? spec.defaultCustomization.spoilerStyle;
  const trunkSample = sampleVehicleTopSurface(controlStations, spec, -0.435, 0.25);
  const trunkEdgeSample = sampleVehicleTopSurface(controlStations, spec, -0.462, 0.15);
  const deckY = trunkSample.y;

  if (spStyle === 'ducktail') {
    const ducktail = new THREE.Mesh(
      createRoundedBoxGeometry(W * 0.80, 0.052, 0.125, 0.016, 5),
      spec.isTwoTonePanda ? darkTrimMat : bodyMaterial
    );
    ducktail.position.set(0, Math.max(0.815, trunkEdgeSample.y + 0.038), -L * 0.462);
    ducktail.rotation.x = 0.24;
    spoilerGroup.add(ducktail);
  } else if (spStyle === 'stock') {
    if (spec.id === 'r34_gtr') {
      // Iconic OEM BNR34 V-Spec II Dual-Plane Rear Wing (Bayside Blue Main Foil, Pillars & Sculpted Side Endplates + Carbon Upper Flap)
      const wingSpan = W * 0.84;
      const wingH = 0.185;
      const wingZ = -L * 0.442;

      const mainFoil = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan, 0.028, 0.195, 0.010, 4),
        bodyMaterial
      );
      mainFoil.position.set(0, deckY + wingH, wingZ);
      mainFoil.rotation.x = 0.07;
      spoilerGroup.add(mainFoil);

      const upperCarbonFlap = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan * 0.96, 0.018, 0.088, 0.006, 3),
        carbonMat
      );
      upperCarbonFlap.position.set(0, deckY + wingH + 0.020, wingZ - 0.048);
      upperCarbonFlap.rotation.x = 0.18;
      spoilerGroup.add(upperCarbonFlap);

      [-1, 1].forEach((side) => {
        // Sculpted Bayside Blue Upright Trunk Pedestals
        const strut = new THREE.Mesh(
          createRoundedBoxGeometry(0.044, wingH, 0.155, 0.012, 4),
          bodyMaterial
        );
        strut.position.set(side * (wingSpan * 0.34), deckY + wingH * 0.5, wingZ + 0.008);
        strut.rotation.x = -0.08;
        spoilerGroup.add(strut);

        const strutBase = new THREE.Mesh(
          createRoundedBoxGeometry(0.064, 0.022, 0.195, 0.008, 3),
          bodyMaterial
        );
        strutBase.position.set(side * (wingSpan * 0.34), deckY + 0.006, wingZ + 0.008);
        spoilerGroup.add(strutBase);

        // Iconic BNR34 Swept-Forward Bayside Blue Side Wing Endplates
        const endplate = new THREE.Mesh(
          createRoundedBoxGeometry(0.026, 0.095, 0.255, 0.010, 4),
          bodyMaterial
        );
        endplate.position.set(side * (wingSpan * 0.50), deckY + wingH - 0.008, wingZ - 0.005);
        endplate.rotation.x = 0.14;
        spoilerGroup.add(endplate);
      });
    } else if (spec.id === 'r33_gtr') {
      // Iconic 1997 BCNR33 V-Spec Swept-Back Outer-Pillar Adjustable Rear Wing with Decklid Base Bar & Side Endplate Emblem
      const wingSpan = W * 0.83;
      const wingH = 0.188;
      const wingZ = -L * 0.435;

      // Full-width lower decklid base bar
      const lowerDeckBar = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan, 0.024, 0.210, 0.008, 3),
        bodyMaterial
      );
      lowerDeckBar.position.set(0, deckY + 0.008, wingZ + 0.012);
      spoilerGroup.add(lowerDeckBar);

      // Adjustable upper main airfoil blade spanning between outer pillars
      const mainAirfoil = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan * 0.95, 0.028, 0.195, 0.010, 4),
        bodyMaterial
      );
      mainAirfoil.position.set(0, deckY + wingH - 0.004, wingZ - 0.022);
      mainAirfoil.rotation.x = 0.10;
      spoilerGroup.add(mainAirfoil);

      // Swept-back trapezoidal side upright endplate profile (matches Side Elevation of BCNR33 blueprint)
      const finShape = new THREE.Shape();
      finShape.moveTo(-0.125, 0.0);
      finShape.lineTo(0.145, 0.0);
      finShape.quadraticCurveTo(0.095, wingH * 0.55, 0.065, wingH + 0.012);
      finShape.lineTo(-0.135, wingH + 0.006);
      finShape.quadraticCurveTo(-0.140, wingH * 0.45, -0.125, 0.0);

      const finExtrude = new THREE.ExtrudeGeometry(finShape, {
        depth: 0.024,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 3,
      });
      finExtrude.rotateY(-Math.PI * 0.5);
      finExtrude.center();

      [-1, 1].forEach((side) => {
        const outerPillar = new THREE.Mesh(finExtrude, bodyMaterial);
        outerPillar.position.set(
          side * (wingSpan * 0.478),
          deckY + wingH * 0.50,
          wingZ - 0.008
        );
        outerPillar.rotation.z = side * 0.11;
        spoilerGroup.add(outerPillar);

        // Side Wing Endplate GT-R / V-spec Emblem (visible in Side Elevation of BCNR33 blueprint)
        const endplateDecal = new THREE.Mesh(
          new THREE.PlaneGeometry(0.092, 0.022),
          new THREE.MeshStandardMaterial({
            map: tex.vspecBadgeTex,
            transparent: true,
            roughness: 0.28,
          })
        );
        endplateDecal.position.set(
          side * (wingSpan * 0.478 + 0.016),
          deckY + wingH * 0.64,
          wingZ - 0.024
        );
        endplateDecal.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        endplateDecal.rotation.z = -side * 0.06;
        spoilerGroup.add(endplateDecal);
      });
    } else if (spec.id === 'r32_gtr') {
      // Iconic 1994 BNR32 GT-R V-Spec II Open-Arch / Outer-Pillar Box Spoiler (Swept Outer Uprights + Horizontal Main Airfoil forming open tunnel over trunk lid)
      const wingSpan = W * 0.805;
      const wingH = 0.114;
      const wingZ = -L * 0.445;

      // Horizontal upper main airfoil blade creating the signature open rectangular tunnel above the trunk lid
      const upperMainBlade = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan * 0.96, 0.024, 0.165, 0.009, 4),
        bodyMaterial
      );
      upperMainBlade.position.set(0, deckY + wingH, wingZ - 0.014);
      upperMainBlade.rotation.x = 0.05;
      spoilerGroup.add(upperMainBlade);

      // Swept-back BNR32 outer side pillar profile curving smoothly into the upper airfoil
      const r32FinShape = new THREE.Shape();
      r32FinShape.moveTo(-0.088, 0.0);
      r32FinShape.lineTo(0.105, 0.0);
      r32FinShape.quadraticCurveTo(0.068, wingH * 0.58, 0.044, wingH + 0.008);
      r32FinShape.lineTo(-0.098, wingH + 0.006);
      r32FinShape.quadraticCurveTo(-0.102, wingH * 0.48, -0.088, 0.0);

      const r32FinExtrude = new THREE.ExtrudeGeometry(r32FinShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.005,
        bevelSegments: 3,
      });
      r32FinExtrude.rotateY(-Math.PI * 0.5);
      r32FinExtrude.center();

      [-1, 1].forEach((side) => {
        const outerPillar = new THREE.Mesh(r32FinExtrude, bodyMaterial);
        outerPillar.position.set(
          side * (wingSpan * 0.468),
          deckY + wingH * 0.48,
          wingZ - 0.006
        );
        outerPillar.rotation.z = side * 0.11;
        spoilerGroup.add(outerPillar);

        // "V-spec II" Rear Quarter Panel Decal below the spoiler (matches Side & Top Blueprint of 1994 BNR32)
        const quarterVspecDecal = new THREE.Mesh(
          new THREE.PlaneGeometry(0.105, 0.024),
          new THREE.MeshStandardMaterial({
            map: tex.vspecBadgeTex,
            transparent: true,
            roughness: 0.28,
          })
        );
        quarterVspecDecal.position.set(
          side * (halfW * 0.892),
          0.742,
          -L * 0.422
        );
        quarterVspecDecal.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        spoilerGroup.add(quarterVspecDecal);
      });
    } else if (spec.id === 'supra_mk4') {
      // Iconic JZA80 Supra Rounded High-Arch Hoop Wing
      const wingSpan = W * 0.86;
      const archH = 0.255;
      const topBlade = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan * 0.92, 0.032, 0.165, 0.012, 5),
        bodyMaterial
      );
      topBlade.position.set(0, deckY + archH, -L * 0.442);
      topBlade.rotation.x = 0.09;
      spoilerGroup.add(topBlade);

      [-1, 1].forEach((side) => {
        const pillar = new THREE.Mesh(
          createRoundedBoxGeometry(0.042, archH * 1.05, 0.165, 0.016, 5),
          bodyMaterial
        );
        pillar.position.set(side * (wingSpan * 0.45), deckY + archH * 0.48, -L * 0.442);
        pillar.rotation.z = -side * 0.18;
        spoilerGroup.add(pillar);
      });
    } else if (spec.id === 'ferrari_f40' || spec.id === 'nsx_na1') {
      // Integrated Outer-Pillar Exotic Wing (F40 / NSX)
      const archH = spec.id === 'ferrari_f40' ? 0.30 : 0.16;
      const wingSpan = W * 0.88;
      const topBlade = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan, 0.032, 0.17, 0.010, 4),
        bodyMaterial
      );
      topBlade.position.set(0, deckY + archH, -L * 0.44);
      topBlade.rotation.x = 0.08;
      spoilerGroup.add(topBlade);

      [-1, 1].forEach((side) => {
        const pillar = new THREE.Mesh(
          createRoundedBoxGeometry(0.038, archH, 0.16, 0.010, 4),
          bodyMaterial
        );
        pillar.position.set(side * (wingSpan * 0.48), deckY + archH * 0.5, -L * 0.44);
        pillar.rotation.z = -side * 0.05;
        spoilerGroup.add(pillar);
      });
    } else if (spec.id === 'wrx_sti' || spec.id === 'lancer_evo9' || spec.id === 'lancer_evo10') {
      // Iconic Tall Box-Arch Rally Wing (Subaru WRX STI WRC Bi-Plane / Mitsubishi Evolution IX & X)
      const rallyH = 0.29;
      const rallySpan = W * 0.84;
      const topAirfoil = new THREE.Mesh(
        createRoundedBoxGeometry(rallySpan, 0.028, 0.18, 0.008, 4),
        spec.id === 'lancer_evo9' ? carbonMat : bodyMaterial
      );
      topAirfoil.position.set(0, deckY + rallyH, -L * 0.44);
      spoilerGroup.add(topAirfoil);

      [-1, 1].forEach((side) => {
        const sideSlab = new THREE.Mesh(
          createRoundedBoxGeometry(0.034, rallyH, 0.20, 0.010, 4),
          bodyMaterial
        );
        sideSlab.position.set(side * (rallySpan * 0.48), deckY + rallyH * 0.5, -L * 0.44);
        spoilerGroup.add(sideSlab);
      });
    } else if (spec.id === 'silvia_s15') {
      // Iconic 2001 Nissan Silvia Spec-R Aero (S15) 3-Pillar Rear Wing with Center Triangular Red Brake-Light Stanchion
      const wingSpan = W * 0.82;
      const wingH = 0.132;
      const wingZ = -L * 0.444;

      const s15MainBlade = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan, 0.026, 0.175, 0.010, 4),
        bodyMaterial
      );
      s15MainBlade.position.set(0, deckY + wingH, wingZ - 0.014);
      s15MainBlade.rotation.x = 0.07;
      spoilerGroup.add(s15MainBlade);

      // Swept-back outer side pillars on the left & right trunk edges
      const s15FinShape = new THREE.Shape();
      s15FinShape.moveTo(-0.088, 0.0);
      s15FinShape.lineTo(0.105, 0.0);
      s15FinShape.quadraticCurveTo(0.065, wingH * 0.58, 0.042, wingH + 0.008);
      s15FinShape.lineTo(-0.098, wingH + 0.004);
      s15FinShape.quadraticCurveTo(-0.102, wingH * 0.46, -0.088, 0.0);

      const s15FinExtrude = new THREE.ExtrudeGeometry(s15FinShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.005,
        bevelSegments: 3,
      });
      s15FinExtrude.rotateY(-Math.PI * 0.5);
      s15FinExtrude.center();

      [-1, 1].forEach((side) => {
        const outerPillar = new THREE.Mesh(s15FinExtrude, bodyMaterial);
        outerPillar.position.set(
          side * (wingSpan * 0.455),
          deckY + wingH * 0.48,
          wingZ - 0.006
        );
        outerPillar.rotation.z = side * 0.14;
        spoilerGroup.add(outerPillar);
      });

      // Signature S15 Spec-R Aero Central V-Shaped Pedestal Stanchion + Triangular Red LED Third Brake Light (CHMSL)
      const centerStanchionGroup = new THREE.Group();
      centerStanchionGroup.position.set(0, deckY + wingH * 0.54, wingZ - 0.012);

      // V-shaped painted center pedestal arms meeting the trunk lid
      [-1, 1].forEach((vSide) => {
        const vArm = new THREE.Mesh(
          createRoundedBoxGeometry(0.028, wingH * 0.92, 0.135, 0.008, 3),
          bodyMaterial
        );
        vArm.position.set(vSide * 0.022, 0, 0);
        vArm.rotation.z = -vSide * 0.24;
        centerStanchionGroup.add(vArm);
      });

      // Triangular Red LED Brake Lamp Housing recessed into the rear face of the S15 center stanchion
      const triBezelShape = new THREE.Shape();
      triBezelShape.moveTo(-0.044, 0.036);
      triBezelShape.lineTo(0.044, 0.036);
      triBezelShape.lineTo(0.0, -0.036);
      triBezelShape.closePath();

      const triBezelGeom = new THREE.ExtrudeGeometry(triBezelShape, {
        depth: 0.018,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      });
      triBezelGeom.center();
      const triBezelMesh = new THREE.Mesh(triBezelGeom, darkTrimMat);
      triBezelMesh.position.set(0, 0.008, -0.068);
      centerStanchionGroup.add(triBezelMesh);

      const triLedShape = new THREE.Shape();
      triLedShape.moveTo(-0.035, 0.028);
      triLedShape.lineTo(0.035, 0.028);
      triLedShape.lineTo(0.0, -0.026);
      triLedShape.closePath();

      const triLedGeom = new THREE.ExtrudeGeometry(triLedShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.002,
        bevelSegments: 2,
      });
      triLedGeom.center();
      const triLedMesh = new THREE.Mesh(triLedGeom, tailLightMaterial);
      triLedMesh.position.set(0, 0.008, -0.072);
      centerStanchionGroup.add(triLedMesh);

      spoilerGroup.add(centerStanchionGroup);
    } else if (spec.id === 'silvia_s14') {
      // Iconic 1998 Nissan Silvia K's Aero Kouki (S14) Tall Swept-Back Outer-Pillar Curved Arch Spoiler
      const wingSpan = W * 0.835;
      const wingH = 0.162;
      const wingZ = -L * 0.442;

      const s14MainBlade = new THREE.Mesh(
        createRoundedBoxGeometry(wingSpan * 0.96, 0.026, 0.175, 0.010, 4),
        bodyMaterial
      );
      s14MainBlade.position.set(0, deckY + wingH, wingZ - 0.018);
      s14MainBlade.rotation.x = 0.08;
      spoilerGroup.add(s14MainBlade);

      const s14FinShape = new THREE.Shape();
      s14FinShape.moveTo(-0.105, 0.0);
      s14FinShape.lineTo(0.125, 0.0);
      s14FinShape.quadraticCurveTo(0.078, wingH * 0.58, 0.048, wingH + 0.010);
      s14FinShape.lineTo(-0.115, wingH + 0.006);
      s14FinShape.quadraticCurveTo(-0.120, wingH * 0.48, -0.105, 0.0);

      const s14FinExtrude = new THREE.ExtrudeGeometry(s14FinShape, {
        depth: 0.024,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 3,
      });
      s14FinExtrude.rotateY(-Math.PI * 0.5);
      s14FinExtrude.center();

      [-1, 1].forEach((side) => {
        const outerPillar = new THREE.Mesh(s14FinExtrude, bodyMaterial);
        outerPillar.position.set(
          side * (wingSpan * 0.468),
          deckY + wingH * 0.48,
          wingZ - 0.008
        );
        outerPillar.rotation.z = side * 0.12;
        spoilerGroup.add(outerPillar);
      });
    } else {
      // OEM Pedestal Wing (Silvia S13, 180SX Type X, RX-7 FD, BMW E30 Sport Evo)
      const pedH = 0.15;
      const pedSpan = W * 0.84;
      const blade = new THREE.Mesh(createRoundedBoxGeometry(pedSpan, 0.030, 0.16, 0.010, 4), bodyMaterial);
      blade.position.set(0, deckY + pedH, -L * 0.44);
      blade.rotation.x = 0.08;
      spoilerGroup.add(blade);
      [-1, 1].forEach((side) => {
        const strut = new THREE.Mesh(createRoundedBoxGeometry(0.042, pedH, 0.14, 0.012, 4), bodyMaterial);
        strut.position.set(side * (pedSpan * 0.38), deckY + pedH * 0.5, -L * 0.44);
        spoilerGroup.add(strut);
      });
    }
  } else if (spStyle === 'gt_carbon') {
    buildBlueprintGTWing(spoilerGroup, L, W, carbonMat, darkTrimMat, deckY);
  }

  if (spec.isTwoTonePanda) {
    [-1, 1].forEach((side) => {
      const pandaSill = new THREE.Mesh(
        createRoundedBoxGeometry(0.032, 0.21, wheelbase * 0.82, 0.008, 4),
        darkTrimMat
      );
      pandaSill.position.set(side * (halfW * 0.945), 0.33, 0);
      chassisGroup.add(pandaSill);
    });
  }

  if (spec.hasMostWantedStripe && (custom?.liveryStyle ?? 'clean') === 'clean') {
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.55,
      roughness: 0.22,
    });
    [-1, 1].forEach((side) => {
      const sideStripe = new THREE.Mesh(
        createRoundedBoxGeometry(0.026, 0.13, wheelbase * 0.72, 0.006, 4),
        stripeMat
      );
      sideStripe.position.set(side * (halfW * 0.948), 0.54, 0);
      chassisGroup.add(sideStripe);

      // Contour-matched hood stripes for M3 GTR
      const stripeSamples = 6;
      for (let sIdx = 0; sIdx < stripeSamples; sIdx++) {
        const tMid = 0.175 + ((sIdx + 0.5) / stripeSamples) * 0.275;
        const segLen = (L * 0.275) / stripeSamples + 0.004;
        const stSample = sampleVehicleTopSurface(controlStations, spec, tMid, 0.28);
        const hoodStripeSeg = new THREE.Mesh(
          createRoundedBoxGeometry(0.16, 0.005, segLen, 0.001, 2),
          stripeMat
        );
        hoodStripeSeg.position.set(side * 0.24, stSample.y + 0.0045, tMid * L);
        hoodStripeSeg.rotation.x = stSample.pitchX;
        chassisGroup.add(hoodStripeSeg);
      }
    });
  }

  if (spec.id === 'nsx_na1' || spec.id === 'ferrari_f40') {
    // Mid-Engine Louvered Rear Decklid Cover & Side Engine Air Scoops
    const rearDeckSample = sampleVehicleTopSurface(controlStations, spec, -0.24, 0.0);
    const engineDeckLouvers = new THREE.Mesh(
      createRoundedBoxGeometry(W * 0.56, 0.018, L * 0.22, 0.006, 4),
      darkTrimMat
    );
    engineDeckLouvers.position.set(0, rearDeckSample.y + 0.006, -L * 0.24);
    engineDeckLouvers.rotation.x = rearDeckSample.pitchX;
    chassisGroup.add(engineDeckLouvers);

    [-1, 1].forEach((side) => {
      const sideScoop = new THREE.Mesh(
        createRoundedBoxGeometry(0.045, 0.16, 0.26, 0.014, 4),
        darkTrimMat
      );
      sideScoop.position.set(side * (halfW * 0.948), 0.56, -L * 0.14);
      chassisGroup.add(sideScoop);
    });
  }

  // 7. Four Independently Rotating & Steering Forged Wheels (Synchronized 1:1 with vWheelR & Circular Wheel Arch Cutouts)
  const rStyle = custom?.rimStyle ?? spec.defaultCustomization.rimStyle;
  const trackHalf = halfW * (hasWidebody ? 0.815 : 0.785);
  const fl = buildTE37Wheel(vWheelR, tireW, 1, rimMaterial, caliperMaterial, rStyle);
  const fr = buildTE37Wheel(vWheelR, tireW, -1, rimMaterial, caliperMaterial, rStyle);
  const rl = buildTE37Wheel(vWheelR, tireW, 1, rimMaterial, caliperMaterial, rStyle);
  const rr = buildTE37Wheel(vWheelR, tireW, -1, rimMaterial, caliperMaterial, rStyle);

  fl.knuckleGroup.position.set(trackHalf, vWheelR, frontZAxle);
  fr.knuckleGroup.position.set(-trackHalf, vWheelR, frontZAxle);
  rl.knuckleGroup.position.set(trackHalf, vWheelR, rearZAxle);
  rr.knuckleGroup.position.set(-trackHalf, vWheelR, rearZAxle);

  fl.knuckleGroup.rotation.z = hasWidebody ? 0.032 : 0.018;
  fr.knuckleGroup.rotation.z = hasWidebody ? -0.032 : -0.018;
  rl.knuckleGroup.rotation.z = hasWidebody ? 0.028 : 0.015;
  rr.knuckleGroup.rotation.z = hasWidebody ? -0.028 : -0.015;

  root.add(fl.knuckleGroup, fr.knuckleGroup, rl.knuckleGroup, rr.knuckleGroup);

  // 8. Headlight Beams, Real Road-Projecting SpotLight, Pop-Up Headlights & Dual-Layer Exhaust Backfire Flames
  const headlightBeams = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  [-1, 1].forEach((side) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.68, 4.2, 16, 1, true), beamMat);
    cone.rotation.x = -Math.PI * 0.5;
    cone.position.set(side * (halfW * 0.59), 0.55, L * 0.49 + 2.1);
    headlightBeams.add(cone);
  });

  // Real dynamic road-illuminating SpotLight projecting forward onto asphalt and barriers
  const roadBeamLight = new THREE.SpotLight(0xe0f2fe, 5.5, 42, Math.PI * 0.24, 0.55, 1.2);
  roadBeamLight.position.set(0, 0.62, L * 0.48);
  roadBeamLight.target.position.set(0, 0.05, L * 0.48 + 22.0);
  headlightBeams.add(roadBeamLight, roadBeamLight.target);
  chassisGroup.add(headlightBeams);

  const backfireFlames = new THREE.Group();
  backfireFlames.visible = false;

  const whiteHotCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerBlueFlameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outerOrangeFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff6b1a,
    transparent: true,
    opacity: 0.84,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const secondaryFlameTongueMat = new THREE.MeshBasicMaterial({
    color: 0xea580c,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sparkEmberMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const exhaustOutlets: Array<[number, number, number]> = [];
  let sumExX = 0;
  activeExhaustXPositions.forEach((exX) => {
    const outletY = 0.228;
    const outletZ = -L * 0.478 - 0.115;
    exhaustOutlets.push([exX, outletY, outletZ]);
    sumExX += exX;

    const nozzleFlameGroup = new THREE.Group();
    nozzleFlameGroup.position.set(exX, outletY, outletZ);

    // 1. Ionized blue combustion base at the exhaust tip nozzle
    const blueBase = new THREE.Mesh(
      new THREE.ConeGeometry(0.036, 0.21, 10),
      innerBlueFlameMat
    );
    blueBase.rotation.x = -Math.PI * 0.5;
    blueBase.position.set(0, 0, -0.095);

    // 2. White-hot / yellow high-velocity inner core
    const whiteHotCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.31, 10),
      whiteHotCoreMat
    );
    whiteHotCore.rotation.x = -Math.PI * 0.5;
    whiteHotCore.position.set(0, 0, -0.145);

    // 3. Primary orange outer flame plume
    const outerPlume = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.48, 12),
      outerOrangeFlameMat
    );
    outerPlume.rotation.x = -Math.PI * 0.5;
    outerPlume.position.set(0, 0, -0.235);

    // 4. Asymmetric secondary flame tongues for organic, non-uniform burst silhouette
    const tongueA = new THREE.Mesh(
      new THREE.ConeGeometry(0.038, 0.38, 8),
      secondaryFlameTongueMat
    );
    tongueA.rotation.set(-Math.PI * 0.5 + 0.07, 0.06, 0.4);
    tongueA.position.set(0.008, 0.006, -0.21);

    const tongueB = new THREE.Mesh(
      new THREE.ConeGeometry(0.034, 0.34, 8),
      secondaryFlameTongueMat
    );
    tongueB.rotation.set(-Math.PI * 0.5 - 0.06, -0.07, -0.5);
    tongueB.position.set(-0.007, -0.005, -0.19);

    // 5. Ejected high-velocity combustion spark & ember particles
    const sparkCluster = new THREE.Group();
    sparkCluster.name = 'spark_cluster';
    const sparkGeo = new THREE.DodecahedronGeometry(0.0075, 0);
    for (let s = 0; s < 8; s++) {
      const sparkMesh = new THREE.Mesh(sparkGeo, sparkEmberMat);
      const angle = (s / 8) * Math.PI * 2 + s * 0.45;
      const radial = 0.012 + (s % 3) * 0.011;
      sparkMesh.position.set(
        Math.cos(angle) * radial,
        Math.sin(angle) * radial,
        -0.16 - s * 0.048
      );
      sparkMesh.scale.set(0.7, 0.7, 2.4 + (s % 3) * 0.8);
      sparkCluster.add(sparkMesh);
    }

    nozzleFlameGroup.add(blueBase, whiteHotCore, outerPlume, tongueA, tongueB, sparkCluster);
    backfireFlames.add(nozzleFlameGroup);
  });
  chassisGroup.add(backfireFlames);

  // Dynamic rear exhaust backfire PointLight casts warm orange flicker onto rear bumper & road asphalt
  const avgExX = activeExhaustXPositions.length > 0 ? sumExX / activeExhaustXPositions.length : 0;
  const backfireLight = _isSoftwareGl
    ? null
    : new THREE.PointLight(0xff7b29, 0, 3.8, 1.8);
  if (backfireLight) {
    backfireLight.position.set(avgExX, 0.25, -L * 0.48 - 0.24);
    backfireLight.visible = false;
    chassisGroup.add(backfireLight);
  }

  // Subtle rear taillight/brake PointLight for realistic bumper reflection & night road falloff
  const rearTailLight = _isSoftwareGl
    ? null
    : new THREE.PointLight(0xff1a24, 0.5, 3.2, 2.0);
  if (rearTailLight) {
    rearTailLight.position.set(0, 0.62, -L * 0.48 - 0.18);
    chassisGroup.add(rearTailLight);
  }

  // Retractable Pop-Up Headlight Pods (Aerodynamically Contoured Housing & Recessed Projector/Reflector Assembly)
  const popUpLightsGroup = new THREE.Group();
  popUpLightsGroup.visible = false;
  if (spec.hasPopUpHeadlights) {
    const popPocketSample = sampleVehicleTopSurface(controlStations, spec, 0.445, 0.56);
    const popY = popPocketSample.y + 0.038;
    const popZ = 0.445 * L;
    const popLensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef9c3,
      emissiveIntensity: 2.0,
      roughness: 0.08,
    });

    [-1, 1].forEach((side) => {
      const podX = side * (halfW * 0.56);
      const podW = halfW * 0.34;
      const popShroud = new THREE.Mesh(
        createRoundedBoxGeometry(podW, 0.078, 0.155, 0.014, 4),
        darkTrimMat
      );
      popShroud.position.set(podX, popY, popZ);
      popShroud.rotation.x = 0.06;

      const popTopLid = new THREE.Mesh(
        createRoundedBoxGeometry(podW + 0.008, 0.016, 0.165, 0.006, 4),
        bodyMaterial
      );
      popTopLid.position.set(podX, popY + 0.040, popZ - 0.002);
      popTopLid.rotation.x = 0.14;
      popUpLightsGroup.add(popShroud, popTopLid);

      if (spec.id === 'mx5_miata') {
        const roundBezel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.044, 0.046, 0.022, 24),
          chromeMat
        );
        roundBezel.rotation.x = Math.PI * 0.5;
        roundBezel.position.set(podX, popY - 0.002, popZ + 0.072);
        const roundLens = new THREE.Mesh(
          new THREE.SphereGeometry(0.039, 20, 16),
          popLensMat
        );
        roundLens.scale.set(1.0, 1.0, 0.38);
        roundLens.position.set(podX, popY - 0.002, popZ + 0.080);
        popUpLightsGroup.add(roundBezel, roundLens);
      } else {
        const innerBezel = new THREE.Mesh(
          createRoundedBoxGeometry(podW * 0.88, 0.056, 0.016, 0.006, 3),
          chromeMat
        );
        innerBezel.position.set(podX, popY - 0.002, popZ + 0.072);
        const rectLens = new THREE.Mesh(
          createRoundedBoxGeometry(podW * 0.82, 0.048, 0.014, 0.005, 3),
          popLensMat
        );
        rectLens.position.set(podX, popY - 0.002, popZ + 0.078);
        popUpLightsGroup.add(innerBezel, rectLens);
      }
    });
  }
  chassisGroup.add(popUpLightsGroup);

  // Under-Car Ground Contact Shadow + 4-Tire Contact Patch AO Plane (reuses cached AO texture & material)
  const contactShadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.24, L * 1.12),
    procMats.contactShadowMat
  );
  contactShadowMesh.rotation.x = -Math.PI * 0.5;
  contactShadowMesh.position.set(0, 0.015, 0);
  root.add(contactShadowMesh);

  const dispose = () => {
    const sharedSet = procMats.sharedMaterialSet;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          for (const mat of m.material) {
            if (mat && !sharedSet.has(mat)) {
              mat.dispose();
            }
          }
        } else if (m.material && !sharedSet.has(m.material)) {
          m.material.dispose();
        }
      }
    });
  };

  return {
    root,
    chassisGroup,
    knuckleFL: fl.knuckleGroup,
    knuckleFR: fr.knuckleGroup,
    knuckleRL: rl.knuckleGroup,
    knuckleRR: rr.knuckleGroup,
    spinFL: fl.spinGroup,
    spinFR: fr.spinGroup,
    spinRL: rl.spinGroup,
    spinRR: rr.spinGroup,
    steeringWheelMesh,
    bodyMaterial,
    rimMaterial,
    caliperMaterial,
    windowGlassMaterial: windowGlassMat,
    tailLightMaterial,
    tailRunningMaterial,
    brakeLightMaterial,
    reverseLightMaterial,
    amberMaterial,
    turnSignalLeftMaterial,
    turnSignalRightMaterial,
    rearTailLight,
    headlightBeams,
    roadBeamLight,
    popUpLightsGroup,
    backfireFlames,
    backfireLight,
    exhaustOutlets,
    dispose,
  };
}

/**
 * Returns a structural key representing all parameters that require rebuilding 3D vehicle geometry.
 * Paint, finish, brightness, metallic flake, roughness, rim color, caliper color, window tint,
 * ride height, and physics/tuning/audio parameters do NOT alter 3D vertex geometry and can be
 * updated in-place in < 0.05ms via applyVehicleMaterialCustomization().
 */
export function getVehicleStructuralKey(
  spec: VehicleSpec,
  custom?: VehicleCustomization,
  isSoftwareGl?: boolean
): string {
  const def = spec.defaultCustomization;
  return [
    spec.id,
    isSoftwareGl ? 'sw' : 'hw',
    custom?.bodyKit ?? def.bodyKit ?? 'stock',
    custom?.frontSplitter ?? def.frontSplitter ?? 'stock',
    custom?.sideSkirtStyle ?? def.sideSkirtStyle ?? 'stock',
    custom?.rearDiffuser ?? def.rearDiffuser ?? 'stock',
    custom?.hoodStyle ?? def.hoodStyle ?? 'stock',
    custom?.grilleStyle ?? def.grilleStyle ?? 'stock',
    custom?.spoilerStyle ?? def.spoilerStyle ?? 'stock',
    custom?.exhaustStyle ?? def.exhaustStyle ?? 'stock',
    custom?.rimStyle ?? def.rimStyle ?? 'te37_6spoke',
    custom?.liveryStyle ?? def.liveryStyle ?? 'none',
    (custom?.frontCamberDeg ?? def.frontCamberDeg ?? -3.0).toFixed(2),
    (custom?.rearCamberDeg ?? def.rearCamberDeg ?? -1.2).toFixed(2),
  ].join('|');
}

/**
 * Updates vehicle paint shader parameters, rim color, caliper color, window tint,
 * and chassis ride height offset in-place on an existing DetailedCarRig in < 0.05ms
 * without rebuilding any 3D geometry or allocating GPU buffers.
 */
export function applyVehicleMaterialCustomization(
  rig: DetailedCarRig,
  spec: VehicleSpec,
  custom: VehicleCustomization
): void {
  const procMats = getR34ProceduralMaterials();
  const paintHex = custom.paintColor ?? spec.defaultCustomization.paintColor ?? '#0047b8';
  const finishType = custom.paintFinish ?? spec.defaultCustomization.paintFinish ?? 'metallic';
  const paintParams = computePaintMaterialParameters(finishType, paintHex, custom);

  rig.bodyMaterial.color.set(paintHex).multiplyScalar(paintParams.brightness);
  rig.bodyMaterial.metalness = paintParams.metalness;
  rig.bodyMaterial.roughness = paintParams.roughness;
  const nextBumpMap = paintParams.useFlakeBump ? procMats.flakeBumpTex : null;
  const needsShaderRecompile = rig.bodyMaterial.bumpMap !== nextBumpMap;
  rig.bodyMaterial.bumpMap = nextBumpMap;
  rig.bodyMaterial.bumpScale = paintParams.bumpScale;
  rig.bodyMaterial.clearcoat = paintParams.clearcoat;
  rig.bodyMaterial.clearcoatRoughness = paintParams.clearcoatRoughness;
  rig.bodyMaterial.sheen = paintParams.sheen;
  rig.bodyMaterial.sheenRoughness = paintParams.sheenRoughness;
  rig.bodyMaterial.sheenColor.set(paintParams.sheenColorHex);
  rig.bodyMaterial.iridescence = paintParams.iridescence;
  rig.bodyMaterial.iridescenceIOR = paintParams.iridescenceIOR;
  rig.bodyMaterial.reflectivity = paintParams.reflectivity;
  rig.bodyMaterial.envMapIntensity = paintParams.envMapIntensity;
  if (needsShaderRecompile) {
    rig.bodyMaterial.needsUpdate = true;
  }

  const rimHex = custom.rimColor ?? spec.defaultCustomization.rimColor ?? '#7c5c36';
  rig.rimMaterial.color.set(rimHex);

  const caliperHex = custom.caliperColor ?? spec.defaultCustomization.caliperColor ?? '#1d4ed8';
  rig.caliperMaterial.color.set(caliperHex);

  const windowTintVal = Math.max(
    0.05,
    Math.min(0.85, custom.windowTint ?? spec.defaultCustomization.windowTint ?? 0.35)
  );
  rig.windowGlassMaterial.opacity = Math.min(0.95, 0.72 + windowTintVal * 0.24);

  rig.chassisGroup.position.y = custom.rideHeightOffset ?? 0;
}

