import * as THREE from 'three';

const garageTextureCache = new Map<string, THREE.Texture>();

export function clearGarageTextureCache(): void {
  garageTextureCache.clear();
}

export interface BuiltGarageShowroom {
  group: THREE.Group;
  platformGroup: THREE.Group;
  setStudioSheetMode: (isSheet: boolean, scene: THREE.Scene) => void;
  updateGarage: (dt: number, elapsed: number, rotateTurntable: boolean, dynoRollerSpeedKmh?: number) => void;
  dispose: () => void;
}

export const SHOWROOM_BG_HEX = 0xd4dfe8;

/**
 * Generates a natural, balanced 360° PMREM automotive reflection environment map.
 * Provides realistic horizon, sky, and lateral softbox reflections on metallic clearcoat paint,
 * chrome, and glass without overexposing horizontal roof/hood surfaces.
 */
export function createNaturalAutomotiveEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const cacheKey = 'garage_studio_env';
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey)!;
  }

  const envScene = new THREE.Scene();

  // 1. Sky-to-Horizon-to-Ground Gradient Dome
  const domeGeo = new THREE.SphereGeometry(24, 32, 24);
  const posAttr = domeGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const ny = y / 24; // -1 (nadir) to +1 (zenith)
    if (ny > 0.18) {
      // Rich natural daylight blue sky overhead (preserves deep TV2 Bayside Blue on hood & roof)
      const t = (ny - 0.18) / 0.82;
      c.setHex(0x60a5fa).lerp(new THREE.Color(0x1d4ed8), Math.pow(t, 0.8));
    } else if (ny >= -0.08) {
      // Crisp bright horizon band for natural automotive door, fender & glass reflections
      const t = (ny + 0.08) / 0.26;
      c.setHex(0xcbd5e1).lerp(new THREE.Color(0xf8fafc), Math.sin(t * Math.PI));
    } else {
      // Warm architectural slate ground bounce
      const t = Math.min(1, (-ny - 0.08) / 0.92);
      c.setHex(0x64748b).lerp(new THREE.Color(0x334155), t);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const domeMesh = new THREE.Mesh(
    domeGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  );
  envScene.add(domeMesh);

  // 2. Lateral & Overhead Studio Softbox Reflection Strips (creates sleek realistic bodyline highlights)
  const stripMat = new THREE.MeshBasicMaterial({
    color: 0xf1f5f9,
    side: THREE.DoubleSide,
  });

  for (const side of [-1, 1]) {
    const sideStrip = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), stripMat);
    sideStrip.position.set(side * 10.2, 3.3, 0);
    sideStrip.rotation.y = -side * Math.PI * 0.5;
    sideStrip.rotation.z = side * 0.28;
    envScene.add(sideStrip);

    const lowerAccentStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xbae6fd, side: THREE.DoubleSide })
    );
    lowerAccentStrip.position.set(side * 9.8, 1.35, 0);
    lowerAccentStrip.rotation.y = -side * Math.PI * 0.5;
    envScene.add(lowerAccentStrip);
  }

  for (const dir of [-1, 1]) {
    const endStrip = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.0), stripMat);
    endStrip.position.set(0, 3.5, dir * 11.2);
    endStrip.lookAt(0, 0.8, 0);
    envScene.add(endStrip);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(envScene, 0.032).texture;
  pmrem.dispose();
  domeGeo.dispose();
  (domeMesh.material as THREE.Material).dispose();
  stripMat.dispose();

  garageTextureCache.set(cacheKey, envTex);
  return envTex;
}

/**
 * Generates an outdoor mountain PMREM environment map tailored to the active time of day
 * ('daytime' for Morning/Afternoon with bright blue sky, white clouds, and green mountain ridges,
 *  'golden' for Golden Hour/Sunset with warm golden-amber horizon and twilight sky,
 *  'night' for Midnight Touge with silver-blue moonlight and streetlamp specular strips)
 * so car clearcoat paint and glass realistically reflect the surrounding mountain environment.
 */
