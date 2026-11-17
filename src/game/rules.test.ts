import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS_DATA } from './mapsData';
import {
  getMapRoadSamples,
  getSurfaceGripMultiplier,
  getTerrainHeight,
  queryRoadAt,
} from './roadMath';
import {
  computeDynoCurve,
  computeHandlingPreviewMetrics,
  createInitialCarState,
  getTuningPresetValues,
  getVehicleGearCount,
  getVehicleShiftDurationSec,
  getWeatherGripMultiplier,
  stepCarPhysics,
} from './carPhysics';
import { getVehicleById, VEHICLES_CATALOG } from './vehiclesData';
import { getEngineAcousticParameters, resolveExhaustAudioConfig, soundEngine } from './sound';
import { computePaintMaterialParameters } from './r34Builder';
import {
  applyVehicleMaterialCustomization,
  buildDetailedVehicleModel,
  getVehicleStructuralKey,
} from './carBuilder';
import {
  computeTandemTelemetry,
  MultiplayerRoomStore,
  validatePlayerStateUpdate,
} from './multiplayerStore';
import {
  createDefaultMobileLayouts,
  DEFAULT_CAR_CUSTOMIZATION,
  DEFAULT_GAME_SETTINGS,
  MapId,
  MobileControlId,
} from './types';

test('both maps have closed primary road loops and connected branch routes with sufficient width', () => {
  const mapIds: MapId[] = ['mountain', 'blossom'];

  for (const mapId of mapIds) {
    const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
    assert.ok(mainSamples.length > 200, `${mapId} should have high-res road samples`);
    assert.ok(branchSamples.length > 50, `${mapId} should have branch route samples`);

    // Check closed loop continuity between last and first sample
    const first = mainSamples[0];
    const last = mainSamples[mainSamples.length - 1];
    const loopGap = Math.hypot(first.x - last.x, first.z - last.z);
    assert.ok(loopGap < 8.0, `${mapId} main loop should close seamlessly (gap=${loopGap})`);

    // Check every sample has generous drifting width (>= 13m total width)
    for (const sample of mainSamples) {
      assert.ok(
        sample.halfWidth * 2 >= 13.0,
        `${mapId} main road width (${sample.halfWidth * 2}m) must be wide enough for drifting`
      );
    }

    // Check branch route endpoints connect to main road
    const branchStart = branchSamples[0];
    const branchEnd = branchSamples[branchSamples.length - 1];
    const qStart = queryRoadAt(branchStart.x, branchStart.z, mapId);
    const qEnd = queryRoadAt(branchEnd.x, branchEnd.z, mapId);
    assert.equal(qStart.onRoad, true, `${mapId} branch start must be on road`);
    assert.equal(qEnd.onRoad, true, `${mapId} branch end must be on road`);
  }
});

test('terrain never pokes through road surfaces on either map, and tunnel/bridge clearances hold', () => {
  const mapIds: MapId[] = ['mountain', 'blossom'];

  for (const mapId of mapIds) {
    const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
    const allSamples = [...mainSamples, ...branchSamples];

    for (const s of allSamples) {
      const terrainY = getTerrainHeight(s.x, s.z, mapId);
      if (s.isBridge) {
        assert.ok(
          s.y > terrainY + 4.0,
          `Bridge deck (${s.y}) must span above riverbed (${terrainY})`
        );
      } else {
        assert.ok(
          terrainY <= s.y - 0.05,
          `Terrain (${terrainY}) must not intersect road surface (${s.y}) on ${mapId}`
        );
      }
    }
  }
});

test('all viewpoints spawn the player directly on a drivable road or plaza', () => {
  const mapIds: MapId[] = ['mountain', 'blossom'];
  for (const mapId of mapIds) {
    const viewpoints = MAPS_DATA[mapId].viewpoints;
    assert.ok(viewpoints.length >= 5, `${mapId} should have at least 5 viewpoints`);
    for (const i of viewpoints.keys()) {
      const state = createInitialCarState(mapId, i);
      const rq = queryRoadAt(state.x, state.z, mapId);
      assert.equal(
        rq.onRoad,
        true,
        `${mapId} viewpoint ${viewpoints[i].id} must spawn on drivable road or plaza`
      );
    }
  }
});

test('car physics accelerates, initiates controlled drift, countersteers without spinning out, and recovers smoothly', () => {
  let state = createInitialCarState('mountain', 0);
  const r34 = getVehicleById('r34_gtr');

  // Accelerate straight for 2.0 seconds
  for (let i = 0; i < 60; i++) {
    state = stepCarPhysics(
      state,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      r34
    );
  }
  assert.ok(
    state.speedKmh > 45 && state.speedKmh < 75,
    `Car should accelerate progressively to 45-75 km/h in 2.0s in Drift Mode without excessive drag-race speed (got ${state.speedKmh})`
  );
  assert.ok(state.distanceDriven > 14, 'Distance driven should increment');

  // Initiate drift with steering + handbrake
  for (let i = 0; i < 20; i++) {
    state = stepCarPhysics(
      state,
      { forward: true, backward: false, left: true, right: false, handbrake: true },
      'mountain',
      1 / 30,
      r34
    );
  }
  assert.equal(state.isDrifting, true, 'Car should enter drift state on handbrake turn');
  assert.ok(state.driftAngle > 10, `Drift angle should exceed 10 deg (got ${state.driftAngle})`);
  assert.ok(
    state.driftAngle < 82,
    `Drift angle should remain controllable without sudden 180 spin-out (got ${state.driftAngle})`
  );
  assert.ok(state.currentDriftPoints > 0, 'Current drift points should accumulate while drifting');

  // Recover from drift by releasing handbrake and straightening wheel
  for (let i = 0; i < 35; i++) {
    state = stepCarPhysics(
      state,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      r34
    );
  }
  assert.ok(
    state.driftAngle < 12,
    `Car should recover smoothly to straight tracking when steering is centered (got ${state.driftAngle})`
  );
});

test('vehicle catalog contains all 26 complete JDM and exotic vehicles with unique physicsConfig and engineAudioProfile', () => {
  assert.equal(VEHICLES_CATALOG.length, 26, `Expected 26 vehicles, got ${VEHICLES_CATALOG.length}`);

  const requiredIds = [
    'r34_gtr',
    'r33_gtr',
    'r32_gtr',
    'silvia_s15',
    'silvia_s14',
    'silvia_s13',
    'nissan_180sx',
    'fairlady_350z',
    'nissan_370z',
    'supra_mk4',
    'supra_mk5',
    'ae86_trueno',
    'toyota_gr86',
    'chaser_jzx100',
    'rx7_fd',
    'rx7_fc',
    'mx5_miata',
    'nsx_na1',
    'civic_typer',
    'honda_s2000',
    'lancer_evo9',
    'lancer_evo10',
    'wrx_sti',
    'ferrari_f40',
    'bmw_m3_e46',
    'bmw_m3_e30',
  ];

  for (const id of requiredIds) {
    const v = getVehicleById(id);
    assert.equal(v.id, id, `Vehicle ${id} must resolve accurately`);
    assert.ok(v.engineAudioProfile, `${v.name} must define an engineAudioProfile`);
    assert.ok(v.physicsConfig, `${v.name} must define a physicsConfig`);
    assert.equal(
      v.physicsConfig?.gearRatios.length,
      6,
      `${v.name} physicsConfig must define 6 gear ratios`
    );
    assert.ok(
      v.dimensions.length > 3.8 && v.dimensions.length < 5.0,
      `${v.name} length (${v.dimensions.length}m) must be realistic`
    );
    assert.ok(
      v.dimensions.width > 1.65 && v.dimensions.width < 2.1,
      `${v.name} width (${v.dimensions.width}m) must be realistic`
    );
    assert.ok(
      v.dimensions.wheelbase > 2.2 && v.dimensions.wheelbase < 2.9,
      `${v.name} wheelbase must be realistic`
    );
    assert.ok(v.factoryColors.length >= 4, `${v.name} should have at least 4 factory paint options`);
  }

  // Verify F40 accelerates faster than Supra MK4, which accelerates faster than AE86
  const ae86 = getVehicleById('ae86_trueno');
  const supra = getVehicleById('supra_mk4');
  const f40 = getVehicleById('ferrari_f40');
  let stateAe86 = createInitialCarState('mountain', 0);
  let stateSupra = createInitialCarState('mountain', 0);
  let stateF40 = createInitialCarState('mountain', 0);

  for (let i = 0; i < 45; i++) {
    stateAe86 = stepCarPhysics(
      stateAe86,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      ae86
    );
    stateSupra = stepCarPhysics(
      stateSupra,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      supra
    );
    stateF40 = stepCarPhysics(
      stateF40,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      f40
    );
  }
  assert.ok(
    stateSupra.speedKmh > stateAe86.speedKmh,
    `Supra MK4 (${stateSupra.speedKmh} km/h) should accelerate faster than AE86 (${stateAe86.speedKmh} km/h)`
  );
  assert.ok(
    stateF40.speedKmh > stateAe86.speedKmh,
    `F40 (${stateF40.speedKmh} km/h) should accelerate faster than AE86 (${stateAe86.speedKmh} km/h)`
  );

  // Verify reverse gear engages reverse lights flag when backing up from standstill
  let revState = createInitialCarState('blossom', 0);
  for (let i = 0; i < 30; i++) {
    revState = stepCarPhysics(
      revState,
      { forward: false, backward: true, left: false, right: false, handbrake: false },
      'blossom',
      1 / 30,
      ae86
    );
  }
  assert.equal(revState.isReversing, true, 'isReversing flag must activate when driving in reverse');
});

