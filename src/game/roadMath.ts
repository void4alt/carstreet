import { MAPS_DATA } from './mapsData';
import { MapId, RoadQueryResult, RoadSurfaceType, Waypoint3D } from './types';

export function getSurfaceGripMultiplier(surfaceType: RoadSurfaceType): number {
  switch (surfaceType) {
    case 'smooth_asphalt':
      return 1.04;
    case 'normal_asphalt':
      return 1.0;
    case 'shoulder':
      return 0.89;
    case 'wet_asphalt':
      return 0.84;
    case 'gravel':
      return 0.74;
    case 'dirt':
      return 0.70;
    case 'grass':
    default:
      return 0.62;
  }
}

export interface SampledRoadNode {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  slopeY: number;
  bankAngle: number;
  halfWidth: number;
  isTunnel: boolean;
  isBridge: boolean;
  hasGuardrailLeft: boolean;
  hasGuardrailRight: boolean;
  hasStreetlight: boolean;
  chevronSide: 'left' | 'right' | 'both' | 'none';
  routeType: 'main' | 'branch';
  index: number;
}

export type TreeSpeciesType = 'sugi_cedar' | 'hinoki_cypress' | 'red_pine' | 'mountain_maple';

export interface TreeCollider {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
  trunkRadius: number;
  seed: number;
  isBlossom: boolean;
  species: TreeSpeciesType;
}

interface MapRoadCache {
  mainSamples: SampledRoadNode[];
  branchSamples: SampledRoadNode[];
}

const roadCache: Partial<Record<MapId, MapRoadCache>> = {};
const treeCache: Partial<Record<MapId, TreeCollider[]>> = {};

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
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

