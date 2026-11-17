import * as THREE from 'three';
import { MAPS_DATA } from './mapsData';
import {
  createJapaneseBuildingModel,
  createMountainTunnelStructure,
  createPlazaLandmarkProps,
  createToriiGateModel,
  createVermilionBridgeStructure,
} from './models';
import {
  createBuildingWallTexture,
  createChevronSignTexture,
  createGraniteRockTexture,
  createJapaneseRoadSignTexture,
  createPineFoliageTexture,
  createPlazaTexture,
  createRoadTexture,
  createRockBumpTexture,
  createSakuraFoliageTexture,
  createSoftSmokePuffTexture,
  createSpeedLimitSignTexture,
  createTerrainDetailTexture,
  createTreeBarkTexture,
} from './proceduralMaterials';
import {
  getBlossomRiverCenterX,
  getMapRoadSamples,
  getMapTreeColliders,
  getTerrainHeight,
  queryRoadAt,
  SampledRoadNode,
} from './roadMath';
import { GraphicsPreset, MapId, TimeOfDay, WeatherMode } from './types';

export interface BuiltMapEnvironment {
  group: THREE.Group;
  skyMaterial: THREE.ShaderMaterial;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  waterMesh: THREE.Mesh | null;
  petalInstancedMesh: THREE.InstancedMesh;
  petalData: Float32Array; // x, y, z, vx, vy, vz, rotSpeed
  smokeInstancedMesh: THREE.InstancedMesh;
  smokeData: Float32Array; // x, y, z, age, maxAge, scale, vx, vz
  exhaustSmokeInstancedMesh: THREE.InstancedMesh;
  exhaustSmokeData: Float32Array; // x, y, z, age, maxAge, scale, vx, vz
  skidInstancedMesh: THREE.InstancedMesh;
  streetlightBulbMat: THREE.MeshStandardMaterial;
  setTimeOfDay: (tod: TimeOfDay, scene: THREE.Scene) => void;
  setWeather: (weather: WeatherMode, scene: THREE.Scene) => void;
  setGraphicsPreset: (preset: GraphicsPreset, isSoftwareGl: boolean) => void;
  updateEnvironment: (
    dt: number,
    elapsed: number,
    carX: number,
    carY: number,
    carZ: number,
    carHeading: number,
    isDrifting: boolean,
    carSpeedKmh?: number,
    driftAngle?: number,
    tireSlipRatio?: number,
    isBrakingHard?: boolean,
    exhaustSmokeIntensity?: number,
    exhaustOutlets?: Array<[number, number, number]>
  ) => void;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function buildRoadRibbonGeometry(
  samples: SampledRoadNode[],
  closed: boolean,
  mapId?: MapId
): THREE.BufferGeometry {
  const count = samples.length;
  const ringCount = closed ? count + 1 : count;
  const cols = 6; // 0: outer-left skirt, 1: left raised concrete curb, 2: left asphalt edge, 3: right asphalt edge, 4: right raised concrete curb, 5: outer-right skirt
  const positions = new Float32Array(ringCount * cols * 3);
  const normals = new Float32Array(ringCount * cols * 3);
  const uvs = new Float32Array(ringCount * cols * 2);
  const indices: number[] = [];

  let accDist = 0;

  for (let i = 0; i < ringCount; i++) {
    const s = samples[i % count];
    if (i > 0) {
      const prev = samples[(i - 1) % count];
      accDist += Math.hypot(s.x - prev.x, s.z - prev.z);
    }

    const hw = s.halfWidth;
    const curbW = hw + 0.34;
    const skirtW = hw + (s.isBridge ? 0.42 : 2.25);
    const skirtDrop = s.isBridge ? -0.35 : -0.95;
    const sinBank = Math.sin(s.bankAngle || 0);
    const leftBankY = hw * sinBank;
    const rightBankY = -hw * sinBank;

    // Taper curbRaise to 0 at branch endpoints so branch curbs never protrude through the main road at junctions
    let junctionTaper = 1.0;
    if (!closed) {
      const distFromEnd = Math.min(i, ringCount - 1 - i);
      if (distFromEnd < 8) {
        junctionTaper = Math.max(0, (distFromEnd - 3) / 5);
      }
    }
    const curbRaise = (s.isBridge ? 0.09 : 0.055) * junctionTaper;

    // 6-point cross-section so the asphalt surface sits at exact `s.y + lateral * sin(bankAngle)`
    // (matching `queryRoadAt` to the millimeter!) with raised 3D concrete shoulder curbs on both edges.
    const pts = [
      { x: s.x + s.nx * skirtW, y: s.y + leftBankY + skirtDrop, z: s.z + s.nz * skirtW, u: 0.0 },
      { x: s.x + s.nx * curbW, y: s.y + leftBankY + curbRaise, z: s.z + s.nz * curbW, u: 0.015 },
      { x: s.x + s.nx * hw, y: s.y + leftBankY, z: s.z + s.nz * hw, u: 0.045 },
      { x: s.x - s.nx * hw, y: s.y + rightBankY, z: s.z - s.nz * hw, u: 0.955 },
      { x: s.x - s.nx * curbW, y: s.y + rightBankY + curbRaise, z: s.z - s.nz * curbW, u: 0.985 },
      { x: s.x - s.nx * skirtW, y: s.y + rightBankY + skirtDrop, z: s.z - s.nz * skirtW, u: 1.0 },
    ];

    // For branch road junction rings, conform any vertex overlapping the main road corridor to the main road surface
    if (!closed && mapId && (i < 12 || i > ringCount - 13)) {
      for (let j = 1; j <= 4; j++) {
        const rq = queryRoadAt(pts[j].x, pts[j].z, mapId);
        if (rq.routeType === 'main' && rq.distanceToCenter <= rq.roadHalfWidth + 0.45) {
          pts[j].y = rq.elevation - 0.003;
        }
      }
    }

    const vCoord = accDist * 0.055;

    for (let j = 0; j < cols; j++) {
      const idx = i * cols + j;
      positions[idx * 3] = pts[j].x;
      positions[idx * 3 + 1] = pts[j].y;
      positions[idx * 3 + 2] = pts[j].z;

      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 1;
      normals[idx * 3 + 2] = 0;

      uvs[idx * 2] = pts[j].u;
      uvs[idx * 2 + 1] = vCoord;
    }

    if (i < ringCount - 1) {
      const base = i * cols;
      const next = (i + 1) * cols;
      for (let j = 0; j < cols - 1; j++) {
        indices.push(base + j, next + j, base + j + 1);
        indices.push(base + j + 1, next + j, next + j + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals on closed loop road ribbons
  if (closed) {
    const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    const lastRingBase = (ringCount - 1) * cols;
    for (let j = 0; j < cols; j++) {
      const nx = (normAttr.getX(j) + normAttr.getX(lastRingBase + j)) * 0.5;
      const ny = (normAttr.getY(j) + normAttr.getY(lastRingBase + j)) * 0.5;
      const nz = (normAttr.getZ(j) + normAttr.getZ(lastRingBase + j)) * 0.5;
      const len = Math.hypot(nx, ny, nz) || 1;
      normAttr.setXYZ(j, nx / len, ny / len, nz / len);
      normAttr.setXYZ(lastRingBase + j, nx / len, ny / len, nz / len);
    }
    normAttr.needsUpdate = true;
  }

  return geo;
}

export function buildMapEnvironment(
  mapId: MapId,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isSoftwareGl: boolean,
  initialTimeOfDay: TimeOfDay
): BuiltMapEnvironment {
  const group = new THREE.Group();
  const mapDef = MAPS_DATA[mapId];
  const { mainSamples, branchSamples } = getMapRoadSamples(mapId);

  // 1. Procedural Textures
  const { map: roadTex, bumpMap: roadBump, roughnessMap: roadRoughness } = createRoadTexture(renderer, mapId);
  const plazaTex = createPlazaTexture(renderer, mapId);
  const chevronTex = createChevronSignTexture(renderer);
  const signTex = createJapaneseRoadSignTexture(renderer, mapId);
  const rockBump = createRockBumpTexture(renderer);
  const wallTex = createBuildingWallTexture(renderer);
  const pineFoliageTex = createPineFoliageTexture(renderer);
  const sakuraFoliageTex = createSakuraFoliageTexture(renderer);
  const barkTex = createTreeBarkTexture(renderer);
  const rockTex = createGraniteRockTexture(renderer);
  const terrainDetailTex = createTerrainDetailTexture(renderer);
  const softSmokeTex = createSoftSmokePuffTexture(renderer);
  const speedLimitTex = createSpeedLimitSignTexture(renderer, mapId === 'mountain' ? 40 : 50);

  // 2. Physically-Inspired Atmospheric Sky Dome with Multi-Layered Volumetric-Style Clouds
  const skyGeo = new THREE.SphereGeometry(520, 36, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x0284c7) },
      upperMidColor: { value: new THREE.Color(0x38bdf8) },
      midColor: { value: new THREE.Color(0xbae6fd) },
      bottomColor: { value: new THREE.Color(0xf0f9ff) },
      cloudLitColor: { value: new THREE.Color(0xffffff) },
      cloudShadowColor: { value: new THREE.Color(0xcbd5e1) },
      cloudCover: { value: 0.55 },
      sunDir: { value: new THREE.Vector3(-0.52, 0.48, -0.70).normalize() },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 topColor;
      uniform vec3 upperMidColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform vec3 cloudLitColor;
      uniform vec3 cloudShadowColor;
      uniform float cloudCover;
      uniform vec3 sunDir;
      uniform float time;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmClouds(vec2 uv) {
        float v = 0.0;
        float a = 0.52;
        for (int i = 0; i < 4; i++) {
          v += a * valueNoise(uv);
          uv = uv * 2.08 + vec2(1.7, 9.2);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y, 0.0, 1.0);

        // Multi-stop Rayleigh/Mie atmospheric sky gradient
        vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, upperMidColor, smoothstep(0.14, 0.52, h));
        col = mix(col, topColor, smoothstep(0.45, 0.94, h));

        // Sun alignment for Mie forward scattering & cloud rim lighting
        float sunAmt = max(dot(dir, sunDir), 0.0);

        // Realistic multi-layered clouds projected across the sky dome
        if (h > 0.02) {
          vec2 cloudUv = dir.xz / (h + 0.18) * 2.2 + vec2(time * 0.007, -time * 0.004);
          float n = fbmClouds(cloudUv);
          float threshold = mix(0.62, 0.28, clamp(cloudCover, 0.0, 1.0));
          float cloudDensity = smoothstep(threshold, threshold + 0.30, n) * smoothstep(0.02, 0.16, h) * (1.0 - smoothstep(0.62, 0.92, h));
          vec3 cCol = mix(cloudShadowColor, cloudLitColor, smoothstep(threshold, threshold + 0.26, n) * (0.55 + 0.45 * pow(sunAmt, 1.5)));
          col = mix(col, cCol, cloudDensity * (0.65 + 0.25 * cloudCover));
        }

        // Solar aureole & crisp sun/moon disk
        col += bottomColor * pow(sunAmt, 8.0) * 0.22 * (1.0 - h * 0.5);
        col += vec3(1.0, 0.94, 0.80) * pow(sunAmt, 36.0) * 0.38;
        col += vec3(1.0, 0.98, 0.92) * smoothstep(0.9975, 0.9996, sunAmt) * 1.15;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
  group.add(skyMesh);

  // 3. Directional Sun / Moonlight, Atmospheric Hemisphere Sky/Ground Fill & Ambient Bounce Floor
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.55);
  sunLight.position.set(-140, 135, -165);
  sunLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    sunLight.shadow.mapSize.set(1024, 1024);
    const d = 220;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 480;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
  }
  group.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x3f6212, 1.38);
  hemiLight.position.set(0, 120, 0);
  group.add(hemiLight);

  // Dedicated ambient fill floor so shaded sides of trees, mountains, and buildings never become black silhouettes
  const ambientLight = new THREE.AmbientLight(0xf0f9ff, 0.56);
  group.add(ambientLight);

  // 4. 3D Terrain Mesh with Vertex Colors & Rock Micro-Relief
  const terrainSize = 620;
  const terrainSegs = isSoftwareGl ? 128 : 160;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getTerrainHeight(vx, vz, mapId);
    posAttr.setY(i, vy);
  }
  terrainGeo.computeVertexNormals();
  const normAttr = terrainGeo.attributes.normal;

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const ny = normAttr.getY(i);
    const slope = 1 - Math.abs(ny);