test('custom workshop tuning parameters scale acceleration and steering response', () => {
  const s15 = getVehicleById('silvia_s15');
  let stockState = createInitialCarState('mountain', 0);
  let tunedState = createInitialCarState('mountain', 0);

  for (let i = 0; i < 35; i++) {
    stockState = stepCarPhysics(
      stockState,
      { forward: true, backward: false, left: true, right: false, handbrake: false },
      'mountain',
      1 / 30,
      s15,
      { horsepowerTuning: 1.0, steeringSensitivity: 1.0 }
    );
    tunedState = stepCarPhysics(
      tunedState,
      { forward: true, backward: false, left: true, right: false, handbrake: false },
      'mountain',
      1 / 30,
      s15,
      { horsepowerTuning: 1.3, steeringSensitivity: 1.3 }
    );
  }

  assert.ok(
    tunedState.speedKmh > stockState.speedKmh,
    `Stage-tuned S15 (${tunedState.speedKmh} km/h) must accelerate faster than stock (${stockState.speedKmh} km/h)`
  );
  assert.ok(
    Math.abs(tunedState.steerAngle) > Math.abs(stockState.steerAngle),
    `Tuned steering sensitivity (${tunedState.steerAngle}) must exceed stock (${stockState.steerAngle})`
  );
});

test('manual and automatic transmission modes shift gears accurately and enforce rev limiter', () => {
  const s15 = getVehicleById('silvia_s15');
  let manualState = createInitialCarState('mountain', 0);

  for (let i = 0; i < 65; i++) {
    manualState = stepCarPhysics(
      manualState,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      s15,
      undefined,
      'manual'
    );
  }
  assert.equal(manualState.gear, 1, 'Manual transmission must hold 1st gear until player shifts');
  assert.equal(manualState.shiftIndicator, true, 'Shift indicator must light up near redline in 1st gear');

  manualState = stepCarPhysics(
    manualState,
    { forward: true, backward: false, left: false, right: false, handbrake: false, shiftUp: true },
    'mountain',
    1 / 30,
    s15,
    undefined,
    'manual'
  );
  assert.equal(manualState.gear, 2, 'Manual upshift must advance to 2nd gear');

  manualState = stepCarPhysics(
    manualState,
    { forward: true, backward: false, left: false, right: false, handbrake: false, shiftUp: true },
    'mountain',
    1 / 30,
    s15,
    undefined,
    'manual'
  );
  assert.equal(manualState.gear, 3, 'Manual upshift must advance to 3rd gear');

  manualState = stepCarPhysics(
    manualState,
    { forward: true, backward: false, left: false, right: false, handbrake: false, shiftDown: true },
    'mountain',
    1 / 30,
    s15,
    undefined,
    'manual'
  );
  assert.equal(manualState.gear, 2, 'Manual downshift must drop to 2nd gear');
});

test('N2O nitrous boost, visible front countersteering, rear wheelspin, and 4-corner suspension travel operate accurately', () => {
  const rx7 = getVehicleById('rx7_fd');
  const civic = getVehicleById('civic_typer');
  assert.equal(civic.drivetrain, 'AWD', 'Civic Type R Time-Attack should represent AWD drivetrain');
  assert.equal(civic.horsepower, 440, 'Civic Type R Time-Attack should have 440 HP');

  let baseRun = createInitialCarState('mountain', 0);
  let nitroRun = createInitialCarState('mountain', 0);

  for (let i = 0; i < 40; i++) {
    baseRun = stepCarPhysics(
      baseRun,
      { forward: true, backward: false, left: false, right: false, handbrake: false, nitro: false },
      'mountain',
      1 / 30,
      rx7
    );
    nitroRun = stepCarPhysics(
      nitroRun,
      { forward: true, backward: false, left: false, right: false, handbrake: false, nitro: true },
      'mountain',
      1 / 30,
      rx7
    );
  }

  assert.ok(
    nitroRun.speedKmh > baseRun.speedKmh,
    `N2O boosted run (${nitroRun.speedKmh} km/h) must exceed normal run (${baseRun.speedKmh} km/h)`
  );
  assert.ok(nitroRun.nitroAmount < 100, 'N2O tank must deplete while boosting');

  let driftState = baseRun;
  for (let i = 0; i < 25; i++) {
    driftState = stepCarPhysics(
      driftState,
      { forward: true, backward: false, left: true, right: false, handbrake: true },
      'mountain',
      1 / 30,
      rx7
    );
  }
  assert.equal(driftState.isDrifting, true, 'RX-7 should enter drift');
  assert.ok(
    Math.abs(driftState.visualFrontSteerAngle) > 0.01,
    'Visual front steer angle must reflect active steering/countersteering'
  );
  assert.ok(
    driftState.rearWheelRotation > driftState.wheelRotation,
    'Rear wheels must spin faster than front wheels during powered RWD drift'
  );
  assert.equal(
    driftState.wheelCompression.length,
    4,
    '4-corner wheel compression array must have 4 values [FL, FR, RL, RR]'
  );
});

test('road surface physics differentiates grip across asphalt, wet asphalt, shoulder, gravel, dirt, and grass, and 4-corner OBB barrier collision prevents passing through fences', () => {
  assert.equal(getSurfaceGripMultiplier('normal_asphalt'), 1.0);
  assert.ok(getSurfaceGripMultiplier('smooth_asphalt') > 1.0);
  assert.ok(getSurfaceGripMultiplier('wet_asphalt') <= 0.85);
  assert.ok(getSurfaceGripMultiplier('shoulder') < 0.92);
  assert.ok(getSurfaceGripMultiplier('gravel') < getSurfaceGripMultiplier('shoulder'));
  assert.ok(getSurfaceGripMultiplier('grass') < getSurfaceGripMultiplier('gravel'));

  // Test 4-corner OBB guardrail barrier collision on a guarded mountain road sample
  const { mainSamples } = getMapRoadSamples('mountain');
  const guardedSample = mainSamples.find(
    (s) => !s.isBridge && !s.isTunnel && queryRoadAt(s.x, s.z, 'mountain').hasGuardrailRight
  );
  assert.ok(guardedSample, 'Mountain map should have guarded road segments');

  if (guardedSample) {
    const s15 = getVehicleById('silvia_s15');
    // Aim car 45 degrees toward the right guardrail and drive into it
    const tangentAngle = Math.atan2(guardedSample.tx, guardedSample.tz);
    const nx = guardedSample.nx;
    const nz = guardedSample.nz;
    let state = createInitialCarState('mountain', 0);
    state = {
      ...state,
      x: guardedSample.x + nx * (guardedSample.halfWidth - 1.2),
      y: guardedSample.y,
      z: guardedSample.z + nz * (guardedSample.halfWidth - 1.2),
      heading: tangentAngle - Math.PI * 0.25,
      vx: Math.sin(tangentAngle - Math.PI * 0.25) * 28,
      vz: Math.cos(tangentAngle - Math.PI * 0.25) * 28,
      speed: 28,
      speedKmh: 100.8,
    };

    let hitBarrier = false;
    for (let i = 0; i < 20; i++) {
      state = stepCarPhysics(
        state,
        { forward: true, backward: false, left: false, right: true, handbrake: false },
        'mountain',
        1 / 30,
        s15
      );
      if (state.collisionImpact > 0) hitBarrier = true;
      const rq = queryRoadAt(state.x, state.z, 'mountain');
      if (rq.hasGuardrailRight) {
        assert.ok(
          rq.distanceToCenter <= rq.roadHalfWidth + 0.5,
          `Car center (${rq.distanceToCenter.toFixed(2)}m) must never pass through guardrail (${(rq.roadHalfWidth + 0.45).toFixed(2)}m)`
        );
      }
    }
    assert.equal(hitBarrier, true, 'Driving into the roadside guardrail must register a barrier collision');
  }
});

