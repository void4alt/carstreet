export type MapId = 'mountain' | 'blossom';
export type TimeOfDay = 'morning' | 'afternoon' | 'golden_hour' | 'sunset' | 'night' | 'day';
export type WeatherMode = 'clear' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'foggy';
export type GraphicsPreset = 'ultra' | 'high' | 'medium' | 'low' | 'performance';
export type CameraMode = 'chase' | 'close' | 'hood' | 'cockpit' | 'side_drift' | 'wide' | 'orbit';
export type GameState = 'title' | 'garage' | 'playing' | 'paused';
export type GarageCameraView =
  | 'sheet'
  | 'turntable'
  | 'front'
  | 'side'
  | 'rear'
  | 'top'
  | 'interior'
  | 'dyno';
export type TransmissionMode = 'automatic' | 'manual_clutch_assist' | 'manual';
export type HeadlightMode = 'auto' | 'off' | 'drl' | 'low' | 'high';
export type HandlingMode = 'drift' | 'street' | 'grip' | 'race' | 'performance';
export type CollisionType = 'none' | 'guardrail' | 'concrete' | 'tree';
export type TuningPresetType = 'street' | 'grip' | 'drift' | 'custom';
export type ControlSchemeMode =
  | 'auto'
  | 'pc'
  | 'mobile_wheel'
  | 'mobile_buttons'
  | 'mobile_tilt';

export type MobileControlId =
  | 'steer_left'
  | 'steer_right'
  | 'steer_wheel'
  | 'handbrake'
  | 'nitro'
  | 'brake'
  | 'throttle'
  | 'gas'
  | 'gear_up'
  | 'gear_down'
  | 'camera';

export interface MobileControlElementConfig {
  id: MobileControlId;
  label: string;
  xPct: number; // 4 to 96 (% of viewport width)
  yPct: number; // 6 to 94 (% of viewport height)
  scale: number; // 0.65 to 1.65
  opacity: number; // 0.20 to 0.95
  rotationDeg: number; // -45 to +45
  sensitivity?: number; // 0.5 to 1.5 (default 1.0)
  visible?: boolean; // default true
}

export interface MobileControllerLayoutProfile {
  id: string;
  name: string;
  handedness: 'right' | 'left';
  steeringType: 'buttons' | 'wheel' | 'tilt';
  controls: Record<MobileControlId, MobileControlElementConfig>;
  elements: Record<MobileControlId, MobileControlElementConfig>;
}

export type EngineSoundType =
  | 'i6_turbo' // Skyline R34/R33/R32, Supra MK4/MK5, Chaser JZX100
  | 'rotary' // Mazda RX-7 FD, RX-7 FC
  | 'i4_na' // AE86 Trueno, Honda S2000, BMW M3 E30
  | 'i4_turbo' // Silvia S15/S14/S13, 180SX, Lancer Evo IX/X, Civic FK8, MX-5 Turbo
  | 'boxer_turbo' // Subaru WRX STI, Toyota GR86 Turbo
  | 'v6_na' // Honda NSX, Nissan 350Z, 370Z
  | 'v8_race'; // Ferrari F40, BMW M3 E46 GTR

export type EngineAudioProfileId =
  | 'rb26dett' // Nissan Skyline GT-R R34, R33, R32 (2.6L Twin-Turbo I6)
  | 'sr20det' // Nissan Silvia S15, S14, S13, 180SX (2.0L Turbo I4)
  | 'vq_tt_v6' // Nissan Fairlady Z Z33 (3.5L VQ35DE), Z34 (3.7L VQ37VHR)
  | 'vq35de_v6' // Nissan 350Z Z33 (3.5L VQ35DE V6)
  | 'vq37vhr_v6' // Nissan 370Z Z34 (3.7L VQ37VHR V6)
  | '2jz_gte' // Toyota Supra RZ JZA80 (3.0L Twin-Turbo I6)
  | 'b58_turbo' // Toyota GR Supra RZ A90 (3.0L Twin-Scroll Turbo I6)
  | '4age_20v_na' // Toyota AE86 Sprinter Trueno (1.6L 4A-GE 20V ITB NA I4)
  | 'fa24_boxer' // Toyota GR86 RZ Pandem (2.4L Boxer-4)
  | '1jz_gte' // Toyota Chaser Tourer V JZX100 (2.5L Single-Turbo I6)
  | '13b_rotary' // Mazda RX-7 FD3S (13B-REW Sequential Twin-Turbo Rotary)
  | '13b_t_rotary' // Mazda RX-7 FC3S (13B-T Single-Turbo Rotary)
  | 'bp_ze_turbo' // Mazda MX-5 Miata NA8C (1.8L BP-ZE Turbo I4)
  | 'c30a_vtec_v6' // Honda NSX Type R NA1 (3.0L C30A DOHC VTEC V6 NA)
  | 'f22c_vtec_i4' // Honda S2000 Type S AP2 (2.2L F22C1 9000-RPM VTEC I4 NA)
  | 'k20c1_vtec_turbo' // Honda Civic Type R FK8 Time-Attack (2.0L K20C1 VTEC Turbo I4)
  | '4g63t_mivec' // Mitsubishi Lancer Evo IX MR CT9A (2.0L 4G63T Turbo I4)
  | '4b11t_mivec' // Mitsubishi Lancer Evo X Final Edition CZ4A (2.0L 4B11T Twin-Scroll I4)
  | 'ej207_boxer' // Subaru Impreza WRX STI Spec C GDB (2.0L EJ207 Boxer-4 Turbo)
  | 'p60b40_v8' // BMW M3 GTR E46 (4.0L Flat-Plane V8 Race + Straight-Cut Gears)
  | 's14b25_na' // BMW M3 Sport Evolution II E30 (2.5L S14B25 High-Rev ITB I4 NA)
  | 'f120b_tt_v8'; // Ferrari F40 Competizione (2.9L Tipo F120B Twin-Turbo V8)

