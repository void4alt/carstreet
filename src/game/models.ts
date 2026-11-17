import * as THREE from 'three';
import { SampledRoadNode } from './roadMath';
import { MapId } from './types';

export interface CarModelRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  wheelFL: THREE.Group;
  wheelFR: THREE.Group;
  wheelRL: THREE.Group;
  wheelRR: THREE.Group;
  headlightBeams: THREE.Group;
  tailLightMaterial: THREE.MeshStandardMaterial;
}

export function createDriftCarModel(isSoftwareGl: boolean): CarModelRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // 1. Primary Silhouette: Extruded JDM Sports Coupe Body Profile
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.15, 0.22);
  bodyShape.lineTo(2.1, 0.20); // bottom sill
  bodyShape.lineTo(2.22, 0.42); // front splitter lip
  bodyShape.lineTo(2.12, 0.68); // nose cone
  bodyShape.lineTo(1.15, 0.84); // hood slope
  bodyShape.lineTo(0.42, 1.26); // windshield A-pillar
  bodyShape.lineTo(-0.75, 1.24); // roofline
  bodyShape.lineTo(-1.65, 0.88); // fastback rear window C-pillar
  bodyShape.lineTo(-2.18, 0.82); // rear decklid
  bodyShape.lineTo(-2.22, 0.34); // rear bumper
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: isSoftwareGl ? 2 : 3,
  });
  bodyGeo.center();
  // Rotate so length is along Z (+Z is forward), width along X, height along Y
  bodyGeo.rotateY(-Math.PI / 2);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xe11d48, // Iconic JDM Crimson Pearl
    metalness: 0.65,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.position.y = 0.72;
  bodyMesh.castShadow = !isSoftwareGl;
  bodyMesh.receiveShadow = !isSoftwareGl;
  chassisGroup.add(bodyMesh);

  // Dark Carbon Lower Splitter, Side Skirts & Rear Diffuser (contrasting roughness 0.65)
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.68,
    metalness: 0.25,
  });
  const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.16, 4.48), carbonMat);
  underbody.position.set(0, 0.26, 0);
  chassisGroup.add(underbody);

  // Widebody Fender Flares (4 arches)
  const fenderGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.24, 16, 1, false, 0, Math.PI);
  fenderGeo.rotateZ(Math.PI / 2);
  const fenderPositions = [
    [-0.92, 0.42, 1.32],
    [0.92, 0.42, 1.32],
    [-0.92, 0.44, -1.32],
    [0.92, 0.44, -1.32],
  ];
  for (const [fx, fy, fz] of fenderPositions) {
    const fender = new THREE.Mesh(fenderGeo, paintMat);
    fender.position.set(fx, fy, fz);
    chassisGroup.add(fender);
  }

  // 2. Secondary Read: Tinted Cabin Greenhouse + Carbon GT Wing
  const cabinGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x090d16,
    metalness: 0.15,
    roughness: 0.1,
    clearcoat: 1.0,
  });
  const cabinBox = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.44, 1.95), cabinGlassMat);
  cabinBox.position.set(0, 1.05, -0.18);
  chassisGroup.add(cabinBox);

  // Rear GT Wing & Dual Struts
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.34), carbonMat);
  wingBlade.position.set(0, 1.24, -2.02);
  wingBlade.rotation.x = 0.14;
  chassisGroup.add(wingBlade);

  const wingEndplateGeo = new THREE.BoxGeometry(0.04, 0.22, 0.42);
  const leftPlate = new THREE.Mesh(wingEndplateGeo, paintMat);
  leftPlate.position.set(-0.98, 1.24, -2.02);
  const rightPlate = new THREE.Mesh(wingEndplateGeo, paintMat);
  rightPlate.position.set(0.98, 1.24, -2.02);
  chassisGroup.add(leftPlate, rightPlate);

  const strutGeo = new THREE.BoxGeometry(0.05, 0.32, 0.18);
  const leftStrut = new THREE.Mesh(strutGeo, carbonMat);
  leftStrut.position.set(-0.52, 1.06, -1.98);
  const rightStrut = new THREE.Mesh(strutGeo, carbonMat);
  rightStrut.position.set(0.52, 1.06, -1.98);
  chassisGroup.add(leftStrut, rightStrut);

  // 3. Accent Details: Headlights, Glowing Tail-Light Bar, Twin Exhausts, Mirrors
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  });
  const hlGeo = new THREE.BoxGeometry(0.38, 0.12, 0.12);
  const hlLeft = new THREE.Mesh(hlGeo, headlightMat);
  hlLeft.position.set(-0.64, 0.56, 2.18);
  const hlRight = new THREE.Mesh(hlGeo, headlightMat);
  hlRight.position.set(0.64, 0.56, 2.18);
  chassisGroup.add(hlLeft, hlRight);

  // Headlight Volumetric Cone Beams (visible especially at sunset/night)
  const headlightBeams = new THREE.Group();
  const beamGeo = new THREE.ConeGeometry(1.6, 14, 16, 1, true);
  beamGeo.translate(0, -7, 0);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(-0.64, 0.52, 2.2);
  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamR.position.set(0.64, 0.52, 2.2);
  headlightBeams.add(beamL, beamR);
  chassisGroup.add(headlightBeams);

  // Glowing JDM Full-Width LED Tail-Light Strip
  const tailLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff1133,
    emissive: 0xff0022,
    emissiveIntensity: 2.5,
    roughness: 0.2,
  });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.14, 0.1), tailLightMaterial);
  tailBar.position.set(0, 0.68, -2.21);
  chassisGroup.add(tailBar);

  // Twin Titanium Exhaust Pipes
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    metalness: 0.9,
    roughness: 0.2,
  });
  const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.32, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, exhaustMat);
  exL.position.set(-0.56, 0.26, -2.24);
  const exR = new THREE.Mesh(exhaustGeo, exhaustMat);
  exR.position.set(0.56, 0.26, -2.24);
  chassisGroup.add(exL, exR);

  // 4. Multi-part Wheels (Tire + Deep-Dish Bronze Rim + Hub)
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x171717,
    roughness: 0.88,
    metalness: 0.05,
  });

  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.29, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Volk TE37 Bronze
    metalness: 0.85,
    roughness: 0.25,
  });

  function buildWheel(): THREE.Group {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wg.add(tire, rim);
    return wg;
  }

  const wheelFL = buildWheel();
  wheelFL.position.set(0.92, 0.36, 1.32);
  const wheelFR = buildWheel();
  wheelFR.position.set(-0.92, 0.36, 1.32);
  const wheelRL = buildWheel();
  wheelRL.position.set(0.92, 0.36, -1.32);
  const wheelRR = buildWheel();
  wheelRR.position.set(-0.92, 0.36, -1.32);

  root.add(wheelFL, wheelFR, wheelRL, wheelRR);

  // 5. Soft Radial Contact Shadow Disc directly beneath the vehicle
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  return {
    root,
    chassisGroup,
    wheelFL,
    wheelFR,
    wheelRL,
    wheelRR,
    headlightBeams,
    tailLightMaterial,
  };
}