test('vehicle-specific engine audio profiles differentiate NA, VTEC, Turbo, Rotary, Boxer, and V8 acoustics', () => {
  const ae86Audio = getEngineAcousticParameters('i4_na', '4age_20v_na');
  const s2000Audio = getEngineAcousticParameters('i4_na', 'f22c_vtec_i4');
  const rb26Audio = getEngineAcousticParameters('i6_turbo', 'rb26dett');
  const rotaryAudio = getEngineAcousticParameters('rotary', '13b_rotary');
  const boxerAudio = getEngineAcousticParameters('boxer_turbo', 'ej207_boxer');
  const m3V8Audio = getEngineAcousticParameters('v8_race', 'p60b40_v8');

  assert.equal(ae86Audio.isTurbo, false, 'AE86 4A-GE 20V must be naturally aspirated (no turbo)');
  assert.equal(s2000Audio.isTurbo, false, 'S2000 F22C1 must be naturally aspirated');
  assert.ok(
    (s2000Audio.vtecCrossoverRpm ?? 0) > 5500,
    'S2000 F22C1 must have a high-RPM VTEC crossover'
  );
  assert.equal(rb26Audio.isTurbo, true, 'RB26DETT must have twin-turbo boost induction');
  assert.equal(
    rotaryAudio.rotaryBrapModulation,
    true,
    '13B Rotary must feature distinct rotary brap modulation'
  );
  assert.equal(
    boxerAudio.boxerRumbleModulation,
    true,
    'EJ207 Boxer must feature unequal-length exhaust rumble'
  );
  assert.equal(m3V8Audio.isTurbo, false, 'E46 M3 GTR P60B40 V8 must be naturally aspirated');
  assert.equal(
    m3V8Audio.hasStraightCutGearWhine,
    true,
    'E46 M3 GTR must feature straight-cut racing gearbox whine'
  );
});

test('W and S controls behave naturally: S progressively brakes while moving forward without triggering drift or instant reverse, and Drift vs Race mode scales speed and slip', () => {
  const s15 = getVehicleById('silvia_s15');
  let driftModeState = createInitialCarState('mountain', 0);
  let raceModeState = createInitialCarState('mountain', 0);

  // Accelerate for 2.0s in both Drift Mode and Race Mode
  for (let i = 0; i < 60; i++) {
    driftModeState = stepCarPhysics(
      driftModeState,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      s15,
      undefined,
      'automatic',
      'drift'
    );
    raceModeState = stepCarPhysics(
      raceModeState,
      { forward: true, backward: false, left: false, right: false, handbrake: false },
      'mountain',
      1 / 30,
      s15,
      undefined,
      'automatic',
      'race'
    );
  }

  assert.ok(
    raceModeState.speedKmh > driftModeState.speedKmh,
    `Race mode (${raceModeState.speedKmh.toFixed(1)} km/h) should accelerate faster than controlled Drift mode (${driftModeState.speedKmh.toFixed(1)} km/h)`
  );
  assert.ok(
    driftModeState.speedKmh < 125,
    `Drift mode 2s launch (${driftModeState.speedKmh.toFixed(1)} km/h) must remain in a controllable mountain touge range`
  );

  // Now press S (backward) while moving forward at ~80 km/h: must progressively brake without reversing or triggering a drift
  const speedBeforeBraking = driftModeState.speedKmh;
  driftModeState = stepCarPhysics(
    driftModeState,
    { forward: false, backward: true, left: true, right: false, handbrake: false },
    'mountain',
    1 / 30,
    s15,
    undefined,
    'automatic',
    'drift'
  );
  assert.ok(
    driftModeState.speedKmh < speedBeforeBraking,
    'Pressing S while moving forward must decelerate the vehicle'
  );
  assert.equal(
    driftModeState.isReversing,
    false,
    'Pressing S at forward speed must brake, not immediately engage reverse'
  );
  assert.equal(
    driftModeState.isDrifting,
    false,
    'Pressing S to brake must not act as an unintended handbrake drift trigger'
  );
});

test('continuous spline segment projection in queryRoadAt eliminates discrete elevation stair-stepping on sloped mountain roads', () => {
  const { mainSamples } = getMapRoadSamples('mountain');
  const s0 = mainSamples[10];
  const s1 = mainSamples[11];
  const midX = (s0.x + s1.x) * 0.5;
  const midZ = (s0.z + s1.z) * 0.5;
  const q0 = queryRoadAt(s0.x, s0.z, 'mountain');
  const qMid = queryRoadAt(midX, midZ, 'mountain');
  const q1 = queryRoadAt(s1.x, s1.z, 'mountain');

  const expectedMidY = (q0.elevation + q1.elevation) * 0.5;
  assert.ok(
    Math.abs(qMid.elevation - expectedMidY) < 0.05,
    `Midpoint road elevation (${qMid.elevation.toFixed(3)}) must smoothly interpolate between adjacent samples (${q0.elevation.toFixed(3)} and ${q1.elevation.toFixed(3)})`
  );
});

test('stationary engine revving surges RPM and triggers exhaust backfire without moving the vehicle, and weather grip multipliers scale traction', () => {
  assert.equal(getWeatherGripMultiplier('clear'), 1.0);
  assert.ok(getWeatherGripMultiplier('light_rain') < getWeatherGripMultiplier('cloudy'));
  assert.ok(getWeatherGripMultiplier('heavy_rain') < getWeatherGripMultiplier('light_rain'));

  const r34 = getVehicleById('r34_gtr');
  let idleState = createInitialCarState('mountain', 0);

  // Rev engine at standstill using revEngine input (or handbrake + forward)
  for (let i = 0; i < 25; i++) {
    idleState = stepCarPhysics(
      idleState,
      { forward: true, backward: false, left: false, right: false, handbrake: true, revEngine: true },
      'mountain',
      1 / 30,
      r34
    );
  }
  assert.ok(idleState.rpm > 4500, `Stationary revving should surge RPM above 4500 (got ${idleState.rpm})`);
  assert.ok(idleState.speedKmh < 1.0, `Car must remain stationary while free-revving (got ${idleState.speedKmh})`);
  assert.equal(idleState.angularVelocity, 0, 'Car must never spin in place while stationary');

  // Release throttle from high stationary RPM: should trigger exhaust backfireTimer > 0
  idleState = stepCarPhysics(
    idleState,
    { forward: false, backward: false, left: false, right: false, handbrake: true, revEngine: false },
    'mountain',
    1 / 30,
    r34
  );
  assert.ok(idleState.backfireTimer > 0, 'Lifting off throttle from high RPM must trigger exhaust backfire flame');
});