export type RoadSurfaceType =
  | 'normal_asphalt'
  | 'smooth_asphalt'
  | 'wet_asphalt'
  | 'shoulder'
  | 'gravel'
  | 'dirt'
  | 'grass';

export interface VehiclePhysicsConfig {
  gearRatios: [number, number, number, number, number, number];
  finalDrive: number;
  gearCount?: 5 | 6; // 5-speed (AE86, S13, FC3S, FD3S, R32, R33, Evo IX, E30, F40) or 6-speed
  shiftTimeSec?: number; // Transmission shift duration (0.14s sequential race to 0.27s vintage H-pattern)
  frontGrip: number; // Front lateral cornering authority (0.85 - 1.25)
  rearGrip: number; // Rear lateral stability vs slide readiness (0.78 - 1.18)
  suspensionStiffness: number; // Roll/pitch resistance (0.82 - 1.32)
  steeringSensitivity: number; // Turn-in sharpness (0.88 - 1.22)
  brakeStrength: number; // Braking deceleration multiplier (0.88 - 1.28)
  dragCoeff: number; // Aerodynamic drag coefficient Cd (0.28 - 0.39)
  downforceCoeff: number; // High-speed aero grip & stability (0.12 - 0.65)
  diffLock: number; // LSD lock ratio (0.50 - 0.92)
  turbocharged: boolean; // True if turbocharged (enables spool & BOV), false if NA
  vtecCrossoverRpm?: number; // Optional VTEC high-cam engagement RPM
  peakTorqueRpm: number;
  redlineRpm: number;
}

export type BodySilhouetteType =
  | 'r34_boxy_coupe'
  | 'supra_aero_coupe'
  | 'rx7_fluid_coupe'
  | 'ae86_hatch_coupe'
  | 's15_sleek_coupe'
  | 'nsx_mid_wedge'
  | 'z33_fastback'
  | 'sti_rally_sedan'
  | 'evo_aggressive_sedan'
  | 's2000_roadster'
  | 'e46_euro_coupe'
  | 'f40_super_wedge';

export type PaintFinishType = 'gloss' | 'metallic' | 'matte' | 'satin' | 'pearl' | 'chrome';
export type RimStyleType = 'te37_6spoke' | 'bbs_mesh' | 'watanabe_8spoke' | 'advan_5spoke';
export type RimStyle = RimStyleType;
export type SpoilerStyleType = 'stock' | 'gt_carbon' | 'ducktail' | 'none';
export type SpoilerStyle = SpoilerStyleType;
export type BodyKitType = 'stock' | 'street_aero' | 'widebody_aero' | 'track_gt';
export type HoodStyleType = 'stock' | 'carbon_vented' | 'twin_duct';
export type ExhaustStyleType = 'stock' | 'titanium_cannon' | 'dual_blast' | 'quad_race';
export type ExhaustSystemType = 'stock_oem' | 'sports_catback' | 'straight_pipe' | 'titanium_race';
export type MufflerType = 'chambered' | 'resonated' | 'blast_pipe' | 'track_dump';
export type TurboSetupType =
  | 'stock_na_or_oem'
  | 'street_spool'
  | 'big_single_flutter'
  | 'anti_lag_sequential';
export type BlowOffValveType =
  | 'recirculating'
  | 'atmospheric_vent'
  | 'compressor_flutter'
  | 'hybrid_dual';
export type LiveryStyleType = 'none' | 'touge_stripe' | 'door_number';
export type FrontSplitterType = 'stock' | 'carbon_race' | 'twin_canard';
export type RearDiffuserType = 'stock' | 'carbon_finned' | 'time_attack';
export type SideSkirtType = 'stock' | 'aero_step' | 'carbon_blade';
export type GrilleStyleType = 'stock' | 'mesh_intercooler' | 'sport_slat';

