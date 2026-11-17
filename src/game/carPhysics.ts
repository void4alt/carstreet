import { MAPS_DATA } from './mapsData';
import { getMapTreeColliders, getTerrainHeight, queryRoadAt } from './roadMath';
import {
  CarInput,
  CarState,
  DynoCurveResult,
  DynoDataPoint,
  EngineSoundType,
  GameSettings,
  HandlingMode,
  MapId,
  TransmissionMode,
  TuningPresetType,
  VehicleCustomization,
  VehicleSpec,
  WeatherMode,
} from './types';
import { VEHICLES_CATALOG } from './vehiclesData';

export interface HandlingPreviewMetrics {
  cornerEntryAuthority: number; // 0 to 100
  oversteerBalance: number; // 0 to 100
  forwardTraction: number; // 0 to 100
  highSpeedStability: number; // 0 to 100
  maxDriftAngleCapDeg: number; // 35 to 62
  // 0 to 10 scale metrics for Garage Telemetry Preview Bars
  driftEase: number;
  corneringGrip: number;
  stability: number;
  steeringResponse: number;
}

/**
 * Deterministic Chassis Dynamometer (Dyno) Simulation Engine.
 * Calculates real RPM-by-RPM Wheel Horsepower (WHP), Engine Torque (Nm), and Manifold Boost (BAR)
 * directly from the vehicle's mechanical specification and installed Garage upgrades (exhaust, turbo, ECU tune).
 * Never uses random numbers.
 */
export function computeDynoCurve(
  vehicle: VehicleSpec = VEHICLES_CATALOG[0],
  custom?: Partial<VehicleCustomization>
): DynoCurveResult {
  const redlineRpm = getEngineRedlineRpm(vehicle.soundType, vehicle);
  const cfg = vehicle.physicsConfig;
  const isTurbo =
    Boolean(cfg?.turbocharged) ||
    (custom?.turboSetup !== undefined && custom.turboSetup !== 'stock_na_or_oem');

  // Exhaust system flow gain (OEM = 1.0, Sports Cat-Back = +3%, Titanium Race = +6.5%, Straight Pipe = +8.5%)
  const exhaustGain =
    custom?.exhaustSystem === 'straight_pipe'
      ? 1.085
      : custom?.exhaustSystem === 'titanium_race'
      ? 1.065
      : custom?.exhaustSystem === 'sports_catback'
      ? 1.03
      : 1.0;

  // Forced induction / turbo setup gain
  const turboGain =
    custom?.turboSetup === 'anti_lag_sequential'
      ? 1.14
      : custom?.turboSetup === 'big_single_flutter'
      ? 1.18
      : custom?.turboSetup === 'street_spool'
      ? 1.08
      : 1.0;

  const ecuTuneMult = Math.max(0.85, Math.min(1.45, custom?.horsepowerTuning ?? 1.0));
  const drivetrainLossFactor = vehicle.drivetrain === 'AWD' ? 0.84 : vehicle.drivetrain === 'RWD' ? 0.88 : 0.90;

  // Target peak Wheel Horsepower (WHP) scaled from crank HP * upgrades * drivetrain efficiency
  const targetPeakWhp =
    vehicle.horsepower *
    ecuTuneMult *
    exhaustGain *
    (isTurbo ? turboGain : 1.0 + (turboGain - 1.0) * 0.35) *
    drivetrainLossFactor;

  const maxBoostBar = !isTurbo
    ? 0.0
    : custom?.turboSetup === 'big_single_flutter'
    ? 1.45
    : custom?.turboSetup === 'anti_lag_sequential'
    ? 1.38
    : custom?.turboSetup === 'street_spool'
    ? 1.18
    : 1.05;

  // First pass: sample raw power index across RPM range (1,000 RPM to redlineRpm in 250 RPM increments)
  const rawSamples: { rpm: number; torqueMult: number; boostBar: number; rawPowerIdx: number }[] = [];
  let maxRawPowerIdx = 0.001;

  for (let rpm = 1000; rpm <= redlineRpm; rpm += 250) {
    const baseTorqueMult = getEngineTorqueMultiplier(rpm, redlineRpm, vehicle.soundType, vehicle);
    const spoolNorm = Math.max(0, Math.min(1, (rpm - 2300) / Math.max(1600, redlineRpm - 2900)));
    const boostBar = !isTurbo
      ? 0.0
      : Number((Math.pow(spoolNorm, custom?.turboSetup === 'big_single_flutter' ? 1.35 : 0.95) * maxBoostBar).toFixed(2));

    // Big single turbo shifts powerband higher; street spool fattens mid-range torque
    const turboBandMod = !isTurbo
      ? 1.0
      : custom?.turboSetup === 'big_single_flutter'
      ? 0.88 + spoolNorm * 0.24
      : custom?.turboSetup === 'anti_lag_sequential'
      ? 0.96 + spoolNorm * 0.16
      : 0.93 + spoolNorm * 0.14;

    const effectiveTorqueMult = baseTorqueMult * turboBandMod;
    const rawPowerIdx = effectiveTorqueMult * (rpm / 7127);
    if (rawPowerIdx > maxRawPowerIdx) {
      maxRawPowerIdx = rawPowerIdx;
    }
    rawSamples.push({ rpm, torqueMult: effectiveTorqueMult, boostBar, rawPowerIdx });
  }

  // Scale torque so peak WHP matches targetPeakWhp using exact physics formula: WHP = (Torque_Nm * RPM) / 7127
  const baseTorqueScaleNm = targetPeakWhp / maxRawPowerIdx;

  const points: DynoDataPoint[] = [];
  let peakWhp = 0;
  let peakWhpRpm = 1000;
  let peakTorqueNm = 0;
  let peakTorqueRpm = 1000;
  let peakBoostBar = 0;

  for (const s of rawSamples) {
    const torqueNm = Math.round(s.torqueMult * baseTorqueScaleNm);
    const whp = Math.round((torqueNm * s.rpm) / 7127);
    points.push({
      rpm: s.rpm,
      whp,
      torqueNm,
      boostBar: s.boostBar,
    });
    if (whp > peakWhp) {
      peakWhp = whp;
      peakWhpRpm = s.rpm;
    }
    if (torqueNm > peakTorqueNm) {
      peakTorqueNm = torqueNm;
      peakTorqueRpm = s.rpm;
    }
    if (s.boostBar > peakBoostBar) {
      peakBoostBar = s.boostBar;
    }
  }

  return {
    points,
    peakWhp,
    peakWhpRpm,
    peakTorqueNm,
    peakTorqueRpm,
    redlineRpm,
    idleRpm: 900,
    crankHp: Math.round(peakWhp / drivetrainLossFactor),
    drivetrainLossPct: Math.round((1 - drivetrainLossFactor) * 100),
    maxBoostBar: peakBoostBar,
    peakBoostBar,
  };
}

/**
 * Returns the physics tuning slider values for the 4 Garage Presets:
 * 1. Street (Balanced street touge setup)
 * 2. Grip (High rear traction, stiff suspension, tight racing lines)
 * 3. Drift (High steering angle 56°, locked LSD, drift camber/toe, easy rear rotation)
 * 4. Custom (Preserves user's custom values or initializes from spec defaults)
 */
export function getTuningPresetValues(
  preset: TuningPresetType,
  spec?: VehicleSpec
): Partial<VehicleCustomization> {
  const isAwd = spec?.drivetrain === 'AWD';
  const stockFd = spec?.physicsConfig?.finalDrive ?? 3.9;
  switch (preset) {
    case 'street':
      return {
        tuningPreset: 'street',
        frontTireGrip: 1.04,
        rearTireGrip: 1.0,
        maxSteerAngleDeg: 44,
        steeringSensitivity: 1.0,
        frontSuspensionStiffness: 1.0,
        rearSuspensionStiffness: 0.98,
        suspensionStiffness: 1.0,
        diffLock: isAwd ? 0.72 : 0.76,
        diffAccelLock: isAwd ? 0.74 : 0.78,
        diffDecelLock: 0.48,
        handbrakeStrength: 1.0,
        tirePressurePsi: 32,
        frontCamberDeg: -2.0,
        rearCamberDeg: -1.2,
        frontToeDeg: -0.05,
        rearToeDeg: 0.15,
        frontWeightBias: isAwd ? 54 : 52,
        rideHeightOffset: -0.02,
        finalDriveRatio: Number(stockFd.toFixed(2)),
      };
    case 'grip':
      return {
        tuningPreset: 'grip',
        frontTireGrip: 1.22,
        rearTireGrip: 1.24,
        maxSteerAngleDeg: 40,
        steeringSensitivity: 1.08,
        frontSuspensionStiffness: 1.22,
        rearSuspensionStiffness: 1.18,
        suspensionStiffness: 1.2,
        diffLock: 0.65,
        diffAccelLock: 0.68,
        diffDecelLock: 0.42,
        handbrakeStrength: 0.85,
        tirePressurePsi: 27,
        frontCamberDeg: -3.2,
        rearCamberDeg: -2.2,
        frontToeDeg: -0.1,
        rearToeDeg: 0.25,
        frontWeightBias: 50,
        rideHeightOffset: -0.035,
        finalDriveRatio: Number(Math.max(3.15, stockFd - 0.18).toFixed(2)),
      };
    case 'drift':
      return {
        tuningPreset: 'drift',
        frontTireGrip: 1.16,
        rearTireGrip: 0.82,
        maxSteerAngleDeg: 56,
        steeringSensitivity: 1.15,
        frontSuspensionStiffness: 1.14,
        rearSuspensionStiffness: 0.92,
        suspensionStiffness: 1.08,
        diffLock: 0.92,
        diffAccelLock: 0.95,
        diffDecelLock: 0.68,
        handbrakeStrength: 1.22,
        tirePressurePsi: 36,
        frontCamberDeg: -4.5,
        rearCamberDeg: -0.8,
        frontToeDeg: -0.25,
        rearToeDeg: 0.1,
        frontWeightBias: 53,
        rideHeightOffset: -0.032,
        finalDriveRatio: Number(Math.min(4.75, stockFd + 0.22).toFixed(2)),
      };
    case 'custom':
    default:
      return {
        tuningPreset: 'custom',
      };
  }
}

/**
 * Computes live handling preview metrics for the Garage Drift Tuning UI.
 * Accepts either (spec, custom) or (custom) directly.
 */