function sampleSpline(
  waypoints: Waypoint3D[],
  closed: boolean,
  subdivisionsPerSegment: number,
  defaultWidth: number,
  routeType: 'main' | 'branch'
): SampledRoadNode[] {
  const n = waypoints.length;
  const rawPoints: {
    x: number;
    y: number;
    z: number;
    halfWidth: number;
    isTunnel: boolean;
    isBridge: boolean;
    hasGuardrailLeft: boolean;
    hasGuardrailRight: boolean;
    hasStreetlight: boolean;
    chevronSide: 'left' | 'right' | 'both' | 'none';
  }[] = [];

  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const p0 = waypoints[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const p3 = waypoints[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];

    for (let s = 0; s < subdivisionsPerSegment; s++) {
      const t = s / subdivisionsPerSegment;
      const smoothT = t * t * (3 - 2 * t);
      const x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      const z = catmullRom(p0.z, p1.z, p2.z, p3.z, t);
      const w1 = p1.width ?? defaultWidth;
      const w2 = p2.width ?? defaultWidth;
      const width = w1 + (w2 - w1) * smoothT;

      const nearestWp = t < 0.5 ? p1 : p2;
      rawPoints.push({
        x,
        y,
        z,
        halfWidth: width * 0.5,
        isTunnel: Boolean(p1.isTunnel && p2.isTunnel),
        isBridge: Boolean(p1.isBridge || (t > 0.3 && p2.isBridge) || (t < 0.7 && p1.isBridge)),
        hasGuardrailLeft: nearestWp.hasGuardrailLeft ?? true,
        hasGuardrailRight: nearestWp.hasGuardrailRight ?? true,
        hasStreetlight: Boolean(s === 0 && p1.hasStreetlight),
        chevronSide: nearestWp.chevronSide ?? 'none',
      });
    }
  }

  if (!closed) {
    const last = waypoints[n - 1];
    rawPoints.push({
      x: last.x,
      y: last.y,
      z: last.z,
      halfWidth: (last.width ?? defaultWidth) * 0.5,
      isTunnel: Boolean(last.isTunnel),
      isBridge: Boolean(last.isBridge),
      hasGuardrailLeft: last.hasGuardrailLeft ?? true,
      hasGuardrailRight: last.hasGuardrailRight ?? true,
      hasStreetlight: Boolean(last.hasStreetlight),
      chevronSide: last.chevronSide ?? 'none',
    });
  }

  const total = rawPoints.length;

  // Apply 2-pass elevation smoothing so vertical grade changes have C2-smooth vertical curvature
  for (let pass = 0; pass < 2; pass++) {
    const smoothedY = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      if (!closed && (i === 0 || i === total - 1)) {
        smoothedY[i] = rawPoints[i].y;
        continue;
      }
      const prev = rawPoints[closed ? (i - 1 + total) % total : Math.max(0, i - 1)].y;
      const curr = rawPoints[i].y;
      const next = rawPoints[closed ? (i + 1) % total : Math.min(total - 1, i + 1)].y;
      smoothedY[i] = prev * 0.22 + curr * 0.56 + next * 0.22;
    }
    for (let i = 0; i < total; i++) {
      rawPoints[i].y = smoothedY[i];
    }
  }

  const result: SampledRoadNode[] = [];

  for (let i = 0; i < total; i++) {
    const prev = rawPoints[closed ? (i - 1 + total) % total : Math.max(0, i - 1)];
    const curr = rawPoints[i];
    const next = rawPoints[closed ? (i + 1) % total : Math.min(total - 1, i + 1)];

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const lenXZ = Math.hypot(dx, dz) || 1;
    const tx = dx / lenXZ;
    const tz = dz / lenXZ;
    // Left normal in XZ plane: (-tz, tx)
    const nx = -tz;
    const nz = tx;
    const slopeY = dy / lenXZ;

    // Compute natural mountain corner banking angle from horizontal turn curvature
    const dx1 = curr.x - prev.x;
    const dz1 = curr.z - prev.z;
    const l1 = Math.hypot(dx1, dz1) || 1;
    const dx2 = next.x - curr.x;
    const dz2 = next.z - curr.z;
    const l2 = Math.hypot(dx2, dz2) || 1;
    const cross = (dx1 / l1) * (dz2 / l2) - (dz1 / l1) * (dx2 / l2);
    const rawBank = curr.isBridge || curr.isTunnel ? 0 : Math.max(-0.058, Math.min(0.058, cross * 0.52));

    result.push({
      ...curr,
      tx,
      tz,
      nx,
      nz,
      slopeY,
      bankAngle: rawBank,
      routeType,
      index: i,
    });
  }

  // Smooth bankAngle and slopeY across 4 passes so corner entry/apex/exit camber transitions are progressive
  for (let pass = 0; pass < 4; pass++) {
    const nextBank = new Float64Array(total);
    const nextSlope = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      const iPrev = closed ? (i - 1 + total) % total : Math.max(0, i - 1);
      const iNext = closed ? (i + 1) % total : Math.min(total - 1, i + 1);
      nextBank[i] =
        result[iPrev].bankAngle * 0.25 +
        result[i].bankAngle * 0.5 +
        result[iNext].bankAngle * 0.25;
      nextSlope[i] =
        result[iPrev].slopeY * 0.22 +
        result[i].slopeY * 0.56 +
        result[iNext].slopeY * 0.22;
    }
    for (let i = 0; i < total; i++) {
      result[i].bankAngle = result[i].isBridge || result[i].isTunnel ? 0 : nextBank[i];
      result[i].slopeY = nextSlope[i];
    }
  }

  return result;
}