export interface SavedPaintPreset {
  name: string;
  paintColor: string;
  paintFinish: PaintFinishType;
  paintBrightness?: number;
  metallicIntensity?: number;
  paintRoughness?: number;
}

export interface CustomPaintPreset {
  id: string;
  name: string;
  hex: string;
  finish: PaintFinishType;
  brightness: number;
  metallicIntensity: number;
  metallicFlake?: number;
  roughness: number;
}

export interface VehicleCustomization {
  paintColor: string;
  paintFinish: PaintFinishType;
  paintBrightness?: number; // 0.7 to 1.3 (default 1.0)
  metallicIntensity?: number; // 0.0 to 1.0
  paintMetallicFlake?: number; // 0.0 to 1.0
  paintRoughness?: number; // 0.02 to 0.85
  rimStyle: RimStyleType;
  rimColor: string;
  caliperColor: string;
  spoilerStyle: SpoilerStyleType;
  bodyKit: BodyKitType;
  rideHeightOffset: number; // 0 = stock, -0.025 = track, -0.048 = stance
  windowTint: number; // opacity/darkness 0.25 (clear) to 0.92 (limo)
  hoodStyle?: HoodStyleType;
  exhaustStyle?: ExhaustStyleType;
  exhaustSystem?: ExhaustSystemType;
  mufflerType?: MufflerType;
  turboSetup?: TurboSetupType;
  bovType?: BlowOffValveType;
  exhaustVolume?: number; // 0.5 to 1.5 (default 1.1)
  crackleIntensity?: number; // 0.0 to 1.0 (default 0.78)
  backfireFrequency?: number; // 0.0 to 1.0 (default 0.75)
  flameIntensity?: number; // 0.0 to 1.3 (default 0.95)
  liveryStyle?: LiveryStyleType;
  frontSplitter?: FrontSplitterType;
  rearDiffuser?: RearDiffuserType;
  sideSkirtStyle?: SideSkirtType;
  grilleStyle?: GrilleStyleType;
  // Tuning Preset & Full CarX-style Drift Setup Sliders
  tuningPreset?: TuningPresetType;
  steeringSensitivity?: number; // 0.75 to 1.35 (default 1.0)
  horsepowerTuning?: number; // 0.85 to 1.35 (default 1.0)
  suspensionStiffness?: number; // 0.75 to 1.35 (default 1.0)
  frontSuspensionStiffness?: number; // 0.70 to 1.40 (default 1.0)
  rearSuspensionStiffness?: number; // 0.70 to 1.40 (default 1.0)
  frontTireGrip?: number; // 0.75 to 1.35 (default 1.0)
  rearTireGrip?: number; // 0.65 to 1.35 (default 1.0)
  maxSteerAngleDeg?: number; // 35 to 60 deg (default 50)
  diffLock?: number; // 0.4 to 1.0 (default 0.82)
  diffAccelLock?: number; // 0.3 to 1.0 (default 0.85)
  diffDecelLock?: number; // 0.2 to 0.9 (default 0.55)
  handbrakeStrength?: number; // 0.7 to 1.4 (default 1.0)
  tirePressurePsi?: number; // 20 to 44 PSI (default 30)
  frontCamberDeg?: number; // -6.0 to 0.0 deg (default -3.0)
  rearCamberDeg?: number; // -4.5 to 0.0 deg (default -1.2)
  frontToeDeg?: number; // -0.5 to 0.5 deg (default -0.15)
  rearToeDeg?: number; // -0.5 to 0.5 deg (default 0.20)
  frontWeightBias?: number; // 45 to 58 % (default 52)
  finalDriveRatio?: number; // 3.10 (tall top speed) to 4.90 (short touge acceleration)
}

export const DEFAULT_CAR_CUSTOMIZATION: VehicleCustomization = {
  paintColor: '#1165d8',
  paintFinish: 'metallic',
  paintBrightness: 1.0,
  metallicIntensity: 0.72,
  paintMetallicFlake: 0.72,
  paintRoughness: 0.14,
  rimStyle: 'te37_6spoke',
  rimColor: '#cbd5e1',
  caliperColor: '#eab308',
  spoilerStyle: 'stock',
  bodyKit: 'stock',
  rideHeightOffset: -0.02,
  windowTint: 0.58,
  exhaustStyle: 'stock',
  exhaustSystem: 'sports_catback',
  mufflerType: 'resonated',
  turboSetup: 'stock_na_or_oem',
  bovType: 'compressor_flutter',
  exhaustVolume: 1.1,
  crackleIntensity: 0.78,
  backfireFrequency: 0.75,
  flameIntensity: 0.95,
  tuningPreset: 'drift',
  steeringSensitivity: 1.0,
  horsepowerTuning: 1.0,
  suspensionStiffness: 1.0,
  frontSuspensionStiffness: 1.0,
  rearSuspensionStiffness: 0.95,
  frontTireGrip: 1.1,
  rearTireGrip: 0.88,
  maxSteerAngleDeg: 52,
  diffLock: 0.86,
  diffAccelLock: 0.88,
  diffDecelLock: 0.58,
  handbrakeStrength: 1.1,
  tirePressurePsi: 32,
  frontCamberDeg: -3.5,
  rearCamberDeg: -1.2,
  frontToeDeg: -0.15,
  rearToeDeg: 0.15,
  frontWeightBias: 52,
  finalDriveRatio: 3.95,
};