export function computeHandlingPreviewMetrics(
  specOrCustom: VehicleSpec | Partial<VehicleCustomization>,
  maybeCustom?: Partial<VehicleCustomization>
): HandlingPreviewMetrics {
  const isSpec = 'drivetrain' in specOrCustom && 'horsepower' in specOrCustom;
  const spec = isSpec ? (specOrCustom as VehicleSpec) : VEHICLES_CATALOG[0];
  const custom = isSpec ? maybeCustom : (specOrCustom as Partial<VehicleCustomization>);

  const cfg = spec.physicsConfig;
  const fGrip = (custom?.frontTireGrip ?? 1.0) * (cfg?.frontGrip ?? 1.1);
  const rGrip = (custom?.rearTireGrip ?? 1.0) * (cfg?.rearGrip ?? 0.9);
  const maxSteer = custom?.maxSteerAngleDeg ?? 50;
  const fCamber = Math.abs(custom?.frontCamberDeg ?? -2.5);
  const rCamber = Math.abs(custom?.rearCamberDeg ?? -1.2);
  const diffAccel = custom?.diffAccelLock ?? custom?.diffLock ?? cfg?.diffLock ?? 0.82;
  const psi = custom?.tirePressurePsi ?? 30;
  const fSusp = custom?.frontSuspensionStiffness ?? custom?.suspensionStiffness ?? 1.0;
  const rSusp = custom?.rearSuspensionStiffness ?? custom?.suspensionStiffness ?? 1.0;

  const cornerEntryAuthority = Math.round(
    Math.max(25, Math.min(99, fGrip * 56 + fCamber * 3.5 + (maxSteer - 35) * 0.65 + fSusp * 8))
  );
  const oversteerBalance = Math.round(
    Math.max(
      20,
      Math.min(
        99,
        (fGrip / Math.max(0.55, rGrip)) * 42 +
          diffAccel * 24 +
          (psi - 24) * 0.9 +
          (maxSteer - 38) * 0.55
      )
    )
  );
  const forwardTraction = Math.round(
    Math.max(
      25,
      Math.min(
        99,
        rGrip * 54 +
          (spec.drivetrain === 'AWD' ? 18 : 6) +
          (38 - psi) * 0.85 +
          rCamber * 2.2
      )
    )
  );
  const highSpeedStability = Math.round(
    Math.max(
      25,
      Math.min(
        99,
        rGrip * 46 +
          (cfg?.downforceCoeff ?? 0.35) * 45 +
          ((fSusp + rSusp) * 0.5) * 18 +
          (custom?.rearToeDeg ?? 0.15) * 14
      )
    )
  );

  return {
    cornerEntryAuthority,
    oversteerBalance,
    forwardTraction,
    highSpeedStability,
    maxDriftAngleCapDeg: Math.round(Math.max(36, Math.min(62, maxSteer * 1.04))),
    driftEase: Number((oversteerBalance / 10).toFixed(1)),
    corneringGrip: Number((cornerEntryAuthority / 10).toFixed(1)),
    stability: Number((highSpeedStability / 10).toFixed(1)),
    steeringResponse: Number(
      Math.min(10, Math.max(2, ((maxSteer - 30) / 30) * 6.5 + (custom?.steeringSensitivity ?? 1.0) * 3.2)).toFixed(1)
    ),
  };
}

export function getEngineRedlineRpm(soundType: EngineSoundType, vehicle?: VehicleSpec): number {
  if (vehicle?.physicsConfig?.redlineRpm) {
    return vehicle.physicsConfig.redlineRpm;
  }
  switch (soundType) {
    case 'rotary':
    case 'i4_na':
      return 8500;
    case 'v8_race':
      return 8200;
    case 'i6_turbo':
      return 7800;
    case 'v6_na':
    case 'i4_turbo':
      return 7500;
    case 'boxer_turbo':
    default:
      return 7200;
  }
}

const FIVE_SPEED_VEHICLE_IDS = new Set([
  'ae86_trueno',
  'silvia_s13',
  'nissan_180sx',
  'rx7_fc',
  'rx7_fd',
  'r32_gtr',
  'r33_gtr',
  'chaser_jzx100',
  'miata_na',
  'nsx_na1',
  'lancer_evo9',
  'lancer_evo10',
  'bmw_m3_e30',
  'ferrari_f40',
]);

/**
 * Returns each vehicle's authentic forward gear count (5-speed vs 6-speed).
 */
export function getVehicleGearCount(vehicle?: VehicleSpec): 5 | 6 {
  if (vehicle?.physicsConfig?.gearCount) {
    return vehicle.physicsConfig.gearCount;
  }
  if (vehicle && FIVE_SPEED_VEHICLE_IDS.has(vehicle.id)) {
    return 5;
  }
  return 6;
}

/**
 * Returns each vehicle's authentic gear shift duration in seconds (0.15s sequential race to 0.26s vintage H-pattern).
 */
export function getVehicleShiftDurationSec(
  vehicle?: VehicleSpec,
  transmissionMode: TransmissionMode = 'automatic'
): number {
  let baseShift = vehicle?.physicsConfig?.shiftTimeSec ?? 0.21;
  if (!vehicle?.physicsConfig?.shiftTimeSec && vehicle) {
    if (vehicle.id === 'bmw_m3_gtr' || vehicle.id === 'gr_supra_a90' || vehicle.id === 'lancer_evo10') {
      baseShift = 0.15;
    } else if (
      vehicle.id === 'ae86_trueno' ||
      vehicle.id === 'silvia_s13' ||
      vehicle.id === 'nissan_180sx' ||
      vehicle.id === 'rx7_fc' ||
      vehicle.id === 'miata_na' ||
      vehicle.id === 'bmw_m3_e30'
    ) {
      baseShift = 0.25;
    } else if (FIVE_SPEED_VEHICLE_IDS.has(vehicle.id)) {
      baseShift = 0.22;
    } else {
      baseShift = 0.19;
    }
  }
  return transmissionMode === 'automatic' ? baseShift + 0.03 : baseShift;
}

export function getWeatherGripMultiplier(weather: WeatherMode = 'clear'): number {
  switch (weather) {
    case 'heavy_rain':
      return 0.74;
    case 'light_rain':
      return 0.84;
    case 'foggy':
      return 0.94;
    case 'cloudy':
      return 0.98;
    case 'clear':
    default:
      return 1.0;
  }
}

/**
 * Returns realistic normalized engine torque multiplier (0.58 to 1.18) at a given RPM,
 * respecting each vehicle's specific engine architecture (NA ITB, VTEC crossover, Rotary, Twin-Turbo I6/V8, Boxer).
 */
export function getEngineTorqueMultiplier(
  rpm: number,
  redlineRpm: number,
  soundType: EngineSoundType,
  vehicle?: VehicleSpec
): number {
  const norm = Math.max(0, Math.min(1.08, (rpm - 900) / Math.max(1000, redlineRpm - 900)));
  const cfg = vehicle?.physicsConfig;

  // VTEC crossover surge for Honda VTEC engines (NSX NA1, S2000 AP2, Civic Type R FK8)
  const vtecBonus =
    cfg?.vtecCrossoverRpm && rpm >= cfg.vtecCrossoverRpm
      ? 0.08 * Math.min(1, (rpm - cfg.vtecCrossoverRpm) / 1200)
      : 0;

  if (cfg && !cfg.turbocharged) {
    // Naturally Aspirated high-revving curve (AE86 4A-GE 20V, S2000 F22C1, NSX C30A, M3 E30 S14, M3 GTR P60B40)
    const peakNorm = Math.max(0.55, Math.min(0.92, (cfg.peakTorqueRpm - 900) / (redlineRpm - 900)));
    const curve = 0.64 + 0.48 * Math.sin(Math.min(1, norm / (peakNorm * 1.15)) * Math.PI * 0.84);
    return Math.max(0.58, Math.min(1.18, curve + vtecBonus));
  }

  if (soundType === 'rotary' || soundType === 'i4_na') {
    return Math.max(0.58, Math.min(1.18, 0.62 + 0.52 * Math.sin(Math.min(1, norm) * Math.PI * 0.82) + vtecBonus));
  }
  if (soundType === 'boxer_turbo' || soundType === 'v6_na') {
    return Math.max(0.62, Math.min(1.16, 0.74 + 0.38 * Math.sin(Math.min(1, norm) * Math.PI * 0.88) + vtecBonus));
  }
  // Turbocharged I6 / I4 / V8: progressive boost spool from 3,000 RPM through peak power
  const spool = norm < 0.28 ? 0.66 + norm * 0.85 : 0.90 + 0.25 * Math.sin((norm - 0.2) * Math.PI);
  return Math.max(0.58, Math.min(1.18, spool + vtecBonus));
}

export function createInitialCarState(mapId: MapId, viewpointIndex = 0): CarState {
  const mapDef = MAPS_DATA[mapId];
  const vp = mapDef.viewpoints[viewpointIndex] ?? mapDef.viewpoints[0];
  const rq = queryRoadAt(vp.x, vp.z, mapId);
  const roadHeading =
    rq.onRoad && (Math.abs(rq.tangentX) > 0.01 || Math.abs(rq.tangentZ) > 0.01)
      ? Math.atan2(rq.tangentX, rq.tangentZ)
      : vp.heading;

  return {
    x: vp.x,
    y: rq.onRoad ? rq.elevation : vp.y,
    z: vp.z,
    vx: 0,
    vz: 0,
    vy: 0,
    heading: roadHeading,
    angularVelocity: 0,
    speed: 0,
    speedKmh: 0,
    steerAngle: 0,
    visualFrontSteerAngle: 0,
    driftAngle: 0,
    signedDriftAngle: 0,
    isDrifting: false,
    isGrounded: true,
    surfaceType: rq.surfaceType ?? 'normal_asphalt',
    surfaceGrip: rq.surfaceGrip ?? 1.0,
    gear: 1,
    rpm: 950,
    redlineRpm: 7800,
    shiftIndicator: false,
    shiftTimer: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    isReversing: false,
    handbrake: false,
    nitroAmount: 100,
    isBoosting: false,
    backfireTimer: 0,
    backfireIntensity: 0,
    exhaustSmokeIntensity: 0.08,
    tireSlipRatio: 0,
    isBrakingHard: false,
    collisionImpact: 0,
    collisionType: 'none',
    wheelRotation: 0,
    rearWheelRotation: 0,
    wheelCompression: [0, 0, 0, 0],
    bodyRoll: 0,
    bodyPitch: 0,
    bodyHeave: 0,
    roadPitch: Math.atan(rq.slopeY || 0),
    roadBank: rq.bankAngle ?? 0,
    currentDriftPoints: 0,
    driftMultiplier: 1.0,
    totalDriftScore: 0,
    bestDriftChain: 0,
    driftComboCount: 0,
    driftNotificationText: '',
    driftNotificationTimer: 0,
    nearMissCount: 0,
    practiceStepsCompleted: [false, false, false, false, false],
    distanceDriven: 0,
    maxSpeedKmh: 0,
    maxDriftAngleDeg: 0,
    totalDriftDurationSec: 0,
    driftSmoothnessPct: 92,
    driftConsistencyPct: 90,
    currentZoneName: vp.name.replace(/^\d+\.\s*/, ''),
    lapCount: 1,
    currentLapTime: 0,
    bestLapTime: 0,
  };
}