/**
 * Builds a traditional Japanese Vermilion Torii Gate straddling the road.
 */
export function createToriiGateModel(spanWidth = 18.5, height = 11.5): THREE.Group {
  const group = new THREE.Group();

  const vermilionMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.38,
    metalness: 0.12,
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.7,
    metalness: 0.2,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.25,
    metalness: 0.85,
  });

  const halfSpan = spanWidth * 0.5;

  // Stone/Black Base Pedestals (Kamebara)
  const baseGeo = new THREE.CylinderGeometry(0.68, 0.78, 1.4, 12);
  const baseL = new THREE.Mesh(baseGeo, blackMat);
  baseL.position.set(-halfSpan, 0.7, 0);
  const baseR = new THREE.Mesh(baseGeo, blackMat);
  baseR.position.set(halfSpan, 0.7, 0);
  group.add(baseL, baseR);

  // Tall Vermilion Pillars (Hashira)
  const colGeo = new THREE.CylinderGeometry(0.48, 0.56, height, 14);
  const colL = new THREE.Mesh(colGeo, vermilionMat);
  colL.position.set(-halfSpan, height * 0.5, 0);
  const colR = new THREE.Mesh(colGeo, vermilionMat);
  colR.position.set(halfSpan, height * 0.5, 0);
  group.add(colL, colR);

  // Lower Tie Beam (Nuki)
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 3.2, 0.65, 0.55), vermilionMat);
  nuki.position.set(0, height - 2.1, 0);
  group.add(nuki);

  // Upper Lintel (Shimagi & Kasagi)
  const shimagi = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 4.4, 0.7, 0.8), vermilionMat);
  shimagi.position.set(0, height + 0.1, 0);
  group.add(shimagi);

  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 5.6, 0.55, 1.05), blackMat);
  kasagi.position.set(0, height + 0.65, 0);
  group.add(kasagi);

  // Center Plaque (Gakuzuka) with gold trim
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 0.7), blackMat);
  plaque.position.set(0, height - 0.95, 0);
  const plaqueInner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.76), goldMat);
  plaqueInner.position.set(0, height - 0.95, 0);
  group.add(plaque, plaqueInner);

  return group;
}