export interface CameraSettings {
  distance: number; // 3.8 to 8.5, default 5.35 (NFS close-chase framing)
  height: number; // 1.15 to 3.2, default 1.68
  smoothing: number; // 5 to 20, default 10.5
  fov: number; // 50 to 78, default 58
  shakeIntensity: number; // 0.0 to 1.5, default 0.65
  rotationSensitivity?: number; // 0.5 to 1.5, default 1.0
  driftCameraLookAhead?: number; // 0.0 to 1.5, default 0.7
  cockpitCameraOffset?: number; // -0.25 to +0.25, default 0
}

export interface KeyBindings {
  accelerate: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
  nitro: string;
  shiftUp: string;
  shiftDown: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  accelerate: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  handbrake: 'Space',
  nitro: 'ShiftLeft',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ',
};

export function createDefaultMobileLayouts(): MobileControllerLayoutProfile[] {
  const rightControls: Record<MobileControlId, MobileControlElementConfig> = {
    steer_left: { id: 'steer_left', label: 'Steer Left', xPct: 10, yPct: 80, scale: 1.08, opacity: 0.44, rotationDeg: 0, sensitivity: 1.0, visible: true },
    steer_right: { id: 'steer_right', label: 'Steer Right', xPct: 24, yPct: 80, scale: 1.08, opacity: 0.44, rotationDeg: 0, sensitivity: 1.0, visible: true },
    steer_wheel: { id: 'steer_wheel', label: 'Steering Wheel', xPct: 15, yPct: 76, scale: 1.18, opacity: 0.44, rotationDeg: 0, sensitivity: 1.0, visible: true },
    handbrake: { id: 'handbrake', label: 'Handbrake (P)', xPct: 33, yPct: 82, scale: 1.08, opacity: 0.46, rotationDeg: 0, sensitivity: 1.0, visible: true },
    nitro: { id: 'nitro', label: 'Nitrous N2O', xPct: 33, yPct: 65, scale: 1.0, opacity: 0.44, rotationDeg: 0, sensitivity: 1.0, visible: true },
    brake: { id: 'brake', label: 'Brake Pedal', xPct: 76, yPct: 82, scale: 1.14, opacity: 0.46, rotationDeg: 0, sensitivity: 1.0, visible: true },
    throttle: { id: 'throttle', label: 'Accelerator Gas', xPct: 90, yPct: 78, scale: 1.22, opacity: 0.48, rotationDeg: 0, sensitivity: 1.0, visible: true },
    gas: { id: 'gas', label: 'Accelerator Gas', xPct: 90, yPct: 78, scale: 1.22, opacity: 0.48, rotationDeg: 0, sensitivity: 1.0, visible: true },
    gear_down: { id: 'gear_down', label: 'Gear Down (G-)', xPct: 76, yPct: 58, scale: 1.02, opacity: 0.42, rotationDeg: 0, sensitivity: 1.0, visible: true },
    gear_up: { id: 'gear_up', label: 'Gear Up (G+)', xPct: 88, yPct: 58, scale: 1.02, opacity: 0.42, rotationDeg: 0, sensitivity: 1.0, visible: true },
    camera: { id: 'camera', label: 'Camera Switch', xPct: 90, yPct: 43, scale: 0.96, opacity: 0.4, rotationDeg: 0, sensitivity: 1.0, visible: true },
  };

  const leftControls = Object.fromEntries(
    Object.entries(rightControls).map(([k, v]) => [
      k,
      {
        ...v,
        xPct: Number((100 - v.xPct).toFixed(1)),
      },
    ])
  ) as Record<MobileControlId, MobileControlElementConfig>;

  const clawControls: Record<MobileControlId, MobileControlElementConfig> = {
    ...rightControls,
    handbrake: { ...rightControls.handbrake, xPct: 76, yPct: 60, scale: 1.12 },
    nitro: { ...rightControls.nitro, xPct: 24, yPct: 60, scale: 1.05 },
    gear_down: { ...rightControls.gear_down, xPct: 12, yPct: 56 },
    gear_up: { ...rightControls.gear_up, xPct: 88, yPct: 54 },
  };

  return [
    {
      id: 'default_right',
      name: 'Standard · Right-Handed Wheel & Pedals',
      handedness: 'right',
      steeringType: 'wheel',
      controls: rightControls,
      elements: rightControls,
    },
    {
      id: 'default_left',
      name: 'Alternative · Left-Handed Mirrored',
      handedness: 'left',
      steeringType: 'wheel',
      controls: leftControls,
      elements: leftControls,
    },
    {
      id: 'custom_claw',
      name: 'Custom · Touge Pro Claw & Buttons',
      handedness: 'right',
      steeringType: 'buttons',
      controls: clawControls,
      elements: clawControls,
    },
  ];
}