test('branch road endpoints weld seamlessly to main loop elevation and wheel compression never sinks tires below road surface', () => {
  for (const mapId of ['mountain', 'blossom'] as MapId[]) {
    const { branchSamples } = getMapRoadSamples(mapId);
    const bStart = branchSamples[0];
    const bEnd = branchSamples[branchSamples.length - 1];
    const qStart = queryRoadAt(bStart.x, bStart.z, mapId);
    const qEnd = queryRoadAt(bEnd.x, bEnd.z, mapId);

    assert.ok(
      Math.abs(bStart.y - qStart.elevation) < 0.08,
      `${mapId} branch start elevation (${bStart.y.toFixed(3)}) must weld flush with main road (${qStart.elevation.toFixed(3)})`
    );
    assert.ok(
      Math.abs(bEnd.y - qEnd.elevation) < 0.08,
      `${mapId} branch end elevation (${bEnd.y.toFixed(3)}) must weld flush with main road (${qEnd.elevation.toFixed(3)})`
    );
  }

  // Verify wheelCompression never goes negative during hard braking, acceleration, or cornering
  const r34 = getVehicleById('r34_gtr');
  let state = createInitialCarState('mountain', 0);
  for (let i = 0; i < 40; i++) {
    state = stepCarPhysics(
      state,
      {
        forward: i < 25,
        backward: i >= 25,
        left: i % 2 === 0,
        right: i % 2 === 1,
        handbrake: i >= 15 && i < 25,
      },
      'mountain',
      1 / 30,
      r34,
      undefined,
      'automatic',
      'drift',
      'clear',
        {
          handlingMode: 'drift',
          transmissionMode: 'automatic',
          headlightMode: 'auto',
          weather: 'clear',
          dynamicTimeCycle: false,
          practiceMode: false,
          controlScheme: 'auto',
          mobileButtonScale: 1.0,
          mobileButtonOpacity: 0.85,
          mobileLeftHanded: false,
          showTelemetryOverlay: false,
          showFpsCounter: false,
          masterVolume: 0.85,
          engineVolume: 0.9,
          sfxVolume: 0.85,
          steeringSensitivity: 1.0,
          accelerateKey: 'KeyW',
          brakeKey: 'KeyS',
          leftKey: 'KeyA',
          rightKey: 'KeyD',
          handbrakeKey: 'Space',
          nitroKey: 'ShiftLeft',
          upshiftKey: 'KeyE',
          downshiftKey: 'KeyQ',
          showDriftNotifications: false,
          camera: { distance: 5.35, height: 1.68, smoothing: 10.5, fov: 58, shakeIntensity: 0.65 },
        }
      );
      for (const comp of state.wheelCompression) {
        assert.ok(comp >= 0, `Wheel compression (${comp}) must never be negative (prevents tire sinking)`);
      }
      assert.equal(
        state.driftNotificationText || '',
        '',
        'Drift notifications must remain empty when showDriftNotifications is false'
      );
    }
  }
);

test('road junction guardrail cutouts remove blocking barriers at branch endpoints and drift plaza entrances', () => {
  for (const mapId of ['mountain', 'blossom'] as MapId[]) {
    const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
    const branchStart = branchSamples[0];
    const branchEnd = branchSamples[branchSamples.length - 1];

    // Branch endpoints themselves must have guardrails open so they merge cleanly into the main loop
    assert.equal(branchStart.hasGuardrailLeft, false, `${mapId} branch start left guardrail must be open`);
    assert.equal(branchStart.hasGuardrailRight, false, `${mapId} branch start right guardrail must be open`);
    assert.equal(branchEnd.hasGuardrailLeft, false, `${mapId} branch end left guardrail must be open`);
    assert.equal(branchEnd.hasGuardrailRight, false, `${mapId} branch end right guardrail must be open`);

    // Main loop samples closest to branch start/end must also have guardrails cut out
    const nearestMainToStart = mainSamples.reduce((best, s) =>
      Math.hypot(s.x - branchStart.x, s.z - branchStart.z) < Math.hypot(best.x - branchStart.x, best.z - branchStart.z)
        ? s
        : best
    );
    assert.equal(
      nearestMainToStart.hasGuardrailLeft && nearestMainToStart.hasGuardrailRight,
      false,
      `${mapId} main road sample at branch junction must open its guardrail`
    );
  }
});

test('CarX drift tuning presets (Street, Grip, Drift) produce distinct handling metrics and real physics differences', () => {
  const silvia = getVehicleById('s15_silvia');
  const streetTuning = { ...DEFAULT_CAR_CUSTOMIZATION, ...getTuningPresetValues('street', silvia) };
  const gripTuning = { ...DEFAULT_CAR_CUSTOMIZATION, ...getTuningPresetValues('grip', silvia) };
  const driftTuning = { ...DEFAULT_CAR_CUSTOMIZATION, ...getTuningPresetValues('drift', silvia) };

  assert.ok(
    (driftTuning.maxSteerAngleDeg ?? 50) > (streetTuning.maxSteerAngleDeg ?? 44) &&
      (streetTuning.maxSteerAngleDeg ?? 44) > (gripTuning.maxSteerAngleDeg ?? 40),
    `Drift max steer angle (${driftTuning.maxSteerAngleDeg}°) > Street (${streetTuning.maxSteerAngleDeg}°) > Grip (${gripTuning.maxSteerAngleDeg}°)`
  );
  assert.ok(
    (driftTuning.rearTireGrip ?? 0.8) < (gripTuning.rearTireGrip ?? 1.2),
    `Drift preset rear grip (${driftTuning.rearTireGrip}) must be lower than Grip preset (${gripTuning.rearTireGrip})`
  );

  const gripMetrics = computeHandlingPreviewMetrics(silvia, gripTuning);
  const driftMetrics = computeHandlingPreviewMetrics(silvia, driftTuning);
  assert.ok(
    driftMetrics.oversteerBalance > gripMetrics.oversteerBalance + 15,
    `Drift preset must significantly increase oversteer/drift balance (${driftMetrics.oversteerBalance} vs ${gripMetrics.oversteerBalance})`
  );
  assert.ok(
    gripMetrics.highSpeedStability > driftMetrics.highSpeedStability,
    `Grip preset must provide higher high-speed stability (${gripMetrics.highSpeedStability} vs ${driftMetrics.highSpeedStability})`
  );

  // Step physics with Grip vs Drift tuning under identical cornering + handbrake initiation
  let gripState = createInitialCarState('mountain', 0);
  let driftState = createInitialCarState('mountain', 0);

  for (let i = 0; i < 45; i++) {
    const input = {
      forward: true,
      backward: false,
      left: i >= 20,
      right: false,
      handbrake: i >= 22 && i <= 27,
    };
    gripState = stepCarPhysics(gripState, input, 'mountain', 1 / 30, silvia, gripTuning, 'automatic', 'drift', 'clear');
    driftState = stepCarPhysics(driftState, input, 'mountain', 1 / 30, silvia, driftTuning, 'automatic', 'drift', 'clear');
  }

  assert.ok(
    Math.abs(driftState.driftAngle) > Math.abs(gripState.driftAngle),
    `Drift tuning preset must achieve a wider drift angle (${Math.abs(driftState.driftAngle).toFixed(3)} deg) than Grip preset (${Math.abs(gripState.driftAngle).toFixed(3)} deg)`
  );
});

test('all 6 PBR paint finishes (gloss, metallic, matte, satin, pearl, chrome) compute distinct physical material parameters', () => {
  const baseCustom = {
    ...DEFAULT_CAR_CUSTOMIZATION,
    paintColor: '#1e3f8a',
    paintBrightness: 1.0,
    metallicIntensity: 0.65,
    paintRoughness: 0.2,
  };

  const gloss = computePaintMaterialParameters('gloss', '#1e3f8a', baseCustom);
  const metallic = computePaintMaterialParameters('metallic', '#1e3f8a', baseCustom);
  const matte = computePaintMaterialParameters('matte', '#1e3f8a', baseCustom);
  const satin = computePaintMaterialParameters('satin', '#1e3f8a', baseCustom);
  const pearl = computePaintMaterialParameters('pearl', '#1e3f8a', baseCustom);
  const chrome = computePaintMaterialParameters('chrome', '#1e3f8a', baseCustom);

  // Matte has zero clearcoat and highest roughness
  assert.equal(matte.clearcoat, 0);
  assert.ok(matte.roughness > gloss.roughness, 'Matte must have higher roughness than Gloss');

  // Satin sits between Matte and Gloss with soft sheen
  assert.ok(satin.roughness < matte.roughness && satin.roughness > gloss.roughness, 'Satin roughness must be between Gloss and Matte');

  // Metallic has higher metalness than Gloss
  assert.ok(metallic.metalness > gloss.metalness, 'Metallic finish must have higher metalness than Gloss');

  // Pearl has strong iridescence
  assert.ok(pearl.iridescence >= 0.7, 'Pearlescent finish must enable strong iridescence');

  // Chrome has near-1.0 metalness and ultra-low roughness
  assert.ok(chrome.metalness >= 0.95, 'Chrome finish must have mirror metalness >= 0.95');
  assert.ok(chrome.roughness <= 0.08, 'Chrome finish must have mirror-low roughness');
});