export function getMapRoadSamples(mapId: MapId): MapRoadCache {
  if (roadCache[mapId]) {
    return roadCache[mapId]!;
  }
  const mapDef = MAPS_DATA[mapId];
  const mainSamples = sampleSpline(mapDef.mainLoop, true, 24, mapDef.roadWidth, 'main');
  const branchSamples = sampleSpline(mapDef.branchRoute, false, 24, mapDef.roadWidth - 0.5, 'branch');

  // Seamlessly weld branch endpoints into main loop elevation & camber over the first/last 14 samples
  if (branchSamples.length >= 28) {
    const startHit = projectOntoSampleChain(branchSamples[0].x, branchSamples[0].z, mainSamples, true, 'main');
    const startMainY = startHit.nodeA.y + (startHit.nodeB.y - startHit.nodeA.y) * startHit.segT;
    const startDeltaY = startMainY - branchSamples[0].y;

    const lastIdx = branchSamples.length - 1;
    const endHit = projectOntoSampleChain(branchSamples[lastIdx].x, branchSamples[lastIdx].z, mainSamples, true, 'main');
    const endMainY = endHit.nodeA.y + (endHit.nodeB.y - endHit.nodeA.y) * endHit.segT;
    const endDeltaY = endMainY - branchSamples[lastIdx].y;

    const blendSpan = 14;
    for (let i = 0; i < blendSpan; i++) {
      const w = 1 - i / blendSpan;
      const smoothW = w * w * (3 - 2 * w);
      branchSamples[i].y += startDeltaY * smoothW;
      branchSamples[i].bankAngle *= 1 - smoothW;

      const ei = lastIdx - i;
      branchSamples[ei].y += endDeltaY * smoothW;
      branchSamples[ei].bankAngle *= 1 - smoothW;
    }

    // Clear guardrails on the first and last 7 branch nodes where the branch merges into the main road
    for (let i = 0; i < 7; i++) {
      branchSamples[i].hasGuardrailLeft = false;
      branchSamples[i].hasGuardrailRight = false;
      branchSamples[lastIdx - i].hasGuardrailLeft = false;
      branchSamples[lastIdx - i].hasGuardrailRight = false;
    }
  }

  // Open guardrails on mainSamples wherever the branch road junctions or drift plazas intersect the main loop
  const branchStart = branchSamples[0];
  const branchEnd = branchSamples[branchSamples.length - 1];
  for (let i = 0; i < mainSamples.length; i++) {
    const ms = mainSamples[i];
    if (branchStart && Math.hypot(ms.x - branchStart.x, ms.z - branchStart.z) < 16.5) {
      ms.hasGuardrailLeft = false;
      ms.hasGuardrailRight = false;
    }
    if (branchEnd && Math.hypot(ms.x - branchEnd.x, ms.z - branchEnd.z) < 16.5) {
      ms.hasGuardrailLeft = false;
      ms.hasGuardrailRight = false;
    }
    for (const plaza of mapDef.plazas) {
      const pdx = ms.x - plaza.x;
      const pdz = ms.z - plaza.z;
      const normDist = Math.hypot(pdx / (plaza.radiusX + 6), pdz / (plaza.radiusZ + 6));
      if (normDist <= 1.05) {
        ms.hasGuardrailLeft = false;
        ms.hasGuardrailRight = false;
      }
    }
  }

  const cache = { mainSamples, branchSamples };
  roadCache[mapId] = cache;
  return cache;
}

interface ProjectedSegmentHit {
  distSq: number;
  nodeA: SampledRoadNode;
  nodeB: SampledRoadNode;
  segT: number;
  routeType: 'main' | 'branch';
}

function projectOntoSampleChain(
  x: number,
  z: number,
  samples: SampledRoadNode[],
  closed: boolean,
  routeType: 'main' | 'branch'
): ProjectedSegmentHit {
  const n = samples.length;
  let bestIdx = 0;
  let bestNodeDistSq = Infinity;

  // Stage 1: Coarse stride (every 6th node, ~10m apart)
  const stride = 6;
  for (let i = 0; i < n; i += stride) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestNodeDistSq) {
      bestNodeDistSq = dSq;
      bestIdx = i;
    }
  }

  // Stage 2: Fine search around any coarse candidate within ~25m of bestNodeDistSq
  const thresholdSq = bestNodeDistSq + 900;
  for (let c = 0; c < n; c += stride) {
    const sc = samples[c];
    const cdx = x - sc.x;
    const cdz = z - sc.z;
    if (cdx * cdx + cdz * cdz <= thresholdSq) {
      const start = Math.max(0, c - stride);
      const end = Math.min(n - 1, c + stride);
      for (let i = start; i <= end; i++) {
        const s = samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestNodeDistSq) {
          bestNodeDistSq = dSq;
          bestIdx = i;
        }
      }
    }
  }

  // Test the 4 adjacent segments around bestIdx for exact continuous projection
  let bestSegDistSq = Infinity;
  let bestNodeA = samples[bestIdx];
  let bestNodeB = samples[bestIdx];
  let bestT = 0;

  for (let offset = -2; offset <= 1; offset++) {
    let idxA = bestIdx + offset;
    let idxB = idxA + 1;
    if (closed) {
      idxA = ((idxA % n) + n) % n;
      idxB = ((idxB % n) + n) % n;
    } else {
      if (idxA < 0 || idxB >= n) continue;
    }
    const a = samples[idxA];
    const b = samples[idxB];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = abx * abx + abz * abz;
    const t = abLenSq > 1e-6 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / abLenSq)) : 0;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < bestSegDistSq) {
      bestSegDistSq = dSq;
      bestNodeA = a;
      bestNodeB = b;
      bestT = t;
    }
  }

  return {
    distSq: bestSegDistSq,
    nodeA: bestNodeA,
    nodeB: bestNodeB,
    segT: bestT,
    routeType,
  };
}