export interface GameSettings {
  handlingMode: HandlingMode;
  transmissionMode: TransmissionMode;
  headlightMode: HeadlightMode;
  weather: WeatherMode;
  dynamicTimeCycle: boolean;
  practiceMode: boolean;
  controlScheme: ControlSchemeMode;
  mobileButtonScale: number; // 0.75 to 1.35
  mobileButtonOpacity: number; // 0.20 to 0.95 (default 0.45 translucent grey)
  mobileButtonOffsetX?: number; // -32 to +32 px horizontal offset
  mobileButtonOffsetY?: number; // -24 to +24 px vertical offset
  mobileLeftHanded: boolean;
  activeMobileLayoutId?: string;
  mobileLayouts?: MobileControllerLayoutProfile[];
  hudOpacity?: number; // 0.35 to 1.0 (default 0.90)
  showTelemetryOverlay: boolean;
  showFpsCounter: boolean;
  // Category A — Graphics
  graphicsPreset?: GraphicsPreset | 'custom';
  renderScale?: number; // 0.5 to 1.5
  shadowQuality?: 'off' | 'low' | 'medium' | 'high' | 'ultra';
  reflectionQuality?: 'low' | 'medium' | 'high' | 'ultra';
  antiAliasing?: boolean | 'off' | 'fxaa' | 'smaa';
  ambientOcclusion?: boolean;
  effectsQuality?: 'low' | 'medium' | 'high' | 'ultra';
  viewDistance?: number; // 350 to 850m
  motionBlur?: number; // 0.0 to 1.0
  bloomIntensity?: number; // 0.0 to 1.0
  vsyncEnabled?: boolean;
  vsync?: boolean;
  frameRateLimit?: 30 | 60 | 120 | 0 | 'unlimited';
  // Category B — Display
  fullscreen?: boolean;
  aspectRatio?: 'auto' | '16:9' | '21:9';
  brightness?: number; // 0.70 to 1.35
  gamma?: number; // 0.80 to 1.25
  cameraSensitivity?: number; // 0.5 to 1.5
  // Category C — 9-Channel Independent Audio Mixer
  masterVolume: number; // 0.0 to 1.0
  engineVolume: number; // 0.0 to 1.0
  sfxVolume: number; // 0.0 to 1.0 (legacy general SFX master)
  exhaustVolume?: number; // 0.0 to 1.0
  turboVolume?: number; // 0.0 to 1.0
  tireVolume?: number; // 0.0 to 1.0
  environmentVolume?: number; // 0.0 to 1.0
  musicVolume?: number; // 0.0 to 1.0
  uiVolume?: number; // 0.0 to 1.0
  collisionVolume?: number; // 0.0 to 1.0
  audioDynamicRange?: 'standard' | 'wide' | 'night';
  engineAudioIntensity?: number; // 0.5 to 1.5
  exhaustAudioIntensity?: number; // 0.5 to 1.5
  // Category D — PC & Mobile Controls
  steeringPreset?: 'casual' | 'balanced' | 'simulation' | 'custom';
  steeringSensitivity: number; // 0.6 to 1.5
  steeringLinearity?: number; // 0.5 to 2.0
  steeringDeadzone?: number; // 0.0 to 0.25
  steeringReturnSpeed?: number; // 0.5 to 2.0
  maxSteeringAngleDeg?: number; // 35 to 60
  throttleSensitivity?: number; // 0.5 to 1.5
  brakeSensitivity?: number; // 0.5 to 1.5
  handbrakeSensitivity?: number; // 0.5 to 1.5
  mouseSteeringEnabled?: boolean;
  controllerVibration?: boolean;
  keyBindings?: KeyBindings;
  accelerateKey: string; // default 'KeyW'
  brakeKey: string; // default 'KeyS'
  leftKey: string; // default 'KeyA'
  rightKey: string; // default 'KeyD'
  handbrakeKey: string; // default 'Space'
  nitroKey: string; // default 'ShiftLeft'
  upshiftKey: string; // default 'KeyE'
  downshiftKey: string; // default 'KeyQ'
  // Category E — Gameplay & Driving Assists
  driftAssist?: number; // 0.0 to 1.0
  steeringAssist?: number; // 0.0 to 1.0
  tractionControl?: 'off' | 'sport' | 'full';
  absEnabled?: boolean;
  stabilityControl?: number | boolean;
  speedUnit?: 'kmh' | 'mph';
  showDriftScoreBanner?: boolean;
  hudVisibility?: 'full' | 'minimal' | 'hidden';
  showDriftNotifications: boolean;
  // Category F — Camera
  driftCameraLookAhead?: number; // 0.0 to 1.5
  cockpitCameraOffset?: number; // -0.25 to +0.25
  camera: CameraSettings;
  // Category G — Accessibility
  uiScale?: number; // 0.85 to 1.20
  largeTextMode?: boolean;
  highContrastHud?: boolean;
  reducedMotion?: boolean;
  subtitlesEnabled?: boolean;
  simplifiedHud?: boolean;
  // Category H — Network
  preferredRegion?: 'JP-East' | 'US-West' | 'EU-Central' | 'AP-South' | 'Global';
  networkRegion?: 'JP-East' | 'US-West' | 'EU-Central' | 'AP-South' | 'Global';
  showNetworkPingHud?: boolean;
  showNetworkPing?: boolean;
  defaultRoomPrivate?: boolean;
  defaultPrivateRoom?: boolean;
}