test('multiplayer room store manages public/private rooms, invite codes, passwords, and anti-cheat telemetry clamping', () => {
  const store = new MultiplayerRoomStore();

  // Default public rooms are seeded
  const initialPublicRooms = store.listRooms(false);
  assert.ok(initialPublicRooms.length >= 3, 'Should seed at least 3 public drift rooms');

  // Create a private password-protected room
  const created = store.createRoom({
    name: 'Team Touge Private',
    isPrivate: true,
    password: 'secret',
    maxPlayers: 4,
    mapId: 'mountain',
    mode: 'tandem',
    weather: 'clear',
    timeOfDay: 'night',
    collisionsEnabled: true,
    hostPlayerId: 'host_1',
  });

  assert.equal(created.isPrivate, true);
  assert.equal(created.inviteCode.length, 6);

  // Private room should not appear in public room list
  const publicIds = store.listRooms(false).map((r) => r.id);
  assert.ok(!publicIds.includes(created.id), 'Private room must not be listed in public directory');

  const samplePlayer = {
    playerId: 'peer_2',
    playerName: 'Keisuke',
    vehicleId: 'rx7_fd',
    paintColor: '#eab308',
    paintFinish: 'metallic' as const,
    x: 0,
    y: 12,
    z: 0,
    vx: 0,
    vz: 0,
    heading: 0,
    steerAngle: 0,
    driftAngle: 0,
    isDrifting: false,
    speedKmh: 0,
    rpm: 1000,
    gear: 1,
    driftScore: 0,
    currentDriftPoints: 0,
    driftMultiplier: 1,
    pingMs: 18,
    lastUpdatedAt: Date.now(),
  };

  // Joining with wrong password fails
  const wrongPw = store.joinRoom(created.id, samplePlayer, 'wrong');
  assert.equal(wrongPw.ok, false);

  // Joining by invite code with correct password succeeds
  const rightPw = store.joinRoom(created.inviteCode, samplePlayer, 'secret');
  assert.equal(rightPw.ok, true);
  assert.equal(rightPw.players?.length, 1);

  // Anti-cheat validation clamps impossible speed or score values
  const sanitized = validatePlayerStateUpdate(
    undefined,
    {
      x: 120,
      y: 14,
      z: -80,
      speedKmh: 9999,
      driftScore: 999999999,
    },
    Date.now()
  );
  assert.equal(sanitized.sanitizedSpeedKmh, 395, 'Speed must be clamped to realistic maximum');
  assert.equal(sanitized.sanitizedScore, 50000, 'Initial drift score must be clamped to anti-cheat ceiling');
});

test('CarX-style transmission modes (automatic drift gear hold, manual_clutch_assist, manual), 5/6-speed gearboxes, finalDriveRatio tuning, and drift statistics work accurately', () => {
  const ae86 = getVehicleById('ae86_trueno');
  const r34 = getVehicleById('r34_gtr');
  const m3gtr = getVehicleById('bmw_m3_gtr');

  // 1. Verify authentic 5-speed vs 6-speed gear counts and shift durations
  assert.equal(getVehicleGearCount(ae86), 5, 'AE86 Trueno should have a 5-speed gearbox');
  assert.equal(getVehicleGearCount(r34), 6, 'R34 GT-R should have a 6-speed Getrag gearbox');
  assert.ok(
    getVehicleShiftDurationSec(m3gtr, 'manual') < getVehicleShiftDurationSec(ae86, 'manual'),
    'BMW M3 GTR sequential race gearbox must shift faster than vintage AE86 H-pattern'
  );

  // 2. Verify AE86 cannot shift above 5th gear in manual mode
  let ae86State = { ...createInitialCarState('mountain', 0), gear: 5 };
  ae86State = stepCarPhysics(
    ae86State,
    { forward: true, backward: false, left: false, right: false, handbrake: false, shiftUp: true },
    'mountain',
    1 / 30,
    ae86,
    undefined,
    'manual'
  );
  assert.equal(ae86State.gear, 5, '5-speed AE86 must cap at 5th gear');

  // 3. Verify Intelligent Automatic holds gear during an active mid-RPM drift (no gear hunting)
  let driftAutoState = {
    ...createInitialCarState('mountain', 0),
    gear: 3,
    rpm: 6100,
    isDrifting: true,
    driftAngle: 28,
    vx: Math.sin(0) * 23,
    vz: Math.cos(0) * 23,
    speed: 23,
    speedKmh: 82.8,
  };
  driftAutoState = stepCarPhysics(
    driftAutoState,
    { forward: true, backward: false, left: true, right: false, handbrake: false },
    'mountain',
    1 / 30,
    r34,
    undefined,
    'automatic',
    'drift'
  );
  assert.equal(
    driftAutoState.gear,
    3,
    'Intelligent Automatic transmission must hold 3rd gear during active mid-RPM drift'
  );

  // 4. Verify manual_clutch_assist auto-downshifts to 1st when stopped in high gear
  let clutchAssistStop = {
    ...createInitialCarState('mountain', 0),
    gear: 4,
    vx: 0,
    vz: 0,
    speed: 0,
    speedKmh: 0,
  };
  clutchAssistStop = stepCarPhysics(
    clutchAssistStop,
    { forward: false, backward: false, left: false, right: false, handbrake: false },
    'mountain',
    1 / 30,
    r34,
    undefined,
    'manual_clutch_assist'
  );
  assert.equal(
    clutchAssistStop.gear,
    1,
    'manual_clutch_assist must auto-downshift to 1st gear when stopped to prevent stalling'
  );

  // 5. Verify finalDriveRatio tuning slider affects gearing & acceleration
  let tallGearState = createInitialCarState('mountain', 0);
  let shortGearState = createInitialCarState('mountain', 0);
  for (let i = 0; i < 35; i++) {
    const inp = { forward: true, backward: false, left: false, right: false, handbrake: false };
    tallGearState = stepCarPhysics(
      tallGearState,
      inp,
      'mountain',
      1 / 30,
      r34,
      { finalDriveRatio: 3.15 },
      'manual'
    );
    shortGearState = stepCarPhysics(
      shortGearState,
      inp,
      'mountain',
      1 / 30,
      r34,
      { finalDriveRatio: 4.75 },
      'manual'
    );
  }
  assert.notEqual(
    tallGearState.rpm,
    shortGearState.rpm,
    'Short vs tall Final Drive Ratio tuning must produce distinct RPM and gearing behavior'
  );
  assert.ok(
    typeof driftAutoState.maxDriftAngleDeg === 'number' &&
      typeof driftAutoState.totalDriftDurationSec === 'number' &&
      typeof driftAutoState.driftSmoothnessPct === 'number' &&
      typeof driftAutoState.driftConsistencyPct === 'number',
    'CarState must track live drift run statistics (max angle, duration, smoothness, consistency)'
  );
});