/**
 * Builds a traditional Japanese wooden Machiya building / shop with tiled overhanging roof and glowing shoji windows.
 */
export function createJapaneseBuildingModel(
  wallTexture: THREE.CanvasTexture,
  scale = 1.0
): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x57534e,
    roughness: 0.88,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xffffff,
    roughness: 0.65,
    emissive: 0xfef08a,
    emissiveMap: wallTexture,
    emissiveIntensity: 0.35,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.55,
    metalness: 0.25,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    roughness: 0.75,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf97316,
    emissiveIntensity: 2.0,
  });

  // 1. Stone Foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.7, 7.6), stoneMat);
  base.position.y = 0.35;
  group.add(base);

  // 2. First Floor Timber & Shoji Body
  const firstFloor = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.8, 6.8), wallMat);
  firstFloor.position.y = 2.6;
  group.add(firstFloor);

  // 3. Lower Eave Overhang
  const lowerEave = new THREE.Mesh(new THREE.ConeGeometry(7.2, 1.3, 4), roofMat);
  lowerEave.rotation.y = Math.PI / 4;
  lowerEave.scale.set(1.15, 1, 0.92);
  lowerEave.position.y = 4.9;
  group.add(lowerEave);

  // 4. Second Floor Attic Loft
  const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.4, 5.2), wallMat);
  upperFloor.position.y = 6.2;
  group.add(upperFloor);

  // 5. Main Curved Kawara Roof & Ridge Beam
  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.4, 4), roofMat);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.scale.set(1.2, 1, 0.95);
  mainRoof.position.y = 8.4;
  group.add(mainRoof);

  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 0.45), woodMat);
  ridgeBeam.position.y = 9.45;
  group.add(ridgeBeam);

  // 6. Glowing Shop Lanterns at Entrance
  const lanternGeo = new THREE.SphereGeometry(0.32, 10, 10);
  lanternGeo.scale(1, 1.35, 1);
  const l1 = new THREE.Mesh(lanternGeo, lanternMat);
  l1.position.set(-2.4, 3.6, 3.7);
  const l2 = new THREE.Mesh(lanternGeo, lanternMat);
  l2.position.set(2.4, 3.6, 3.7);
  group.add(l1, l2);

  group.scale.setScalar(scale);
  return group;
}

/**
 * Builds the scenic Vermilion Wooden Bridge over the Jade River in Blossom Drift.
 */