export type PhotoCameraPreset =
  | 'free'
  | 'front_34'
  | 'rear_34'
  | 'side_profile'
  | 'low_angle'
  | 'wide_scenic';

export interface PhotoModeState {
  active: boolean;
  hideHud: boolean;
  preset: PhotoCameraPreset;
  distance: number; // 2.8 to 14.0
  height: number; // 0.35 to 5.5
  fov: number; // 24 to 85
  exposure: number; // 0.55 to 1.85
  dofBlur: number; // 0.0 to 1.0
  yawOffset: number; // radians around car
  pitchOffset: number; // radians vertical tilt
}

export const DEFAULT_PHOTO_MODE_STATE: PhotoModeState = {
  active: false,
  hideHud: false,
  preset: 'front_34',
  distance: 4.8,
  height: 1.15,
  fov: 42,
  exposure: 1.08,
  dofBlur: 0.25,
  yawOffset: 0.58,
  pitchOffset: 0.06,
};

export type ReplayCameraMode =
  | 'chase'
  | 'side_tracking'
  | 'rear_tracking'
  | 'front_tracking'
  | 'wide_cinematic';

export interface ReplayFrame {
  x: number;
  y: number;
  z: number;
  heading: number;
  roadPitch: number;
  roadBank: number;
  bodyRoll: number;
  bodyPitch: number;
  bodyHeave: number;
  steerAngle: number;
  wheelRotation: number;
  rearWheelRotation: number;
  wheelCompression: [number, number, number, number];
  isDrifting: boolean;
  driftAngle: number;
  signedDriftAngle: number;
  tireSlipRatio: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  backfireTimer: number;
  backfireIntensity: number;
  currentDriftPoints: number;
  driftMultiplier: number;
}