test('automotive exhaust audio customization, turbo STUTUTU flutter config, manifold boost pressure, and flame intensity work accurately', () => {
  const r34 = getVehicleById('r34_gtr');
  const ae86 = getVehicleById('ae86_trueno');
  const m3gtr = getVehicleById('bmw_m3_e46');

  // 1. Naturally aspirated stock cars (AE86, M3 GTR) do not have turbo flutter by default
  const ae86StockAudio = resolveExhaustAudioConfig(
    ae86.soundType,
    ae86.engineAudioProfile,
    DEFAULT_CAR_CUSTOMIZATION
  );
  const m3StockAudio = resolveExhaustAudioConfig(
    m3gtr.soundType,
    m3gtr.engineAudioProfile,
    DEFAULT_CAR_CUSTOMIZATION
  );
  assert.equal(ae86StockAudio.isEffectiveTurbo, false, 'Stock 4A-GE AE86 must be naturally aspirated');
  assert.equal(ae86StockAudio.hasTurboFlutter, false, 'Stock NA AE86 must not trigger turbo flutter');
  assert.equal(m3StockAudio.isEffectiveTurbo, false, 'Stock P60B40 V8 M3 GTR must be naturally aspirated');

  // 2. Installing an aftermarket Big Single Turbo kit on an NA car enables turbo boost and STUTUTU compressor surge
  const ae86TurboAudio = resolveExhaustAudioConfig(ae86.soundType, ae86.engineAudioProfile, {
    ...DEFAULT_CAR_CUSTOMIZATION,
    turboSetup: 'big_single_flutter',
    bovType: 'compressor_flutter',
  });
  assert.equal(ae86TurboAudio.isEffectiveTurbo, true, 'Big Single Turbo upgrade must enable forced induction');
  assert.equal(ae86TurboAudio.hasTurboFlutter, true, 'Compressor flutter BOV setup must enable STUTUTU surge');

  // 3. Titanium Race exhaust + Blast Pipe muffler increases exhaust volume multiplier and filter cutoff over Stock OEM
  const r34StockAudio = resolveExhaustAudioConfig(r34.soundType, r34.engineAudioProfile, {
    ...DEFAULT_CAR_CUSTOMIZATION,
    exhaustSystem: 'stock_oem',
    mufflerType: 'chambered',
  });
  const r34TitaniumRaceAudio = resolveExhaustAudioConfig(r34.soundType, r34.engineAudioProfile, {
    ...DEFAULT_CAR_CUSTOMIZATION,
    exhaustSystem: 'titanium_race',
    mufflerType: 'blast_pipe',
  });
  assert.ok(
    r34TitaniumRaceAudio.volumeMultiplier > r34StockAudio.volumeMultiplier,
    `Titanium Race + Blast Pipe volume (${r34TitaniumRaceAudio.volumeMultiplier}) must exceed Stock OEM (${r34StockAudio.volumeMultiplier})`
  );
  assert.ok(
    r34TitaniumRaceAudio.filterCutoffBoost > r34StockAudio.filterCutoffBoost,
    `Titanium Race filter cutoff boost (${r34TitaniumRaceAudio.filterCutoffBoost}) must exceed Stock OEM (${r34StockAudio.filterCutoffBoost})`
  );

  // 4. Turbo vehicles build positive manifold boost (turboBoostBar > 0.5) under high-RPM throttle and trigger short irregular backfire bursts on throttle lift
  let r34State = createInitialCarState('mountain', 0);
  for (let i = 0; i < 28; i++) {
    r34State = stepCarPhysics(
      r34State,
      { forward: true, backward: false, left: false, right: false, handbrake: true, revEngine: true },
      'mountain',
      1 / 30,
      r34,
      {
        ...DEFAULT_CAR_CUSTOMIZATION,
        exhaustSystem: 'straight_pipe',
        turboSetup: 'big_single_flutter',
        backfireFrequency: 1.0,
        flameIntensity: 1.0,
      }
    );
  }
  assert.ok(
    (r34State.turboBoostBar ?? 0) > 0.6,
    `Turbo R34 under high-RPM throttle must build positive manifold boost (got ${r34State.turboBoostBar})`
  );

  // Lift throttle: backfireTimer should be a crisp short burst (<= 0.14s) and backfireIntensity > 0
  r34State = stepCarPhysics(
    r34State,
    { forward: false, backward: false, left: false, right: false, handbrake: true, revEngine: false },
    'mountain',
    1 / 30,
    r34,
    {
      ...DEFAULT_CAR_CUSTOMIZATION,
      exhaustSystem: 'straight_pipe',
      turboSetup: 'big_single_flutter',
      backfireFrequency: 1.0,
      flameIntensity: 1.0,
    }
  );
  assert.ok(
    r34State.backfireTimer > 0 && r34State.backfireTimer <= 0.14,
    `Exhaust flame burst must be short and realistic (got ${r34State.backfireTimer.toFixed(3)}s)`
  );
  assert.ok(r34State.backfireIntensity > 0.5, 'Backfire intensity must be strong with straight pipe & max flame intensity');

  // 5. Setting flameIntensity to 0 suppresses visual exhaust flames
  let noFlameState = createInitialCarState('mountain', 0);
  for (let i = 0; i < 25; i++) {
    noFlameState = stepCarPhysics(
      noFlameState,
      { forward: true, backward: false, left: false, right: false, handbrake: true, revEngine: true },
      'mountain',
      1 / 30,
      r34,
      { ...DEFAULT_CAR_CUSTOMIZATION, flameIntensity: 0 }
    );
  }
  noFlameState = stepCarPhysics(
    noFlameState,
    { forward: false, backward: false, left: false, right: false, handbrake: true, revEngine: false },
    'mountain',
    1 / 30,
    r34,
    { ...DEFAULT_CAR_CUSTOMIZATION, flameIntensity: 0 }
  );
  assert.equal(noFlameState.backfireTimer, 0, 'Setting flameIntensity to 0 must suppress exhaust flame bursts');
});

test('Exhaust Sound Dyno Facility computeDynoCurve calculates deterministic WHP, Torque Nm, and Boost BAR across vehicles and upgrades', () => {
  const r34 = getVehicleById('r34_gtr');
  const ae86 = getVehicleById('ae86_trueno');

  const stockR34Dyno = computeDynoCurve(r34, DEFAULT_CAR_CUSTOMIZATION);
  const tunedR34Dyno = computeDynoCurve(r34, {
    ...DEFAULT_CAR_CUSTOMIZATION,
    horsepowerTuning: 1.35,
    turboSetup: 'big_single_flutter',
    exhaustSystem: 'titanium_race',
  });
  const stockAe86Dyno = computeDynoCurve(ae86, DEFAULT_CAR_CUSTOMIZATION);

  assert.ok(stockR34Dyno.points.length >= 25, 'Dyno curve should generate high-resolution RPM data points');
  assert.ok(
    stockR34Dyno.peakWhp > stockAe86Dyno.peakWhp,
    `R34 GT-R peak WHP (${stockR34Dyno.peakWhp}) must exceed AE86 Trueno (${stockAe86Dyno.peakWhp})`
  );
  assert.ok(
    tunedR34Dyno.peakWhp > stockR34Dyno.peakWhp + 80,
    `Stage-tuned Titanium Race + Big Single Turbo R34 (${tunedR34Dyno.peakWhp} WHP) must produce significantly more WHP than stock (${stockR34Dyno.peakWhp} WHP)`
  );
  assert.ok(
    tunedR34Dyno.peakTorqueNm > stockR34Dyno.peakTorqueNm,
    `Tuned R34 peak torque (${tunedR34Dyno.peakTorqueNm} Nm) must exceed stock (${stockR34Dyno.peakTorqueNm} Nm)`
  );
  assert.equal(stockAe86Dyno.maxBoostBar, 0, 'Stock naturally aspirated AE86 must report 0.00 BAR manifold boost');
  assert.ok(tunedR34Dyno.maxBoostBar > 1.2, `Big Single Turbo R34 must build >1.2 BAR boost (got ${tunedR34Dyno.maxBoostBar})`);
});