export function queryRoadAt(x: number, z: number, mapId: MapId): RoadQueryResult {
  const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
  const mapDef = MAPS_DATA[mapId];

  const mainHit = projectOntoSampleChain(x, z, mainSamples, true, 'main');
  const branchHit = projectOntoSampleChain(x, z, branchSamples, false, 'branch');
  const bestHit = branchHit.distSq < mainHit.distSq ? branchHit : mainHit;

  const { nodeA, nodeB, segT, routeType: bestRoute } = bestHit;
  const bestNode = segT < 0.5 ? nodeA : nodeB;

  // Continuous interpolation along segment [nodeA, nodeB]
  const projX = nodeA.x + (nodeB.x - nodeA.x) * segT;
  const projY = nodeA.y + (nodeB.y - nodeA.y) * segT;
  const projZ = nodeA.z + (nodeB.z - nodeA.z) * segT;
  const rawTx = nodeA.tx + (nodeB.tx - nodeA.tx) * segT;
  const rawTz = nodeA.tz + (nodeB.tz - nodeA.tz) * segT;
  const tLen = Math.hypot(rawTx, rawTz) || 1;
  const tx = rawTx / tLen;
  const tz = rawTz / tLen;
  const nx = -tz;
  const nz = tx;
  const slopeY = nodeA.slopeY + (nodeB.slopeY - nodeA.slopeY) * segT;
  const bankAngle = nodeA.bankAngle + (nodeB.bankAngle - nodeA.bankAngle) * segT;
  const halfWidth = nodeA.halfWidth + (nodeB.halfWidth - nodeA.halfWidth) * segT;

  const distToSpline = Math.sqrt(bestHit.distSq);
  const dx = x - projX;
  const dz = z - projZ;
  const signedLateralOffset = dx * nx + dz * nz;

  // Account for subtle corner banking across the road width
  const clampedLateral = Math.max(-halfWidth, Math.min(halfWidth, signedLateralOffset));
  const bankedRoadY = projY + clampedLateral * Math.sin(bankAngle);

  // Check if inside or closer to any open drift plaza
  for (const plaza of mapDef.plazas) {
    const pdx = x - plaza.x;
    const pdz = z - plaza.z;
    const normDist = Math.hypot(pdx / plaza.radiusX, pdz / plaza.radiusZ);
    if (normDist <= 1.05) {
      const roadMargin = halfWidth + 4.0;
      const elev = distToSpline < roadMargin ? Math.min(bankedRoadY, plaza.y) : plaza.y;
      return {
        onRoad: true,
        distanceToCenter: Math.min(distToSpline, normDist * Math.min(plaza.radiusX, plaza.radiusZ) * 0.5),
        signedLateralOffset: 0,
        roadHalfWidth: Math.max(plaza.radiusX, plaza.radiusZ),
        elevation: elev,
        tangentX: tx,
        tangentZ: tz,
        slopeY: 0,
        bankAngle: 0,
        isTunnel: false,
        isBridge: false,
        isPlaza: true,
        segmentIndex: bestNode.index,
        routeType: 'plaza',
        hasGuardrailLeft: false,
        hasGuardrailRight: false,
        surfaceType: 'smooth_asphalt',
        surfaceGrip: getSurfaceGripMultiplier('smooth_asphalt'),
      };
    }
  }

  // Determine exact road or off-road surface type
  let surfaceType: RoadSurfaceType = 'normal_asphalt';
  if (distToSpline <= halfWidth - 0.55) {
    if (bestNode.isBridge) {
      surfaceType = 'smooth_asphalt';
    } else if (bestNode.isTunnel) {
      surfaceType = 'wet_asphalt';
    } else {
      surfaceType = 'normal_asphalt';
    }
  } else if (distToSpline <= halfWidth + 0.65) {
    surfaceType = 'shoulder';
  } else if (distToSpline <= halfWidth + 2.8) {
    surfaceType = mapId === 'mountain' ? 'gravel' : 'dirt';
  } else {
    surfaceType = 'grass';
  }

  return {
    onRoad: distToSpline <= halfWidth + 0.6,
    distanceToCenter: distToSpline,
    signedLateralOffset,
    roadHalfWidth: halfWidth,
    elevation: bankedRoadY,
    tangentX: tx,
    tangentZ: tz,
    slopeY,
    bankAngle,
    isTunnel: Boolean(nodeA.isTunnel || nodeB.isTunnel),
    isBridge: Boolean(nodeA.isBridge || nodeB.isBridge),
    isPlaza: false,
    segmentIndex: bestNode.index,
    routeType: bestRoute,
    hasGuardrailLeft: bestNode.hasGuardrailLeft,
    hasGuardrailRight: bestNode.hasGuardrailRight,
    surfaceType,
    surfaceGrip: getSurfaceGripMultiplier(surfaceType),
  };
}