export function createVermilionBridgeStructure(samples: SampledRoadNode[]): THREE.Group {
  const group = new THREE.Group();

  const redWoodMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.42,
    metalness: 0.1,
  });
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: 0x3e2723,
    roughness: 0.78,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.25,
    metalness: 0.85,
  });

  const postGeo = new THREE.BoxGeometry(0.38, 1.65, 0.38);
  const finialGeo = new THREE.ConeGeometry(0.26, 0.45, 8);
  const pierGeo = new THREE.CylinderGeometry(0.65, 0.78, 9.0, 10);

  const bridgeNodes = samples.filter((s) => s.isBridge);
  for (let i = 0; i < bridgeNodes.length; i++) {
    const s = bridgeNodes[i];
    const hw = s.halfWidth + 0.65;
    const angle = Math.atan2(s.tx, s.tz);

    // Left and right bridge posts & brass finials every 2 samples
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const px = s.x + s.nx * hw * side;
        const pz = s.z + s.nz * hw * side;

        const post = new THREE.Mesh(postGeo, redWoodMat);
        post.position.set(px, s.y + 0.75, pz);
        post.rotation.y = angle;
        group.add(post);

        const finial = new THREE.Mesh(finialGeo, brassMat);
        finial.position.set(px, s.y + 1.75, pz);
        group.add(finial);

        // Heavy timber piers going down into the riverbed every 4 samples
        if (i % 4 === 0) {
          const pier = new THREE.Mesh(pierGeo, darkTimberMat);
          pier.position.set(px * 0.92 + s.x * 0.08, s.y - 4.5, pz * 0.92 + s.z * 0.08);
          group.add(pier);
        }
      }
    }

    // Horizontal red wooden railings connecting to next bridge node
    if (i < bridgeNodes.length - 1) {
      const next = bridgeNodes[i + 1];
      const segLen = Math.hypot(next.x - s.x, next.z - s.z) + 0.25;
      const railGeo = new THREE.BoxGeometry(0.22, 0.24, segLen);
      const lowerRailGeo = new THREE.BoxGeometry(0.18, 0.18, segLen);
      const deckBeamGeo = new THREE.BoxGeometry(hw * 2 + 0.8, 0.55, segLen);

      const midX = (s.x + next.x) * 0.5;
      const midY = (s.y + next.y) * 0.5;
      const midZ = (s.z + next.z) * 0.5;

      // Under-deck timber structural beam
      const deckBeam = new THREE.Mesh(deckBeamGeo, darkTimberMat);
      deckBeam.position.set(midX, midY - 0.35, midZ);
      deckBeam.rotation.y = angle;
      group.add(deckBeam);

      for (const side of [-1, 1]) {
        const rx = midX + s.nx * hw * side;
        const rz = midZ + s.nz * hw * side;

        const topRail = new THREE.Mesh(railGeo, redWoodMat);
        topRail.position.set(rx, midY + 1.25, rz);
        topRail.rotation.y = angle;
        group.add(topRail);

        const midRail = new THREE.Mesh(lowerRailGeo, redWoodMat);
        midRail.position.set(rx, midY + 0.65, rz);
        midRail.rotation.y = angle;
        group.add(midRail);
      }
    }
  }

  return group;
}

/**
 * Builds the carved Mountain Rock Tunnel vault, concrete portals, and ceiling sodium lights for Mountain Drift.
 */
export function createMountainTunnelStructure(
  samples: SampledRoadNode[],
  rockBumpMap: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x52525b,
    roughness: 0.82,
    bumpMap: rockBumpMap,
    bumpScale: 0.12,
    side: THREE.DoubleSide,
  });

  const portalStoneMat = new THREE.MeshStandardMaterial({
    color: 0x3f3f46,
    roughness: 0.75,
  });

  const sodiumLampMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 3.5,
  });

  const cliffRockMat = new THREE.MeshStandardMaterial({
    color: 0x44403c,
    roughness: 0.9,
    bumpMap: rockBumpMap,
    bumpScale: 0.35,
  });

  const tunnelNodes = samples.filter((s) => s.isTunnel);
  for (let i = 0; i < tunnelNodes.length; i++) {
    const s = tunnelNodes[i];
    const radius = s.halfWidth + 1.5;
    const angle = Math.atan2(s.tx, s.tz);

    // Semi-cylindrical hollow arch vault
    if (i < tunnelNodes.length - 1) {
      const next = tunnelNodes[i + 1];
      const segLen = Math.hypot(next.x - s.x, next.z - s.z) + 0.55;
      const archGeo = new THREE.CylinderGeometry(
        radius,
        radius,
        segLen,
        18,
        1,
        true,
        -Math.PI * 0.5,
        Math.PI
      );
      archGeo.rotateZ(Math.PI / 2);
      archGeo.rotateY(Math.PI / 2);

      const arch = new THREE.Mesh(archGeo, concreteMat);
      arch.position.set((s.x + next.x) * 0.5, (s.y + next.y) * 0.5 + 0.2, (s.z + next.z) * 0.5);
      arch.rotation.y = angle;
      group.add(arch);
    }

    // Sculpted 3D Rocky Cliff Mass resting ON TOP of the tunnel arch & flanking the tunnel walls
    if (i % 2 === 0) {
      const topCliff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius + 4.5, 1),
        cliffRockMat
      );
      topCliff.scale.set(1.35, 0.85, 1.25);
      topCliff.position.set(s.x, s.y + radius + 5.2, s.z);
      topCliff.rotation.y = angle + i * 0.5;
      group.add(topCliff);

      for (const side of [-1, 1]) {
        const sideCliff = new THREE.Mesh(
          new THREE.DodecahedronGeometry(6.8, 1),
          cliffRockMat
        );
        sideCliff.scale.set(1.1, 1.45, 1.1);
        sideCliff.position.set(
          s.x + s.nx * (radius + 5.2) * side,
          s.y + 4.8,
          s.z + s.nz * (radius + 5.2) * side
        );
        group.add(sideCliff);
      }
    }

    // Tunnel Portal Rings at entrance and exit, plus periodic concrete ribs
    if (i === 0 || i === tunnelNodes.length - 1 || i % 4 === 0) {
      const ribGeo = new THREE.TorusGeometry(radius + 0.35, 0.75, 8, 20, Math.PI);
      const rib = new THREE.Mesh(ribGeo, portalStoneMat);
      rib.position.set(s.x, s.y + 0.2, s.z);
      rib.rotation.y = angle;
      group.add(rib);
    }

    // Warm Amber Sodium Tunnel Lights along ceiling and walls
    if (i % 2 === 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.65), sodiumLampMat);
      lamp.position.set(s.x, s.y + radius - 0.35, s.z);
      lamp.rotation.y = angle;
      group.add(lamp);
    }
  }

  return group;
}