    if (mapId === 'mountain') {
      if (slope > 0.34 || vy > 48) {
        // Sunlit rocky granite cliffs & high alpine ridges
        _color.setHex(vy > 62 ? 0xcbd5e1 : 0x78716c);
      } else if (vy < 7) {
        // Lush green valley floor
        _color.setHex(0x3f6212);
      } else {
        // Vibrant sunlit mountain alpine grass & moss
        _color.setHex(0x4d7c0f);
      }
    } else {
      // Blossom Drift terrain colors
      if (vy < 1.8 && vz > 65) {
        // Sandy stone riverbed & banks
        _color.setHex(0xd6d3d1);
      } else if (vy > 22) {
        // Distant Sakura-covered mountain ridges
        const blossomPatch = Math.sin(vx * 0.04) * Math.cos(vz * 0.04) > 0.1;
        _color.setHex(blossomPatch ? 0xf472b6 : 0x4d7c0f);
      } else {
        // Lush spring garden grass with flower field patches
        const flowerField = Math.sin(vx * 0.05 + 1.2) * Math.cos(vz * 0.05) > 0.45;
        _color.setHex(flowerField ? 0xf9a8d4 : 0x578c3d);
      }
    }

    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainDetailTex,
    vertexColors: true,
    roughness: 0.80,
    metalness: 0.03,
    bumpMap: rockBump,
    bumpScale: mapId === 'mountain' ? 0.36 : 0.14,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);

  // 5. Road Ribbons (Main Loop + Interconnected Branch Route) + Drift Plazas
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    bumpMap: roadBump,
    bumpScale: 0.048,
    roughnessMap: roadRoughness,
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.14,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const mainRoadGeo = buildRoadRibbonGeometry(mainSamples, true, mapId);
  const mainRoadMesh = new THREE.Mesh(mainRoadGeo, roadMat);
  mainRoadMesh.receiveShadow = !isSoftwareGl;
  group.add(mainRoadMesh);

  const branchRoadMat = roadMat.clone();
  branchRoadMat.polygonOffset = false;
  const branchRoadGeo = buildRoadRibbonGeometry(branchSamples, false, mapId);
  const branchRoadMesh = new THREE.Mesh(branchRoadGeo, branchRoadMat);
  branchRoadMesh.receiveShadow = !isSoftwareGl;
  group.add(branchRoadMesh);

  // Open Drift Plazas / Rest Areas + 3D Drift Practice Cones & Clipping Zones
  const plazaMat = new THREE.MeshStandardMaterial({
    map: plazaTex,
    bumpMap: roadBump,
    bumpScale: 0.03,
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const coneBaseGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42);
  const coneBodyGeo = new THREE.ConeGeometry(0.17, 0.68, 12);
  const coneCollarGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.18, 12);
  const coneOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.38,
    metalness: 0.08,
  });
  const coneWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  });

  for (const plaza of mapDef.plazas) {
    const pGeo = new THREE.CylinderGeometry(1, 1.04, 0.28, 48);
    pGeo.scale(plaza.radiusX, 1, plaza.radiusZ);
    const pMesh = new THREE.Mesh(pGeo, plazaMat);
    pMesh.position.set(plaza.x, plaza.y - 0.14, plaza.z);
    pMesh.rotation.y = plaza.rotation;
    pMesh.receiveShadow = !isSoftwareGl;
    group.add(pMesh);

    // Place Figure-8 & Outer Clipping Zone Drift Practice Cones on the Plaza
    const conePositions: Array<{ x: number; z: number }> = [];
    // Two inner figure-8 pivot pylons (4 cones per pivot circle)
    for (const pivotOffset of [-plaza.radiusX * 0.34, plaza.radiusX * 0.34]) {
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        conePositions.push({
          x: plaza.x + pivotOffset + Math.cos(ang) * 2.2,
          z: plaza.z + Math.sin(ang) * 2.2,
        });
      }
    }
    // Outer clipping-zone apex cones along the plaza perimeter
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      if (Math.abs(Math.sin(ang)) < 0.35) continue; // Keep road entry/exit clear
      conePositions.push({
        x: plaza.x + Math.cos(ang) * (plaza.radiusX * 0.78),
        z: plaza.z + Math.sin(ang) * (plaza.radiusZ * 0.78),
      });
    }

    const baseInst = new THREE.InstancedMesh(coneBaseGeo, coneOrangeMat, conePositions.length);
    const bodyInst = new THREE.InstancedMesh(coneBodyGeo, coneOrangeMat, conePositions.length);
    const collarInst = new THREE.InstancedMesh(coneCollarGeo, coneWhiteMat, conePositions.length);
    conePositions.forEach((cp, idx) => {
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.position.set(cp.x, plaza.y + 0.03, cp.z);
      _dummy.updateMatrix();
      baseInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(cp.x, plaza.y + 0.37, cp.z);
      _dummy.updateMatrix();
      bodyInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(cp.x, plaza.y + 0.46, cp.z);
      _dummy.updateMatrix();
      collarInst.setMatrixAt(idx, _dummy.matrix);
    });
    baseInst.instanceMatrix.needsUpdate = true;
    bodyInst.instanceMatrix.needsUpdate = true;
    collarInst.instanceMatrix.needsUpdate = true;
    group.add(baseInst, bodyInst, collarInst);
  }

  // 6. Special Map Structures (Mountain Tunnel / Blossom Bridge & River & Torii Gates & Village)
  let waterMesh: THREE.Mesh | null = null;

  if (mapId === 'mountain') {
    const tunnelGroup = createMountainTunnelStructure(mainSamples, rockBump);
    group.add(tunnelGroup);
  } else {
    // Jade River Water Surface
    const waterGeo = new THREE.PlaneGeometry(520, 220, 32, 32);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.14,
      metalness: 0.65,
      bumpMap: rockBump,
      bumpScale: 0.05,
      transparent: true,
      opacity: 0.88,
    });
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(0, 1.45, 165);
    group.add(waterMesh);

    // Vermilion Wooden Bridge over the river
    const bridgeGroup = createVermilionBridgeStructure(mainSamples);
    group.add(bridgeGroup);

    // Towering Vermilion Torii Gates straddling key road sections (including bridge approach & boulevard)
    const toriiIndices = [0, 35, 118, 154, 195, 225, 250];
    for (const idx of toriiIndices) {
      const s = mainSamples[idx % mainSamples.length];
      if (!s.isBridge) {
        const torii = createToriiGateModel(s.halfWidth * 2 + 2.6, 11.5);
        torii.position.set(s.x, s.y, s.z);
        torii.rotation.y = Math.atan2(s.tx, s.tz);
        group.add(torii);
      }
    }
    // One Torii gate at entrance to the Hanami Courtyard branch road
    const branchMid = branchSamples[Math.floor(branchSamples.length * 0.25)];
    const branchTorii = createToriiGateModel(branchMid.halfWidth * 2 + 2.6, 11.0);
    branchTorii.position.set(branchMid.x, branchMid.y, branchMid.z);
    branchTorii.rotation.y = Math.atan2(branchMid.tx, branchMid.tz);
    group.add(branchTorii);

    // Traditional Japanese Village Houses & Shops along the West Village Avenue, Bridge Bank & Festival Square
    const villagePlacements = [
      { x: -192, z: 85, rot: Math.PI / 2, scale: 1.05 },
      { x: -190, z: 35, rot: Math.PI / 2, scale: 0.95 },
      { x: -188, z: -35, rot: Math.PI / 2, scale: 1.1 },
      { x: -192, z: -85, rot: Math.PI / 2, scale: 1.0 },
      { x: -140, z: 32, rot: -Math.PI / 2, scale: 0.95 },
      { x: -138, z: -45, rot: -Math.PI / 2, scale: 1.0 },
      { x: -35, z: -212, rot: 0, scale: 1.05 },
      { x: 35, z: -212, rot: 0, scale: 1.05 },
      { x: 48, z: 32, rot: Math.PI, scale: 0.92 },
      { x: -48, z: 34, rot: 0, scale: 0.92 },
      { x: -95, z: 122, rot: 0.3, scale: 1.0 },
      { x: 95, z: 122, rot: -0.3, scale: 1.0 },
    ];
    for (const vp of villagePlacements) {
      const rq = queryRoadAt(vp.x, vp.z, mapId);
      if (!rq.onRoad && rq.distanceToCenter > rq.roadHalfWidth + 4.5) {
        const ty = getTerrainHeight(vp.x, vp.z, mapId);
        const house = createJapaneseBuildingModel(wallTex, vp.scale);
        house.position.set(vp.x, ty, vp.z);
        house.rotation.y = vp.rot;
        group.add(house);
      }
    }
  }

  // Add Rest Area / Courtyard Landmark Pavilions
  group.add(createPlazaLandmarkProps(mapId));

  // 7. Instanced Guardrails, Reflective Markers, Chevron Boards & Streetlights / Lanterns
  const allRoadNodes = [...mainSamples, ...branchSamples];
  const guardrailRails: { x: number; y: number; z: number; rotY: number; pitchX: number; len: number }[] = [];
  const reflectorPosts: { x: number; y: number; z: number; isRed: boolean }[] = [];
  const chevronBoards: { x: number; y: number; z: number; rotY: number }[] = [];
  const roadSigns: { x: number; y: number; z: number; rotY: number }[] = [];
  const lightPoles: { x: number; y: number; z: number; rotY: number }[] = [];

  for (let i = 0; i < allRoadNodes.length - 1; i++) {
    const s = allRoadNodes[i];
    const next = allRoadNodes[i + 1];
    if (s.routeType !== next.routeType) continue;
    if (s.isBridge && mapId === 'blossom') continue; // Bridge has its own red wooden railings

    // Skip guardrails right where the branch road intersects the main road or plazas
    const nearBranchIntersection =
      s.routeType === 'main' &&
      (Math.hypot(s.x - branchSamples[0].x, s.z - branchSamples[0].z) < 18 ||
        Math.hypot(
          s.x - branchSamples[branchSamples.length - 1].x,
          s.z - branchSamples[branchSamples.length - 1].z
        ) < 18);

    const nearPlaza = mapDef.plazas.some(
      (p) => Math.hypot((s.x - p.x) / p.radiusX, (s.z - p.z) / p.radiusZ) < 1.12
    );
    if (nearBranchIntersection || nearPlaza) continue;

    const segLen = Math.hypot(next.x - s.x, next.z - s.z);
    if (segLen > 12 || segLen < 0.2) continue;

    const angle = Math.atan2(next.x - s.x, next.z - s.z);
    const railOffset = s.halfWidth + 0.52;
    const sinBankS = Math.sin(s.bankAngle || 0);
    const sinBankNext = Math.sin(next.bankAngle || 0);

    if (mapId === 'mountain' || s.hasGuardrailLeft || s.hasGuardrailRight) {
      for (const side of [-1, 1]) {
        if (side === 1 && !s.hasGuardrailLeft) continue;
        if (side === -1 && !s.hasGuardrailRight) continue;

        const rx0 = s.x + s.nx * railOffset * side;
        const rz0 = s.z + s.nz * railOffset * side;
        const ry0 = s.y + railOffset * side * sinBankS;

        const rx1 = next.x + next.nx * (next.halfWidth + 0.52) * side;
        const rz1 = next.z + next.nz * (next.halfWidth + 0.52) * side;
        const ry1 = next.y + (next.halfWidth + 0.52) * side * sinBankNext;

        const midX = (rx0 + rx1) * 0.5;
        const midY = (ry0 + ry1) * 0.5 + 0.56;
        const midZ = (rz0 + rz1) * 0.5;
        const rdx = rx1 - rx0;
        const rdy = ry1 - ry0;
        const rdz = rz1 - rz0;
        const rLenXZ = Math.hypot(rdx, rdz) || 1;
        const rLen3D = Math.hypot(rLenXZ, rdy) || 1;
        const railRotY = Math.atan2(rdx, rdz);
        const railPitchX = -Math.atan2(rdy, rLenXZ);

        guardrailRails.push({
          x: midX,
          y: midY,
          z: midZ,
          rotY: railRotY,
          pitchX: railPitchX,
          len: rLen3D + 0.08,
        });

        if (i % 3 === 0) {
          reflectorPosts.push({ x: rx0, y: ry0 + 0.4, z: rz0, isRed: side === 1 });
        }
      }
    }

    // Hairpin Chevron Warning Boards positioned cleanly behind the guardrail
    if (s.chevronSide !== 'none' && i % 6 === 0) {
      const side = s.chevronSide === 'left' ? 1 : -1;
      const cx = s.x + s.nx * (s.halfWidth + 1.95) * side;
      const cz = s.z + s.nz * (s.halfWidth + 1.95) * side;
      const cy = s.y + (s.halfWidth + 1.95) * side * sinBankS + 1.55;
      chevronBoards.push({ x: cx, y: cy, z: cz, rotY: angle + Math.PI * 0.5 * side });
    }

    // Japanese Warning / Route Signs every 42 samples
    if (i % 42 === 5 && !s.isTunnel) {
      const sx = s.x + s.nx * (s.halfWidth + 1.65);
      const sz = s.z + s.nz * (s.halfWidth + 1.65);
      const sy = s.y + (s.halfWidth + 1.65) * sinBankS;
      roadSigns.push({ x: sx, y: sy, z: sz, rotY: angle + Math.PI });
    }

    // Streetlights (Mountain) or Traditional Japanese Road Lanterns (Blossom)
    if (i % 15 === 0 && !s.isTunnel) {
      const side = (i / 15) % 2 === 0 ? 1 : -1;
      const lx = s.x + s.nx * (s.halfWidth + 1.35) * side;
      const lz = s.z + s.nz * (s.halfWidth + 1.35) * side;
      const ly = s.y + (s.halfWidth + 1.35) * side * sinBankS;
      lightPoles.push({ x: lx, y: ly, z: lz, rotY: angle + (side === 1 ? -Math.PI / 2 : Math.PI / 2) });
    }
  }

  // Instantiate Slope-Aligned Galvanized Steel W-Beam Guardrail Beams
  if (guardrailRails.length > 0) {
    const railGeo = new THREE.BoxGeometry(0.18, 0.34, 1.0);
    const railMat = new THREE.MeshStandardMaterial({
      color: mapId === 'mountain' ? 0xd4d4d8 : 0x78350f,
      metalness: mapId === 'mountain' ? 0.68 : 0.18,
      roughness: mapId === 'mountain' ? 0.32 : 0.72,
    });
    const railInst = new THREE.InstancedMesh(railGeo, railMat, guardrailRails.length);
    _dummy.rotation.order = 'YXZ';
    guardrailRails.forEach((r, idx) => {
      _dummy.position.set(r.x, r.y, r.z);
      _dummy.rotation.set(r.pitchX, r.rotY, 0);
      _dummy.scale.set(1, 1, r.len);
      _dummy.updateMatrix();
      railInst.setMatrixAt(idx, _dummy.matrix);
    });
    _dummy.rotation.order = 'XYZ';
    railInst.instanceMatrix.needsUpdate = true;
    railInst.computeBoundingSphere();
    group.add(railInst);
  }

  // Instantiate Guardrail Posts & Reflective Safety Markers
  if (reflectorPosts.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.85, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.6 });
    const refGeo = new THREE.BoxGeometry(0.16, 0.18, 0.16);
    const refMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 1.5,
    });

    const postInst = new THREE.InstancedMesh(postGeo, postMat, reflectorPosts.length);
    const refInst = new THREE.InstancedMesh(refGeo, refMat, reflectorPosts.length);

    reflectorPosts.forEach((p, idx) => {
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      postInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(p.x, p.y + 0.46, p.z);
      _dummy.updateMatrix();
      refInst.setMatrixAt(idx, _dummy.matrix);
      refInst.setColorAt(idx, _color.setHex(p.isRed ? 0xef4444 : 0xfbbf24));
    });
    postInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    refInst.instanceMatrix.needsUpdate = true;
    if (refInst.instanceColor) refInst.instanceColor.needsUpdate = true;
    refInst.computeBoundingSphere();
    group.add(postInst, refInst);
  }

  // Instantiate Chevron Warning Boards
  if (chevronBoards.length > 0) {
    const chevGeo = new THREE.BoxGeometry(2.1, 0.95, 0.12);
    const chevMat = new THREE.MeshStandardMaterial({
      map: chevronTex,
      color: 0xffffff,
      roughness: 0.3,
    });
    const chevInst = new THREE.InstancedMesh(chevGeo, chevMat, chevronBoards.length);
    chevronBoards.forEach((c, idx) => {
      _dummy.position.set(c.x, c.y, c.z);
      _dummy.rotation.set(0, c.rotY, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      chevInst.setMatrixAt(idx, _dummy.matrix);
    });
    chevInst.instanceMatrix.needsUpdate = true;
    chevInst.computeBoundingSphere();
    group.add(chevInst);
  }

  // Instantiate Japanese Warning Signs
  if (roadSigns.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.6, roughness: 0.4 });
    const boardGeo = new THREE.BoxGeometry(1.15, 1.15, 0.08);
    const boardMat = new THREE.MeshStandardMaterial({ map: signTex, color: 0xffffff, roughness: 0.35 });

    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, roadSigns.length);
    const boardInst = new THREE.InstancedMesh(boardGeo, boardMat, roadSigns.length);

    roadSigns.forEach((rs, idx) => {
      _dummy.position.set(rs.x, rs.y + 1.4, rs.z);
      _dummy.rotation.set(0, rs.rotY, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      poleInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(rs.x, rs.y + 2.65, rs.z);
      if (mapId === 'mountain') {
        _dummy.rotation.set(0, rs.rotY, Math.PI / 4); // Diamond warning board
      } else {
        _dummy.rotation.set(0, rs.rotY, 0);
      }
      _dummy.updateMatrix();
      boardInst.setMatrixAt(idx, _dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    boardInst.instanceMatrix.needsUpdate = true;
    boardInst.computeBoundingSphere();
    group.add(poleInst, boardInst);

    // Add Japanese Circular Retroreflective Speed Limit Disks (40 / 50 km/h) mounted on the sign poles
    const speedDiskGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.06, 20);
    speedDiskGeo.rotateX(Math.PI / 2);
    const speedDiskMat = new THREE.MeshStandardMaterial({
      map: speedLimitTex,
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.15,
    });
    const speedDiskInst = new THREE.InstancedMesh(speedDiskGeo, speedDiskMat, roadSigns.length);
    roadSigns.forEach((rs, idx) => {
      _dummy.position.set(rs.x, rs.y + 1.62, rs.z);
      _dummy.rotation.set(0, rs.rotY, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      speedDiskInst.setMatrixAt(idx, _dummy.matrix);
    });
    speedDiskInst.instanceMatrix.needsUpdate = true;
    speedDiskInst.computeBoundingSphere();
    group.add(speedDiskInst);
  }

  // Streetlights (Mountain) or Japanese Wooden/Stone Lanterns (Blossom)
  const streetlightBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: mapId === 'mountain' ? 0xf59e0b : 0xfb923c,
    emissiveIntensity: 2.2,
  });

  if (lightPoles.length > 0) {
    if (mapId === 'mountain') {
      const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6.2, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.7, roughness: 0.35 });
      const bulbGeo = new THREE.BoxGeometry(1.1, 0.18, 0.42);

      const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lightPoles.length);
      const bulbInst = new THREE.InstancedMesh(bulbGeo, streetlightBulbMat, lightPoles.length);

      lightPoles.forEach((lp, idx) => {
        _dummy.position.set(lp.x, lp.y + 3.1, lp.z);
        _dummy.rotation.set(0, lp.rotY, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        poleInst.setMatrixAt(idx, _dummy.matrix);

        const armX = lp.x + Math.sin(lp.rotY) * 0.85;
        const armZ = lp.z + Math.cos(lp.rotY) * 0.85;
        _dummy.position.set(armX, lp.y + 6.1, armZ);
        _dummy.updateMatrix();
        bulbInst.setMatrixAt(idx, _dummy.matrix);
      });
      poleInst.instanceMatrix.needsUpdate = true;
      poleInst.computeBoundingSphere();
      bulbInst.instanceMatrix.needsUpdate = true;
      bulbInst.computeBoundingSphere();
      group.add(poleInst, bulbInst);
    } else {
      // Traditional Japanese Torō Road Lanterns (Pedestal + Glowing Paper Chamber + Pagoda Cap)
      const postGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.8, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.85 });
      const chamberGeo = new THREE.BoxGeometry(0.68, 0.78, 0.68);
      const capGeo = new THREE.ConeGeometry(0.78, 0.55, 4);

      const postInst = new THREE.InstancedMesh(postGeo, postMat, lightPoles.length);
      const chamberInst = new THREE.InstancedMesh(chamberGeo, streetlightBulbMat, lightPoles.length);
      const capInst = new THREE.InstancedMesh(capGeo, postMat, lightPoles.length);

      lightPoles.forEach((lp, idx) => {
        _dummy.position.set(lp.x, lp.y + 1.4, lp.z);
        _dummy.rotation.set(0, lp.rotY, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        postInst.setMatrixAt(idx, _dummy.matrix);

        _dummy.position.set(lp.x, lp.y + 3.1, lp.z);
        _dummy.updateMatrix();
        chamberInst.setMatrixAt(idx, _dummy.matrix);

        _dummy.position.set(lp.x, lp.y + 3.75, lp.z);
        _dummy.rotation.set(0, lp.rotY + Math.PI / 4, 0);
        _dummy.updateMatrix();
        capInst.setMatrixAt(idx, _dummy.matrix);
      });
      postInst.instanceMatrix.needsUpdate = true;
      postInst.computeBoundingSphere();
      chamberInst.instanceMatrix.needsUpdate = true;
      chamberInst.computeBoundingSphere();
      capInst.instanceMatrix.needsUpdate = true;
      capInst.computeBoundingSphere();
      group.add(postInst, chamberInst, capInst);
    }
  }

  // 8. Dense Forests & Environmental Foliage (Shared with Physics via getMapTreeColliders)
  const treePositions = getMapTreeColliders(mapId);
  const rockPositions: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number }[] = [];
  const bushPositions: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tint: number }[] = [];

  // Deterministic pseudo-random generator for boulders and roadside understory shrubs
  let seed = mapId === 'mountain' ? 2468 : 8642;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Place roadside wild bushes, ferns, and undergrowth along mountain embankments
  for (let i = 0; i < allRoadNodes.length; i += 2) {
    const s = allRoadNodes[i];
    if (s.isTunnel || s.isBridge) continue;
    for (const side of [-1, 1]) {
      const offset = s.halfWidth + 2.4 + rand() * 5.8;
      const bx = s.x + s.nx * offset * side + (rand() - 0.5) * 2.2;
      const bz = s.z + s.nz * offset * side + (rand() - 0.5) * 2.2;
      const rq = queryRoadAt(bx, bz, mapId);
      if (!rq.onRoad && rq.distanceToCenter > rq.roadHalfWidth + 2.1) {
        const by = getTerrainHeight(bx, bz, mapId);
        if (mapId === 'blossom' && by < 1.8 && bz > 65) continue;
        bushPositions.push({
          x: bx,
          y: by,
          z: bz,
          sx: 0.9 + rand() * 1.35,
          sy: 0.65 + rand() * 0.95,
          sz: 0.9 + rand() * 1.35,
          rot: rand() * Math.PI * 2,
          tint: rand(),
        });
      }
    }
  }

  // Add rocky cliff outcrops & boulders
  for (let i = 0; i < (mapId === 'mountain' ? 140 : 65); i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 35 + rand() * 230;
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const rq = queryRoadAt(rx, rz, mapId);
    if (!rq.onRoad && rq.distanceToCenter > rq.roadHalfWidth + 3.8) {
      const ry = getTerrainHeight(rx, rz, mapId);
      rockPositions.push({
        x: rx,
        y: ry,
        z: rz,
        sx: 1.8 + rand() * 4.5,
        sy: 1.4 + rand() * 5.2,
        sz: 1.8 + rand() * 4.5,
        rot: rand() * Math.PI,
      });
    }
  }

  // Helper to sculpt organic irregular foliage clusters (never stacked geometric cones!)
  const createOrganicFoliageClusterGeo = (rx: number, ry: number, rz: number, seedOffset: number) => {
    const geo = new THREE.IcosahedronGeometry(1.0, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n1 = Math.sin(vx * 3.4 + vy * 2.7 + seedOffset) * 0.18;
      const n2 = Math.cos(vz * 3.9 - vx * 2.2 + seedOffset * 1.7) * 0.14;
      const droop = vy < 0 ? -0.12 : 0.04;
      const s = 1.0 + n1 + n2;
      pos.setXYZ(i, vx * rx * s, (vy + droop) * ry * s, vz * rz * s);
    }
    geo.computeVertexNormals();
    return geo;
  };

  // Helper to sculpt a tapered tree trunk with flared root base and natural bend
  const createGnarledTrunkGeo = (topR: number, bottomR: number, height: number) => {
    const geo = new THREE.CylinderGeometry(topR, bottomR, height, 8, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const normY = (vy + height * 0.5) / height; // 0 at base, 1 at top
      // Root flare at bottom 25% so trunk anchors solidly into uneven mountain slopes
      const rootFlare = normY < 0.28 ? 1.0 + Math.pow(1.0 - normY / 0.28, 2.0) * 0.48 : 1.0;
      const ang = Math.atan2(vz, vx);
      const rootButtress = normY < 0.35 ? 1.0 + Math.sin(ang * 5.0) * 0.16 * (1.0 - normY / 0.35) : 1.0;
      // Subtle organic trunk curve
      const bendX = Math.sin(normY * Math.PI) * 0.14;
      const bendZ = Math.cos(normY * Math.PI * 0.8) * 0.08;
      pos.setXYZ(i, vx * rootFlare * rootButtress + bendX, vy, vz * rootFlare * rootButtress + bendZ);
    }
    geo.computeVertexNormals();
    return geo;
  };

  if (mapId === 'mountain') {
    // Realistic Japanese Mountain Hinoki / Cedar / Red Pine Trees:
    // Gnarled trunk with root flare grounded below terrain + reaching wooden boughs + 4 asymmetric organic foliage clusters
    const trunkGeo = createGnarledTrunkGeo(0.22, 0.46, 5.4);
    const branchGeo = new THREE.CylinderGeometry(0.08, 0.18, 2.4, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      bumpMap: barkTex,
      bumpScale: 0.09,
      color: 0x5c3d28,
      roughness: 0.92,
    });

    const cluster1Geo = createOrganicFoliageClusterGeo(2.65, 1.55, 2.55, 1.1);
    const cluster2Geo = createOrganicFoliageClusterGeo(2.25, 1.45, 2.15, 2.7);
    const cluster3Geo = createOrganicFoliageClusterGeo(1.95, 1.35, 1.85, 4.3);
    const crownTopGeo = createOrganicFoliageClusterGeo(1.65, 1.30, 1.65, 6.1);

    const foliageMat = new THREE.MeshStandardMaterial({
      map: pineFoliageTex,
      bumpMap: pineFoliageTex,
      bumpScale: 0.14,
      color: 0xffffff,
      roughness: 0.72,
      emissive: 0x1a2e12,
      emissiveIntensity: 0.15,
    });

    const count = treePositions.length;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const branchLeftInst = new THREE.InstancedMesh(branchGeo, trunkMat, count);
    const branchRightInst = new THREE.InstancedMesh(branchGeo, trunkMat, count);
    const c1Inst = new THREE.InstancedMesh(cluster1Geo, foliageMat, count);
    const c2Inst = new THREE.InstancedMesh(cluster2Geo, foliageMat, count);
    const c3Inst = new THREE.InstancedMesh(cluster3Geo, foliageMat, count);
    const c4Inst = new THREE.InstancedMesh(crownTopGeo, foliageMat, count);

    treePositions.forEach((t, idx) => {
      const s = t.scale;
      const sp = t.species || 'sugi_cedar';
      // Species-specific silhouette multipliers (tall Sugi Cedar, wide Hinoki, flat-top Red Pine, spreading Maple)
      const hStretch = sp === 'sugi_cedar' ? 1.18 : sp === 'hinoki_cypress' ? 1.02 : sp === 'red_pine' ? 0.94 : 0.88;
      const wStretch = sp === 'sugi_cedar' ? 0.84 : sp === 'hinoki_cypress' ? 1.06 : sp === 'red_pine' ? 1.22 : 1.16;

      const tiltX = Math.sin(t.rot * 2.3) * 0.045;
      const tiltZ = Math.cos(t.rot * 1.7) * 0.045;
      // Anchor trunk 0.35m below terrain surface so roots never float on steep slopes
      const baseGroundY = t.y - 0.35;

      _dummy.position.set(t.x, baseGroundY + 2.7 * s * hStretch, t.z);
      _dummy.rotation.set(tiltX, t.rot, tiltZ);
      _dummy.scale.set(s * (sp === 'red_pine' ? 1.08 : 0.96), s * hStretch, s * (sp === 'red_pine' ? 1.08 : 0.96));
      _dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, _dummy.matrix);

      // Left reaching primary bough
      const cosR = Math.cos(t.rot);
      const sinR = Math.sin(t.rot);
      _dummy.position.set(t.x + cosR * 0.85 * s * wStretch, baseGroundY + 3.8 * s * hStretch, t.z + sinR * 0.85 * s * wStretch);
      _dummy.rotation.set(tiltX + 0.35, t.rot, tiltZ - 0.82);
      _dummy.scale.setScalar(s * wStretch);
      _dummy.updateMatrix();
      branchLeftInst.setMatrixAt(idx, _dummy.matrix);

      // Right reaching primary bough
      _dummy.position.set(t.x - cosR * 0.78 * s * wStretch, baseGroundY + 4.6 * s * hStretch, t.z - sinR * 0.78 * s * wStretch);
      _dummy.rotation.set(tiltX - 0.28, t.rot + 0.6, tiltZ + 0.76);
      _dummy.scale.setScalar(s * 0.92 * wStretch);
      _dummy.updateMatrix();
      branchRightInst.setMatrixAt(idx, _dummy.matrix);

      // Lower-left spreading foliage canopy pad
      _dummy.position.set(t.x + cosR * 1.15 * s * wStretch, baseGroundY + 4.3 * s * hStretch, t.z + sinR * 1.15 * s * wStretch);
      _dummy.rotation.set(tiltX, t.rot + 0.2, tiltZ);
      _dummy.scale.set(s * 1.04 * wStretch, s * 0.88 * hStretch, s * 0.96 * wStretch);
      _dummy.updateMatrix();
      c1Inst.setMatrixAt(idx, _dummy.matrix);

      // Mid-right counter-balancing foliage canopy pad
      _dummy.position.set(t.x - cosR * 1.05 * s * wStretch, baseGroundY + 5.4 * s * hStretch, t.z - sinR * 1.05 * s * wStretch);
      _dummy.rotation.set(tiltX, t.rot + 1.4, tiltZ);
      _dummy.scale.set(s * 0.96 * wStretch, s * 0.86 * hStretch, s * 1.05 * wStretch);
      _dummy.updateMatrix();
      c2Inst.setMatrixAt(idx, _dummy.matrix);

      // Upper offset foliage cluster
      _dummy.position.set(t.x - sinR * 0.75 * s * wStretch, baseGroundY + 6.5 * s * hStretch, t.z + cosR * 0.75 * s * wStretch);
      _dummy.rotation.set(tiltX, t.rot + 2.6, tiltZ);
      _dummy.scale.set(s * 0.92 * wStretch, s * 0.85 * hStretch, s * 0.94 * wStretch);
      _dummy.updateMatrix();
      c3Inst.setMatrixAt(idx, _dummy.matrix);

      // Crown apex cluster
      _dummy.position.set(t.x + sinR * 0.25 * s, baseGroundY + 7.6 * s * hStretch, t.z - cosR * 0.25 * s);
      _dummy.rotation.set(tiltX, t.rot + 3.8, tiltZ);
      _dummy.scale.set(s * 0.88 * wStretch, s * 0.84 * hStretch, s * 0.88 * wStretch);
      _dummy.updateMatrix();
      c4Inst.setMatrixAt(idx, _dummy.matrix);

      // Species-authentic foliage coloration (deep Sugi green, lush Hinoki, olive Red Pine, warm Alpine Maple)
      const baseHue =
        sp === 'sugi_cedar'
          ? 0.34
          : sp === 'hinoki_cypress'
            ? 0.31
            : sp === 'red_pine'
              ? 0.28
              : 0.24;
      _color.setHSL(baseHue + (t.tint - 0.5) * 0.05, 0.50, 0.34 + t.tint * 0.16);
      c1Inst.setColorAt(idx, _color);
      _color.setHSL(baseHue + 0.01 + (t.tint - 0.5) * 0.05, 0.52, 0.38 + t.tint * 0.16);
      c2Inst.setColorAt(idx, _color);
      c3Inst.setColorAt(idx, _color);
      _color.setHSL(baseHue + 0.02 + (t.tint - 0.5) * 0.04, 0.55, 0.43 + t.tint * 0.16);
      c4Inst.setColorAt(idx, _color);
    });

    for (const inst of [trunkInst, branchLeftInst, branchRightInst, c1Inst, c2Inst, c3Inst, c4Inst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
  } else {
    // Massive Cherry Blossom (Sakura) Trees (Gnarled Flared Trunk + Reaching Boughs + 3 Multi-Cloud Blossom Canopies)
    const trunkGeo = createGnarledTrunkGeo(0.34, 0.62, 4.8);
    const branchGeo = new THREE.CylinderGeometry(0.11, 0.24, 2.6, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      bumpMap: barkTex,
      bumpScale: 0.08,
      color: 0x5c3a28,
      roughness: 0.88,
    });
    const canopyGeo = createOrganicFoliageClusterGeo(3.6, 2.1, 3.5, 1.9);
    const sakuraMat = new THREE.MeshStandardMaterial({
      map: sakuraFoliageTex,
      bumpMap: sakuraFoliageTex,
      bumpScale: 0.08,
      color: 0xffffff,
      roughness: 0.68,
      emissive: 0xf472b6,
      emissiveIntensity: 0.10,
    });

    const count = treePositions.length;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const branchLeftInst = new THREE.InstancedMesh(branchGeo, trunkMat, count);
    const branchRightInst = new THREE.InstancedMesh(branchGeo, trunkMat, count);
    const crownCenterInst = new THREE.InstancedMesh(canopyGeo, sakuraMat, count);
    const crownLeftInst = new THREE.InstancedMesh(canopyGeo, sakuraMat, count);
    const crownRightInst = new THREE.InstancedMesh(canopyGeo, sakuraMat, count);

    treePositions.forEach((t, idx) => {
      const s = t.scale;
      const baseGroundY = t.y - 0.35;
      const cosR = Math.cos(t.rot);
      const sinR = Math.sin(t.rot);

      _dummy.position.set(t.x, baseGroundY + 2.4 * s, t.z);
      _dummy.rotation.set(0.05, t.rot, -0.04);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(t.x + cosR * 1.05 * s, baseGroundY + 3.8 * s, t.z + sinR * 1.05 * s);
      _dummy.rotation.set(0.25, t.rot, -0.78);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      branchLeftInst.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(t.x - cosR * 1.0 * s, baseGroundY + 4.0 * s, t.z - sinR * 1.0 * s);
      _dummy.rotation.set(-0.22, t.rot, 0.74);
      _dummy.scale.setScalar(s * 0.94);
      _dummy.updateMatrix();
      branchRightInst.setMatrixAt(idx, _dummy.matrix);

      // Main central blossom cloud
      _dummy.position.set(t.x, baseGroundY + 5.8 * s, t.z);
      _dummy.rotation.set(0, t.rot, 0);
      _dummy.scale.setScalar(s * 1.04);
      _dummy.updateMatrix();
      crownCenterInst.setMatrixAt(idx, _dummy.matrix);

      // Left overarching blossom bough
      _dummy.position.set(t.x + cosR * 2.2 * s, baseGroundY + 4.9 * s, t.z + sinR * 2.2 * s);
      _dummy.scale.setScalar(s * 0.82);
      _dummy.updateMatrix();
      crownLeftInst.setMatrixAt(idx, _dummy.matrix);

      // Right overarching blossom bough
      _dummy.position.set(t.x - cosR * 2.1 * s, baseGroundY + 5.2 * s, t.z - sinR * 2.1 * s);
      _dummy.scale.setScalar(s * 0.78);
      _dummy.updateMatrix();
      crownRightInst.setMatrixAt(idx, _dummy.matrix);

      if (t.tint < 0.33) {
        _color.setHex(0xffe4e6);
      } else if (t.tint < 0.72) {
        _color.setHex(0xfbcfe8);
      } else {
        _color.setHex(0xf472b6);
      }
      crownCenterInst.setColorAt(idx, _color);
      crownLeftInst.setColorAt(idx, _color);
      crownRightInst.setColorAt(idx, _color);
    });

    for (const inst of [trunkInst, branchLeftInst, branchRightInst, crownCenterInst, crownLeftInst, crownRightInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
  }

  // Instantiate Roadside Understory Bushes & Shrubs
  if (bushPositions.length > 0) {
    const bushGeo = createOrganicFoliageClusterGeo(1.15, 0.78, 1.15, 5.2);
    const bushMat = new THREE.MeshStandardMaterial({
      map: pineFoliageTex,
      bumpMap: pineFoliageTex,
      bumpScale: 0.08,
      color: 0xffffff,
      roughness: 0.88,
    });
    const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, bushPositions.length);
    bushPositions.forEach((b, idx) => {
      _dummy.position.set(b.x, b.y + b.sy * 0.35, b.z);
      _dummy.rotation.set(0, b.rot, 0);
      _dummy.scale.set(b.sx, b.sy, b.sz);
      _dummy.updateMatrix();
      bushInst.setMatrixAt(idx, _dummy.matrix);
      _color.setHSL(0.31 + (b.tint - 0.5) * 0.07, 0.42, 0.25 + b.tint * 0.14);
      bushInst.setColorAt(idx, _color);
    });
    bushInst.instanceMatrix.needsUpdate = true;
    if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
    bushInst.computeBoundingSphere();
    group.add(bushInst);
  }

  // Instantiate Rugged Craggy Granite Rock Boulders
  if (rockPositions.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 2);
    const rPos = rockGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const crag =
        1.0 +
        Math.sin(vx * 3.7 + vy * 2.3) * 0.14 +
        Math.cos(vz * 4.1 - vx * 1.9) * 0.1;
      rPos.setXYZ(i, vx * crag, vy * crag, vz * crag);
    }
    rockGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: mapId === 'mountain' ? 0xb4bcc8 : 0xd6d3d1,
      roughness: 0.84,
      bumpMap: rockBump,
      bumpScale: 0.28,
    });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
    rockPositions.forEach((r, idx) => {
      _dummy.position.set(r.x, r.y + r.sy * 0.32, r.z);
      _dummy.rotation.set(r.rot * 0.5, r.rot, 0);
      _dummy.scale.set(r.sx, r.sy, r.sz);
      _dummy.updateMatrix();
      rockInst.setMatrixAt(idx, _dummy.matrix);
    });
    rockInst.instanceMatrix.needsUpdate = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  // 8B. Distant Mountain Ridge Wind Turbines, Roadside Gas/Rest Canopy, Reflective Cat's-Eye Studs & Soaring Birds
  const windTurbineRotors: THREE.Group[] = [];
  const turbineMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.28,
    metalness: 0.22,
  });
  const turbineTipMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });
  const turbinePlacements =
    mapId === 'mountain'
      ? [
          { x: -165, z: -150, yaw: 0.45, scale: 1.15 },
          { x: -120, z: -188, yaw: 0.35, scale: 1.05 },
          { x: 145, z: -165, yaw: -0.5, scale: 1.2 },
          { x: 185, z: 95, yaw: -1.1, scale: 1.1 },
          { x: -175, z: 120, yaw: 0.9, scale: 1.0 },
        ]
      : [
          { x: -185, z: -165, yaw: 0.4, scale: 1.05 },
          { x: 175, z: -155, yaw: -0.4, scale: 1.1 },
          { x: 190, z: 115, yaw: -0.8, scale: 1.0 },
        ];

  for (const tp of turbinePlacements) {
    const rq = queryRoadAt(tp.x, tp.z, mapId);
    if (!rq.onRoad && rq.distanceToCenter > rq.roadHalfWidth + 14) {
      const ty = getTerrainHeight(tp.x, tp.z, mapId);
      const tGroup = new THREE.Group();
      tGroup.position.set(tp.x, ty - 1.0, tp.z);
      tGroup.rotation.y = tp.yaw;
      tGroup.scale.setScalar(tp.scale);

      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.15, 28, 12), turbineMat);
      tower.position.y = 14;
      const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.35, 3.6), turbineMat);
      nacelle.position.set(0, 28.2, 0.6);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), turbineTipMat);
      beacon.position.set(0, 29.05, -0.8);
      tGroup.add(tower, nacelle, beacon);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 28.2, 2.5);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.6, 12), turbineMat);
      hub.rotation.x = Math.PI / 2;
      rotorGroup.add(hub);

      for (let b = 0; b < 3; b++) {
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.z = (b * Math.PI * 2) / 3;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 11.5, 0.14), turbineMat);
        blade.position.y = 6.0;
        blade.rotation.y = 0.18;
        const bladeTip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.4, 0.15), turbineTipMat);
        bladeTip.position.y = 11.2;
        bladeTip.rotation.y = 0.18;
        bladeHolder.add(blade, bladeTip);
        rotorGroup.add(bladeHolder);
      }
      tGroup.add(rotorGroup);
      windTurbineRotors.push(rotorGroup);
      group.add(tGroup);
    }
  }

  // Roadside Touge Pit / Rest Stop Canopy at First Plaza
  if (mapDef.plazas.length > 0) {
    const p0 = mapDef.plazas[0];
    const pitGroup = new THREE.Group();
    const angle = p0.rotation || 0;
    pitGroup.position.set(
      p0.x + Math.cos(angle) * (p0.radiusX * 0.58),
      p0.y,
      p0.z - Math.sin(angle) * (p0.radiusZ * 0.58)
    );
    pitGroup.rotation.y = angle;

    const canopyRoofMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.45,
    });
    const canopyTrimMat = new THREE.MeshStandardMaterial({
      color: mapId === 'mountain' ? 0x38bdf8 : 0xf472b6,
      emissive: mapId === 'mountain' ? 0x0284c7 : 0xdb2777,
      emissiveIntensity: 1.8,
    });
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.5,
    });

    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.42, 5.4), canopyRoofMat);
    roof.position.y = 4.35;
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(9.75, 0.22, 5.55), canopyTrimMat);
    fascia.position.y = 4.45;
    const underLight = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 3.8), streetlightBulbMat);
    underLight.position.y = 4.12;
    pitGroup.add(roof, fascia, underLight);

    for (const cx of [-3.6, 3.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.2, 10), columnMat);
      col.position.set(cx, 2.1, 0);
      const island = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 3.4), columnMat);
      island.position.set(cx, 0.11, 0);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.55, 0.52), canopyRoofMat);
      pump.position.set(cx, 0.95, 0);
      const pumpScreen = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.56), canopyTrimMat);
      pumpScreen.position.set(cx, 1.32, 0);
      pitGroup.add(col, island, pump, pumpScreen);
    }
    group.add(pitGroup);
  }

  // Reflective Roadside Cat's-Eye Lane Studs along Main Road
  const catsEyeCoords: { x: number; y: number; z: number; isCenter: boolean }[] = [];
  for (let i = 0; i < mainSamples.length; i += 3) {
    const s = mainSamples[i];
    const sinB = Math.sin(s.bankAngle || 0);
    catsEyeCoords.push({ x: s.x, y: s.y + 0.035, z: s.z, isCenter: true });
    for (const side of [-1, 1]) {
      const lat = (s.halfWidth - 0.35) * side;
      catsEyeCoords.push({
        x: s.x + s.nx * lat,
        y: s.y + lat * sinB + 0.035,
        z: s.z + s.nz * lat,
        isCenter: false,
      });
    }
  }
  if (catsEyeCoords.length > 0) {
    const studGeo = new THREE.BoxGeometry(0.14, 0.045, 0.14);
    const studMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 1.75,
      roughness: 0.2,
    });
    const studInst = new THREE.InstancedMesh(studGeo, studMat, catsEyeCoords.length);
    catsEyeCoords.forEach((ce, idx) => {
      _dummy.position.set(ce.x, ce.y, ce.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      studInst.setMatrixAt(idx, _dummy.matrix);
      studInst.setColorAt(idx, _color.setHex(ce.isCenter ? 0xfbbf24 : 0x38bdf8));
    });
    studInst.instanceMatrix.needsUpdate = true;
    if (studInst.instanceColor) studInst.instanceColor.needsUpdate = true;
    studInst.computeBoundingSphere();
    group.add(studInst);
  }

  // Distant Soaring Mountain Birds (V-Wing Silhouettes Circling High Above the Valley)
  const birdCount = 18;
  const birdGeo = new THREE.ConeGeometry(0.45, 1.25, 3);
  birdGeo.scale(2.4, 0.18, 0.65);
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
  const birdInstancedMesh = new THREE.InstancedMesh(birdGeo, birdMat, birdCount);
  birdInstancedMesh.frustumCulled = false;
  group.add(birdInstancedMesh);

  // Pooled Zero-GC Rain Streak Particles (Active during 'light_rain' and 'heavy_rain')
  const rainCount = 320;
  const rainGeo = new THREE.PlaneGeometry(0.035, 1.35);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rainInstancedMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainInstancedMesh.frustumCulled = false;
  rainInstancedMesh.visible = false;
  const rainData = new Float32Array(rainCount * 4); // localX, localY, localZ, fallSpeed
  for (let i = 0; i < rainCount; i++) {
    const b = i * 4;
    rainData[b + 0] = (Math.random() - 0.5) * 65;
    rainData[b + 1] = Math.random() * 24;
    rainData[b + 2] = (Math.random() - 0.5) * 65;
    rainData[b + 3] = 24 + Math.random() * 10;
  }
  group.add(rainInstancedMesh);

  // 9. Pooled Zero-GC Floating Sakura Petals (Blossom) / Golden Mountain Mist Motes (Mountain)
  const petalCount = mapId === 'blossom' ? 280 : 90;
  const petalGeo = new THREE.CircleGeometry(mapId === 'blossom' ? 0.13 : 0.09, 5);
  petalGeo.scale(1.35, 0.85, 1.0);
  const petalMat = new THREE.MeshBasicMaterial({
    color: mapId === 'blossom' ? 0xf9a8d4 : 0xfde68a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: mapId === 'blossom' ? 0.82 : 0.4,
  });
  const petalInstancedMesh = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  petalInstancedMesh.frustumCulled = false;
  const petalData = new Float32Array(petalCount * 7);

  for (let i = 0; i < petalCount; i++) {
    const base = i * 7;
    petalData[base + 0] = (Math.random() - 0.5) * 90; // local X offset around car
    petalData[base + 1] = 1 + Math.random() * 18; // height above car
    petalData[base + 2] = (Math.random() - 0.5) * 90; // local Z offset around car
    petalData[base + 3] = -1.2 - Math.random() * 1.5; // wind X
    petalData[base + 4] = -1.4 - Math.random() * 1.2; // fall speed Y
    petalData[base + 5] = (Math.random() - 0.5) * 1.5; // wind Z
    petalData[base + 6] = 1.5 + Math.random() * 2.5; // flutter speed
  }
  group.add(petalInstancedMesh);

  // Helper to build a soft multi-plane crossed smoke puff geometry with zero spherical hard edges
  const createCrossedSmokePuffGeo = (w: number, h: number): THREE.BufferGeometry => {
    const angles = [0, Math.PI / 3, (Math.PI * 2) / 3];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vOffset = 0;

    for (const ang of angles) {
      const cosA = Math.cos(ang) * (w * 0.5);
      const sinA = Math.sin(ang) * (w * 0.5);
      const hh = h * 0.5;
      positions.push(
        -cosA, -hh, -sinA,
         cosA, -hh,  sinA,
         cosA,  hh,  sinA,
        -cosA,  hh, -sinA
      );
      for (let k = 0; k < 4; k++) {
        normals.push(0, 1, 0);
      }
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(
        vOffset, vOffset + 1, vOffset + 2,
        vOffset, vOffset + 2, vOffset + 3
      );
      vOffset += 4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  };

  // 10. Pooled Zero-GC Velocity-Reactive Tire Drift Smoke Ring Buffer (Soft-Edged Wispy Plumes)
  const smokeCount = 112;
  const smokeGeo = createCrossedSmokePuffGeo(0.78, 0.46);
  const smokeMat = new THREE.MeshBasicMaterial({
    map: softSmokeTex,
    color: 0xdbe2ec,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const smokeInstancedMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
  smokeInstancedMesh.frustumCulled = false;
  const smokeData = new Float32Array(smokeCount * 8);
  for (let i = 0; i < smokeCount; i++) {
    smokeData[i * 8 + 3] = 999; // inactive
    _dummy.position.set(0, -100, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    smokeInstancedMesh.setMatrixAt(i, _dummy.matrix);
  }
  smokeInstancedMesh.instanceMatrix.needsUpdate = true;
  group.add(smokeInstancedMesh);

  let smokeCursor = 0;
  let smokeSpawnTimer = 0;

  // 10B. Separate Pooled Exhaust Vapor System (Subtle translucent vapor wisps from exhaust tips)
  const exhaustSmokeCount = 48;
  const exhaustSmokeGeo = createCrossedSmokePuffGeo(0.24, 0.18);
  const exhaustSmokeMat = new THREE.MeshBasicMaterial({
    map: softSmokeTex,
    color: 0xcbd5e1,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const exhaustSmokeInstancedMesh = new THREE.InstancedMesh(
    exhaustSmokeGeo,
    exhaustSmokeMat,
    exhaustSmokeCount
  );
  exhaustSmokeInstancedMesh.frustumCulled = false;
  const exhaustSmokeData = new Float32Array(exhaustSmokeCount * 8);
  for (let i = 0; i < exhaustSmokeCount; i++) {
    exhaustSmokeData[i * 8 + 3] = 999;
    _dummy.position.set(0, -100, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    exhaustSmokeInstancedMesh.setMatrixAt(i, _dummy.matrix);
  }
  exhaustSmokeInstancedMesh.instanceMatrix.needsUpdate = true;
  group.add(exhaustSmokeInstancedMesh);

  let exhaustSmokeCursor = 0;
  let exhaustSmokeSpawnTimer = 0;

  // 11. Pooled Persistent Tire Skid Marks on Road Surface
  const skidCount = 240;
  const skidGeo = new THREE.PlaneGeometry(0.28, 1.05);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x090a0d,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const skidInstancedMesh = new THREE.InstancedMesh(skidGeo, skidMat, skidCount);
  skidInstancedMesh.frustumCulled = false;
  for (let i = 0; i < skidCount; i++) {
    _dummy.position.set(0, -100, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    skidInstancedMesh.setMatrixAt(i, _dummy.matrix);
  }
  skidInstancedMesh.instanceMatrix.needsUpdate = true;
  group.add(skidInstancedMesh);

  let skidCursor = 0;
  let skidSpawnTimer = 0;
  let currentTod: TimeOfDay = initialTimeOfDay;
  let currentWeather: WeatherMode = 'clear';
  let currentPreset: GraphicsPreset = 'ultra';
  let baseFogColorHex = 0xdbeafe;
  let baseFogDensity = 0.00052;

  function applyRoadSurfaceLook() {
    const isRain = currentWeather === 'light_rain' || currentWeather === 'heavy_rain';
    const isHeavyRain = currentWeather === 'heavy_rain';
    const isNight = currentTod === 'night';

    if (isRain) {
      roadMat.roughness = isHeavyRain ? 0.16 : 0.22;
      roadMat.metalness = isHeavyRain ? 0.38 : 0.30;
      plazaMat.roughness = isHeavyRain ? 0.18 : 0.24;
      plazaMat.metalness = isHeavyRain ? 0.36 : 0.28;
    } else if (currentPreset === 'ultra') {
      roadMat.roughness = isNight ? 0.28 : 0.42;
      roadMat.metalness = isNight ? 0.26 : 0.16;
      plazaMat.roughness = isNight ? 0.30 : 0.44;
      plazaMat.metalness = isNight ? 0.24 : 0.16;
    } else if (currentPreset === 'high') {
      roadMat.roughness = isNight ? 0.42 : 0.52;
      roadMat.metalness = 0.12;
      plazaMat.roughness = 0.50;
      plazaMat.metalness = 0.12;
    } else {
      roadMat.roughness = 0.65;
      roadMat.metalness = 0.06;
      plazaMat.roughness = 0.62;
      plazaMat.metalness = 0.06;
    }
  }

  function applyWeatherAndFog(targetScene: THREE.Scene) {
    applyRoadSurfaceLook();
    rainInstancedMesh.visible =
      currentWeather === 'light_rain' || currentWeather === 'heavy_rain';
    rainMat.opacity = currentWeather === 'heavy_rain' ? 0.58 : 0.36;

    const weatherCloudBoost =
      currentWeather === 'heavy_rain'
        ? 0.96
        : currentWeather === 'light_rain'
        ? 0.88
        : currentWeather === 'cloudy'
        ? 0.82
        : currentWeather === 'foggy'
        ? 0.78
        : 0.52;
    skyMaterial.uniforms.cloudCover.value = weatherCloudBoost;

    const fogMult =
      currentWeather === 'foggy'
        ? 2.85
        : currentWeather === 'heavy_rain'
        ? 1.95
        : currentWeather === 'light_rain'
        ? 1.45
        : currentWeather === 'cloudy'
        ? 1.18
        : 1.0;

    targetScene.fog = new THREE.FogExp2(baseFogColorHex, baseFogDensity * fogMult);
  }

  function setWeather(weather: WeatherMode, targetScene: THREE.Scene) {
    currentWeather = weather;
    applyWeatherAndFog(targetScene);
  }

  function setGraphicsPreset(preset: GraphicsPreset, softwareGl: boolean) {
    currentPreset = preset;
    applyRoadSurfaceLook();
    petalInstancedMesh.visible = preset !== 'performance';
    if (!softwareGl) {
      sunLight.castShadow = preset !== 'performance';
    }
  }

  // Physically Believable 5-State Time-of-Day & Atmospheric Lighting System
  function setTimeOfDay(tod: TimeOfDay, targetScene: THREE.Scene) {
    currentTod = tod;
    const normalizedTod = tod === 'day' ? 'afternoon' : tod;

    if (normalizedTod === 'morning') {
      // Fresh, bright alpine morning with crisp blue sky, white clouds, soft sunlight & gentle mist
      skyMaterial.uniforms.topColor.value.setHex(0x0ea5e9);
      skyMaterial.uniforms.upperMidColor.value.setHex(0x38bdf8);
      skyMaterial.uniforms.midColor.value.setHex(0xbae6fd);
      skyMaterial.uniforms.bottomColor.value.setHex(0xfff7ed);
      skyMaterial.uniforms.cloudLitColor.value.setHex(0xffffff);
      skyMaterial.uniforms.cloudShadowColor.value.setHex(0xcbd5e1);
      skyMaterial.uniforms.sunDir.value.set(0.65, 0.34, -0.68).normalize();

      sunLight.position.set(145, 92, -150);
      sunLight.color.setHex(0xfff7ed);
      sunLight.intensity = 2.45;
      hemiLight.color.setHex(0xe0f2fe);
      hemiLight.groundColor.setHex(0x4d7c0f);
      hemiLight.intensity = 1.38;
      ambientLight.color.setHex(0xf0f9ff);
      ambientLight.intensity = 0.56;

      baseFogColorHex = mapId === 'mountain' ? 0xdbeafe : 0xfce7f3;
      baseFogDensity = 0.00062;
      targetScene.background = new THREE.Color(baseFogColorHex);
      streetlightBulbMat.emissiveIntensity = 0.8;
    } else if (normalizedTod === 'afternoon') {
      // Bright sunny daytime mountain environment matching the uploaded reference photo
      skyMaterial.uniforms.topColor.value.setHex(0x0284c7);
      skyMaterial.uniforms.upperMidColor.value.setHex(0x38bdf8);
      skyMaterial.uniforms.midColor.value.setHex(0x93c5fd);
      skyMaterial.uniforms.bottomColor.value.setHex(0xe0f2fe);
      skyMaterial.uniforms.cloudLitColor.value.setHex(0xffffff);
      skyMaterial.uniforms.cloudShadowColor.value.setHex(0xcbd5e1);
      skyMaterial.uniforms.sunDir.value.set(-0.48, 0.62, -0.62).normalize();

      sunLight.position.set(-125, 165, -145);
      sunLight.color.setHex(0xffffff);
      sunLight.intensity = 2.65;
      hemiLight.color.setHex(0xe0f2fe);
      hemiLight.groundColor.setHex(0x4d7c0f);
      hemiLight.intensity = 1.48;
      ambientLight.color.setHex(0xffffff);
      ambientLight.intensity = 0.62;

      baseFogColorHex = mapId === 'mountain' ? 0xdbeafe : 0xfdf2f8;
      baseFogDensity = 0.00046;
      targetScene.background = new THREE.Color(baseFogColorHex);
      streetlightBulbMat.emissiveIntensity = 0.5;
    } else if (normalizedTod === 'golden_hour') {
      // Warm cinematic Golden Hour — golden sunlight, amber-yellow horizon, blue upper sky, brightly lit forests
      skyMaterial.uniforms.topColor.value.setHex(0x1d4ed8);
      skyMaterial.uniforms.upperMidColor.value.setHex(0x60a5fa);
      skyMaterial.uniforms.midColor.value.setHex(0xfde047);
      skyMaterial.uniforms.bottomColor.value.setHex(0xfdba74);
      skyMaterial.uniforms.cloudLitColor.value.setHex(0xfef08a);
      skyMaterial.uniforms.cloudShadowColor.value.setHex(0x94a3b8);
      skyMaterial.uniforms.sunDir.value.set(-0.62, 0.24, -0.74).normalize();

      sunLight.position.set(-145, 78, -165);
      sunLight.color.setHex(0xffedd5);
      sunLight.intensity = 2.38;
      hemiLight.color.setHex(0xfef3c7);
      hemiLight.groundColor.setHex(0x3f6212);
      hemiLight.intensity = 1.28;
      ambientLight.color.setHex(0xfef3c7);
      ambientLight.intensity = 0.52;

      baseFogColorHex = 0xfde68a;
      baseFogDensity = 0.00058;
      targetScene.background = new THREE.Color(0x93c5fd);
      streetlightBulbMat.emissiveIntensity = 1.4;
    } else if (normalizedTod === 'sunset') {
      // Balanced cinematic Sunset — warm orange/yellow horizon, subtle pink/lavender mid sky, strong ambient fill
      // (Never dark red or pitch black!)
      skyMaterial.uniforms.topColor.value.setHex(0x1e3a8a);
      skyMaterial.uniforms.upperMidColor.value.setHex(0x6366f1);
      skyMaterial.uniforms.midColor.value.setHex(0xf472b6);
      skyMaterial.uniforms.bottomColor.value.setHex(0xfdba74);
      skyMaterial.uniforms.cloudLitColor.value.setHex(0xfed7aa);
      skyMaterial.uniforms.cloudShadowColor.value.setHex(0x64748b);
      skyMaterial.uniforms.sunDir.value.set(-0.64, 0.14, -0.75).normalize();

      sunLight.position.set(-150, 56, -170);
      sunLight.color.setHex(0xfed7aa);
      sunLight.intensity = 2.20;
      hemiLight.color.setHex(0xfde68a);
      hemiLight.groundColor.setHex(0x334155);
      hemiLight.intensity = 1.18;
      ambientLight.color.setHex(0xe0e7ff);
      ambientLight.intensity = 0.48;

      baseFogColorHex = 0xc7d2fe;
      baseFogDensity = 0.00068;
      targetScene.background = new THREE.Color(0x4f46e5);
      streetlightBulbMat.emissiveIntensity = 2.2;
    } else {
      // Realistic Moonlit Night — silver-blue moonlight, blue ambient sky fill, visible trees & mountains
      skyMaterial.uniforms.topColor.value.setHex(0x0f172a);
      skyMaterial.uniforms.upperMidColor.value.setHex(0x1e3a8a);
      skyMaterial.uniforms.midColor.value.setHex(0x334155);
      skyMaterial.uniforms.bottomColor.value.setHex(0x475569);
      skyMaterial.uniforms.cloudLitColor.value.setHex(0x93c5fd);
      skyMaterial.uniforms.cloudShadowColor.value.setHex(0x1e293b);
      skyMaterial.uniforms.sunDir.value.set(0.52, 0.46, -0.72).normalize();

      sunLight.position.set(130, 115, -160);
      sunLight.color.setHex(mapId === 'mountain' ? 0xbfdbfe : 0xfbcfe8);
      sunLight.intensity = 1.48;
      hemiLight.color.setHex(mapId === 'mountain' ? 0x60a5fa : 0xf472b6);
      hemiLight.groundColor.setHex(0x1e293b);
      hemiLight.intensity = 1.02;
      ambientLight.color.setHex(0x60a5fa);
      ambientLight.intensity = 0.44;

      baseFogColorHex = mapId === 'mountain' ? 0x1e293b : 0x2e1065;
      baseFogDensity = 0.00085;
      targetScene.background = new THREE.Color(baseFogColorHex);
      streetlightBulbMat.emissiveIntensity = 4.2;
    }

    applyWeatherAndFog(targetScene);
  }

  setTimeOfDay(initialTimeOfDay, scene);

  function updateEnvironment(
    dt: number,
    elapsed: number,
    carX: number,
    carY: number,
    carZ: number,
    carHeading: number,
    isDrifting: boolean,
    carSpeedKmh = 60,
    driftAngle = 20,
    tireSlipRatio = 0,
    isBrakingHard = false,
    exhaustSmokeIntensity = 0.2,
    exhaustOutlets: Array<[number, number, number]> = [[0.412, 0.228, -2.32]]
  ) {
    skyMaterial.uniforms.time.value = elapsed;

    // Animate river ripples in Blossom Drift
    if (waterMesh && rockBump) {
      rockBump.offset.x = (elapsed * 0.03) % 1;
      rockBump.offset.y = (elapsed * 0.02) % 1;
    }

    // Update falling Sakura petals / mountain mist around the camera/car
    if (petalInstancedMesh.visible) {
      for (let i = 0; i < petalCount; i++) {
        const base = i * 7;
        petalData[base + 0] += petalData[base + 3] * dt;
        petalData[base + 1] += petalData[base + 4] * dt;
        petalData[base + 2] += petalData[base + 5] * dt;

        // Wrap around [-45, 45] box centered on car
        if (petalData[base + 1] < 0.2) petalData[base + 1] = 18;
        if (petalData[base + 0] < -45) petalData[base + 0] += 90;
        if (petalData[base + 0] > 45) petalData[base + 0] -= 90;
        if (petalData[base + 2] < -45) petalData[base + 2] += 90;
        if (petalData[base + 2] > 45) petalData[base + 2] -= 90;

        const rot = elapsed * petalData[base + 6] + i;
        _dummy.position.set(
          carX + petalData[base + 0] + Math.sin(rot) * 0.4,
          carY + petalData[base + 1],
          carZ + petalData[base + 2] + Math.cos(rot) * 0.4
        );
        _dummy.rotation.set(rot, rot * 0.7, rot * 0.3);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        petalInstancedMesh.setMatrixAt(i, _dummy.matrix);
      }
      petalInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    const sinH = Math.sin(carHeading);
    const cosH = Math.cos(carHeading);

    // Spawn & update velocity-reactive tire drift smoke puffs + persistent road skid marks
    const activeTireSlip = isDrifting || tireSlipRatio > 0.36 || isBrakingHard;
    if (activeTireSlip && carSpeedKmh > 10) {
      const intensity = Math.min(
        1.45,
        0.48 +
          (carSpeedKmh / 155) * 0.42 +
          (driftAngle / 44) * 0.38 +
          tireSlipRatio * 0.35
      );
      smokeSpawnTimer += dt * intensity;
      if (smokeSpawnTimer >= 0.028) {
        smokeSpawnTimer = 0;
        for (const side of [-0.82, 0.82]) {
          const idx = smokeCursor % smokeCount;
          smokeCursor++;
          const base = idx * 8;
          // Rear wheel contact patch world position (hugging the road right under left/right rear tires)
          smokeData[base + 0] = carX - sinH * 1.38 + cosH * side + (Math.random() - 0.5) * 0.12;
          smokeData[base + 1] = carY + 0.06;
          smokeData[base + 2] = carZ - cosH * 1.38 - sinH * side + (Math.random() - 0.5) * 0.12;
          smokeData[base + 3] = 0; // age
          smokeData[base + 4] = (0.40 + Math.random() * 0.22) * Math.min(1.2, intensity); // maxAge
          smokeData[base + 5] = (isBrakingHard && !isDrifting ? 0.24 : 0.34) * intensity; // initial scale
          // Trail backward in the car's wake with natural lateral turbulence
          smokeData[base + 6] = -sinH * (carSpeedKmh * 0.018) + (Math.random() - 0.5) * 1.5;
          smokeData[base + 7] = -cosH * (carSpeedKmh * 0.018) + (Math.random() - 0.5) * 1.5;
        }
      }

      // Lay down persistent rubber tire skid marks on the road surface during drifting, wheelspin, or hard braking
      skidSpawnTimer += dt;
      if (skidSpawnTimer >= 0.036 && (carSpeedKmh > 14 || tireSlipRatio > 0.42)) {
        skidSpawnTimer = 0;
        for (const side of [-0.76, 0.76]) {
          const sIdx = skidCursor % skidCount;
          skidCursor++;
          const wx = carX - sinH * 1.34 + cosH * side;
          const wz = carZ - cosH * 1.34 - sinH * side;
          _dummy.position.set(wx, carY + 0.055, wz);
          _dummy.rotation.set(0, carHeading, 0);
          _dummy.scale.set(1, 1, Math.min(1.45, 0.72 + carSpeedKmh / 115));
          _dummy.updateMatrix();
          skidInstancedMesh.setMatrixAt(sIdx, _dummy.matrix);
        }
        skidInstancedMesh.instanceMatrix.needsUpdate = true;
      }
    }

    for (let i = 0; i < smokeCount; i++) {
      const base = i * 8;
      const age = smokeData[base + 3];
      const maxAge = smokeData[base + 4];
      if (age < maxAge) {
        const nextAge = age + dt;
        smokeData[base + 3] = nextAge;
        smokeData[base + 0] += smokeData[base + 6] * dt;
        smokeData[base + 1] += 0.38 * dt; // Stay low along the asphalt wake
        smokeData[base + 2] += smokeData[base + 7] * dt;
        const lifeRatio = nextAge / maxAge;
        const initSc = smokeData[base + 5] || 0.38;
        // Spread horizontally while dissipating softly
        const sc = (initSc + lifeRatio * 1.05) * (1 - lifeRatio * 0.78);
        _dummy.position.set(smokeData[base + 0], smokeData[base + 1], smokeData[base + 2]);
        _dummy.rotation.set(0, nextAge * 1.4 + i * 0.5, 0);
        _dummy.scale.set(Math.max(0.01, sc * 1.25), Math.max(0.01, sc * 0.72), Math.max(0.01, sc * 1.25));
      } else {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
      }
      _dummy.updateMatrix();
      smokeInstancedMesh.setMatrixAt(i, _dummy.matrix);
    }
    smokeInstancedMesh.instanceMatrix.needsUpdate = true;

    // Update separate Exhaust Vapor wisps (only emitted on idle vapor or gear shift, never forming blobs)
    if (exhaustSmokeIntensity > 0.16 && exhaustOutlets.length > 0) {
      exhaustSmokeSpawnTimer += dt * (0.5 + exhaustSmokeIntensity * 1.1);
      if (exhaustSmokeSpawnTimer >= 0.055) {
        exhaustSmokeSpawnTimer = 0;
        for (const [ox, oy, oz] of exhaustOutlets) {
          const eIdx = exhaustSmokeCursor % exhaustSmokeCount;
          exhaustSmokeCursor++;
          const base = eIdx * 8;
          const worldX = carX + sinH * oz + cosH * ox;
          const worldY = carY + oy;
          const worldZ = carZ + cosH * oz - sinH * ox;
          exhaustSmokeData[base + 0] = worldX;
          exhaustSmokeData[base + 1] = worldY;
          exhaustSmokeData[base + 2] = worldZ;
          exhaustSmokeData[base + 3] = 0; // age
          exhaustSmokeData[base + 4] = 0.18 + exhaustSmokeIntensity * 0.18; // brief maxAge
          exhaustSmokeData[base + 5] = 0.24 + exhaustSmokeIntensity * 0.28; // small wisp scale
          const jetSpeed = 2.2 + exhaustSmokeIntensity * 2.8;
          exhaustSmokeData[base + 6] = -sinH * jetSpeed + (Math.random() - 0.5) * 0.45;
          exhaustSmokeData[base + 7] = -cosH * jetSpeed + (Math.random() - 0.5) * 0.45;
        }
      }
    }

    for (let i = 0; i < exhaustSmokeCount; i++) {
      const base = i * 8;
      const age = exhaustSmokeData[base + 3];
      const maxAge = exhaustSmokeData[base + 4];
      if (age < maxAge) {
        const nextAge = age + dt;
        exhaustSmokeData[base + 3] = nextAge;
        exhaustSmokeData[base + 0] += exhaustSmokeData[base + 6] * dt;
        exhaustSmokeData[base + 1] += 0.25 * dt;
        exhaustSmokeData[base + 2] += exhaustSmokeData[base + 7] * dt;
        const lifeRatio = nextAge / maxAge;
        const initSc = exhaustSmokeData[base + 5] || 0.25;
        const sc = (initSc + lifeRatio * 0.65) * (1 - lifeRatio * 0.88);
        _dummy.position.set(
          exhaustSmokeData[base + 0],
          exhaustSmokeData[base + 1],
          exhaustSmokeData[base + 2]
        );
        _dummy.rotation.set(0, nextAge * 2.2 + i, 0);
        _dummy.scale.setScalar(Math.max(0.01, sc));
      } else {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
      }
      _dummy.updateMatrix();
      exhaustSmokeInstancedMesh.setMatrixAt(i, _dummy.matrix);
    }
    exhaustSmokeInstancedMesh.instanceMatrix.needsUpdate = true;
    // Animate ridge wind turbine rotors
    for (let i = 0; i < windTurbineRotors.length; i++) {
      windTurbineRotors[i].rotation.z = elapsed * (1.15 + i * 0.12) + i * 1.3;
    }

    // Animate distant soaring birds circling above the mountain valley
    for (let i = 0; i < birdCount; i++) {
      const orbitAngle = elapsed * (0.14 + (i % 4) * 0.03) + i * 0.65;
      const radius = 58 + (i % 5) * 24;
      const bx = Math.cos(orbitAngle) * radius;
      const bz = Math.sin(orbitAngle) * radius;
      const by = 48 + (i % 3) * 8 + Math.sin(elapsed * 1.4 + i) * 1.8;
      _dummy.position.set(bx, by, bz);
      _dummy.rotation.set(0, -orbitAngle, Math.sin(elapsed * 5.2 + i) * 0.18);
      _dummy.scale.setScalar(1.0);
      _dummy.updateMatrix();
      birdInstancedMesh.setMatrixAt(i, _dummy.matrix);
    }
    birdInstancedMesh.instanceMatrix.needsUpdate = true;

    // Animate pooled rain streaks when weather is light_rain or heavy_rain
    if (rainInstancedMesh.visible) {
      const rainSpeedMult = currentWeather === 'heavy_rain' ? 1.35 : 1.0;
      for (let i = 0; i < rainCount; i++) {
        const b = i * 4;
        rainData[b + 1] -= rainData[b + 3] * rainSpeedMult * dt;
        rainData[b + 0] -= 2.4 * dt;
        if (rainData[b + 1] < 0.2) {
          rainData[b + 1] = 22 + Math.random() * 4;
          rainData[b + 0] = (Math.random() - 0.5) * 65;
          rainData[b + 2] = (Math.random() - 0.5) * 65;
        }
        _dummy.position.set(
          carX + rainData[b + 0],
          carY + rainData[b + 1],
          carZ + rainData[b + 2]
        );
        _dummy.rotation.set(0, carHeading, 0.08);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        rainInstancedMesh.setMatrixAt(i, _dummy.matrix);
      }
      rainInstancedMesh.instanceMatrix.needsUpdate = true;
    }
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
    roadTex.dispose();
    roadBump.dispose();
    plazaTex.dispose();
    chevronTex.dispose();
    signTex.dispose();
    rockBump.dispose();
    wallTex.dispose();
    pineFoliageTex.dispose();
    sakuraFoliageTex.dispose();
    barkTex.dispose();
    rockTex.dispose();
    terrainDetailTex.dispose();
  }

  return {
    group,
    skyMaterial,
    sunLight,
    hemiLight,
    ambientLight,
    waterMesh,
    petalInstancedMesh,
    petalData,
    smokeInstancedMesh,
    smokeData,
    exhaustSmokeInstancedMesh,
    exhaustSmokeData,
    skidInstancedMesh,
    streetlightBulbMat,
    setTimeOfDay,
    setWeather,
    setGraphicsPreset,
    updateEnvironment,
    dispose,
  };
}