/**
 * Computes river center X for a given Z coordinate in the Blossom Drift map.
 * The Jade River winds from North-East to South-West and passes directly under the bridge at (0, 155).
 */
export function getBlossomRiverCenterX(z: number): number {
  return (z - 155) * 0.45 + Math.sin(z * 0.025) * 18;
}

export function isPointInBlossomRiver(x: number, z: number): boolean {
  // River flows in the southern valley section (z > 65) passing through (0, 155)
  if (z < 75) return false;
  const riverX = getBlossomRiverCenterX(z);
  return Math.abs(x - riverX) < 22;
}

/**
 * Deterministic procedural terrain elevation that smoothly conforms to the road network
 * so terrain NEVER pokes through roads, forms a real mountain tunnel roof over tunnel segments,
 * and carves a riverbed underneath bridges.
 */
export function getTerrainHeight(x: number, z: number, mapId: MapId): number {
  const rq = queryRoadAt(x, z, mapId);
  const mapDef = MAPS_DATA[mapId];

  // Check distance to nearest plaza edge
  let minPlazaFactor = 1.0;
  let nearestPlazaY = rq.elevation;
  for (const plaza of mapDef.plazas) {
    const normDist = Math.hypot((x - plaza.x) / plaza.radiusX, (z - plaza.z) / plaza.radiusZ);
    if (normDist < minPlazaFactor + 0.35) {
      minPlazaFactor = Math.min(minPlazaFactor, normDist);
      nearestPlazaY = plaza.y;
    }
  }

  if (mapId === 'mountain') {
    // Base mountain slope: high in North (z < 0), lower in South valley (z > 0), with perimeter peaks
    const northSouthSlope = Math.max(0, (160 - z) * 0.095);
    const radialDist = Math.hypot(x, z);
    const outerMountains =
      radialDist > 210
        ? Math.pow((radialDist - 210) * 0.032, 1.55) *
          (12 + 6 * Math.sin(x * 0.025) * Math.cos(z * 0.025))
        : 0;
    const ridgeWaves =
      Math.sin(x * 0.018 + 0.5) * Math.cos(z * 0.018) * 6.5 +
      Math.sin(x * 0.045 - z * 0.035) * 2.4;

    let rawHeight = northSouthSlope + outerMountains + ridgeWaves;

    // Smoothly clamp/blend terrain around roads and plazas so terrain never intersects any road surface
    const innerRadius = rq.roadHalfWidth + 1.8;
    const outerRadius = rq.roadHalfWidth + 22.0;
    const roadBedY = rq.elevation - 0.18;
    const plazaBedY = nearestPlazaY - 0.18;

    if (rq.distanceToCenter <= innerRadius && minPlazaFactor <= 1.05) {
      return Math.min(roadBedY, plazaBedY);
    }
    if (rq.distanceToCenter <= innerRadius) {
      return roadBedY;
    }
    if (minPlazaFactor <= 1.05) {
      return plazaBedY;
    }
    if (minPlazaFactor < 1.35) {
      const t = (minPlazaFactor - 1.05) / 0.3;
      const smooth = t * t * (3 - 2 * t);
      rawHeight = plazaBedY * (1 - smooth) + rawHeight * smooth;
    }
    if (rq.distanceToCenter < outerRadius) {
      const t = (rq.distanceToCenter - innerRadius) / (outerRadius - innerRadius);
      const smooth = t * t * (3 - 2 * t);
      return roadBedY * (1 - smooth) + rawHeight * smooth;
    }

    return rawHeight;
  } else {
    // Blossom Drift terrain: peaceful valley surrounded by lush Sakura hills and a carved river channel
    const radialDist = Math.hypot(x, z);
    const outerSakuraHills =
      radialDist > 205
        ? Math.pow((radialDist - 205) * 0.028, 1.45) *
          (9 + 4 * Math.sin(x * 0.02) * Math.cos(z * 0.02))
        : 0;
    const gentleValley =
      4.2 +
      Math.sin(x * 0.015) * Math.cos(z * 0.015) * 2.2 +
      Math.sin(x * 0.04 + z * 0.03) * 0.65;

    let rawHeight = gentleValley + outerSakuraHills;

    // Carve the Jade River channel in the southern part of the map (passing under the bridge at z ~ 155)
    if (z > 65) {
      const riverCenterX = getBlossomRiverCenterX(z);
      const distToRiver = Math.abs(x - riverCenterX);
      const zFade = Math.min(1, Math.max(0, (z - 65) / 30));
      if (distToRiver < 32) {
        const riverFactor = Math.cos((distToRiver / 32) * (Math.PI * 0.5));
        const depth = riverFactor * riverFactor * 6.4 * zFade;
        rawHeight -= depth;
      }
    }

    // Under a bridge, keep the riverbed depressed so the bridge spans cleanly over water
    if (rq.isBridge) {
      return Math.min(rawHeight, 0.2);
    }

    const innerRadius = rq.roadHalfWidth + 1.8;
    const outerRadius = rq.roadHalfWidth + 18.0;
    const roadBedY = rq.elevation - 0.16;
    const plazaBedY = nearestPlazaY - 0.16;

    if (rq.distanceToCenter <= innerRadius && minPlazaFactor <= 1.05) {
      return Math.min(roadBedY, plazaBedY);
    }
    if (rq.distanceToCenter <= innerRadius) {
      return roadBedY;
    }
    if (minPlazaFactor <= 1.05) {
      return plazaBedY;
    }
    if (minPlazaFactor < 1.35) {
      const t = (minPlazaFactor - 1.05) / 0.3;
      const smooth = t * t * (3 - 2 * t);
      rawHeight = plazaBedY * (1 - smooth) + rawHeight * smooth;
    }
    if (rq.distanceToCenter < outerRadius) {
      const t = (rq.distanceToCenter - innerRadius) / (outerRadius - innerRadius);
      const smooth = t * t * (3 - 2 * t);
      return roadBedY * (1 - smooth) + rawHeight * smooth;
    }

    return rawHeight;
  }
}