/**
 * Advances the mountain drifting & street-racing vehicle physics by `rawDt` seconds (clamped to <= 0.05s).
 * Features:
 * - Dedicated `drift`, `street`, `grip`, and `race` (alias `performance`) handling profiles.
 * - Weather grip multiplier (`clear`, `cloudy`, `foggy`, `light_rain`, `heavy_rain`).
 * - Stationary engine revving & exhaust backfire when holding Handbrake+Gas, Neutral+Gas, or Rev key.
 * - Silent visual drift combo, transition, and near-miss scoring (zero beeps).
 * - Non-bouncing inelastic 4-corner OBB guardrail/wall collision and solid roadside tree trunk collision.
 */
export function stepCarPhysics(
  state: CarState,
  input: CarInput,
  mapId: MapId,
  rawDt: number,
  vehicle: VehicleSpec = VEHICLES_CATALOG[0],
  custom?: Partial<VehicleCustomization>,
  transmissionMode: TransmissionMode = 'automatic',
  handlingMode: HandlingMode = 'drift',
  weather: WeatherMode = 'clear',
  settings?: Partial<GameSettings>
): CarState {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  const cfg = vehicle.physicsConfig;
  const isDriftMode = handlingMode === 'drift';
  const isStreetMode = handlingMode === 'street';
  const isGripOrRaceMode = handlingMode === 'grip' || handlingMode === 'race' || handlingMode === 'performance';

  // Read Garage Drift Tuning Sliders & Gameplay/Control Settings (with physical defaults)
  const steerSens =
    (custom?.steeringSensitivity ?? 1.0) *
    (settings?.steeringSensitivity ?? 1.0) *
    (cfg?.steeringSensitivity ?? 1.02);
  const steerLinearity = Math.max(0.5, Math.min(2.0, settings?.steeringLinearity ?? 1.0));
  const steerDeadzone = Math.max(0, Math.min(0.25, settings?.steeringDeadzone ?? 0.02));
  const throttleSens = Math.max(0.5, Math.min(1.6, settings?.throttleSensitivity ?? 1.0));
  const brakeSens = Math.max(0.5, Math.min(1.6, settings?.brakeSensitivity ?? 1.0));
  const handbrakeSens = Math.max(0.5, Math.min(1.6, settings?.handbrakeSensitivity ?? 1.0));
  const driftAssistLevel = Math.max(0, Math.min(1, settings?.driftAssist ?? 0.25));
  const steeringAssistLevel = Math.max(0, Math.min(1, settings?.steeringAssist ?? 0.35));
  const tractionControlMode = settings?.tractionControl ?? 'off';
  const absEnabled = settings?.absEnabled ?? true;
  const stabilityControlLevel =
    typeof settings?.stabilityControl === 'boolean'
      ? settings.stabilityControl
        ? 0.65
        : 0
      : Math.max(0, Math.min(1, settings?.stabilityControl ?? 0.15));

  const hpTune = custom?.horsepowerTuning ?? 1.0;
  const fSuspStiff = custom?.frontSuspensionStiffness ?? custom?.suspensionStiffness ?? 1.0;
  const rSuspStiff = custom?.rearSuspensionStiffness ?? custom?.suspensionStiffness ?? 1.0;
  const suspStiff = ((fSuspStiff + rSuspStiff) * 0.5) * (cfg?.suspensionStiffness ?? 1.08);

  const diffLock = custom?.diffLock ?? cfg?.diffLock ?? (isDriftMode ? 0.85 : isStreetMode ? 0.76 : 0.68);
  const diffAccelLock = custom?.diffAccelLock ?? diffLock;
  const diffDecelLock = custom?.diffDecelLock ?? Math.max(0.25, diffLock * 0.65);
  const handbrakeStrength = (custom?.handbrakeStrength ?? 1.0) * handbrakeSens;
  const steerReturnSpeed = Math.max(0.5, Math.min(2.0, settings?.steeringReturnSpeed ?? 1.0));
  const maxSteerAngleDeg = Math.max(
    35,
    Math.min(
      60,
      custom?.maxSteerAngleDeg ??
        settings?.maxSteeringAngleDeg ??
        (isDriftMode ? 52 : isStreetMode ? 46 : 42)
    )
  );
  const tirePressurePsi = Math.max(20, Math.min(44, custom?.tirePressurePsi ?? 30));
  const frontCamberDeg = custom?.frontCamberDeg ?? (isDriftMode ? -3.5 : isStreetMode ? -2.6 : -2.2);
  const rearCamberDeg = custom?.rearCamberDeg ?? -1.2;
  const frontToeDeg = custom?.frontToeDeg ?? -0.15;
  const rearToeDeg = custom?.rearToeDeg ?? 0.2;
  const frontWeightBiasRatio = Math.max(0.45, Math.min(0.58, (custom?.frontWeightBias ?? 52) / 100));

  // Tire pressure effect: lower PSI (22-27) boosts rear traction; higher PSI (34-42) eases drift initiation
  const psiRearGripMod = 1.0 - (tirePressurePsi - 30) * 0.011;
  // Front negative camber (-3° to -5°) increases front lateral bite while countersteering at high drift angles
  const camberFrontBiteMod = 1.0 + Math.min(0.12, Math.abs(frontCamberDeg) * 0.022);
  const camberRearBiteMod = 1.0 + Math.min(0.06, (2.0 - Math.abs(rearCamberDeg - -1.2)) * 0.02);
  // Front toe-out (-0.2° to -0.4°) sharpens turn-in response; rear toe-in (+0.2°) stabilizes drift transitions
  const toeTurnInMod = 1.0 + Math.max(-0.06, Math.min(0.08, -frontToeDeg * 0.16));
  const rearToeStabilityMod = 1.0 + Math.max(-0.05, Math.min(0.08, rearToeDeg * 0.18));

  // Drift Mode prioritizes controlled rear slip & responsive front countersteer;
  // Street Mode balances progressive slip with faster straight-line acceleration;
  // Grip / Race Mode prioritizes maximum lateral grip, straight-line stability & corner exit traction.
  const frontGripCfg =
    (cfg?.frontGrip ?? 1.12) *
    (custom?.frontTireGrip ?? 1.0) *
    camberFrontBiteMod *
    (isDriftMode ? 1.06 : isStreetMode ? 1.12 : 1.18);
  const rearGripCfg =
    (cfg?.rearGrip ?? 0.9) *
    (custom?.rearTireGrip ?? 1.0) *
    psiRearGripMod *
    camberRearBiteMod *
    (isDriftMode ? 0.86 : isStreetMode ? 1.04 : isGripOrRaceMode ? 1.24 : 1.12);
  const brakeStrengthCfg = (cfg?.brakeStrength ?? 1.12) * brakeSens;
  const dragCoeff = cfg?.dragCoeff ?? 0.33;
  const downforceCoeff = (cfg?.downforceCoeff ?? 0.36) * (isDriftMode ? 1.0 : isStreetMode ? 1.12 : 1.25);

  const redlineRpm = getEngineRedlineRpm(vehicle.soundType, vehicle);

  // Query surface under the car at the start of the step & apply weather grip modifier
  const startRq = queryRoadAt(state.x, state.z, mapId);
  const baseSurfaceType = startRq.surfaceType ?? 'normal_asphalt';
  const isRainWeather = weather === 'light_rain' || weather === 'heavy_rain';
  const currentSurfaceType =
    isRainWeather && (baseSurfaceType === 'normal_asphalt' || baseSurfaceType === 'smooth_asphalt')
      ? 'wet_asphalt'
      : baseSurfaceType;
  const weatherGripMult = getWeatherGripMultiplier(weather);
  const surfaceGrip = (startRq.surfaceGrip ?? 1.0) * weatherGripMult;

  // Vehicle mass & inertia scaling (1280 kg reference JDM coupe)
  const weightKg = Math.max(850, vehicle.weightKg || 1300);
  const massAgilityFactor = Math.max(0.82, Math.min(1.22, 1280 / weightKg));

  const forwardX = Math.sin(state.heading);
  const forwardZ = Math.cos(state.heading);
  const rightX = Math.cos(state.heading);
  const rightZ = -Math.sin(state.heading);

  // Decompose current velocity into forward and lateral components
  let forwardSpeed = state.vx * forwardX + state.vz * forwardZ;
  let lateralSpeed = state.vx * rightX + state.vz * rightZ;
  const prevForwardSpeed = forwardSpeed;

  // Current slip angle in radians (+ when sliding left relative to nose, - when sliding right)
  const currentSpeedTotal = Math.hypot(state.vx, state.vz);
  const currentSpeedKmh = currentSpeedTotal * 3.6;
  const currentSlipRad =
    Math.abs(forwardSpeed) > 1.8 ? Math.atan2(lateralSpeed, Math.abs(forwardSpeed)) : 0;

  // Progressive, non-twitchy steering sensitivity with speed attenuation + analog steering wheel support
  const speedSteerAttenuation = 1 / (1 + Math.pow(currentSpeedKmh / 145, 1.25) * 0.42);
  const digitalSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  let rawSteerInput =
    typeof input.analogSteer === 'number' && Math.abs(input.analogSteer) > 0.005
      ? Math.max(-1, Math.min(1, input.analogSteer))
      : digitalSteer;
  if (typeof input.analogSteer === 'number' && Math.abs(input.analogSteer) > 0.005) {
    const absSteer = Math.abs(rawSteerInput);
    if (absSteer <= steerDeadzone) {
      rawSteerInput = 0;
    } else {
      const rescaled = (absSteer - steerDeadzone) / Math.max(0.01, 1 - steerDeadzone);
      rawSteerInput = Math.sign(rawSteerInput) * Math.pow(rescaled, steerLinearity);
    }
  }
  // Subtle countersteer assist when sliding if steeringAssistLevel > 0 and no strong opposing manual input
  const counterSteerAssistTarget =
    state.isDrifting && Math.abs(currentSlipRad) > 0.14
      ? Math.max(-0.85, Math.min(0.85, currentSlipRad * 1.15)) * steeringAssistLevel * 0.28
      : 0;
  const targetSteer = Math.max(-1, Math.min(1, rawSteerInput + counterSteerAssistTarget));
  const maxSteerRad = (maxSteerAngleDeg / 50) * 0.56;
  const maxSteer =
    maxSteerRad * (0.86 + steerSens * 0.14) * (state.isDrifting ? 1.14 : speedSteerAttenuation);
  const isReturningToCenter =
    Math.abs(rawSteerInput) < 0.05 ||
    Math.abs(targetSteer * maxSteer) < Math.abs(state.steerAngle) * 0.85;
  const baseSteerRate = (state.isDrifting ? 9.8 : 7.4) * steerSens * toeTurnInMod * massAgilityFactor;
  const steerRate = isReturningToCenter ? baseSteerRate * steerReturnSpeed : baseSteerRate;
  const steerAngle =
    state.steerAngle +
    (targetSteer * maxSteer - state.steerAngle) * (1 - Math.exp(-steerRate * dt));

  // ---------------------------------------------------------------------------
  // 1. TRANSMISSION GEAR RATIOS (Vehicle-Specific 5/6-Speed Gearbox + Neutral + Reverse)
  // ---------------------------------------------------------------------------
  const maxGear = getVehicleGearCount(vehicle);
  const shiftDurationSec = getVehicleShiftDurationSec(vehicle, transmissionMode);
  const stockFinalDrive = cfg?.finalDrive ?? 3.9;
  const activeFinalDrive = Math.max(3.1, Math.min(4.9, custom?.finalDriveRatio ?? stockFinalDrive));
  const finalDriveRatioMod = Math.max(0.8, Math.min(1.24, activeFinalDrive / stockFinalDrive));

  // Realistic touge speed scaling: Drift Mode emphasizes 55-120 km/h technical control in 2nd-4th gear
  const modeTopSpeedScale = (isDriftMode ? 0.50 : 0.68) / Math.pow(finalDriveRatioMod, 0.65);
  const topKmh = vehicle.topSpeedKmh * (0.94 + (hpTune - 1.0) * 0.20);
  const ratios = cfg?.gearRatios ?? [3.5, 2.15, 1.52, 1.18, 0.94, 0.76];
  const topRatio = ratios[maxGear - 1] || 0.76;

  const gearMaxSpeedsKmh = [
    0,
    Math.max(topKmh * 0.18, Math.min(topKmh * 0.25, topKmh * (topRatio / ratios[0]) * 1.02)),
    Math.max(topKmh * 0.33, Math.min(topKmh * 0.42, topKmh * (topRatio / ratios[1]) * 1.01)),
    Math.max(topKmh * 0.48, Math.min(topKmh * 0.58, topKmh * (topRatio / ratios[2]))),
    Math.max(topKmh * 0.65, Math.min(topKmh * 0.74, topKmh * (topRatio / ratios[3]))),
    Math.max(topKmh * 0.81, Math.min(topKmh * 0.91, topKmh * (topRatio / ratios[4]))),
    topKmh * 1.02,
  ];
  const finalDriveScale = (activeFinalDrive / 3.9);
  const gearTorqueMultipliers = [
    0,
    (ratios[0] / 2.85) * finalDriveScale,
    (ratios[1] / 1.98) * finalDriveScale,
    (ratios[2] / 1.52) * finalDriveScale,
    (ratios[3] / 1.24) * finalDriveScale,
    (ratios[4] / 1.05) * finalDriveScale,
    (ratios[5] / 0.94) * finalDriveScale,
  ];

  let gear = Math.min(maxGear, state.gear);
  let shiftTimer = Math.max(0, (state.shiftTimer ?? 0) - dt);
  const isManualMode =
    transmissionMode === 'manual' || transmissionMode === 'manual_clutch_assist';

  if (isManualMode) {
    if (input.shiftUp && gear < maxGear) {
      gear = gear === -1 ? 0 : gear + 1;
      shiftTimer = shiftDurationSec;
    } else if (input.shiftDown && gear > -1) {
      gear = gear === 1 ? 0 : gear - 1;
      shiftTimer = shiftDurationSec * 0.92;
    } else if (
      transmissionMode === 'manual_clutch_assist' &&
      gear > 1 &&
      forwardSpeed < 3.2 &&
      !input.handbrake &&
      !input.forward &&
      shiftTimer <= 0
    ) {
      // Clutch-assist anti-stall auto-downshift to 1st when coming to a stop
      gear = 1;
      shiftTimer = shiftDurationSec * 0.75;
    }
  } else {
    // INTELLIGENT AUTOMATIC TRANSMISSION:
    // - Only engage reverse when stopped/reversing and holding Brake/Reverse
    // - Hold current gear during an active drift unless near redline (94%) or bogging (< 2250 RPM)
    if (forwardSpeed <= 0.05 && input.backward && !input.forward && !input.handbrake) {
      gear = -1;
    } else {
      if (gear <= 0) gear = 1;
      if (shiftTimer <= 0) {
        const currentGearTop = (gearMaxSpeedsKmh[gear] || 60) * modeTopSpeedScale;
        const prevGearTop = gear > 1 ? gearMaxSpeedsKmh[gear - 1] * modeTopSpeedScale : 0;
        const activelyDrifting = state.isDrifting || state.driftAngle > 10.5;

        if (activelyDrifting) {
          // Hold gear mid-drift so the transmission never hunts up/down in a corner
          const driftUpshiftSpeed = currentGearTop * 0.95;
          const driftDownshiftSpeed = prevGearTop * 0.56;
          if (
            gear < maxGear &&
            currentSpeedKmh > driftUpshiftSpeed &&
            state.rpm >= redlineRpm * 0.94 &&
            input.forward
          ) {
            gear++;
            shiftTimer = shiftDurationSec;
          } else if (gear > 1 && currentSpeedKmh < driftDownshiftSpeed && state.rpm < 2250) {
            gear--;
            shiftTimer = shiftDurationSec * 0.9;
          }
        } else {
          const upshiftSpeed = currentGearTop * (input.forward ? 0.88 : 0.76);
          const downshiftSpeed = prevGearTop * (input.backward ? 0.78 : 0.66);

          if (
            gear < maxGear &&
            currentSpeedKmh > upshiftSpeed &&
            state.rpm >= redlineRpm * (input.forward ? 0.78 : 0.65)
          ) {
            gear++;
            shiftTimer = shiftDurationSec;
          } else if (gear > 1 && currentSpeedKmh < downshiftSpeed) {
            gear--;
            shiftTimer = shiftDurationSec * 0.9;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. NITROUS OXIDE (N2O) BOOST & RECHARGE
  // ---------------------------------------------------------------------------
  let nitroAmount = state.nitroAmount ?? 100;
  let isBoosting = false;
  if (input.nitro && nitroAmount > 2 && input.forward && gear >= 1 && forwardSpeed > 2) {
    isBoosting = true;
    nitroAmount = Math.max(0, nitroAmount - 26 * dt);
  } else {
    const rechargeRate = state.isDrifting ? 14.5 : currentSpeedKmh > 45 ? 4.2 : 1.8;
    nitroAmount = Math.min(100, nitroAmount + rechargeRate * dt);
  }

  // ---------------------------------------------------------------------------
  // 3. ENGINE ACCELERATION, TORQUE DELIVERY, PROGRESSIVE BRAKING & STATIONARY REV
  // ---------------------------------------------------------------------------
  const powerToWeightRatio = vehicle.horsepower / weightKg;
  const powerMult =
    (vehicle.powerMultiplier ?? 1.0) *
    hpTune *
    (0.64 + powerToWeightRatio * 0.78);
  const torqueCurveMult = getEngineTorqueMultiplier(state.rpm, redlineRpm, vehicle.soundType, vehicle);
  const activeGear = Math.max(1, Math.min(maxGear, Math.abs(gear)));
  const gearTorque = Math.max(0.64, Math.min(1.36, gearTorqueMultipliers[activeGear] ?? 1.0));

  const gearTopSpeedMs = (gearMaxSpeedsKmh[activeGear] / 3.6) * modeTopSpeedScale;
  const isHittingLimiter =
    isManualMode && gear >= 1 && gear <= maxGear && forwardSpeed >= gearTopSpeedMs * 0.99;

  const hasThrottleInput = Boolean(input.forward || (input.analogThrottle ?? 0) > 0.05);
  const hasBrakeInput = Boolean(input.backward || (input.analogBrake ?? 0) > 0.05);
  const rawThrottleCmd =
    typeof input.analogThrottle === 'number' && input.analogThrottle > 0.02
      ? Math.min(1, Math.pow(input.analogThrottle, 1 / throttleSens))
      : input.forward
      ? 1
      : 0;
  // Traction control modulation when sliding at high slip angles
  const tcsCutFactor =
    tractionControlMode === 'full' && Math.abs(currentSlipRad) > 0.16
      ? Math.max(0.32, 1 - Math.abs(currentSlipRad) * 1.1)
      : tractionControlMode === 'sport' && Math.abs(currentSlipRad) > 0.42
      ? Math.max(0.58, 1 - (Math.abs(currentSlipRad) - 0.42) * 0.9)
      : 1.0;
  const throttleCmd = rawThrottleCmd * tcsCutFactor;
  const brakeCmd =
    typeof input.analogBrake === 'number' && input.analogBrake > 0.02
      ? Math.min(1, Math.pow(input.analogBrake, 1 / brakeSens))
      : input.backward
      ? 1
      : 0;

  // Detect stationary engine revving: pressing Rev button, or holding Handbrake + Gas while stopped, or Neutral + Gas
  const isStationaryHandbrakeRev =
    input.handbrake && hasThrottleInput && Math.abs(forwardSpeed) < 1.8;
  const isFreeRevving =
    Boolean(input.revEngine) || isStationaryHandbrakeRev || (gear === 0 && hasThrottleInput);

  // Realistic torque interruption during gear shift + manual low-RPM bogging vs clutch-assist slip
  const shiftInterruptFactor =
    shiftTimer > 0.03
      ? 0.18 + 0.82 * Math.max(0, 1 - shiftTimer / Math.max(0.12, shiftDurationSec))
      : 1.0;
  const lowRpmBogFactor =
    transmissionMode === 'manual' && gear >= 3 && state.rpm < 2350
      ? 0.56
      : transmissionMode === 'manual_clutch_assist' && gear >= 2 && state.rpm < 2600
      ? 0.88
      : 1.0;
  const clutchEngagement = isFreeRevving ? 0.0 : shiftInterruptFactor * lowRpmBogFactor;
  const nitroBoostMult = isBoosting ? 1.24 : 1.0;
  const isRwd = vehicle.drivetrain === 'RWD';
  const isAwd = vehicle.drivetrain === 'AWD';
  const isFwd = vehicle.drivetrain === 'FWD';
  const longitudinalTraction = isAwd
    ? 0.42 + surfaceGrip * 0.62
    : (0.28 + surfaceGrip * 0.70) * Math.max(0.84, Math.min(1.16, psiRearGripMod));

  // Progressive acceleration rate for authentic mountain touge driving (controlled 55-120 km/h drifts, not drag racing)
  const baseAccelRate = isDriftMode ? 7.8 : 11.8;
  const driftForwardTraction = state.isDrifting
    ? Math.max(0.36, 0.80 - Math.min(0.44, (state.driftAngle / 48) * 0.44))
    : 1.0;

  const engineAccel =
    baseAccelRate *
    powerMult *
    torqueCurveMult *
    gearTorque *
    clutchEngagement *
    nitroBoostMult *
    longitudinalTraction *
    driftForwardTraction;

  const reverseAccel = 8.4 * massAgilityFactor * surfaceGrip;
  const absDecelMod = absEnabled ? 1.0 : brakeCmd > 0.85 ? 0.86 : 1.0;
  const brakeDecel = 24.5 * brakeStrengthCfg * absDecelMod * (0.38 + surfaceGrip * 0.62);
  const maxForwardSpeed = (topKmh / 3.6) * modeTopSpeedScale * (isBoosting ? 1.10 : 1.0);

  let throttle = 0;
  let brake = 0;

  const offRoadDrag =
    currentSurfaceType === 'grass'
      ? 1.05
      : currentSurfaceType === 'dirt' || currentSurfaceType === 'gravel'
      ? 0.68
      : currentSurfaceType === 'shoulder'
      ? 0.18
      : 0;
  const aeroDragDecel = dragCoeff * 0.0068 * forwardSpeed * Math.abs(forwardSpeed);
  // Only apply slope resistance when moving at speed (> 2.5 m/s) so stationary cars never roll backward into R on hills
  const slopeGravityDecel =
    forwardSpeed > 2.5 ? (startRq.slopeY || 0) * 9.81 * 0.28 : 0;

  if (isFreeRevving) {
    throttle = throttleCmd || 1;
    if (Math.abs(forwardSpeed) < 0.8) {
      forwardSpeed = 0;
    } else {
      forwardSpeed *= Math.exp(-3.5 * dt);
    }
  } else if (isManualMode) {
    if (gear === -1) {
      if (hasThrottleInput) {
        throttle = 0.85 * throttleCmd;
        forwardSpeed = Math.max(-11.5, forwardSpeed - reverseAccel * throttleCmd * dt);
      } else if (hasBrakeInput) {
        brake = brakeCmd;
        forwardSpeed = Math.min(0, forwardSpeed + brakeDecel * brakeCmd * dt);
      } else {
        forwardSpeed *= Math.exp(-(0.95 + offRoadDrag) * dt);
        if (Math.abs(forwardSpeed) < 0.12) forwardSpeed = 0;
      }
    } else if (gear === 0) {
      throttle = throttleCmd;
      brake = brakeCmd;
      if (brake > 0) {
        if (Math.abs(forwardSpeed) < 0.4) forwardSpeed = 0;
        else forwardSpeed -= Math.sign(forwardSpeed) * brakeDecel * brake * dt;
      } else {
        forwardSpeed *= Math.exp(-(0.48 + offRoadDrag) * dt);
        if (Math.abs(forwardSpeed) < 0.12) forwardSpeed = 0;
      }
    } else {
      if (hasThrottleInput) {
        if (forwardSpeed < -0.35) {
          brake = 1;
          forwardSpeed = Math.min(0, forwardSpeed + brakeDecel * dt);
        } else {
          forwardSpeed = Math.max(0, forwardSpeed);
          throttle = throttleCmd;
          if (!isHittingLimiter) {
            const speedRatio = Math.max(0, forwardSpeed / maxForwardSpeed);
            const effectiveAccel =
              engineAccel * throttle * Math.max(0.06, 1 - Math.pow(speedRatio, 1.28) * 0.86);
            forwardSpeed +=
              (effectiveAccel - aeroDragDecel - slopeGravityDecel - offRoadDrag * forwardSpeed * 0.38) * dt;
          } else {
            forwardSpeed = Math.min(forwardSpeed, gearTopSpeedMs);
          }
        }
      } else if (hasBrakeInput) {
        brake = brakeCmd;
        forwardSpeed = Math.max(0, forwardSpeed - brakeDecel * brake * dt);
      } else {
        const engineBrakeDrag = 0.48 + (7 - activeGear) * 0.11 + offRoadDrag;
        forwardSpeed = Math.max(
          0,
          (forwardSpeed - (aeroDragDecel + slopeGravityDecel) * dt) * Math.exp(-engineBrakeDrag * dt)
        );
        if (forwardSpeed < 0.12) forwardSpeed = 0;
      }
    }
  } else {
    // AUTOMATIC MODE
    if (hasThrottleInput) {
      if (forwardSpeed < -0.35) {
        brake = 1;
        forwardSpeed = Math.min(0, forwardSpeed + brakeDecel * dt);
      } else {
        forwardSpeed = Math.max(0, forwardSpeed);
        throttle = throttleCmd;
        const speedRatio = Math.max(0, forwardSpeed / maxForwardSpeed);
        const effectiveAccel =
          engineAccel * throttle * Math.max(0.06, 1 - Math.pow(speedRatio, 1.28) * 0.86);
        forwardSpeed +=
          (effectiveAccel - aeroDragDecel - slopeGravityDecel - offRoadDrag * forwardSpeed * 0.38) * dt;
      }
    } else if (hasBrakeInput) {
      if (forwardSpeed > 0.05) {
        brake = brakeCmd;
        forwardSpeed = Math.max(0, forwardSpeed - brakeDecel * brake * dt);
      } else if (!input.handbrake) {
        throttle = 0.65 * brakeCmd;
        forwardSpeed = Math.max(-11.5, forwardSpeed - reverseAccel * brakeCmd * dt);
      } else {
        brake = 1;
        forwardSpeed = 0;
      }
    } else {
      const engineBrakeDrag = 0.52 + (7 - activeGear) * 0.09 + offRoadDrag;
      if (forwardSpeed >= 0) {
        forwardSpeed = Math.max(
          0,
          (forwardSpeed - (aeroDragDecel + slopeGravityDecel) * dt) * Math.exp(-engineBrakeDrag * dt)
        );
      } else {
        forwardSpeed *= Math.exp(-engineBrakeDrag * 2.2 * dt);
      }
      if (Math.abs(forwardSpeed) < 0.12) forwardSpeed = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. REALISTIC TIRE GRIP, WEIGHT TRANSFER & DRIFT vs RACE MODE PHYSICS
  // ---------------------------------------------------------------------------
  const longAccelG = (forwardSpeed - prevForwardSpeed) / dt / 9.81;
  const staticWeightOffset = (frontWeightBiasRatio - 0.52) * 0.65;
  const frontLoadTransfer = Math.max(
    -0.25,
    Math.min(
      0.32,
      staticWeightOffset - longAccelG * 0.16 + brake * 0.12 - throttle * 0.08
    )
  );

  const aeroGripBonus = 1 + downforceCoeff * Math.min(0.28, Math.pow(currentSpeedKmh / 190, 2) * 0.25);
  const absSteerGripRetention = !absEnabled && brake > 0.82 ? 0.72 : 1.0;
  const effectiveFrontGrip =
    frontGripCfg * surfaceGrip * aeroGripBonus * absSteerGripRetention * (1 + frontLoadTransfer * 0.65);
  const effectiveRearGrip =
    rearGripCfg * surfaceGrip * aeroGripBonus * (1 - frontLoadTransfer * 0.55);

  // SPACE (Handbrake): locks rear tires and initiates a controllable drift when combined with steering
  if (input.handbrake && Math.abs(forwardSpeed) > 2.5) {
    forwardSpeed *= Math.exp(-0.78 * handbrakeStrength * dt);
    if (Math.abs(steerAngle) > 0.03) {
      const hbKick =
        (isRwd ? 7.4 : isAwd ? 6.6 : 7.5) *
        handbrakeStrength *
        (isDriftMode ? 1.15 : 0.85);
      lateralSpeed +=
        -Math.sign(steerAngle) *
        Math.min(Math.abs(forwardSpeed) * 0.42, 9.2) *
        dt *
        hbKick *
        (0.75 + diffDecelLock * 0.32);
    }
  }

  // Natural corner-entry weight transfer (trail-braking / lift-off oversteer when turning sharply at speed)
  const isLiftOffEntry = throttle === 0 && state.throttle > 0.4 && forwardSpeed > 11.0;
  if ((brake > 0.5 || isLiftOffEntry) && Math.abs(steerAngle) > 0.24 && forwardSpeed > 11.0) {
    const entryTransfer =
      (isDriftMode ? 0.20 : 0.08) *
      (0.85 + diffDecelLock * 0.35) *
      massAgilityFactor;
    lateralSpeed += -Math.sign(steerAngle) * forwardSpeed * entryTransfer * dt;
  }

  // Throttle-controlled rear oversteer & drift angle modulation
  // Requires intentional steering angle (> 0.19 rad) or an existing slide so gentle steering inputs never auto-slide
  if (
    throttle > 0.45 &&
    (Math.abs(steerAngle) > 0.19 || (state.isDrifting && Math.abs(steerAngle) > 0.10)) &&
    forwardSpeed > 5.0
  ) {
    const drivetrainSlideFactor = isRwd ? 1.0 : isAwd ? 0.66 : 0.26;
    // In Race Mode, rear tires maintain strong traction under throttle; in Drift Mode, throttle modulates slide angle
    const modeSlideMult = isDriftMode ? 1.22 : 0.46;
    const throttleSlideForce =
      throttle *
      powerMult *
      drivetrainSlideFactor *
      modeSlideMult *
      (0.68 + diffAccelLock * 0.42) *
      (1.08 / Math.max(0.6, effectiveRearGrip)) *
      3.08 *
      dt;
    lateralSpeed += -Math.sign(steerAngle) * throttleSlideForce;
  }

  // Turning / Yaw dynamics with natural self-aligning countersteering stabilization
  const speedFactor = Math.min(1.0, Math.abs(forwardSpeed) / 4.5);
  const directionSign = forwardSpeed >= -0.2 ? 1 : -1;
  const drivetrainYawMult = isRwd ? 1.05 : isAwd ? 0.98 : 0.92;
  const steerYawInput =
    steerAngle *
    2.38 *
    speedFactor *
    directionSign *
    drivetrainYawMult *
    effectiveFrontGrip *
    (input.handbrake ? 1.28 * handbrakeStrength : 1.0) *
    massAgilityFactor;

  // Self-aligning front-axle restoring yaw rate proportional to slip angle (enhanced by driftAssist & stabilityControl)
  const assistSelfAlignBoost = 1.0 + driftAssistLevel * 0.28 + stabilityControlLevel * 0.35;
  const slipSelfAlign =
    Math.abs(currentSlipRad) > 0.06
      ? currentSlipRad *
        (isDriftMode ? 1.50 : 1.95) *
        assistSelfAlignBoost *
        effectiveFrontGrip *
        rearToeStabilityMod *
        speedFactor
      : 0;

  const targetYawRate = steerYawInput + slipSelfAlign;
  const yawResponseRate = (state.isDrifting ? 11.6 : 10.2) * suspStiff;

  let angularVelocity =
    state.angularVelocity +
    (targetYawRate - state.angularVelocity) * (1 - Math.exp(-yawResponseRate * dt));

  let newHeading = state.heading + angularVelocity * dt;

  let newForwardX = Math.sin(newHeading);
  let newForwardZ = Math.cos(newHeading);
  let newRightX = Math.cos(newHeading);
  let newRightZ = -Math.sin(newHeading);

  // Centrifugal lateral slip from cornering yaw
  const centrifugalSlip =
    -angularVelocity * forwardSpeed * (isDriftMode ? 0.40 : 0.26) * (0.86 + diffAccelLock * 0.16) * dt;
  lateralSpeed += centrifugalSlip;

  // AWD front-axle pull on corner exit; FWD understeer stabilization
  if (isAwd && state.isDrifting && throttle > 0.45) {
    lateralSpeed *= Math.exp(-1.18 * surfaceGrip * dt);
    forwardSpeed += 1.6 * throttle * surfaceGrip * dt;
  } else if (isFwd && throttle > 0.55 && !input.handbrake) {
    lateralSpeed *= Math.exp(-2.1 * surfaceGrip * dt);
  }

  // Smooth lateral tire grip curve for predictable drift holding & clean recovery
  const steerIntensity = Math.min(1.0, Math.abs(steerAngle) / 0.36);
  const driftHoldFactor =
    throttle > 0.35 && Math.abs(steerAngle) > 0.12
      ? 1.0 - steerIntensity * (isRwd ? 0.55 : isAwd ? 0.44 : 0.30) * (isDriftMode ? 1.10 : 0.65)
      : 1.0;

  const isCountersteering =
    Math.abs(currentSlipRad) > 0.14 && Math.sign(steerAngle) === Math.sign(currentSlipRad);
  const recoveryGripBoost =
    Math.abs(steerAngle) < 0.08 && !input.handbrake
      ? 1.55 * rearToeStabilityMod * (1 + stabilityControlLevel * 0.25)
      : isCountersteering
      ? 1.30 * camberFrontBiteMod * (1 + driftAssistLevel * 0.22)
      : 1.0 + stabilityControlLevel * 0.18;

  const activeDiffLock = throttle > 0.2 ? diffAccelLock : diffDecelLock;
  const baseLateralGrip = input.handbrake
    ? 1.25 / Math.max(0.8, handbrakeStrength)
    : (3.75 * effectiveRearGrip * driftHoldFactor * recoveryGripBoost) /
      Math.max(0.75, 0.68 + activeDiffLock * 0.38);

  lateralSpeed *= Math.exp(-baseLateralGrip * dt);

  // Progressive slip angle ceiling scaled by Garage Max Steering Angle (35-60 deg) and stability/drift assists
  const steerAngleSlipScale = (maxSteerAngleDeg / 50) * (1 - stabilityControlLevel * 0.16);
  const maxLateralRatio = input.handbrake
    ? 0.82 * steerAngleSlipScale
    : isDriftMode
    ? (isRwd ? 0.76 : 0.68) * steerAngleSlipScale
    : 0.48;
  const maxLateral = Math.abs(forwardSpeed) * maxLateralRatio;
  if (Math.abs(lateralSpeed) > maxLateral) {
    lateralSpeed = Math.sign(lateralSpeed) * maxLateral;
  }

  let vx = newForwardX * forwardSpeed + newRightX * lateralSpeed;
  let vz = newForwardZ * forwardSpeed + newRightZ * lateralSpeed;

  let nextX = state.x + vx * dt;
  let nextZ = state.z + vz * dt;

  // ---------------------------------------------------------------------------
  // 5. NON-BOUNCING INELASTIC BARRIER, BRIDGE, PLAZA & TREE TRUNK COLLISIONS
  // ---------------------------------------------------------------------------
  const rq = queryRoadAt(nextX, nextZ, mapId);
  let collisionImpact = 0;
  let collisionType: 'none' | 'guardrail' | 'concrete' | 'tree' = 'none';
  let minBarrierClearance = 99;

  const halfLength = (vehicle.dimensions.length || 4.5) * 0.5;
  const halfWidth = (vehicle.dimensions.width || 1.86) * 0.5;

  if (!rq.isPlaza && rq.distanceToCenter < rq.roadHalfWidth + 20) {
    const nx = -rq.tangentZ;
    const nz = rq.tangentX;
    const tx = rq.tangentX;
    const tz = rq.tangentZ;

    const obbLateralRadius =
      Math.abs(newForwardX * nx + newForwardZ * nz) * halfLength +
      Math.abs(newRightX * nx + newRightZ * nz) * halfWidth;

    const leftIsHardWall = Boolean(rq.isTunnel || rq.isBridge);
    const rightIsHardWall = Boolean(rq.isTunnel || rq.isBridge);
    const leftHasRail = Boolean(rq.hasGuardrailLeft || leftIsHardWall);
    const rightHasRail = Boolean(rq.hasGuardrailRight || rightIsHardWall);

    const leftBarrierFace = leftHasRail ? rq.roadHalfWidth + 0.45 : rq.roadHalfWidth + 1.35;
    const rightBarrierFace = rightHasRail ? rq.roadHalfWidth + 0.45 : rq.roadHalfWidth + 1.35;

    const leftCornerExtent = rq.signedLateralOffset + obbLateralRadius;
    const rightCornerExtent = -rq.signedLateralOffset + obbLateralRadius;

    minBarrierClearance = Math.min(
      leftHasRail ? leftBarrierFace - leftCornerExtent : 99,
      rightHasRail ? rightBarrierFace - rightCornerExtent : 99
    );

    let hitSide: 1 | -1 | 0 = 0;
    let penetration = 0;

    if (leftCornerExtent > leftBarrierFace) {
      hitSide = 1;
      penetration = leftCornerExtent - leftBarrierFace;
      collisionType = leftIsHardWall ? 'concrete' : 'guardrail';
    } else if (rightCornerExtent > rightBarrierFace) {
      hitSide = -1;
      penetration = rightCornerExtent - rightBarrierFace;
      collisionType = rightIsHardWall ? 'concrete' : 'guardrail';
    }

    if (hitSide !== 0 && penetration > 0) {
      const pushDist = Math.min(penetration, 3.0);
      nextX -= nx * hitSide * pushDist;
      nextZ -= nz * hitSide * pushDist;

      const vTangent = vx * tx + vz * tz;
      const vNormal = vx * nx + vz * nz;
      const outwardNormalSpeed = vNormal * hitSide;
      const totalImpactSpeed = Math.hypot(vx, vz);

      if (outwardNormalSpeed > 0) {
        if (totalImpactSpeed > 2.5) {
          collisionImpact = Math.min(
            1.0,
            (outwardNormalSpeed / 12.0 + totalImpactSpeed / 50.0) * Math.min(1.0, 0.35 + penetration * 1.4)
          );
        }

        const impactAngleRatio = Math.min(1.0, outwardNormalSpeed / Math.max(1.0, totalImpactSpeed));
        const wallFriction = Math.max(0.55, 0.94 - impactAngleRatio * 0.34);
        const newVTangent = vTangent * wallFriction;

        vx = tx * newVTangent;
        vz = tz * newVTangent;
      } else {
        vx *= 0.96;
        vz *= 0.96;
        if (totalImpactSpeed > 6.0) {
          collisionImpact = Math.max(collisionImpact, 0.18);
        }
      }

      const roadHeading =
        vTangent >= -0.5 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz);
      let headingDiff = roadHeading - newHeading;
      while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
      while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

      newHeading += headingDiff * Math.min(0.38, 0.14 + penetration * 0.22);
      angularVelocity *= 0.25;

      newForwardX = Math.sin(newHeading);
      newForwardZ = Math.cos(newHeading);
      newRightX = Math.cos(newHeading);
      newRightZ = -Math.sin(newHeading);
      forwardSpeed = vx * newForwardX + vz * newForwardZ;
      lateralSpeed = vx * newRightX + vz * newRightZ;
    }
  } else if (rq.isPlaza) {
    const mapDef = MAPS_DATA[mapId];
    for (const plaza of mapDef.plazas) {
      const pdx = nextX - plaza.x;
      const pdz = nextZ - plaza.z;
      const normDist = Math.hypot(pdx / plaza.radiusX, pdz / plaza.radiusZ);
      if (normDist > 0.96 && normDist < 1.25 && rq.distanceToCenter > 10.5) {
        const pen = normDist - 0.96;
        const scale = 0.96 / normDist;
        nextX = plaza.x + pdx * scale;
        nextZ = plaza.z + pdz * scale;
        const rLen = Math.hypot(pdx, pdz) || 1;
        const rnx = pdx / rLen;
        const rnz = pdz / rLen;
        const vn = vx * rnx + vz * rnz;
        if (vn > 0) {
          collisionImpact = Math.min(1.0, (vn / 14) * Math.min(1, pen * 8));
          collisionType = 'guardrail';
          vx -= rnx * vn;
          vz -= rnz * vn;
        }
        vx *= 0.88;
        vz *= 0.88;
        angularVelocity *= 0.35;
        forwardSpeed = vx * newForwardX + vz * newForwardZ;
        lateralSpeed = vx * newRightX + vz * newRightZ;
      }
    }
  }

  // Solid tree trunk collision when driving off-road
  if (!rq.onRoad && !rq.isPlaza) {
    const trees = getMapTreeColliders(mapId);
    const carRadius = Math.min(halfWidth, 0.95);
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const tdx = nextX - tree.x;
      const tdz = nextZ - tree.z;
      const minSep = carRadius + tree.trunkRadius;
      const distSq = tdx * tdx + tdz * tdz;
      if (distSq < minSep * minSep && distSq > 1e-5) {
        const dist = Math.sqrt(distSq);
        const pen = minSep - dist;
        const tnx = tdx / dist;
        const tnz = tdz / dist;
        nextX += tnx * pen;
        nextZ += tnz * pen;

        const vn = vx * tnx + vz * tnz;
        if (vn < 0) {
          collisionImpact = Math.max(collisionImpact, Math.min(1.0, -vn / 11));
          collisionType = 'tree';
          vx -= tnx * vn;
          vz -= tnz * vn;
          vx *= 0.72;
          vz *= 0.72;
          angularVelocity *= 0.3;
          forwardSpeed = vx * newForwardX + vz * newForwardZ;
          lateralSpeed = vx * newRightX + vz * newRightZ;
        }
        break;
      }
    }
  }

  const worldLimit = 225;
  const radial = Math.hypot(nextX, nextZ);
  if (radial > worldLimit) {
    const scale = worldLimit / radial;
    nextX *= scale;
    nextZ *= scale;
  }

  const finalRq = queryRoadAt(nextX, nextZ, mapId);
  const targetY =
    finalRq.onRoad || finalRq.isPlaza
      ? finalRq.elevation
      : Math.max(getTerrainHeight(nextX, nextZ, mapId), finalRq.elevation - 1.5);

  const groundTrackRate = finalRq.onRoad || finalRq.isPlaza ? 38 : 22;
  const newY = state.y + (targetY - state.y) * (1 - Math.exp(-groundTrackRate * dt));
  const vy = (newY - state.y) / dt;
  const isGrounded = Math.abs(newY - targetY) < 0.22;

  const speed = Math.hypot(vx, vz);
  const speedKmh = speed * 3.6;

  // ---------------------------------------------------------------------------
  // 6. DRIFT ANGLE, SILENT VISUAL SCORING, TRANSITIONS, NEAR-MISSES & PRACTICE
  // ---------------------------------------------------------------------------
  let driftAngle = 0;
  let signedDriftAngle = 0;
  if (speed > 2.8 && forwardSpeed > 1.8) {
    const velAngle = Math.atan2(vx, vz);
    let diff = velAngle - newHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    signedDriftAngle = (diff * 180) / Math.PI;
    driftAngle = Math.abs(signedDriftAngle);
  }

  // Prevent points for stationary spinning: requires forwardSpeed > 2.2 m/s and speedKmh > 20
  const isDrifting =
    isGrounded &&
    speedKmh > 20 &&
    forwardSpeed > 2.2 &&
    (driftAngle > 9.0 || (input.handbrake && Math.abs(steerAngle) > 0.12 && speedKmh > 24));

  // Front wheels visibly steer into the countersteering direction during a drift
  const driftRad = (signedDriftAngle * Math.PI) / 180;
  const targetVisualSteer = isDrifting
    ? Math.max(-0.68, Math.min(0.68, driftRad * 0.84 + steerAngle * 0.5))
    : steerAngle;
  const visualFrontSteerAngle =
    (state.visualFrontSteerAngle ?? state.steerAngle) +
    (targetVisualSteer - (state.visualFrontSteerAngle ?? state.steerAngle)) *
      (1 - Math.exp(-16 * dt));

  let currentDriftPoints = state.currentDriftPoints;
  let driftMultiplier = state.driftMultiplier;
  let totalDriftScore = state.totalDriftScore;
  let bestDriftChain = state.bestDriftChain;
  let driftComboCount = state.driftComboCount ?? 0;
  let driftNotificationText = state.driftNotificationText ?? '';
  let driftNotificationTimer = Math.max(0, (state.driftNotificationTimer ?? 0) - dt);
  if (driftNotificationTimer <= 0) {
    driftNotificationText = '';
  }
  let nearMissCount = state.nearMissCount ?? 0;

  const allowNotifications = settings?.showDriftNotifications !== false;

  if (collisionImpact > 0.32 && currentDriftPoints > 0) {
    // Hard barrier impact breaks the active drift chain
    currentDriftPoints = 0;
    driftMultiplier = 1.0;
    driftComboCount = 0;
    if (allowNotifications) {
      driftNotificationText = 'DRIFT LOST';
      driftNotificationTimer = 1.0;
    }
  } else if (isDrifting) {
    const cornerBonus = Math.min(1.4, 1.0 + Math.abs(angularVelocity) * 0.25);
    const pointsRate = (driftAngle * 4.8 + speedKmh * 1.95) * driftMultiplier * cornerBonus;
    currentDriftPoints += pointsRate * dt;
    driftMultiplier = Math.min(5.0, driftMultiplier + 0.30 * dt);

    if (driftComboCount === 0) {
      driftComboCount = 1;
    }

    // Detect clean Drift Transition (flipping drift direction smoothly during a chain — silent mid-drift bonus)
    if (
      Math.abs(state.signedDriftAngle) > 8 &&
      Math.abs(signedDriftAngle) > 8 &&
      Math.sign(state.signedDriftAngle) !== Math.sign(signedDriftAngle) &&
      currentDriftPoints > 120
    ) {
      currentDriftPoints += 350 * driftMultiplier;
      driftMultiplier = Math.min(5.0, driftMultiplier + 0.45);
      driftComboCount += 1;
    }

    // Detect Roadside Near-Miss Bonus (drifting close to guardrail at speed without hitting it)
    if (
      collisionImpact === 0 &&
      minBarrierClearance > 0.05 &&
      minBarrierClearance < 0.85 &&
      driftAngle > 16 &&
      speedKmh > 42
    ) {
      currentDriftPoints += 220 * dt * 2.5;
      if ((state.nearMissCount ?? 0) === nearMissCount && Math.random() < dt * 1.5) {
        nearMissCount += 1;
      }
    }

    bestDriftChain = Math.max(bestDriftChain, Math.round(currentDriftPoints));
  } else if (currentDriftPoints > 0) {
    // Show completion summary notification ONLY after the drift chain is finished and banked
    const banked = Math.round(currentDriftPoints);
    totalDriftScore += banked;
    if (allowNotifications && banked >= 250) {
      const rankPrefix =
        banked >= 5000
          ? 'MASTER DRIFT'
          : banked >= 2200
          ? 'GREAT DRIFT'
          : 'DRIFT BANKED';
      driftNotificationText = `${rankPrefix} +${banked.toLocaleString()} PTS`;
      driftNotificationTimer = 1.5;
    }
    currentDriftPoints = 0;
    driftMultiplier = 1.0;
    driftComboCount = 0;
  }

  // Update live Drift Run Statistics (Max Angle, Total Duration, Smoothness %, Consistency %)
  const maxDriftAngleDeg = Math.max(
    state.maxDriftAngleDeg ?? 0,
    isDrifting ? Math.round(driftAngle) : 0
  );
  const totalDriftDurationSec =
    (state.totalDriftDurationSec ?? 0) + (isDrifting ? dt : 0);
  const prevSmoothness = state.driftSmoothnessPct ?? 92;
  const prevConsistency = state.driftConsistencyPct ?? 90;
  const steerJerk = Math.abs(steerAngle - state.steerAngle) / dt;
  const instantSmoothness = isDrifting
    ? Math.max(62, Math.min(100, 100 - Math.max(0, steerJerk - 1.2) * 8.5))
    : prevSmoothness;
  const driftSmoothnessPct = Math.round(
    prevSmoothness + (instantSmoothness - prevSmoothness) * Math.min(1, dt * 2.2)
  );
  const instantConsistency =
    collisionImpact > 0.3
      ? Math.max(55, prevConsistency - 12)
      : isDrifting && driftAngle >= 14 && driftAngle <= 52
      ? Math.min(100, prevConsistency + dt * 3.5)
      : prevConsistency;
  const driftConsistencyPct = Math.round(instantConsistency);

  // Update interactive Drift Practice Mode steps
  const prevSteps = state.practiceStepsCompleted ?? [false, false, false, false, false];
  const practiceStepsCompleted: [boolean, boolean, boolean, boolean, boolean] = [
    prevSteps[0] || (isDrifting && driftAngle > 12),
    prevSteps[1] || (isDrifting && isCountersteering && driftAngle > 14),
    prevSteps[2] || (isDrifting && throttle > 0.45 && driftAngle > 18),
    prevSteps[3] || (input.handbrake && speedKmh > 25 && driftAngle > 10),
    prevSteps[4] || driftComboCount >= 2 || bestDriftChain >= 1200,
  ];

  // ---------------------------------------------------------------------------
  // 7. ENGINE RPM, SHIFT RECOVERY, STATIONARY REV & EXHAUST BACKFIRE / OVERRUN
  // ---------------------------------------------------------------------------
  const gearMin = activeGear > 1 ? gearMaxSpeedsKmh[activeGear - 1] * modeTopSpeedScale * 0.55 : 0;
  const gearMax = (gearMaxSpeedsKmh[activeGear] || 65) * modeTopSpeedScale;
  const gearProgress = Math.min(
    1.04,
    Math.max(0, (speedKmh - gearMin) / Math.max(10, gearMax - gearMin))
  );

  let targetRpm = 950;
  if (isFreeRevving) {
    targetRpm = 950 + throttle * (redlineRpm - 950);
  } else if (gear === 0) {
    targetRpm = 950 + throttle * (redlineRpm - 1100);
  } else if (gear === -1) {
    targetRpm = 1050 + Math.min(1, Math.abs(forwardSpeed) / 11.5) * (redlineRpm * 0.62);
  } else {
    const wheelSlipRpmBoost = isDrifting ? 460 + throttle * 480 : 0;
    const nitroRpmBoost = isBoosting ? 380 : 0;
    const clutchAssistFloor =
      transmissionMode === 'manual_clutch_assist' && throttle > 0.3 ? 2650 : 1050;
    targetRpm = Math.max(
      clutchAssistFloor,
      1050 + gearProgress * (redlineRpm - 1250) + wheelSlipRpmBoost + nitroRpmBoost
    );
  }

  // Rev limiter fuel-cut flutter near redline
  if (targetRpm >= redlineRpm - 140 && (throttle > 0.5 || isFreeRevving)) {
    const bounce = Math.sin((state.distanceDriven + 1) * 18 + rawDt * 120) > 0 ? 115 : -190;
    targetRpm = redlineRpm + bounce;
  }

  // Smooth mechanical RPM transition during gear shift (natural RPM drop on upshift, rev-match blip on downshift)
  if (shiftTimer > 0.02) {
    const shiftProgress = 1 - shiftTimer / Math.max(0.12, shiftDurationSec);
    const clutchSlipDip = 0.89 + 0.11 * shiftProgress;
    targetRpm *= clutchSlipDip;
  }

  const rpmRate = isFreeRevving ? 16 : shiftTimer > 0 ? 9.5 : 11.5;
  const rpm = state.rpm + (targetRpm - state.rpm) * (1 - Math.exp(-rpmRate * dt));

  // Realistic Exhaust Backfire & Overrun Flame Burst Trigger
  // Differentiates NA engines (short, crisp high-RPM decel pops) vs. Turbo/Rotary (upshift & anti-lag bursts)
  // and scales with Garage customization (backfireFrequency, flameIntensity, exhaustSystem, turboSetup).
  const isEffectiveTurbo =
    Boolean(cfg?.turbocharged) ||
    (custom?.turboSetup !== undefined && custom.turboSetup !== 'stock_na_or_oem');
  const userBackfireFreq = Math.max(0, Math.min(1.2, custom?.backfireFrequency ?? 0.75));
  const userFlameInt = Math.max(0, Math.min(1.4, custom?.flameIntensity ?? 0.95));
  const sysFlameMult =
    custom?.exhaustSystem === 'straight_pipe' || custom?.exhaustSystem === 'titanium_race'
      ? 1.22
      : custom?.exhaustSystem === 'stock_oem'
      ? 0.65
      : 1.0;

  let backfireTimer = Math.max(0, state.backfireTimer - dt);
  let backfireIntensity = state.backfireIntensity ?? 0;

  const highRpmLift = state.throttle > 0.45 && throttle < 0.08 && rpm > redlineRpm * 0.52;
  const gearShifted = gear !== state.gear && state.rpm > 3500;
  const handbrakeInitiated = input.handbrake && !state.handbrake && speedKmh > 30;
  const antiLagOverrun =
    isEffectiveTurbo &&
    custom?.turboSetup === 'anti_lag_sequential' &&
    throttle < 0.15 &&
    rpm > redlineRpm * 0.56 &&
    Math.random() < 0.18 * userBackfireFreq;
  const limiterPop =
    (isHittingLimiter || (isFreeRevving && rpm > redlineRpm * 0.85)) &&
    throttle > 0.65 &&
    Math.random() < 0.46 * Math.max(0.35, userBackfireFreq);

  if (
    userFlameInt > 0.02 &&
    userBackfireFreq > 0.02 &&
    (gearShifted || handbrakeInitiated || highRpmLift || limiterPop || antiLagOverrun || isBoosting)
  ) {
    // Short, crisp flame bursts (0.065s - 0.125s) so flames never look like static cones
    const baseBurstDur = isEffectiveTurbo ? 0.095 + Math.random() * 0.035 : 0.068 + Math.random() * 0.028;
    backfireTimer = isBoosting ? 0.085 : baseBurstDur;
    const rawInt = isBoosting
      ? 0.96
      : gearShifted
      ? isEffectiveTurbo
        ? 0.92
        : 0.78
      : highRpmLift || antiLagOverrun
      ? 0.84
      : 0.88;
    backfireIntensity = Math.min(1.35, rawInt * userFlameInt * sysFlameMult);
  } else if (backfireTimer <= 0) {
    backfireIntensity = 0;
  }

  // Exhaust vapor intensity (subtle and realistic: light vapor at idle, revving, or gear shift)
  const exhaustSmokeIntensity = Math.min(
    0.42,
    isFreeRevving
      ? 0.28
      : speedKmh < 12
      ? 0.14 + throttle * 0.15
      : shiftTimer > 0
      ? 0.26
      : throttle * 0.11
  );

  // Automatic, physics-driven tire slip ratio
  const isBrakingHard = isGrounded && brake > 0.75 && speedKmh > 52;
  const wheelSpinLaunch =
    isGrounded &&
    !isFreeRevving &&
    throttle > 0.85 &&
    gear === 1 &&
    speedKmh > 6 &&
    speedKmh < 32 &&
    isRwd;
  const tireSlipRatio = !isGrounded
    ? 0
    : isDrifting
    ? Math.min(1.85, 0.45 + (driftAngle / 42) * 0.85 + throttle * 0.48)
    : input.handbrake && speedKmh > 20
    ? 1.15
    : isBrakingHard
    ? 0.55
    : wheelSpinLaunch
    ? 0.58
    : 0;

  // ---------------------------------------------------------------------------
  // 8. INDEPENDENT 4-CORNER SUSPENSION TRAVEL, BODY ROLL, DIVE, SQUAT & ROAD SLOPE
  // ---------------------------------------------------------------------------
  const latAccelG = (angularVelocity * forwardSpeed) / 9.81;

  const surfaceChatterAmp =
    currentSurfaceType === 'gravel' || currentSurfaceType === 'dirt'
      ? 0.0065
      : currentSurfaceType === 'grass'
      ? 0.0085
      : currentSurfaceType === 'shoulder'
      ? 0.0038
      : 0.0022;
  const roadRipple =
    speed > 2 ? Math.sin(state.distanceDriven * 1.55) * surfaceChatterAmp * Math.min(1, speed / 20) : 0;

  const revChassisTorqueRock = isFreeRevving ? Math.sin(rpm * 0.025) * 0.014 : 0;
  const targetRoll =
    (-latAccelG * 0.036 - angularVelocity * Math.min(speed / 15, 1.15) * 0.038) /
      Math.max(0.75, suspStiff) +
    revChassisTorqueRock;
  const targetPitch =
    (brake * 0.028 - throttle * 0.022 - longAccelG * 0.012) /
    Math.max(0.75, suspStiff);

  const bodyRoll = state.bodyRoll + (targetRoll - state.bodyRoll) * (1 - Math.exp(-11 * suspStiff * dt));
  const bodyPitch =
    state.bodyPitch + (targetPitch - state.bodyPitch) * (1 - Math.exp(-11 * suspStiff * dt));
  const bodyHeave = roadRipple + (collisionImpact > 0 ? Math.sin(rawDt * 80) * 0.01 * collisionImpact : 0);

  const roadHeadingDot = newForwardX * finalRq.tangentX + newForwardZ * finalRq.tangentZ;
  const targetRoadPitch = -Math.atan(finalRq.slopeY || 0) * roadHeadingDot;
  const targetRoadBank = (finalRq.bankAngle ?? 0) * roadHeadingDot;
  const prevRoadPitch = state.roadPitch ?? targetRoadPitch;
  const prevRoadBank = state.roadBank ?? targetRoadBank;
  const roadPitch = prevRoadPitch + (targetRoadPitch - prevRoadPitch) * (1 - Math.exp(-18 * dt));
  const roadBank = prevRoadBank + (targetRoadBank - prevRoadBank) * (1 - Math.exp(-18 * dt));

  const diveOffset = Math.max(-0.018, Math.min(0.018, bodyPitch * 0.32));
  const rollOffset = Math.max(-0.020, Math.min(0.020, bodyRoll * 0.34));
  const prevComp = state.wheelCompression ?? [0, 0, 0, 0];
  // Tires sit flush on the road surface (comp >= 0); suspension travel compresses upward into fender wells
  const targetComp: [number, number, number, number] = [
    Math.max(0.0, Math.min(0.020, diveOffset + rollOffset + Math.abs(roadRipple))), // FL
    Math.max(0.0, Math.min(0.020, diveOffset - rollOffset + Math.abs(roadRipple))), // FR
    Math.max(0.0, Math.min(0.020, -diveOffset + rollOffset + Math.abs(roadRipple))), // RL
    Math.max(0.0, Math.min(0.020, -diveOffset - rollOffset + Math.abs(roadRipple))), // RR
  ];
  const compLerp = 1 - Math.exp(-16 * suspStiff * dt);
  const wheelCompression: [number, number, number, number] = [
    prevComp[0] + (targetComp[0] - prevComp[0]) * compLerp,
    prevComp[1] + (targetComp[1] - prevComp[1]) * compLerp,
    prevComp[2] + (targetComp[2] - prevComp[2]) * compLerp,
    prevComp[3] + (targetComp[3] - prevComp[3]) * compLerp,
  ];

  // ---------------------------------------------------------------------------
  // 9. INDEPENDENT FRONT & REAR WHEEL ROTATION
  // ---------------------------------------------------------------------------
  const wheelR = vehicle.dimensions.wheelRadius || 0.35;
  const frontWheelOmega = forwardSpeed / wheelR;
  const rearSpinSlipBoost =
    isFreeRevving || (input.handbrake && throttle < 0.2)
      ? 0
      : isDrifting && throttle > 0.2
      ? forwardSpeed * (1.28 + throttle * 0.45) + throttle * 5.8
      : wheelSpinLaunch
      ? forwardSpeed * 1.38 + 4.5
      : forwardSpeed;
  const rearWheelOmega = rearSpinSlipBoost / wheelR;

  const wheelRotation = state.wheelRotation + frontWheelOmega * dt;
  const rearWheelRotation =
    (state.rearWheelRotation ?? state.wheelRotation) + rearWheelOmega * dt;

  // Nearest viewpoint / sector tracking & lap timer
  const mapDef = MAPS_DATA[mapId];
  let nearestZone = state.currentZoneName;
  let minVpDist = Infinity;
  for (const vp of mapDef.viewpoints) {
    const d = Math.hypot(nextX - vp.x, nextZ - vp.z);
    if (d < minVpDist) {
      minVpDist = d;
      nearestZone = vp.name.replace(/^\d+\.\s*/, '');
    }
  }

  const nextDistance = state.distanceDriven + speed * dt;
  const lapLengthMeters = mapId === 'mountain' ? 1420 : 1380;
  const lapCount = Math.max(1, Math.floor(nextDistance / lapLengthMeters) + 1);
  const currentLapTime =
    lapCount > (state.lapCount ?? 1) ? 0 : (state.currentLapTime ?? 0) + dt;
  const bestLapTime =
    lapCount > (state.lapCount ?? 1) && (state.currentLapTime ?? 0) > 15
      ? state.bestLapTime > 0
        ? Math.min(state.bestLapTime, state.currentLapTime)
        : state.currentLapTime
      : state.bestLapTime ?? 0;

  const engineLoad = Math.round(
    Math.max(
      6,
      Math.min(
        100,
        throttle * 78 + (rpm / Math.max(4000, redlineRpm)) * 22 + (isBoosting ? 12 : 0)
      )
    )
  );

  // Manifold Boost Pressure (bar): -0.45 vacuum off-throttle up to +1.35 bar under boost for turbo cars
  const maxBoostBar = !isEffectiveTurbo
    ? 0.0
    : custom?.turboSetup === 'big_single_flutter' || custom?.turboSetup === 'anti_lag_sequential'
    ? 1.38
    : custom?.turboSetup === 'street_spool'
    ? 1.18
    : 1.05;
  const spoolNorm = Math.max(0, Math.min(1, (rpm - 2400) / Math.max(1800, redlineRpm - 3000)));
  const targetBoostBar = !isEffectiveTurbo
    ? -0.42 + throttle * 0.42
    : throttle > 0.18
    ? -0.25 + throttle * (0.25 + spoolNorm * maxBoostBar)
    : custom?.turboSetup === 'anti_lag_sequential' && rpm > 4000
    ? 0.35
    : -0.45;
  const prevBoostBar = state.turboBoostBar ?? -0.4;
  const boostRate = targetBoostBar > prevBoostBar ? 7.5 : 14.0;
  const turboBoostBar = Number(
    (prevBoostBar + (targetBoostBar - prevBoostBar) * (1 - Math.exp(-boostRate * dt))).toFixed(2)
  );

  return {
    x: nextX,
    y: newY,
    z: nextZ,
    vx,
    vz,
    vy,
    heading: newHeading,
    angularVelocity,
    speed,
    speedKmh,
    steerAngle,
    visualFrontSteerAngle,
    driftAngle,
    signedDriftAngle,
    isDrifting,
    isGrounded,
    surfaceType: currentSurfaceType,
    surfaceGrip,
    gear,
    rpm,
    redlineRpm,
    shiftIndicator: gear >= 1 && gear < maxGear && rpm >= redlineRpm * 0.86,
    shiftTimer,
    throttle,
    brake,
    clutch: shiftTimer > 0 || isFreeRevving ? 1 : 0,
    isReversing: gear === -1,
    handbrake: input.handbrake,
    nitroAmount,
    isBoosting,
    backfireTimer,
    backfireIntensity,
    exhaustSmokeIntensity,
    tireSlipRatio,
    isBrakingHard,
    collisionImpact,
    collisionType,
    wheelRotation,
    rearWheelRotation,
    wheelCompression,
    bodyRoll,
    bodyPitch,
    bodyHeave,
    roadPitch,
    roadBank,
    currentDriftPoints,
    driftMultiplier,
    totalDriftScore,
    bestDriftChain,
    driftComboCount,
    driftNotificationText,
    driftNotificationTimer,
    nearMissCount,
    practiceStepsCompleted,
    distanceDriven: nextDistance,
    maxSpeedKmh: Math.max(state.maxSpeedKmh, speedKmh),
    maxDriftAngleDeg,
    totalDriftDurationSec,
    driftSmoothnessPct,
    driftConsistencyPct,
    currentZoneName: nearestZone,
    lapCount,
    currentLapTime,
    bestLapTime,
    engineLoad,
    turboBoostBar,
  };
}