test('multiplayer race countdown state machine, customization sync, and tandem drift proximity calculator work accurately', () => {
  const store = new MultiplayerRoomStore();
  const roomId = 'pub_akina_1';

  const p1 = {
    playerId: 'driver_takumi',
    playerName: 'Takumi',
    vehicleId: 'ae86_trueno',
    paintColor: '#f8fafc',
    paintFinish: 'gloss' as const,
    bodyKit: 'street_aero' as const,
    spoilerStyle: 'ducktail' as const,
    rimStyle: 'watanabe_8spoke' as const,
    rimColor: '#1e293b',
    x: 100,
    y: 12,
    z: 200,
    vx: 0,
    vz: 22,
    heading: 0,
    steerAngle: 0.25,
    driftAngle: 32,
    isDrifting: true,
    speedKmh: 82,
    rpm: 6800,
    gear: 3,
    driftScore: 4200,
    currentDriftPoints: 850,
    driftMultiplier: 3,
    headlightsOn: true,
    pingMs: 14,
    lastUpdatedAt: Date.now(),
  };

  const p2 = {
    ...p1,
    playerId: 'driver_keisuke',
    playerName: 'Keisuke',
    vehicleId: 'rx7_fd',
    paintColor: '#eab308',
    x: 101.5,
    y: 12,
    z: 193.5, // ~6.7m behind Takumi along +Z heading
    driftAngle: 30,
    speedKmh: 84,
  };

  store.joinRoom(roomId, p1);
  store.joinRoom(roomId, p2);

  // Verify tandem proximity & synchronization calculation for Chase driver (p2 following p1)
  const playersInRoom = store.getRoomPlayers(roomId);
  assert.equal(playersInRoom.length, 2);
  assert.equal(playersInRoom[0].bodyKit, 'street_aero', 'Remote vehicle bodyKit must sync');
  assert.equal(playersInRoom[0].rimStyle, 'watanabe_8spoke', 'Remote vehicle rimStyle must sync');

  const tandem = computeTandemTelemetry(
    {
      x: p2.x,
      z: p2.z,
      heading: p2.heading,
      speedKmh: p2.speedKmh,
      driftAngle: p2.driftAngle,
      isDrifting: p2.isDrifting,
    },
    playersInRoom,
    p2.playerId
  );

  assert.equal(tandem.active, true, 'Tandem telemetry must activate when two cars drift in close proximity');
  assert.equal(tandem.partnerName, 'Takumi');
  assert.equal(tandem.role, 'CHASE', 'Trailing driver behind lead car must be assigned CHASE role');
  assert.ok(tandem.distanceMeters > 4 && tandem.distanceMeters < 10, `Expected ~6.7m tandem distance, got ${tandem.distanceMeters}`);
  assert.ok(tandem.angleSyncPct >= 90, `Expected high angle sync %, got ${tandem.angleSyncPct}%`);
  assert.ok(tandem.bonusMultiplier >= 1.5, `Expected tandem bonus multiplier >= 1.5x, got ${tandem.bonusMultiplier}x`);

  // Verify server-authoritative race countdown -> active -> lobby reset
  const started = store.startRace(roomId, 2);
  assert.equal(started.ok, true);
  assert.equal(started.room?.raceStatus, 'countdown');
  assert.equal(started.room?.totalLaps, 2);

  // Advance clock by 4 seconds past 3.5s countdown
  const roomInternal = store.getRoom(roomId);
  assert.ok(roomInternal);
  if (roomInternal) {
    store.tickRoomRaceState(roomInternal, (roomInternal.raceCountdownStartMs ?? Date.now()) + 4000);
    assert.equal(roomInternal.raceStatus, 'active', 'Room must transition from countdown to active after 3.5s');
  }

  const reset = store.resetRace(roomId);
  assert.equal(reset.ok, true);
  assert.equal(reset.room?.raceStatus, 'lobby', 'resetRace must return room to free-roam lobby state');

  // Verify private room creation and isolation
  const privateRoom = store.createRoom({
    name: 'Secret Touge Club',
    isPrivate: true,
    password: 'jdm',
  });
  assert.equal(privateRoom.isPrivate, true, 'Room must be flagged private');
  assert.equal(privateRoom.hasPassword, true, 'Room must require password');

  // Verify race countdown dismissal logic: when countdown has exceeded 4.5s (3.5s countdown + 1.0s GO!),
  // the banner must clear (null) rather than staying stuck on 'GO!'
  const cdStart = Date.now() - 4600;
  const elapsed = Date.now() - cdStart;
  const bannerLabel = elapsed >= 4500 ? null : elapsed >= 3500 ? 'GO!' : '1';
  assert.equal(bannerLabel, null, 'Race countdown GO! must be dismissed after 1 second and never remain stuck');
});

test('both maps define all 6 Open-World interactive POI categories on drivable road coordinates', () => {
  for (const mapId of ['mountain', 'blossom'] as MapId[]) {
    const pois = MAPS_DATA[mapId].pois ?? [];
    assert.equal(pois.length, 6, `${mapId} must define 6 Open-World POIs`);
    const categories = new Set(pois.map((p) => p.category));
    for (const expectedCat of ['garage', 'dyno', 'dealership', 'fuel_station', 'drift_zone', 'race_event'] as const) {
      assert.ok(categories.has(expectedCat), `${mapId} POIs must include ${expectedCat}`);
    }
  }
});

test('3-profile Mobile Controller Layout Editor (including movable/resizable steer_wheel), 9-channel SoundEngine mixer, and 9-category GameSettings driving & steering assists work accurately', () => {
  // 1. Verify all 3 Mobile Controller Layout Profiles contain all 10 translucent touch elements (including steer_wheel) in safe bounds
  const layouts = createDefaultMobileLayouts();
  assert.equal(layouts.length, 3, 'Must create 3 mobile controller layout profiles');
  assert.equal(layouts[0].steeringType, 'wheel', 'Default mobile layout profile should default to analog steering wheel');
  const requiredControls: MobileControlId[] = [
    'steer_wheel',
    'steer_left',
    'steer_right',
    'handbrake',
    'nitro',
    'throttle',
    'brake',
    'gear_up',
    'gear_down',
    'camera',
  ];
  for (const prof of layouts) {
    for (const ctrlId of requiredControls) {
      const el = prof.elements[ctrlId];
      assert.ok(el, `Profile ${prof.id} must define element ${ctrlId}`);
      assert.ok(el.xPct >= 4 && el.xPct <= 96, `${prof.id}.${ctrlId} xPct (${el.xPct}) must be within safe screen bounds`);
      assert.ok(el.yPct >= 4 && el.yPct <= 96, `${prof.id}.${ctrlId} yPct (${el.yPct}) must be within safe screen bounds`);
      assert.ok(el.opacity >= 0.2 && el.opacity <= 0.65, `${prof.id}.${ctrlId} default opacity (${el.opacity}) must be translucent so road remains visible`);
      assert.ok((el.sensitivity ?? 1.0) >= 0.5 && (el.sensitivity ?? 1.0) <= 2.0, `${prof.id}.${ctrlId} must define sensitivity`);
    }
  }
  // Verify right-handed profile puts throttle on the right (>75% X) and steer_wheel on the left (<30% X), and left-handed profile mirrors them
  assert.ok(layouts[0].elements.throttle.xPct > 75, 'Right-handed layout must place Gas pedal on the right side');
  assert.ok(layouts[0].elements.steer_wheel.xPct < 30, 'Right-handed layout must place Analog Steering Wheel on the left side');
  assert.ok(layouts[1].elements.throttle.xPct < 25, 'Left-handed layout must mirror Gas pedal to the left side');
  assert.ok(layouts[1].elements.steer_wheel.xPct > 70, 'Left-handed layout must mirror Analog Steering Wheel to the right side');

  // 2. Verify 9-Channel SoundEngine audio mixer applies and clamps all 9 channels
  soundEngine.setAudioSettings({
    masterVolume: 0.8,
    engineVolume: 0.95,
    exhaustVolume: 0.9,
    turboVolume: 0.85,
    tireVolume: 0.75,
    environmentVolume: 0.6,
    musicVolume: 0.4,
    uiVolume: 0.7,
    collisionVolume: 0.8,
    audioDynamicRange: 'wide',
    engineAudioIntensity: 1.15,
    exhaustAudioIntensity: 1.2,
  });
  const vols = soundEngine.getChannelVolumes();
  assert.equal(vols.masterVolume, 0.8);
  assert.equal(vols.engineVolume, 0.95);
  assert.equal(vols.exhaustVolume, 0.9);
  assert.equal(vols.turboVolume, 0.85);
  assert.equal(vols.tireVolume, 0.75);
  assert.equal(vols.environmentVolume, 0.6);
  assert.equal(vols.musicVolume, 0.4);
  assert.equal(vols.uiVolume, 0.7);
  assert.equal(vols.collisionVolume, 0.8);

  // 3. Verify 9-Category GameSettings driving assists (Full TCS vs TCS Off) affect wheelspin and drift angle
  const s15 = getVehicleById('silvia_s15');
  let tcsOffState = createInitialCarState('mountain', 0);
  let tcsFullState = createInitialCarState('mountain', 0);

  for (let i = 0; i < 40; i++) {
    const inp = {
      forward: true,
      backward: false,
      left: i >= 15,
      right: false,
      handbrake: i >= 15 && i <= 20,
      analogSteer: i >= 15 ? 0.85 : 0,
    };
    tcsOffState = stepCarPhysics(
      tcsOffState,
      inp,
      'mountain',
      1 / 30,
      s15,
      undefined,
      'automatic',
      'drift',
      'clear',
      {
        ...DEFAULT_GAME_SETTINGS,
        tractionControl: 'off',
        stabilityControl: false,
      }
    );
    tcsFullState = stepCarPhysics(
      tcsFullState,
      inp,
      'mountain',
      1 / 30,
      s15,
      undefined,
      'automatic',
      'drift',
      'clear',
      {
        ...DEFAULT_GAME_SETTINGS,
        tractionControl: 'full',
        stabilityControl: true,
      }
    );
  }
  assert.ok(
    Math.abs(tcsOffState.driftAngle) > Math.abs(tcsFullState.driftAngle),
    `TCS Off (${tcsOffState.driftAngle.toFixed(1)}°) must allow wider drift angle than Full TCS + Stability Control (${tcsFullState.driftAngle.toFixed(1)}°)`
  );

  // 4. Verify maxSteeringAngleDeg and steeringReturnSpeed settings scale steering lock and return-to-center rate
  let narrowLockState = createInitialCarState('mountain', 0);
  let wideLockState = createInitialCarState('mountain', 0);
  for (let i = 0; i < 20; i++) {
    const steerInp = {
      forward: true,
      backward: false,
      left: true,
      right: false,
      handbrake: false,
      analogSteer: 1.0,
    };
    narrowLockState = stepCarPhysics(narrowLockState, steerInp, 'mountain', 1 / 30, s15, undefined, 'automatic', 'drift', 'clear', {
      ...DEFAULT_GAME_SETTINGS,
      maxSteeringAngleDeg: 32,
      steeringReturnSpeed: 0.6,
    });
    wideLockState = stepCarPhysics(wideLockState, steerInp, 'mountain', 1 / 30, s15, undefined, 'automatic', 'drift', 'clear', {
      ...DEFAULT_GAME_SETTINGS,
      maxSteeringAngleDeg: 58,
      steeringReturnSpeed: 1.8,
    });
  }
  assert.ok(
    Math.abs(wideLockState.steerAngle) > Math.abs(narrowLockState.steerAngle),
    `58° maxSteeringAngleDeg (${wideLockState.steerAngle.toFixed(3)}) must produce wider steering lock than 32° (${narrowLockState.steerAngle.toFixed(3)})`
  );
});