export interface ReplayState {
  active: boolean;
  playing: boolean;
  playbackSpeed: 0.25 | 0.5 | 1.0;
  cameraMode: ReplayCameraMode;
  currentFrame: number;
  totalFrames: number;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  distance: 5.35,
  height: 1.68,
  smoothing: 10.5,
  fov: 58,
  shakeIntensity: 0.65,
  rotationSensitivity: 1.0,
  driftCameraLookAhead: 0.7,
  cockpitCameraOffset: 0.0,
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  handlingMode: 'drift',
  transmissionMode: 'automatic',
  headlightMode: 'auto',
  weather: 'clear',
  dynamicTimeCycle: false,
  practiceMode: false,
  controlScheme: 'auto',
  mobileButtonScale: 1.08,
  mobileButtonOpacity: 0.44,
  mobileButtonOffsetX: 0,
  mobileButtonOffsetY: 0,
  mobileLeftHanded: false,
  activeMobileLayoutId: 'default_right',
  mobileLayouts: createDefaultMobileLayouts(),
  hudOpacity: 0.92,
  showTelemetryOverlay: false,
  showFpsCounter: false,
  // Graphics
  graphicsPreset: 'ultra',
  renderScale: 1.0,
  shadowQuality: 'high',
  reflectionQuality: 'high',
  antiAliasing: true,
  ambientOcclusion: true,
  effectsQuality: 'high',
  viewDistance: 650,
  motionBlur: 0.15,
  bloomIntensity: 0.25,
  vsyncEnabled: true,
  vsync: true,
  frameRateLimit: 60,
  // Display
  fullscreen: false,
  aspectRatio: 'auto',
  brightness: 1.0,
  gamma: 1.0,
  cameraSensitivity: 1.0,
  // Audio (9 Independent Channels)
  masterVolume: 0.85,
  engineVolume: 0.92,
  sfxVolume: 0.85,
  exhaustVolume: 0.96,
  turboVolume: 0.88,
  tireVolume: 0.82,
  environmentVolume: 0.65,
  musicVolume: 0.45,
  uiVolume: 0.65,
  collisionVolume: 0.85,
  audioDynamicRange: 'wide',
  engineAudioIntensity: 1.0,
  exhaustAudioIntensity: 1.0,
  // Controls
  steeringPreset: 'balanced',
  steeringSensitivity: 1.0,
  steeringLinearity: 1.0,
  steeringDeadzone: 0.04,
  steeringReturnSpeed: 1.15,
  maxSteeringAngleDeg: 52,
  throttleSensitivity: 1.0,
  brakeSensitivity: 1.0,
  handbrakeSensitivity: 1.0,
  mouseSteeringEnabled: false,
  controllerVibration: true,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  accelerateKey: 'KeyW',
  brakeKey: 'KeyS',
  leftKey: 'KeyA',
  rightKey: 'KeyD',
  handbrakeKey: 'Space',
  nitroKey: 'ShiftLeft',
  upshiftKey: 'KeyE',
  downshiftKey: 'KeyQ',
  // Gameplay
  driftAssist: 0.35,
  steeringAssist: 0.4,
  tractionControl: 'off',
  absEnabled: true,
  stabilityControl: 0.15,
  speedUnit: 'kmh',
  showDriftScoreBanner: true,
  hudVisibility: 'full',
  showDriftNotifications: false,
  // Camera
  driftCameraLookAhead: 1.0,
  cockpitCameraOffset: 0.0,
  camera: { ...DEFAULT_CAMERA_SETTINGS },
  // Accessibility
  uiScale: 1.0,
  largeTextMode: false,
  highContrastHud: false,
  reducedMotion: false,
  subtitlesEnabled: false,
  simplifiedHud: false,
  // Network
  preferredRegion: 'JP-East',
  networkRegion: 'JP-East',
  showNetworkPingHud: true,
  showNetworkPing: true,
  defaultRoomPrivate: false,
  defaultPrivateRoom: false,
};

export interface VehicleSpec {
  id: string;
  name: string;
  manufacturer: string;
  chassisCode: string;
  year: number;
  country: string;
  drivetrain: 'RWD' | 'AWD' | 'FWD';
  engineDescription: string;
  horsepower: number;
  weightKg: number;
  topSpeedKmh: number;
  driftRating: number; // 1-10
  handlingRating: number; // 1-10
  accelerationRating: number; // 1-10
  powerMultiplier: number; // Physics acceleration multiplier
  driftGripFactor: number; // Physics drift slip balance
  soundType: EngineSoundType;
  engineAudioProfile?: EngineAudioProfileId;
  physicsConfig?: VehiclePhysicsConfig;
  silhouette: BodySilhouetteType;
  hasPopUpHeadlights?: boolean;
  isTwoTonePanda?: boolean;
  hasMostWantedStripe?: boolean;
  dimensions: {
    length: number;
    width: number;
    height: number;
    wheelbase: number;
    wheelRadius: number;
  };
  defaultCustomization: VehicleCustomization;
  factoryColors: { name: string; hex: string }[];
}

export interface Waypoint3D {
  x: number;
  y: number;
  z: number;
  width?: number;
  isTunnel?: boolean;
  isBridge?: boolean;
  hasGuardrailLeft?: boolean;
  hasGuardrailRight?: boolean;
  hasStreetlight?: boolean;
  chevronSide?: 'left' | 'right' | 'both' | 'none';
}

export interface DriftPlaza {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}

export interface MapViewpoint {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  cameraOffset: { x: number; y: number; z: number };
}

export type OpenWorldPOICategory =
  | 'garage'
  | 'dyno'
  | 'dealership'
  | 'fuel_station'
  | 'drift_zone'
  | 'race_event'
  | 'service_area';

export interface OpenWorldPOI {
  id: string;
  name: string;
  category: OpenWorldPOICategory;
  description: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  rewardCr?: number;
  rewardCredits?: number;
  viewpointIdx?: number;
  accentColor?: string;
  raceType?: 'sprint' | 'circuit' | 'touge_battle' | 'time_attack' | 'checkpoint_challenge';
}