/**
 * Builds scenic roadside Rest Area & Courtyard Pavilions for each map.
 */
export function createPlazaLandmarkProps(mapId: MapId): THREE.Group {
  const group = new THREE.Group();

  if (mapId === 'mountain') {
    // 1. Akina Summit Rest Area: Japanese Vending Machines, Observation Pergola, and Route Board at (0, 32, -208)
    const pergolaGroup = new THREE.Group();
    pergolaGroup.position.set(0, 32, -210);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5 });

    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, 5.5), roofMat);
    roof.position.y = 3.8;
    pergolaGroup.add(roof);

    for (const px of [-5.8, -1.9, 1.9, 5.8]) {
      for (const pz of [-2.0, 2.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.8, 8), woodMat);
        post.position.set(px, 1.9, pz);
        pergolaGroup.add(post);
      }
    }

    // Iconic Glowing Japanese Roadside Vending Machines (Red, Blue, White)
    const vmColors = [0xdc2626, 0x2563eb, 0xf8fafc];
    vmColors.forEach((col, idx) => {
      const vm = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 2.2, 0.95),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })
      );
      vm.position.set(-3.5 + idx * 1.7, 1.1, -1.2);
      const vmScreen = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.1, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xe0f2fe,
          emissiveIntensity: 1.8,
        })
      );
      vmScreen.position.set(-3.5 + idx * 1.7, 1.35, -0.71);
      pergolaGroup.add(vm, vmScreen);
    });

    group.add(pergolaGroup);

    // 2. Valley Observatory Rest Stop Gazebo at (-25, 17.8, -50)
    const obsGroup = pergolaGroup.clone();
    obsGroup.position.set(-25, 17.8, -52);
    group.add(obsGroup);
  } else {
    // Blossom Drift: Traditional Japanese Octagonal Tea Pavilion & Lanterns at edge of Hanami Courtyard (0, 4.5, -40)
    const pavilion = new THREE.Group();
    pavilion.position.set(0, 4.5, -42);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
    const redWoodMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });

    const dais = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.2, 0.65, 8), stoneMat);
    dais.position.y = 0.32;
    pavilion.add(dais);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 4.2, 10), redWoodMat);
      col.position.set(Math.cos(a) * 5.4, 2.4, Math.sin(a) * 5.4);
      pavilion.add(col);
    }

    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 3.2, 8), roofMat);
    roof.position.y = 5.9;
    pavilion.add(roof);

    const finial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.35, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.85, roughness: 0.2 })
    );
    finial.position.y = 7.9;
    pavilion.add(finial);

    group.add(pavilion);
  }

  return group;
}