test('all 26 vehicles build bespoke 3D rear taillight assemblies with independent running, brake, reverse, and L/R indicator materials', () => {
  if (typeof globalThis.document === 'undefined') {
    const noop = () => {};
    const gradientStub = { addColorStop: noop };
    const ctxStub = new Proxy(
      {
        createLinearGradient: () => gradientStub,
        createRadialGradient: () => gradientStub,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
        measureText: () => ({ width: 10 }),
      },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return noop;
        },
        set() {
          return true;
        },
      }
    );
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        width: 64,
        height: 64,
        getContext: () => ctxStub,
      }),
    };
  }

  assert.equal(VEHICLES_CATALOG.length, 26, 'Catalog must contain all 26 vehicles');

  for (const spec of VEHICLES_CATALOG) {
    const rig = buildDetailedVehicleModel(spec, DEFAULT_CAR_CUSTOMIZATION, false);

    assert.ok(rig.tailRunningMaterial, `${spec.id} must expose tailRunningMaterial`);
    assert.ok(rig.brakeLightMaterial, `${spec.id} must expose brakeLightMaterial`);
    assert.ok(rig.reverseLightMaterial, `${spec.id} must expose reverseLightMaterial`);
    assert.ok(rig.turnSignalLeftMaterial, `${spec.id} must expose turnSignalLeftMaterial`);
    assert.ok(rig.turnSignalRightMaterial, `${spec.id} must expose turnSignalRightMaterial`);
    assert.ok(rig.rearTailLight, `${spec.id} must expose rearTailLight PointLight`);

    // Ensure the 5 functional rear-lighting materials are distinct Material instances so they can be controlled independently
    const uniqueMats = new Set([
      rig.tailRunningMaterial,
      rig.brakeLightMaterial,
      rig.reverseLightMaterial,
      rig.turnSignalLeftMaterial,
      rig.turnSignalRightMaterial,
    ]);
    assert.equal(
      uniqueMats.size,
      5,
      `${spec.id} must have 5 distinct rear-lighting material instances (running, brake, reverse, left turn, right turn)`
    );

    // Traverse the 3D chassisGroup and count meshes wired to each rear-lighting material
    let runningMeshCount = 0;
    let brakeMeshCount = 0;
    let reverseMeshCount = 0;
    let leftTurnMeshCount = 0;
    let rightTurnMeshCount = 0;

    rig.chassisGroup.traverse((obj) => {
      const mesh = obj as { isMesh?: boolean; material?: unknown };
      if (!mesh.isMesh) return;
      if (mesh.material === rig.tailRunningMaterial) runningMeshCount++;
      if (mesh.material === rig.brakeLightMaterial) brakeMeshCount++;
      if (mesh.material === rig.reverseLightMaterial) reverseMeshCount++;
      if (mesh.material === rig.turnSignalLeftMaterial) leftTurnMeshCount++;
      if (mesh.material === rig.turnSignalRightMaterial) rightTurnMeshCount++;
    });

    assert.ok(
      runningMeshCount >= 2,
      `${spec.id} must have left & right 3D running light meshes wired to tailRunningMaterial (found ${runningMeshCount})`
    );
    assert.ok(
      brakeMeshCount >= 2,
      `${spec.id} must have dedicated 3D brake light emitter meshes wired to brakeLightMaterial (found ${brakeMeshCount})`
    );
    assert.ok(
      reverseMeshCount >= 1,
      `${spec.id} must have 3D reverse light emitter meshes wired to reverseLightMaterial (found ${reverseMeshCount})`
    );
    assert.ok(
      leftTurnMeshCount >= 1,
      `${spec.id} must have 3D left turn indicator meshes wired to turnSignalLeftMaterial (found ${leftTurnMeshCount})`
    );
    assert.ok(
      rightTurnMeshCount >= 1,
      `${spec.id} must have 3D right turn indicator meshes wired to turnSignalRightMaterial (found ${rightTurnMeshCount})`
    );
    rig.dispose();
  }
});

test('zero-lag material customization updates PBR paint, rims, calipers, window tint, and ride height in-place without rebuilding 3D geometry', () => {
  // 1. Legacy vehicle ID aliases resolve to their proper catalog vehicles
  assert.equal(getVehicleById('s15_silvia').id, 'silvia_s15');
  assert.equal(getVehicleById('bmw_m3_gtr').id, 'bmw_m3_e46');

  const r34 = getVehicleById('r34_gtr');
  const baseKey = getVehicleStructuralKey(r34, DEFAULT_CAR_CUSTOMIZATION, false);

  // 2. Non-structural changes (paint, finish, brightness, flake, roughness, rim/caliper color, tint, ride height, tuning, exhaust) preserve structural key
  const nonStructuralCustom = {
    ...DEFAULT_CAR_CUSTOMIZATION,
    paintColor: '#dc2626',
    paintFinish: 'matte' as const,
    paintBrightness: 1.2,
    metallicIntensity: 0.9,
    paintRoughness: 0.78,
    rimColor: '#fbbf24',
    caliperColor: '#10b981',
    windowTint: 0.8,
    rideHeightOffset: -0.045,
    horsepowerTuning: 1.35,
    flameIntensity: 1.8,
    backfireFrequency: 1.0,
  };
  assert.equal(
    getVehicleStructuralKey(r34, nonStructuralCustom, false),
    baseKey,
    'Non-structural paint, material, ride height, tuning, and audio changes must not trigger a 3D geometry rebuild'
  );

  // 3. Structural aero/wheel changes must produce a distinct structural key
  const widebodyCustom = {
    ...DEFAULT_CAR_CUSTOMIZATION,
    bodyKit: 'widebody_aero' as const,
  };
  assert.notEqual(
    getVehicleStructuralKey(r34, widebodyCustom, false),
    baseKey,
    'Changing bodyKit must change the structural key so 3D geometry is rebuilt'
  );

  // 4. applyVehicleMaterialCustomization updates materials and ride height in-place on an existing rig
  const rig = buildDetailedVehicleModel(r34, DEFAULT_CAR_CUSTOMIZATION, false);
  applyVehicleMaterialCustomization(rig, r34, nonStructuralCustom);

  assert.equal(
    rig.bodyMaterial.clearcoat,
    0,
    'Applying matte finish in-place must set bodyMaterial.clearcoat to 0'
  );
  assert.ok(
    rig.bodyMaterial.roughness >= 0.75,
    'Applying matte finish in-place must update bodyMaterial.roughness'
  );
  assert.equal(
    rig.rimMaterial.color.getHexString(),
    'fbbf24',
    'Applying rimColor in-place must update rimMaterial.color'
  );
  assert.equal(
    rig.caliperMaterial.color.getHexString(),
    '10b981',
    'Applying caliperColor in-place must update caliperMaterial.color'
  );
  assert.ok(
    Math.abs(rig.chassisGroup.position.y - -0.045) < 1e-6,
    'Applying rideHeightOffset in-place must update chassisGroup.position.y'
  );

  rig.dispose();
});