export interface MapDefinition {
  id: MapId;
  name: string;
  japaneseTitle: string;
  subtitle: string;
  themeDescription: string;
  roadWidth: number;
  elevationRange: string;
  totalLengthKm: string;
  mainLoop: Waypoint3D[];
  branchRoute: Waypoint3D[];
  plazas: DriftPlaza[];
  viewpoints: MapViewpoint[];
  pois?: OpenWorldPOI[];
  accentColor: string;
}

export interface DynoDataPoint {
  rpm: number;
  whp: number;
  torqueNm: number;
  boostBar: number;
}

export interface DynoCurveResult {
  points: DynoDataPoint[];
  peakWhp: number;
  peakWhpRpm: number;
  peakTorqueNm: number;
  peakTorqueRpm: number;
  redlineRpm: number;
  idleRpm: number;
  crankHp: number;
  drivetrainLossPct: number;
  maxBoostBar: number;
  peakBoostBar: number;
}

export interface PlayerProfile {
  playerName: string;
  level: number;
  xp: number;
  credits: number;
  ownedVehicleIds: string[];
  totalDriftScore: number;
  bestSingleDriftChain: number;
  bestTandemScore: number;
  racesCompleted: number;
  racesWon: number;
  totalDistanceKm: number;
  unlockedAchievements: string[];
}

export interface RoadQueryResult {
  onRoad: boolean;
  distanceToCenter: number;
  signedLateralOffset: number;
  roadHalfWidth: number;
  elevation: number;
  tangentX: number;
  tangentZ: number;
  slopeY: number;
  bankAngle?: number;
  isTunnel: boolean;
  isBridge: boolean;
  isPlaza: boolean;
  segmentIndex: number;
  routeType: 'main' | 'branch' | 'plaza';
  hasGuardrailLeft?: boolean;
  hasGuardrailRight?: boolean;
  surfaceType?: RoadSurfaceType;
  surfaceGrip?: number;
}

export interface CarState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  vy: number;
  heading: number;
  angularVelocity: number;
  speed: number;
  speedKmh: number;
  steerAngle: number;
  visualFrontSteerAngle: number; // Includes countersteer angle during drift
  driftAngle: number; // Absolute slip angle in degrees
  signedDriftAngle: number; // Signed slip angle in degrees (+ left slide, - right slide)
  isDrifting: boolean;
  isGrounded: boolean;
  surfaceType?: RoadSurfaceType;
  surfaceGrip?: number;
  gear: number; // -1 = Reverse, 0 = Neutral, 1..6 = Forward Gears
  rpm: number;
  redlineRpm: number;
  shiftIndicator: boolean;
  shiftTimer: number; // Clutch / gear shift engagement timer
  throttle: number;
  brake: number;
  clutch: number;
  isReversing: boolean;
  handbrake: boolean;
  nitroAmount: number; // 0 to 100
  isBoosting: boolean;
  backfireTimer: number;
  backfireIntensity: number; // 0 to 1
  exhaustSmokeIntensity: number; // 0 to 1 (separate from tire smoke)
  tireSlipRatio: number; // 0 to 2.0 (drives tire smoke & skid marks)
  isBrakingHard: boolean;
  collisionImpact: number; // 0 to 1 (triggers collision sound & camera trauma)
  collisionType?: CollisionType;
  wheelRotation: number; // Front wheel cumulative rotation
  rearWheelRotation: number; // Rear wheel cumulative rotation (includes drift wheelspin)
  wheelCompression: [number, number, number, number]; // FL, FR, RL, RR independent suspension travel (m)
  bodyRoll: number;
  bodyPitch: number;
  bodyHeave: number;
  roadPitch?: number;
  roadBank?: number;
  currentDriftPoints: number;
  driftMultiplier: number;
  totalDriftScore: number;
  bestDriftChain: number;
  driftComboCount?: number;
  driftNotificationText?: string;
  driftNotificationTimer?: number;
  nearMissCount?: number;
  practiceStepsCompleted?: [boolean, boolean, boolean, boolean, boolean];
  distanceDriven: number;
  maxSpeedKmh: number;
  maxDriftAngleDeg?: number;
  totalDriftDurationSec?: number;
  driftSmoothnessPct?: number;
  driftConsistencyPct?: number;
  currentZoneName: string;
  lapCount: number;
  currentLapTime: number;
  bestLapTime: number;
  engineLoad?: number; // 0 to 100%
  turboBoostBar?: number; // -0.5 bar vacuum to +1.4 bar boost
}

export interface CarInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  nitro?: boolean;
  revEngine?: boolean;
  shiftUp?: boolean; // Edge-triggered upshift in Manual mode
  shiftDown?: boolean; // Edge-triggered downshift in Manual mode
  analogSteer?: number; // -1 (full right) to +1 (full left) for mobile wheel / analog stick
  analogThrottle?: number; // 0 to 1 progressive throttle pedal
  analogBrake?: number; // 0 to 1 progressive brake pedal
}