function seededRand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Generates deterministic, grounded 3D tree placements and trunk colliders for a map.
 * Trees are strictly excluded from roads, shoulders, bridges, tunnels, rivers, and drift plazas.
 */
export function getMapTreeColliders(mapId: MapId): TreeCollider[] {
  if (treeCache[mapId]) {
    return treeCache[mapId]!;
  }
  const mapDef = MAPS_DATA[mapId];
  const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
  const allSamples = [...mainSamples, ...branchSamples];
  const colliders: TreeCollider[] = [];

  const pickSpecies = (rSpec: number): TreeSpeciesType => {
    if (rSpec < 0.34) return 'sugi_cedar';
    if (rSpec < 0.62) return 'hinoki_cypress';
    if (rSpec < 0.84) return 'red_pine';
    return 'mountain_maple';
  };

  // 1. Roadside forest corridor along main & branch touge roads
  for (let i = 0; i < allSamples.length; i += 3) {
    const s = allSamples[i];
    if (s.isTunnel || s.isBridge) continue;

    for (const side of [-1, 1]) {
      const r1 = seededRand(i * 19.7 + side * 7.3 + (mapId === 'blossom' ? 100 : 0));
      const r2 = seededRand(i * 31.1 + side * 13.9 + (mapId === 'blossom' ? 200 : 0));
      const r3 = seededRand(i * 47.3 + side * 23.1);

      // Primary roadside tree row (strictly outside barrier + shoulder margin)
      const offset = s.halfWidth + 4.4 + r1 * 14.5;
      const jitterAlong = (r2 - 0.5) * 4.5;
      const tx = s.x + s.nx * side * offset + s.tx * jitterAlong;
      const tz = s.z + s.nz * side * offset + s.tz * jitterAlong;

      const rq = queryRoadAt(tx, tz, mapId);
      if (rq.distanceToCenter < rq.roadHalfWidth + 4.1 || rq.isPlaza || rq.isTunnel || rq.isBridge) {
        continue;
      }
      if (mapId === 'blossom' && isPointInBlossomRiver(tx, tz)) continue;

      let insidePlaza = false;
      for (const p of mapDef.plazas) {
        if (Math.hypot((tx - p.x) / (p.radiusX + 6), (tz - p.z) / (p.radiusZ + 6)) < 1.05) {
          insidePlaza = true;
          break;
        }
      }
      if (insidePlaza) continue;

      // Prevent overlapping trunks
      let tooClose = false;
      for (let j = Math.max(0, colliders.length - 18); j < colliders.length; j++) {
        if (Math.hypot(tx - colliders[j].x, tz - colliders[j].z) < 3.6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const ty = getTerrainHeight(tx, tz, mapId);
      const scale = 0.85 + r3 * 0.78;
      const isBlossom = mapId === 'blossom' && r2 < 0.78;
      colliders.push({
        x: tx,
        y: ty,
        z: tz,
        scale,
        rot: r1 * Math.PI * 2,
        tint: r2,
        trunkRadius: 0.42 * scale,
        seed: i * 17 + (side > 0 ? 3 : 9),
        isBlossom,
        species: pickSpecies(seededRand(i * 61.3 + side * 11.7)),
      });
    }
  }

  // 2. Outer mountain slope / valley forest fill
  for (let i = 0; i < 210; i++) {
    const r1 = seededRand(i * 53.7 + 11.3);
    const r2 = seededRand(i * 71.9 + 29.1);
    const r3 = seededRand(i * 89.3 + 43.7);
    const angle = r1 * Math.PI * 2;
    const radius = 32 + r2 * 185;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    const rq = queryRoadAt(tx, tz, mapId);
    if (rq.distanceToCenter < rq.roadHalfWidth + 5.2 || rq.isPlaza || rq.isTunnel || rq.isBridge) {
      continue;
    }
    if (mapId === 'blossom' && isPointInBlossomRiver(tx, tz)) continue;

    let insidePlaza = false;
    for (const p of mapDef.plazas) {
      if (Math.hypot((tx - p.x) / (p.radiusX + 7), (tz - p.z) / (p.radiusZ + 7)) < 1.05) {
        insidePlaza = true;
        break;
      }
    }
    if (insidePlaza) continue;

    const ty = getTerrainHeight(tx, tz, mapId);
    const scale = 0.9 + r3 * 0.88;
    const isBlossom = mapId === 'blossom' && r1 < 0.72;
    colliders.push({
      x: tx,
      y: ty,
      z: tz,
      scale,
      rot: r2 * Math.PI * 2,
      tint: r3,
      trunkRadius: 0.44 * scale,
      seed: 1000 + i * 23,
      isBlossom,
      species: pickSpecies(seededRand(i * 97.1 + 19.3)),
    });
  }

  treeCache[mapId] = colliders;
  return colliders;
}