export function createOutdoorTougeEnvMap(
  renderer: THREE.WebGLRenderer,
  modeOrIsNight: boolean | 'daytime' | 'golden' | 'night' = 'daytime'
): THREE.Texture {
  const mode: 'daytime' | 'golden' | 'night' =
    typeof modeOrIsNight === 'boolean'
      ? modeOrIsNight
        ? 'night'
        : 'daytime'
      : modeOrIsNight;

  const cacheKey = `outdoor_env_${mode}`;
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey)!;
  }

  const envScene = new THREE.Scene();

  const domeGeo = new THREE.SphereGeometry(24, 64, 48);
  const posAttr = domeGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = y / 24; // -1 to +1
    const angle = Math.atan2(z, x);

    // Distant mountain ridge silhouette + foreground pine tree canopy profile along the horizon
    const mountainRidgeHeight =
      0.09 +
      Math.sin(angle * 3.0 + 0.6) * 0.055 +
      Math.cos(angle * 7.0 - 0.4) * 0.032;
    const pineTreeCrownHeight =
      0.035 +
      Math.sin(angle * 11.0) * 0.032 +
      Math.cos(angle * 23.0) * 0.022 +
      Math.sin(angle * 47.0) * 0.014;

    // Multi-layered cumulus cloud formations across the upper sky hemisphere
    const cloudBand =
      ny > 0.12
        ? Math.max(
            0,
            Math.sin(angle * 3.0 + ny * 6.8) * 0.52 +
              Math.cos(angle * 6.0 - ny * 4.8) * 0.36 +
              Math.sin(angle * 13.0 + ny * 9.0) * 0.18
          )
        : 0;

    if (ny > 0.28) {
      const t = (ny - 0.28) / 0.72;
      if (mode === 'night') {
        c.setHex(0x1e3a8a).lerp(new THREE.Color(0x0b1329), Math.pow(t, 0.8));
        if (cloudBand > 0.35) {
          c.lerp(new THREE.Color(0x3b82f6), (cloudBand - 0.35) * 0.35);
        }
      } else if (mode === 'golden') {
        c.setHex(0x6366f1).lerp(new THREE.Color(0x1e3a8a), Math.pow(t, 0.78));
        if (cloudBand > 0.22) {
          c.lerp(new THREE.Color(0xfde68a), Math.min(0.82, (cloudBand - 0.22) * 0.65));
        }
      } else {
        // CarX Street crisp azure sky with bright sunlit cumulus clouds reflected on hood/roof/windshield
        c.setHex(0x38bdf8).lerp(new THREE.Color(0x0369a1), Math.pow(t, 0.76));
        if (cloudBand > 0.20) {
          c.lerp(new THREE.Color(0xffffff), Math.min(0.88, (cloudBand - 0.20) * 0.95));
        }
      }
    } else if (ny > mountainRidgeHeight) {
      const t = (ny - mountainRidgeHeight) / Math.max(0.05, 0.28 - mountainRidgeHeight);
      if (mode === 'night') {
        c.setHex(0x334155).lerp(new THREE.Color(0x1e3a8a), t);
      } else if (mode === 'golden') {
        c.setHex(0xfef08a).lerp(new THREE.Color(0xf97316), Math.pow(t, 0.75));
      } else {
        // Luminous atmospheric horizon band for crisp door & fender beltline reflections
        c.setHex(0xf0f9ff).lerp(new THREE.Color(0x7dd3fc), Math.pow(t, 0.72));
      }
    } else if (ny > pineTreeCrownHeight) {
      // Distant sunlit blue-green mountain ridges
      c.setHex(mode === 'night' ? 0x1e293b : mode === 'golden' ? 0x475569 : 0x335c67);
    } else if (ny >= -0.05) {
      // Rich evergreen Sugi/Pine forest silhouette band along doors and quarter panels
      c.setHex(mode === 'night' ? 0x0f172a : mode === 'golden' ? 0x2d3a24 : 0x2d5a27);
    } else {
      // Weathered touge asphalt & concrete guardrail ground bounce
      const t = Math.min(1, (-ny - 0.05) / 0.95);
      const baseBounce = mode === 'night' ? 0x1e293b : mode === 'golden' ? 0x475569 : 0x52525b;
      const nadirBounce = mode === 'night' ? 0x090d16 : 0x27272a;
      c.setHex(baseBounce).lerp(new THREE.Color(nadirBounce), t);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const domeMesh = new THREE.Mesh(
    domeGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  );
  envScene.add(domeMesh);

  // Primary directional sun & cloud specular reflection cards for razor-sharp clearcoat highlights
  const sunCardMat = new THREE.MeshBasicMaterial({
    color: mode === 'night' ? 0xdbeafe : mode === 'golden' ? 0xfef08a : 0xffffff,
    side: THREE.DoubleSide,
  });
  const sunCard = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.8), sunCardMat);
  sunCard.position.set(-10.5, mode === 'daytime' ? 9.2 : 5.2, -11.5);
  sunCard.lookAt(0, 0.8, 0);
  envScene.add(sunCard);

  const skyRibbonMat = new THREE.MeshBasicMaterial({
    color: mode === 'night' ? 0x93c5fd : mode === 'golden' ? 0xfdba74 : 0xf0f9ff,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const sideRibbon = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.4), skyRibbonMat);
    sideRibbon.position.set(side * 10.2, 3.6, 0);
    sideRibbon.rotation.y = -side * Math.PI * 0.5;
    sideRibbon.rotation.z = side * 0.28;
    envScene.add(sideRibbon);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(envScene, 0.024).texture;
  pmrem.dispose();
  domeGeo.dispose();
  (domeMesh.material as THREE.Material).dispose();
  sunCardMat.dispose();
  skyRibbonMat.dispose();

  garageTextureCache.set(cacheKey, envTex);
  return envTex;
}

function createStudioBlueprintGridTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'studio_grid';
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey) as THREE.CanvasTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // Fine sub-grid lines
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Primary blueprint grid lines
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  garageTextureCache.set(cacheKey, tex);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const cacheKey = 'contact_shadow';
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey) as THREE.CanvasTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 122);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.78)');
  grad.addColorStop(0.58, 'rgba(15, 23, 42, 0.40)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // 4 Darker Tire Contact Patch AO Spots for realistic ground anchoring
  const tireSpots = [
    [56, 62],
    [200, 62],
    [56, 194],
    [200, 194],
  ];
  for (const [tx, ty] of tireSpots) {
    const tGrad = ctx.createRadialGradient(tx, ty, 2, tx, ty, 26);
    tGrad.addColorStop(0, 'rgba(2, 6, 23, 0.85)');
    tGrad.addColorStop(0.6, 'rgba(2, 6, 23, 0.35)');
    tGrad.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.arc(tx, ty, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  garageTextureCache.set(cacheKey, tex);
  return tex;
}

function createGarageFloorTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'garage_floor';
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey) as THREE.CanvasTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Clean, bright architectural polished concrete & slate floor
  ctx.fillStyle = '#7c8b9e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle architectural tile seams
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Clean studio bay border accents
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 480, 480);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  garageTextureCache.set(cacheKey, tex);
  return tex;
}

function createJdmBannerTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'jdm_banner';
  if (garageTextureCache.has(cacheKey)) {
    return garageTextureCache.get(cacheKey) as THREE.CanvasTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('東京 JDM DESIGN STUDIO', 256, 56);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('PERFORMANCE & CUSTOMIZATION SHOWROOM', 256, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  garageTextureCache.set(cacheKey, tex);
  return tex;
}

export function buildGarageShowroom(
  renderer: THREE.WebGLRenderer,
  _scene: THREE.Scene,
  isSoftwareGl: boolean
): BuiltGarageShowroom {
  const group = new THREE.Group();
  const showroomDecorGroup = new THREE.Group();
  const studioBlueprintGroup = new THREE.Group();
  studioBlueprintGroup.visible = false;
  group.add(showroomDecorGroup, studioBlueprintGroup);

  const floorTex = createGarageFloorTexture(renderer);
  const bannerTex = createJdmBannerTexture(renderer);
  const studioGridTex = createStudioBlueprintGridTexture(renderer);
  const contactShadowTex = createContactShadowTexture();

  // Studio Blueprint Floor & Soft Contact Shadow for 360° Turnaround Sheet Mode
  const studioFloorMat = new THREE.MeshBasicMaterial({
    map: studioGridTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const studioFloorMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), studioFloorMat);
  studioFloorMesh.rotation.x = -Math.PI / 2;
  studioFloorMesh.position.y = -0.002;
  studioBlueprintGroup.add(studioFloorMesh);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.55, 5.20),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.002;
  studioBlueprintGroup.add(shadowPlane);

  // 1. Bright Satin Architectural Concrete & Slate Showroom Floor
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: floorTex,
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.16,
    clearcoat: 0.22,
    clearcoatRoughness: 0.28,
  });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.12;
  floorMesh.receiveShadow = !isSoftwareGl;
  showroomDecorGroup.add(floorMesh);

  // 2. Rotating Circular Showroom Turntable Platform (at y = 0 where car tires rest flush)
  const platformGroup = new THREE.Group();
  showroomDecorGroup.add(platformGroup);

  const deckMat = new THREE.MeshPhysicalMaterial({
    color: 0x475569,
    roughness: 0.46,
    metalness: 0.25,
    clearcoat: 0.15,
    clearcoatRoughness: 0.32,
  });
  const deckCylinder = new THREE.Mesh(new THREE.CylinderGeometry(3.85, 4.1, 0.12, 64), deckMat);
  deckCylinder.position.y = -0.06;
  deckCylinder.receiveShadow = !isSoftwareGl;
  platformGroup.add(deckCylinder);

  // Soft Grounding Contact Shadow on Top of Turntable Platform
  const turntableShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.60, 5.25),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    })
  );
  turntableShadow.rotation.x = -Math.PI / 2;
  turntableShadow.position.y = 0.003;
  platformGroup.add(turntableShadow);

  // Studio Perimeter Ring around Turntable
  const neonCyanMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x94a3b8,
    emissiveIntensity: 0.8,
  });
  const neonAmberMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
  });

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.96, 0.045, 10, 64),
    neonCyanMat
  );
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -0.02;
  platformGroup.add(outerRing);

  // Radial turntable index ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.35), neonAmberMat);
    tick.position.set(Math.sin(a) * 3.55, 0.002, Math.cos(a) * 3.55);
    tick.rotation.y = a;
    platformGroup.add(tick);
  }

  // 2B. Integrated AWD Chassis Dynamometer Twin Steel Rollers & Front Cooling Blower Bay
  const dynoRollerMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.22,
  });
  const dynoFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.65,
    roughness: 0.38,
  });
  const dynoAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.35,
    roughness: 0.4,
  });

  const dynoRollers: THREE.Mesh[] = [];
  const rollerGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.68, 24);
  rollerGeo.rotateZ(Math.PI / 2);

  // Place twin rollers under front axle (z = +1.34) and rear axle (z = -1.34) for left (-0.78) and right (+0.78) tracks
  for (const axleZ of [-1.34, 1.34]) {
    const bayRecess = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.024, 0.56), dynoFrameMat);
    bayRecess.position.set(0, -0.004, axleZ);
    platformGroup.add(bayRecess);

    // Safety yellow border strips along each dyno roller pit
    for (const zEdge of [-0.27, 0.27]) {
      const safetyStrip = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.028, 0.025), dynoAccentMat);
      safetyStrip.position.set(0, 0.001, axleZ + zEdge);
      platformGroup.add(safetyStrip);
    }

    for (const sideX of [-0.78, 0.78]) {
      for (const rollerOffsetZ of [-0.13, 0.13]) {
        const roller = new THREE.Mesh(rollerGeo, dynoRollerMat);
        roller.position.set(sideX, -0.095, axleZ + rollerOffsetZ);
        platformGroup.add(roller);
        dynoRollers.push(roller);
      }
    }
  }

  // Front High-Velocity Dyno Cooling Fan Housing (z = +3.18 facing the front intercooler/radiator)
  const blowerGroup = new THREE.Group();
  blowerGroup.position.set(0, 0.26, 3.18);
  const blowerShroud = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.52, 0.34), dynoFrameMat);
  blowerGroup.add(blowerShroud);
  const blowerIntakeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.022, 10, 28),
    dynoAccentMat
  );
  blowerIntakeRing.position.set(0, 0, -0.175);
  blowerGroup.add(blowerIntakeRing);

  const fanRotorGroup = new THREE.Group();
  fanRotorGroup.position.set(0, 0, -0.15);
  const bladeGeo = new THREE.BoxGeometry(0.36, 0.055, 0.012);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(bladeGeo, dynoRollerMat);
    blade.rotation.z = (b / 4) * Math.PI;
    fanRotorGroup.add(blade);
  }
  blowerGroup.add(fanRotorGroup);
  platformGroup.add(blowerGroup);

  // 3. Overhead Daylight Skylight Softbox Rig & Brushed Aluminum Trusses
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.65,
    roughness: 0.30,
  });
  const softboxEmitMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xf8fafc,
    emissiveIntensity: 2.0,
  });

  // Main overhead rectangular studio light halo directly above turntable
  const lightBankFrame = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 3.8), trussMat);
  lightBankFrame.position.set(0, 4.85, 0);
  const lightBankPanel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 3.4), softboxEmitMat);
  lightBankPanel.position.set(0, 4.78, 0);
  showroomDecorGroup.add(lightBankFrame, lightBankPanel);

  // Angled side softbox panels for sleek lateral car bodyline reflections
  for (const side of [-1, 1]) {
    const sideSoftbox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 5.2), softboxEmitMat);
    sideSoftbox.position.set(side * 5.2, 3.2, 0);
    sideSoftbox.rotation.z = side * 0.45;
    showroomDecorGroup.add(sideSoftbox);
  }

  // Natural Daylight Studio Lighting Rig (Bright, even illumination with natural shadows & specular highlights)
  const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.38);
  keyLight.position.set(6.0, 7.0, 6.5);
  keyLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    keyLight.shadow.mapSize.set(1024, 1024);
    const d = 6;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
  }
  group.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.92);
  fillLight.position.set(-6.5, 6.0, 6.5);
  group.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xf1f5f9, 0.88);
  rimLight.position.set(-5.5, 3.4, -7.5);
  group.add(rimLight);

  const sideRimLight = new THREE.DirectionalLight(0xf8fafc, 0.85);
  sideRimLight.position.set(9, 2.4, 2.5);
  group.add(sideRimLight);

  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x475569, 0.80);
  group.add(hemiLight);

  // 4. Modern Bright Architectural Showroom Walls, Columns, Panoramic Daylight Windows & Bays
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ef,
    roughness: 0.48,
    metalness: 0.08,
  });

  // Back Showroom Wall with JDM Studio Signboard
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(28, 8, 0.6), concreteMat);
  backWall.position.set(0, 3.8, -11.5);
  showroomDecorGroup.add(backWall);

  const bannerBoard = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 2.2, 0.12),
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: 0xffffff,
      emissiveMap: bannerTex,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    })
  );
  bannerBoard.position.set(0, 3.6, -11.1);
  showroomDecorGroup.add(bannerBoard);

  // Bright Architectural Pillars with Vertical Accent Strips
  const pillarGeo = new THREE.BoxGeometry(0.95, 8.0, 0.95);
  const neonStripGeo = new THREE.BoxGeometry(0.08, 6.2, 0.08);
  const pillarCoords = [
    [-9.5, -10.5],
    [9.5, -10.5],
    [-10.5, -3.5],
    [10.5, -3.5],
    [-10.5, 4.5],
    [10.5, 4.5],
  ];
  pillarCoords.forEach(([px, pz], idx) => {
    const p = new THREE.Mesh(pillarGeo, concreteMat);
    p.position.set(px, 3.8, pz);
    showroomDecorGroup.add(p);

    const strip = new THREE.Mesh(
      neonStripGeo,
      idx % 2 === 0 ? neonCyanMat : neonAmberMat
    );
    strip.position.set(px * 0.94, 3.1, pz * 0.94);
    showroomDecorGroup.add(strip);
  });

  // Large Panoramic Daylight Windows on Left & Right Walls
  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0xbae6fd,
    emissiveIntensity: 0.85,
    roughness: 0.12,
  });
  for (const side of [-1, 1]) {
    const winWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.8, 14), windowGlowMat);
    winWall.position.set(side * 12.2, 2.8, 0.5);
    showroomDecorGroup.add(winWall);

    // Window mullions
    for (let z = -5.5; z <= 6.5; z += 3.0) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.0, 0.18), trussMat);
      mullion.position.set(side * 12.1, 2.8, z);
      showroomDecorGroup.add(mullion);
    }
  }

  // Brushed Aluminum Mechanic Tool Benches along outer showroom bays
  const toolBenchMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.55,
    roughness: 0.28,
  });
  for (const tx of [-8.8, 8.8]) {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 0.8), toolBenchMat);
    chest.position.set(tx, 0.42, -10.4);
    showroomDecorGroup.add(chest);
  }

  const sheetBgColor = new THREE.Color(0xb8bec6);
  const sheetFog = new THREE.FogExp2(0xb8bec6, 0.004);
  const showroomBgColor = new THREE.Color(SHOWROOM_BG_HEX);
  const showroomFog = new THREE.FogExp2(SHOWROOM_BG_HEX, 0.006);

  let currentSheetMode = false;
  function setStudioSheetMode(isSheet: boolean, targetScene: THREE.Scene) {
    if (currentSheetMode === isSheet && studioBlueprintGroup.visible === isSheet) return;
    currentSheetMode = isSheet;
    showroomDecorGroup.visible = !isSheet;
    studioBlueprintGroup.visible = isSheet;
    if (isSheet) {
      targetScene.background = sheetBgColor;
      targetScene.fog = sheetFog;
      hemiLight.groundColor.setHex(0x475569);
      hemiLight.intensity = 1.05;
    } else {
      targetScene.background = showroomBgColor;
      targetScene.fog = showroomFog;
      hemiLight.groundColor.setHex(0x64748b);
      hemiLight.intensity = 1.15;
    }
  }

  function updateGarage(dt: number, _elapsed: number, rotateTurntable: boolean, dynoRollerSpeedKmh = 0) {
    if (rotateTurntable) {
      platformGroup.rotation.y += dt * 0.32;
    }
    const rollerOmega = (dynoRollerSpeedKmh / 3.6) / 0.11;
    if (rollerOmega > 0.01) {
      for (const r of dynoRollers) {
        r.rotation.x -= rollerOmega * dt;
      }
    }
    // Spin cooling blower fan continuously (faster under high dyno wheel speed)
    fanRotorGroup.rotation.z += dt * (4.5 + Math.min(28, dynoRollerSpeedKmh * 0.14));
  }

  function dispose() {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    floorTex.dispose();
    bannerTex.dispose();
    studioGridTex.dispose();
    contactShadowTex.dispose();
  }

  return {
    group,
    platformGroup,
    setStudioSheetMode,
    updateGarage,
    dispose,
  };
}
