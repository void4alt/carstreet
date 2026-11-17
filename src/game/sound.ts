import {
  BlowOffValveType,
  CollisionType,
  EngineAudioProfileId,
  EngineSoundType,
  ExhaustSystemType,
  GameSettings,
  MufflerType,
  TurboSetupType,
  VehicleCustomization,
} from './types';

export interface EngineAcousticParameters {
  profileId: EngineAudioProfileId | EngineSoundType;
  baseFreq: number;
  maxFreq: number;
  idleRatio: number;
  midRatio: number;
  highRatio: number;
  filterBase: number;
  filterSpan: number;
  isTurbo: boolean;
  hasStraightCutGearWhine: boolean;
  vtecCrossoverRpm: number | null;
  rotaryBrapModulation: boolean;
  boxerRumbleModulation: boolean;
}

export function getEngineAcousticParameters(
  soundType: EngineSoundType = 'i6_turbo',
  profileId?: EngineAudioProfileId
): EngineAcousticParameters {
  const key = profileId ?? soundType;
  switch (key) {
    case 'rb26dett':
      return {
        profileId: 'rb26dett',
        baseFreq: 54,
        maxFreq: 214,
        idleRatio: 0.5,
        midRatio: 1.5,
        highRatio: 2.05,
        filterBase: 350,
        filterSpan: 580,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case '2jz_gte':
      return {
        profileId: '2jz_gte',
        baseFreq: 48,
        maxFreq: 196,
        idleRatio: 0.48,
        midRatio: 1.48,
        highRatio: 1.98,
        filterBase: 310,
        filterSpan: 540,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case '1jz_gte':
      return {
        profileId: '1jz_gte',
        baseFreq: 56,
        maxFreq: 226,
        idleRatio: 0.52,
        midRatio: 1.54,
        highRatio: 2.12,
        filterBase: 380,
        filterSpan: 640,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'b58_turbo':
      return {
        profileId: 'b58_turbo',
        baseFreq: 50,
        maxFreq: 202,
        idleRatio: 0.5,
        midRatio: 1.5,
        highRatio: 2.0,
        filterBase: 340,
        filterSpan: 560,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'sr20det':
      return {
        profileId: 'sr20det',
        baseFreq: 58,
        maxFreq: 228,
        idleRatio: 0.48,
        midRatio: 1.42,
        highRatio: 1.95,
        filterBase: 360,
        filterSpan: 590,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'bp_ze_turbo':
      return {
        profileId: 'bp_ze_turbo',
        baseFreq: 61,
        maxFreq: 236,
        idleRatio: 0.5,
        midRatio: 1.45,
        highRatio: 2.0,
        filterBase: 390,
        filterSpan: 610,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case '4age_20v_na':
      return {
        profileId: '4age_20v_na',
        baseFreq: 66,
        maxFreq: 288,
        idleRatio: 0.52,
        midRatio: 1.55,
        highRatio: 2.22,
        filterBase: 480,
        filterSpan: 820,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'f22c_vtec_i4':
      return {
        profileId: 'f22c_vtec_i4',
        baseFreq: 64,
        maxFreq: 296,
        idleRatio: 0.52,
        midRatio: 1.58,
        highRatio: 2.28,
        filterBase: 470,
        filterSpan: 860,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: 6000,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'c30a_vtec_v6':
      return {
        profileId: 'c30a_vtec_v6',
        baseFreq: 57,
        maxFreq: 254,
        idleRatio: 0.5,
        midRatio: 1.52,
        highRatio: 2.16,
        filterBase: 430,
        filterSpan: 760,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: 5800,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'k20c1_vtec_turbo':
      return {
        profileId: 'k20c1_vtec_turbo',
        baseFreq: 60,
        maxFreq: 244,
        idleRatio: 0.5,
        midRatio: 1.48,
        highRatio: 2.08,
        filterBase: 410,
        filterSpan: 680,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: 5400,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'vq_tt_v6':
    case 'vq35de_v6':
      return {
        profileId: key === 'vq35de_v6' ? 'vq35de_v6' : 'vq_tt_v6',
        baseFreq: 52,
        maxFreq: 218,
        idleRatio: 0.48,
        midRatio: 1.46,
        highRatio: 2.02,
        filterBase: 360,
        filterSpan: 620,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'vq37vhr_v6':
      return {
        profileId: 'vq37vhr_v6',
        baseFreq: 55,
        maxFreq: 234,
        idleRatio: 0.5,
        midRatio: 1.52,
        highRatio: 2.12,
        filterBase: 385,
        filterSpan: 675,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case '13b_rotary':
    case 'rotary':
      return {
        profileId: '13b_rotary',
        baseFreq: 78,
        maxFreq: 322,
        idleRatio: 0.66,
        midRatio: 1.52,
        highRatio: 2.28,
        filterBase: 530,
        filterSpan: 850,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: true,
        boxerRumbleModulation: false,
      };
    case '13b_t_rotary':
      return {
        profileId: '13b_t_rotary',
        baseFreq: 73,
        maxFreq: 304,
        idleRatio: 0.64,
        midRatio: 1.48,
        highRatio: 2.18,
        filterBase: 495,
        filterSpan: 790,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: true,
        boxerRumbleModulation: false,
      };
    case 'ej207_boxer':
    case 'boxer_turbo':
      return {
        profileId: 'ej207_boxer',
        baseFreq: 40,
        maxFreq: 154,
        idleRatio: 0.41,
        midRatio: 1.24,
        highRatio: 1.76,
        filterBase: 245,
        filterSpan: 410,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: true,
      };
    case 'fa24_boxer':
      return {
        profileId: 'fa24_boxer',
        baseFreq: 47,
        maxFreq: 188,
        idleRatio: 0.46,
        midRatio: 1.38,
        highRatio: 1.94,
        filterBase: 320,
        filterSpan: 540,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: true,
      };
    case '4g63t_mivec':
      return {
        profileId: '4g63t_mivec',
        baseFreq: 56,
        maxFreq: 232,
        idleRatio: 0.49,
        midRatio: 1.46,
        highRatio: 2.04,
        filterBase: 375,
        filterSpan: 640,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case '4b11t_mivec':
      return {
        profileId: '4b11t_mivec',
        baseFreq: 59,
        maxFreq: 238,
        idleRatio: 0.5,
        midRatio: 1.48,
        highRatio: 2.06,
        filterBase: 390,
        filterSpan: 660,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'p60b40_v8':
      return {
        profileId: 'p60b40_v8',
        baseFreq: 58,
        maxFreq: 262,
        idleRatio: 0.55,
        midRatio: 1.36,
        highRatio: 2.08,
        filterBase: 440,
        filterSpan: 740,
        isTurbo: false,
        hasStraightCutGearWhine: true,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'f120b_tt_v8':
    case 'v8_race':
      return {
        profileId: 'f120b_tt_v8',
        baseFreq: 55,
        maxFreq: 256,
        idleRatio: 0.54,
        midRatio: 1.34,
        highRatio: 2.04,
        filterBase: 430,
        filterSpan: 720,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 's14b25_na':
    case 'i4_na':
      return {
        profileId: 's14b25_na',
        baseFreq: 62,
        maxFreq: 272,
        idleRatio: 0.5,
        midRatio: 1.52,
        highRatio: 2.16,
        filterBase: 455,
        filterSpan: 770,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'v6_na':
      return {
        profileId: 'v6_na',
        baseFreq: 54,
        maxFreq: 218,
        idleRatio: 0.5,
        midRatio: 1.5,
        highRatio: 2.0,
        filterBase: 360,
        filterSpan: 600,
        isTurbo: false,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
    case 'i4_turbo':
    case 'i6_turbo':
    default:
      return {
        profileId: key,
        baseFreq: 52,
        maxFreq: 206,
        idleRatio: 0.5,
        midRatio: 1.5,
        highRatio: 2.0,
        filterBase: 330,
        filterSpan: 550,
        isTurbo: true,
        hasStraightCutGearWhine: false,
        vtecCrossoverRpm: null,
        rotaryBrapModulation: false,
        boxerRumbleModulation: false,
      };
  }
}

export interface ResolvedExhaustAudioConfig {
  exhaustSystem: ExhaustSystemType;
  mufflerType: MufflerType;
  turboSetup: TurboSetupType;
  bovType: BlowOffValveType;
  isEffectiveTurbo: boolean;
  hasTurboFlutter: boolean;
  volumeMultiplier: number;
  filterCutoffBoost: number;
  subBassDb: number;
  crackleScale: number;
  flutterPulseCount: number;
  turboSpoolGainMult: number;
}

export function resolveExhaustAudioConfig(
  soundType: EngineSoundType = 'i6_turbo',
  profileId?: EngineAudioProfileId,
  custom?: Partial<VehicleCustomization>
): ResolvedExhaustAudioConfig {
  const baseParams = getEngineAcousticParameters(soundType, profileId);
  const exhaustSystem: ExhaustSystemType = custom?.exhaustSystem ?? 'sports_catback';
  const mufflerType: MufflerType = custom?.mufflerType ?? 'resonated';
  const turboSetup: TurboSetupType = custom?.turboSetup ?? 'stock_na_or_oem';
  const bovType: BlowOffValveType = custom?.bovType ?? 'compressor_flutter';
  const userVol = Math.max(0.4, Math.min(1.6, custom?.exhaustVolume ?? 1.1));
  const userCrackle = Math.max(0, Math.min(1.2, custom?.crackleIntensity ?? 0.78));

  // Factory NA cars (4A-GE, F22C, C30A, P60B40 V8, S14B25, stock V6 NA) are only turbocharged if an aftermarket turbo setup is installed
  const factoryTurbo = baseParams.isTurbo;
  const isEffectiveTurbo = factoryTurbo || turboSetup !== 'stock_na_or_oem';

  const hasTurboFlutter =
    isEffectiveTurbo &&
    (bovType === 'compressor_flutter' ||
      bovType === 'hybrid_dual' ||
      turboSetup === 'big_single_flutter' ||
      turboSetup === 'anti_lag_sequential');

  const sysVolMap: Record<ExhaustSystemType, number> = {
    stock_oem: 0.88,
    sports_catback: 1.12,
    straight_pipe: 1.36,
    titanium_race: 1.42,
  };
  const mufVolMap: Record<MufflerType, number> = {
    chambered: 0.94,
    resonated: 1.05,
    blast_pipe: 1.24,
    track_dump: 1.32,
  };
  const sysCutoffMap: Record<ExhaustSystemType, number> = {
    stock_oem: -45,
    sports_catback: 65,
    straight_pipe: 210,
    titanium_race: 280,
  };
  const mufSubMap: Record<MufflerType, number> = {
    chambered: 5.5,
    resonated: 6.5,
    blast_pipe: 8.5,
    track_dump: 7.5,
  };

  const volumeMultiplier = Math.min(1.95, sysVolMap[exhaustSystem] * mufVolMap[mufflerType] * userVol);
  const filterCutoffBoost =
    sysCutoffMap[exhaustSystem] + (mufflerType === 'blast_pipe' || mufflerType === 'track_dump' ? 95 : 0);
  const subBassDb = mufSubMap[mufflerType] + (exhaustSystem === 'straight_pipe' ? 2.0 : 0);
  const crackleScale =
    userCrackle *
    (exhaustSystem === 'straight_pipe' || exhaustSystem === 'titanium_race' ? 1.28 : 1.0) *
    (turboSetup === 'anti_lag_sequential' ? 1.35 : 1.0);
  const flutterPulseCount =
    turboSetup === 'big_single_flutter' ? 7 : turboSetup === 'anti_lag_sequential' ? 8 : 6;
  const turboSpoolGainMult =
    !isEffectiveTurbo
      ? 0
      : turboSetup === 'big_single_flutter'
      ? 1.45
      : turboSetup === 'anti_lag_sequential'
      ? 1.55
      : turboSetup === 'street_spool'
      ? 1.2
      : 1.0;

  return {
    exhaustSystem,
    mufflerType,
    turboSetup,
    bovType,
    isEffectiveTurbo,
    hasTurboFlutter,
    volumeMultiplier,
    filterCutoffBoost,
    subBassDb,
    crackleScale,
    flutterPulseCount,
    turboSpoolGainMult,
  };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;

  // 4-Layer Crossfaded Engine Synthesizer Nodes
  private idleOsc: OscillatorNode | null = null;
  private idleGain: GainNode | null = null;
  private lowOsc: OscillatorNode | null = null;
  private lowGain: GainNode | null = null;
  private midOsc: OscillatorNode | null = null;
  private midGain: GainNode | null = null;
  private highOsc: OscillatorNode | null = null;
  private highGain: GainNode | null = null;

  private exhaustSubFilter: BiquadFilterNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private exhaustShaper: WaveShaperNode | null = null;
  private engineMasterGain: GainNode | null = null;

  // Breathy Turbo Induction Air Filter (replaces pure-sine whistle)
  private turboFilter: BiquadFilterNode | null = null;
  private turboGain: GainNode | null = null;

  // Multi-Layered Realistic Rubber-on-Asphalt Tire Slip & Squeal Channels
  private tireScrubFilter: BiquadFilterNode | null = null;
  private tireScrubGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private screechHighFilter: BiquadFilterNode | null = null;
  private screechHighGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private initialized = false;
  private masterVolume = 0.85;
  private engineVolume = 0.92;
  private sfxVolume = 0.85;
  private exhaustVolume = 0.96;
  private turboVolume = 0.88;
  private tireVolume = 0.82;
  private environmentVolume = 0.65;
  private musicVolume = 0.45;
  private uiVolume = 0.65;
  private collisionVolume = 0.85;
  private audioDynamicRange: 'standard' | 'wide' | 'night' = 'wide';
  private engineAudioIntensity = 1.0;
  private exhaustAudioIntensity = 1.0;
  private lastCollisionSoundTime = 0;
  private lastFlutterSoundTime = 0;

  // Realistic Engine Startup Sequence State Machine
  private isEngineStarting = false;
  private startupStartTime = 0;
  private startupSoundType: EngineSoundType = 'i6_turbo';
  private startupProfileId?: EngineAudioProfileId;
  private startupCustom?: Partial<VehicleCustomization>;

  /**
   * Pre-warms the Web Audio API context and generates cached noise buffers on early user gestures
   * (pointerdown/keydown/touchstart) so entering gameplay has zero initialization lag or audio popping.
   */
  public warmup(): void {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      // Master Dynamics Compressor prevents digital clipping while delivering loud, punchy exhaust presence
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -13;
      this.masterCompressor.knee.value = 10;
      this.masterCompressor.ratio.value = 4.5;
      this.masterCompressor.attack.value = 0.003;
      this.masterCompressor.release.value = 0.12;
      this.masterCompressor.connect(this.masterGain);

      // Sub-Bass Exhaust Resonance Shelf (deep tailpipe chest thump at 88 Hz)
      this.exhaustSubFilter = this.ctx.createBiquadFilter();
      this.exhaustSubFilter.type = 'lowshelf';
      this.exhaustSubFilter.frequency.value = 88;
      this.exhaustSubFilter.gain.value = 6.5;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 480;
      this.engineFilter.Q.value = 1.65;

      // Warm analog soft-clipping WaveShaper adds authentic harmonic richness to straight-pipe / race exhausts
      this.exhaustShaper = this.ctx.createWaveShaper();
      const curveLen = 1024;
      const curve = new Float32Array(curveLen);
      const drive = 2.15;
      for (let i = 0; i < curveLen; i++) {
        const x = (i * 2) / curveLen - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
      this.exhaustShaper.curve = curve;
      this.exhaustShaper.oversample = '2x';

      this.engineMasterGain = this.ctx.createGain();
      this.engineMasterGain.gain.value = 0;

      this.exhaustSubFilter.connect(this.engineFilter);
      this.engineFilter.connect(this.exhaustShaper);
      this.exhaustShaper.connect(this.engineMasterGain);
      this.engineMasterGain.connect(this.masterCompressor);

      // Layer 1: Idle & Sub-Bass Exhaust Pulse (initialized silent to prevent pop)
      this.idleOsc = this.ctx.createOscillator();
      this.idleOsc.type = 'triangle';
      this.idleOsc.frequency.value = 34;
      this.idleGain = this.ctx.createGain();
      this.idleGain.gain.value = 0.0;
      this.idleOsc.connect(this.idleGain);
      this.idleGain.connect(this.exhaustSubFilter);
      this.idleOsc.start();

      // Layer 2: Low-RPM Baritone Exhaust Resonance
      this.lowOsc = this.ctx.createOscillator();
      this.lowOsc.type = 'sawtooth';
      this.lowOsc.frequency.value = 58;
      this.lowGain = this.ctx.createGain();
      this.lowGain.gain.value = 0.0;
      this.lowOsc.connect(this.lowGain);
      this.lowGain.connect(this.exhaustSubFilter);
      this.lowOsc.start();

      // Layer 3: Mid-RPM Cylinder Firing Harmonic
      this.midOsc = this.ctx.createOscillator();
      this.midOsc.type = 'square';
      this.midOsc.frequency.value = 110;
      this.midGain = this.ctx.createGain();
      this.midGain.gain.value = 0.0;
      this.midOsc.connect(this.midGain);
      this.midGain.connect(this.exhaustSubFilter);
      this.midOsc.start();

      // Layer 4: High-RPM Screamer / Induction Howl
      this.highOsc = this.ctx.createOscillator();
      this.highOsc.type = 'sawtooth';
      this.highOsc.frequency.value = 210;
      this.highGain = this.ctx.createGain();
      this.highGain.gain.value = 0.0;
      this.highOsc.connect(this.highGain);
      this.highGain.connect(this.exhaustSubFilter);
      this.highOsc.start();

      // Rich pink/brownish-weighted noise buffer - allocated and cached once
      if (!this.noiseBuffer) {
        const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          output[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.55) * 0.95));
        }
        this.noiseBuffer = noiseBuffer;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = this.noiseBuffer;
      noiseNode.loop = true;

      // Breathy Turbocharger Air Spool Filter (filtered airflow instead of pure sine beep!)
      this.turboFilter = this.ctx.createBiquadFilter();
      this.turboFilter.type = 'bandpass';
      this.turboFilter.frequency.value = 2200;
      this.turboFilter.Q.value = 2.8;
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.value = 0;
      noiseNode.connect(this.turboFilter);
      this.turboFilter.connect(this.turboGain);
      this.turboGain.connect(this.masterCompressor);

      // Tire Layer 1: Low-Mid Rubber Tread Scrub & Sidewall Load (320 - 580 Hz)
      this.tireScrubFilter = this.ctx.createBiquadFilter();
      this.tireScrubFilter.type = 'bandpass';
      this.tireScrubFilter.frequency.value = 420;
      this.tireScrubFilter.Q.value = 1.4;
      this.tireScrubGain = this.ctx.createGain();
      this.tireScrubGain.gain.value = 0;
      noiseNode.connect(this.tireScrubFilter);
      this.tireScrubFilter.connect(this.tireScrubGain);
      this.tireScrubGain.connect(this.masterCompressor);

      // Tire Layer 2: Primary Rubber-on-Asphalt Slip Formant (780 - 1180 Hz)
      this.screechFilter = this.ctx.createBiquadFilter();
      this.screechFilter.type = 'bandpass';
      this.screechFilter.frequency.value = 920;
      this.screechFilter.Q.value = 2.4;
      this.screechGain = this.ctx.createGain();
      this.screechGain.gain.value = 0;
      noiseNode.connect(this.screechFilter);
      this.screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.masterCompressor);

      // Tire Layer 3: High-Slip Rubber Squeal Harmonic Formant (1380 - 1850 Hz)
      this.screechHighFilter = this.ctx.createBiquadFilter();
      this.screechHighFilter.type = 'bandpass';
      this.screechHighFilter.frequency.value = 1520;
      this.screechHighFilter.Q.value = 3.0;
      this.screechHighGain = this.ctx.createGain();
      this.screechHighGain.gain.value = 0;
      noiseNode.connect(this.screechHighFilter);
      this.screechHighFilter.connect(this.screechHighGain);
      this.screechHighGain.connect(this.masterCompressor);

      // Road & mountain wind / asphalt rolling noise channel
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 360;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      noiseNode.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.masterCompressor);

      noiseNode.start();

      this.initialized = true;
    } catch {
      // Ignore audio blocked errors in headless environments
    }
  }

  public setVolumes(master: number, engine: number, sfx: number) {
    this.masterVolume = Math.max(0, Math.min(1, master));
    this.engineVolume = Math.max(0, Math.min(1, engine));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public setAudioSettings(settings: Partial<GameSettings>) {
    if (typeof settings.masterVolume === 'number') {
      this.masterVolume = Math.max(0, Math.min(1, settings.masterVolume));
    }
    if (typeof settings.engineVolume === 'number') {
      this.engineVolume = Math.max(0, Math.min(1, settings.engineVolume));
    }
    if (typeof settings.sfxVolume === 'number') {
      this.sfxVolume = Math.max(0, Math.min(1, settings.sfxVolume));
    }
    if (typeof settings.exhaustVolume === 'number') {
      this.exhaustVolume = Math.max(0, Math.min(1, settings.exhaustVolume));
    }
    if (typeof settings.turboVolume === 'number') {
      this.turboVolume = Math.max(0, Math.min(1, settings.turboVolume));
    }
    if (typeof settings.tireVolume === 'number') {
      this.tireVolume = Math.max(0, Math.min(1, settings.tireVolume));
    }
    if (typeof settings.environmentVolume === 'number') {
      this.environmentVolume = Math.max(0, Math.min(1, settings.environmentVolume));
    }
    if (typeof settings.musicVolume === 'number') {
      this.musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
    }
    if (typeof settings.uiVolume === 'number') {
      this.uiVolume = Math.max(0, Math.min(1, settings.uiVolume));
    }
    if (typeof settings.collisionVolume === 'number') {
      this.collisionVolume = Math.max(0, Math.min(1, settings.collisionVolume));
    }
    if (settings.audioDynamicRange) {
      this.audioDynamicRange = settings.audioDynamicRange;
      if (this.masterCompressor && this.ctx) {
        const t = Math.max(0.001, this.ctx.currentTime);
        if (this.audioDynamicRange === 'night') {
          this.masterCompressor.threshold.setTargetAtTime(-22, t, 0.05);
          this.masterCompressor.ratio.setTargetAtTime(8.0, t, 0.05);
        } else if (this.audioDynamicRange === 'standard') {
          this.masterCompressor.threshold.setTargetAtTime(-16, t, 0.05);
          this.masterCompressor.ratio.setTargetAtTime(5.2, t, 0.05);
        } else {
          this.masterCompressor.threshold.setTargetAtTime(-12, t, 0.05);
          this.masterCompressor.ratio.setTargetAtTime(3.8, t, 0.05);
        }
      }
    }
    if (typeof settings.engineAudioIntensity === 'number') {
      this.engineAudioIntensity = Math.max(0.5, Math.min(1.5, settings.engineAudioIntensity));
    }
    if (typeof settings.exhaustAudioIntensity === 'number') {
      this.exhaustAudioIntensity = Math.max(0.5, Math.min(1.5, settings.exhaustAudioIntensity));
    }
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public getChannelVolumes() {
    return {
      masterVolume: this.masterVolume,
      engineVolume: this.engineVolume,
      exhaustVolume: this.exhaustVolume,
      turboVolume: this.turboVolume,
      tireVolume: this.tireVolume,
      environmentVolume: this.environmentVolume,
      musicVolume: this.musicVolume,
      uiVolume: this.uiVolume,
      collisionVolume: this.collisionVolume,
      audioDynamicRange: this.audioDynamicRange,
      engineAudioIntensity: this.engineAudioIntensity,
      exhaustAudioIntensity: this.exhaustAudioIntensity,
    };
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        mute ? 0 : this.masterVolume,
        this.ctx.currentTime,
        0.04
      );
    }
    if (this.muted && this.ctx && this.engineMasterGain && this.screechGain) {
      this.engineMasterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.tireScrubGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechHighGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.turboGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public update(
    rpm: number,
    isDrifting: boolean,
    isPlaying: boolean,
    soundType: EngineSoundType = 'i6_turbo',
    speedKmh = 0,
    throttle = 0,
    tireSlipRatio = 0,
    isBrakingHard = false,
    profileId?: EngineAudioProfileId,
    custom?: Partial<VehicleCustomization>
  ) {
    if (
      !this.initialized ||
      !this.ctx ||
      !this.idleOsc ||
      !this.lowOsc ||
      !this.midOsc ||
      !this.highOsc ||
      !this.idleGain ||
      !this.lowGain ||
      !this.midGain ||
      !this.highGain ||
      !this.engineFilter ||
      !this.engineMasterGain ||
      !this.screechGain
    ) {
      return;
    }
    if (this.muted || !isPlaying) {
      this.engineMasterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.tireScrubGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechHighGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.turboGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const t = this.ctx.currentTime;
    const params = getEngineAcousticParameters(soundType, profileId);
    const exCfg = resolveExhaustAudioConfig(soundType, profileId, custom);

    let effectiveRpm = rpm;
    let startupVolumeMult = 1.0;

    if (this.isEngineStarting) {
      const elapsed = t - this.startupStartTime;
      if (elapsed < 0.82 && throttle < 0.12) {
        if (elapsed < 0.20) {
          // Cranking phase: Starter motor is spinning flywheel, cylinders haven't fired yet
          effectiveRpm = 360 + (elapsed / 0.20) * 120;
          startupVolumeMult = 0.0;
        } else if (elapsed < 0.44) {
          // Ignition catch & roar flare: Combustion catches, RPM blips to ~1520 RPM
          const p = (elapsed - 0.20) / 0.24;
          effectiveRpm = 480 + (1 - Math.cos(p * Math.PI)) * 0.5 * 1040;
          startupVolumeMult = Math.min(1.0, p * 1.25);
        } else {
          // Settle to idle: RPM gracefully eases from 1520 down to idle 950 RPM
          const p = (elapsed - 0.44) / 0.38;
          effectiveRpm = 1520 - (1 - Math.cos(p * Math.PI)) * 0.5 * 570;
          startupVolumeMult = 1.0;
        }
      } else {
        this.isEngineStarting = false;
      }
    }

    const rpmNorm = Math.min(1.18, Math.max(0, (effectiveRpm - 850) / 6800));

    if (this.exhaustSubFilter) {
      this.exhaustSubFilter.gain.setTargetAtTime(exCfg.subBassDb, t, 0.06);
    }

    // VTEC high-cam harmonic crossover boost above vtecCrossoverRpm
    const vtecActive =
      params.vtecCrossoverRpm !== null && rpm >= params.vtecCrossoverRpm
        ? Math.min(1, (rpm - params.vtecCrossoverRpm) / 900)
        : 0;

    // Rotary brap-brap idle pulse or Boxer unequal-length header sub-harmonic warble
    const pulseMod = params.rotaryBrapModulation
      ? rpm < 2450
        ? Math.sin(t * 46) * 6.5
        : 0
      : params.boxerRumbleModulation
      ? Math.sin(t * 36) * 3.8
      : 0;

    const freq = params.baseFreq + rpmNorm * (params.maxFreq - params.baseFreq) + pulseMod;
    this.lowOsc.frequency.setTargetAtTime(freq, t, 0.03);
    this.idleOsc.frequency.setTargetAtTime(freq * params.idleRatio, t, 0.03);
    this.midOsc.frequency.setTargetAtTime(freq * params.midRatio * (1 + vtecActive * 0.06), t, 0.03);
    this.highOsc.frequency.setTargetAtTime(freq * params.highRatio * (1 + vtecActive * 0.12), t, 0.03);

    // Smooth 4-band crossfade across Idle -> Low -> Mid -> High RPM with deep exhaust presence
    const idleWeight = Math.max(0.16, 1.0 - rpmNorm * 1.9);
    const lowWeight = Math.max(0.24, 1.0 - Math.abs(rpmNorm - 0.32) * 1.3);
    const midWeight =
      Math.max(0.12, 1.0 - Math.abs(rpmNorm - 0.62) * 1.5) * (0.58 + throttle * 0.42);
    const highWeight =
      Math.max(0, (rpmNorm - 0.38) * 1.58 + vtecActive * 0.28) * (0.68 + throttle * 0.32);

    this.idleGain.gain.setTargetAtTime(idleWeight * 0.56, t, 0.04);
    this.lowGain.gain.setTargetAtTime(lowWeight * 0.65, t, 0.04);
    this.midGain.gain.setTargetAtTime(midWeight * 0.42, t, 0.04);
    this.highGain.gain.setTargetAtTime(highWeight * 0.48, t, 0.04);

    // Off-throttle deceleration overrun burble modulation + Garage Exhaust System tone
    const filterCutoff =
      params.filterBase +
      exCfg.filterCutoffBoost +
      rpmNorm * params.filterSpan +
      throttle * 340 +
      vtecActive * 260;
    const overrunMod = throttle < 0.08 && rpm > 2600 ? Math.sin(t * 62) * 68 : 0;
    this.engineFilter.frequency.setTargetAtTime(
      Math.max(190, filterCutoff + overrunMod),
      t,
      0.035
    );

    // Strong, authoritative automotive engine & exhaust mix (compressed via masterCompressor to never clip)
    const effectiveEngineGain =
      (this.engineVolume * 0.52 + this.exhaustVolume * 0.48) *
      ((this.engineAudioIntensity + this.exhaustAudioIntensity) * 0.5);
    const loadBoost =
      (0.082 + throttle * 0.056 + rpmNorm * 0.038 + vtecActive * 0.014) * exCfg.volumeMultiplier;
    this.engineMasterGain.gain.setTargetAtTime(
      loadBoost * effectiveEngineGain * startupVolumeMult,
      t,
      0.045
    );

    // Breathy Turbocharger Induction Air Spool OR Straight-Cut Transmission Mesh
    if (this.turboFilter && this.turboGain) {
      if (params.hasStraightCutGearWhine && !exCfg.isEffectiveTurbo) {
        const gearWhineFreq = 950 + Math.min(1800, speedKmh * 7.5) + rpmNorm * 340;
        const whineGain =
          speedKmh > 12
            ? Math.min(0.022, (speedKmh / 200) * 0.022 * (0.65 + throttle * 0.35)) *
              this.engineVolume
            : 0;
        this.turboFilter.frequency.setTargetAtTime(gearWhineFreq, t, 0.04);
        this.turboGain.gain.setTargetAtTime(whineGain, t, 0.04);
      } else if (exCfg.isEffectiveTurbo) {
        const turboAirFreq = 1650 + rpmNorm * 2150;
        const boostGain =
          throttle > 0.22 && rpm > 2850
            ? Math.min(
                0.036,
                (rpmNorm - 0.25) * 0.038 * throttle * exCfg.turboSpoolGainMult
              ) * this.turboVolume
            : 0;
        this.turboFilter.frequency.setTargetAtTime(turboAirFreq, t, 0.055);
        this.turboGain.gain.setTargetAtTime(Math.max(0, boostGain), t, 0.055);
      } else {
        this.turboGain.gain.setTargetAtTime(0, t, 0.04);
      }
    }

    // Multi-layered Rubber-on-Asphalt Tire Slip & Squeal
    const slip = Math.max(
      tireSlipRatio,
      isDrifting ? 0.55 + Math.min(0.85, speedKmh / 140) : isBrakingHard ? 0.52 : 0
    );

    const surfaceFlutter = Math.sin(t * 21) * 32 + Math.cos(t * 37) * 19;
    const speedPitchOffset = Math.min(340, speedKmh * 2.2);
    const effTireVol = this.tireVolume * this.sfxVolume;

    if (this.tireScrubFilter && this.tireScrubGain) {
      const scrubFreq = 340 + speedPitchOffset * 0.45 + surfaceFlutter * 0.4;
      const targetScrub =
        slip > 0.08 ? Math.min(0.042, (0.010 + slip * 0.024) * effTireVol) : 0;
      this.tireScrubFilter.frequency.setTargetAtTime(scrubFreq, t, 0.05);
      this.tireScrubGain.gain.setTargetAtTime(targetScrub, t, 0.055);
    }

    const primaryFreq =
      (isBrakingHard && !isDrifting ? 780 : 860) + speedPitchOffset * 0.72 + surfaceFlutter;
    const targetPrimaryScreech =
      slip > 0.22 ? Math.min(0.046, (slip - 0.18) * 0.034 * effTireVol) : 0;
    if (this.screechFilter) {
      this.screechFilter.frequency.setTargetAtTime(primaryFreq, t, 0.05);
    }
    this.screechGain.gain.setTargetAtTime(targetPrimaryScreech, t, 0.06);

    if (this.screechHighFilter && this.screechHighGain) {
      const highSlipFreq = 1390 + speedPitchOffset * 0.95 - surfaceFlutter * 0.8;
      const targetHighScreech =
        slip > 0.62 ? Math.min(0.028, (slip - 0.58) * 0.026 * effTireVol) : 0;
      this.screechHighFilter.frequency.setTargetAtTime(highSlipFreq, t, 0.05);
      this.screechHighGain.gain.setTargetAtTime(targetHighScreech, t, 0.065);
    }

    if (this.windGain) {
      const breezeFloor = isPlaying ? 0.0045 : 0;
      const targetWind =
        (breezeFloor + Math.min(0.026, (speedKmh / 185) * 0.026)) *
        this.environmentVolume *
        this.sfxVolume;
      this.windGain.gain.setTargetAtTime(targetWind, t, 0.08);
    }
  }

  public playEngineStartup(
    _soundType: EngineSoundType = 'i6_turbo',
    _profileId?: EngineAudioProfileId,
    _custom?: Partial<VehicleCustomization>
  ) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      this.isEngineStarting = true;
      this.startupStartTime = t;

      // Authentic starter motor mechanical crank pulses (2 pulses during 0.0s - 0.16s)
      if (this.noiseBuffer) {
        for (const crankOffset of [0.0, 0.08, 0.15]) {
          const crankSrc = this.ctx.createBufferSource();
          crankSrc.buffer = this.noiseBuffer;
          const crankFilter = this.ctx.createBiquadFilter();
          crankFilter.type = 'bandpass';
          crankFilter.frequency.setValueAtTime(210, t + crankOffset);
          crankFilter.Q.value = 3.5;
          const crankGain = this.ctx.createGain();
          crankGain.gain.setValueAtTime(0.045 * this.engineVolume, t + crankOffset);
          crankGain.gain.exponentialRampToValueAtTime(0.001, t + crankOffset + 0.06);
          crankSrc.connect(crankFilter);
          crankFilter.connect(crankGain);
          crankGain.connect(this.masterCompressor);
          crankSrc.start(t + crankOffset);
          crankSrc.stop(t + crankOffset + 0.065);
        }
      }

      // Starter motor electric high-speed whine (cranks 0.0s to 0.20s until ignition catches)
      const starterWhine = this.ctx.createOscillator();
      starterWhine.type = 'sine';
      starterWhine.frequency.setValueAtTime(190, t);
      starterWhine.frequency.exponentialRampToValueAtTime(255, t + 0.19);
      const starterGain = this.ctx.createGain();
      starterGain.gain.setValueAtTime(0.001, t);
      starterGain.gain.linearRampToValueAtTime(0.032 * this.engineVolume, t + 0.04);
      starterGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.21);
      starterWhine.connect(starterGain);
      starterGain.connect(this.masterCompressor);
      starterWhine.start(t);
      starterWhine.stop(t + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Authentic JDM Compressor Surge Turbo Flutter ("STUTUTU") when lifting off throttle under boost.
   * Synthesizes rapid, decaying air-chop pulses across the compressor blades with RPM/boost-dependent pitch.
   */
  public playTurboFlutter(
    soundType: EngineSoundType = 'i6_turbo',
    profileId?: EngineAudioProfileId,
    rpmNorm = 0.75,
    boostLoad = 0.85,
    custom?: Partial<VehicleCustomization>
  ) {
    if (this.muted) return;
    const exCfg = resolveExhaustAudioConfig(soundType, profileId, custom);
    if (!exCfg.isEffectiveTurbo) return;

    this.init();
    if (!this.ctx || !this.noiseBuffer || !this.masterCompressor) return;

    const now = performance.now();
    if (now - this.lastFlutterSoundTime < 150) return;
    this.lastFlutterSoundTime = now;

    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const clampedRpm = Math.max(0.3, Math.min(1.1, rpmNorm));
      const clampedBoost = Math.max(0.35, Math.min(1.25, boostLoad));
      const vol = this.turboVolume * exCfg.volumeMultiplier * clampedBoost;

      // Base compressor housing resonance pitch by engine architecture
      const basePitch =
        profileId === 'sr20det'
          ? 2480
          : profileId === 'rb26dett'
          ? 2340
          : profileId === '2jz_gte' || profileId === '1jz_gte'
          ? 2220
          : profileId === '13b_rotary'
          ? 2580
          : 2300;
      const startPitch = basePitch * (0.86 + clampedRpm * 0.24);

      const pulses = exCfg.flutterPulseCount;
      let cursorSec = 0;

      for (let i = 0; i < pulses; i++) {
        const decay = Math.pow(0.8, i);
        // Flutter pulse spacing widens slightly as turbine wheel slows down (e.g. 46ms -> 78ms)
        const pulseDur = 0.044 + i * 0.0055;
        const pulseStart = t + cursorSec;
        cursorSec += pulseDur + 0.008;

        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        // Primary compressor blade air-chop formant
        const bpHigh = this.ctx.createBiquadFilter();
        bpHigh.type = 'bandpass';
        const pulsePitch = startPitch * (1 - i * 0.068);
        bpHigh.frequency.setValueAtTime(pulsePitch, pulseStart);
        bpHigh.frequency.exponentialRampToValueAtTime(pulsePitch * 0.76, pulseStart + pulseDur);
        bpHigh.Q.value = 5.4;

        // Secondary intake charge-pipe hollow resonance formant ("tu-tu-tu" body)
        const bpBody = this.ctx.createBiquadFilter();
        bpBody.type = 'bandpass';
        const bodyPitch = pulsePitch * 0.44;
        bpBody.frequency.setValueAtTime(bodyPitch, pulseStart);
        bpBody.frequency.exponentialRampToValueAtTime(bodyPitch * 0.78, pulseStart + pulseDur);
        bpBody.Q.value = 3.8;

        const pulseGain = this.ctx.createGain();
        const peakAmp = Math.min(0.14, 0.078 * vol * decay);
        pulseGain.gain.setValueAtTime(0.001, pulseStart);
        pulseGain.gain.linearRampToValueAtTime(peakAmp, pulseStart + 0.009);
        pulseGain.gain.exponentialRampToValueAtTime(0.0015, pulseStart + pulseDur);

        src.connect(bpHigh);
        src.connect(bpBody);
        bpHigh.connect(pulseGain);
        bpBody.connect(pulseGain);
        pulseGain.connect(this.masterCompressor);

        src.start(pulseStart);
        src.stop(pulseStart + pulseDur + 0.005);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Configurable Turbo Pressure Release: routes to STUTUTU Compressor Flutter, Atmospheric BOV ("Psshh"),
   * Recirculating Plumb-Back, or Hybrid Dual-Port based on vehicle turbo architecture and Garage setup.
   */
  public playBlowOffValve(
    soundType: EngineSoundType = 'i6_turbo',
    profileId?: EngineAudioProfileId,
    custom?: Partial<VehicleCustomization>,
    rpmNorm = 0.75,
    boostLoad = 0.85
  ) {
    if (this.muted) return;
    const exCfg = resolveExhaustAudioConfig(soundType, profileId, custom);
    if (!exCfg.isEffectiveTurbo) return;

    if (exCfg.bovType === 'compressor_flutter') {
      this.playTurboFlutter(soundType, profileId, rpmNorm, boostLoad, custom);
      return;
    }

    this.init();
    if (!this.ctx || !this.noiseBuffer || !this.masterCompressor) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const isRecirc = exCfg.bovType === 'recirculating';
      const startPitch = isRecirc
        ? 1450
        : profileId === 'sr20det'
        ? 2650
        : profileId === 'f120b_tt_v8'
        ? 2150
        : 2420;
      filter.frequency.setValueAtTime(startPitch, t);
      filter.frequency.exponentialRampToValueAtTime(isRecirc ? 620 : 880, t + 0.22);
      filter.Q.value = isRecirc ? 1.8 : 3.4;

      const gain = this.ctx.createGain();
      const v = this.turboVolume * exCfg.volumeMultiplier * (isRecirc ? 0.48 : 1.0);
      gain.gain.setValueAtTime(0.068 * v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor);
      src.start(t);
      src.stop(t + 0.25);

      // Hybrid Dual-Port vents an initial atmospheric burst followed by compressor flutter chops
      if (exCfg.bovType === 'hybrid_dual') {
        this.playTurboFlutter(soundType, profileId, rpmNorm, boostLoad * 0.85, custom);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Realistic mechanical transmission linkage engagement + brief ignition torque cut.
   * Contains ZERO electronic or tonal beeps!
   */
  public playGearShift(isUpShift = true) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);

      if (this.engineFilter) {
        const curFreq = this.engineFilter.frequency.value || 460;
        this.engineFilter.frequency.setValueAtTime(curFreq * 0.58, t);
        this.engineFilter.frequency.setTargetAtTime(curFreq, t + 0.045, 0.035);
      }

      if (this.noiseBuffer) {
        const clunkSrc = this.ctx.createBufferSource();
        clunkSrc.buffer = this.noiseBuffer;
        const clunkFilter = this.ctx.createBiquadFilter();
        clunkFilter.type = 'bandpass';
        clunkFilter.frequency.setValueAtTime(isUpShift ? 138 : 158, t);
        clunkFilter.frequency.exponentialRampToValueAtTime(62, t + 0.06);
        clunkFilter.Q.value = 1.65;

        const clunkGain = this.ctx.createGain();
        clunkGain.gain.setValueAtTime(0.064 * this.sfxVolume, t);
        clunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

        clunkSrc.connect(clunkFilter);
        clunkFilter.connect(clunkGain);
        clunkGain.connect(this.masterCompressor);
        clunkSrc.start(t);
        clunkSrc.stop(t + 0.07);
      }
    } catch {
      // Ignore
    }
  }

  public playHandbrakePull() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, t);
      filter.frequency.exponentialRampToValueAtTime(220, t + 0.085);
      filter.Q.value = 1.6;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.038 * this.sfxVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterCompressor);
      src.start(t);
      src.stop(t + 0.095);
    } catch {
      // Ignore
    }
  }

  public playCollisionImpact(severity = 0.6, collisionType: CollisionType = 'guardrail') {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor) return;
    const now = performance.now();
    if (now - this.lastCollisionSoundTime < 160) return;
    this.lastCollisionSoundTime = now;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const clampedSev = Math.max(0.15, Math.min(1.0, severity));
      const amp = Math.min(0.14, 0.04 + clampedSev * 0.09) * this.collisionVolume * this.sfxVolume;

      if (this.noiseBuffer) {
        const thumpSrc = this.ctx.createBufferSource();
        thumpSrc.buffer = this.noiseBuffer;
        const thumpFilter = this.ctx.createBiquadFilter();
        thumpFilter.type = 'lowpass';
        thumpFilter.frequency.setValueAtTime(
          collisionType === 'guardrail' ? 185 : collisionType === 'tree' ? 115 : 140,
          t
        );
        thumpFilter.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        const thumpGain = this.ctx.createGain();
        thumpGain.gain.setValueAtTime(amp * 1.15, t);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        thumpSrc.connect(thumpFilter);
        thumpFilter.connect(thumpGain);
        thumpGain.connect(this.masterCompressor);
        thumpSrc.start(t);
        thumpSrc.stop(t + 0.17);

        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(
          collisionType === 'guardrail' ? 760 : collisionType === 'concrete' ? 480 : 380,
          t
        );
        filter.frequency.exponentialRampToValueAtTime(210, t + 0.18);
        filter.Q.value = 1.8;
        const scrapeGain = this.ctx.createGain();
        scrapeGain.gain.setValueAtTime(amp * 0.65, t);
        scrapeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
        src.connect(filter);
        filter.connect(scrapeGain);
        scrapeGain.connect(this.masterCompressor);
        src.start(t);
        src.stop(t + 0.2);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Realistic multi-tier percussive exhaust backfire / unburnt fuel detonation in the tailpipe.
   * Synchronizes with visual flame size:
   * - Small (< 0.52): crisp localized exhaust pop
   * - Medium (0.52 - 0.82): mid-band detonation crack + muffler thump
   * - Large (>= 0.82): deep cannon sub-bass shockwave + metallic blast-pipe bang
   */
  public playBackfirePop(
    intensity = 0.85,
    custom?: Partial<VehicleCustomization>,
    distanceMeters = 0
  ) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const exVol = Math.max(0.5, Math.min(1.6, custom?.exhaustVolume ?? 1.1));
      const sysBoost =
        custom?.exhaustSystem === 'straight_pipe' || custom?.exhaustSystem === 'titanium_race'
          ? 1.32
          : custom?.exhaustSystem === 'stock_oem'
          ? 0.78
          : 1.08;
      // Spatial distance attenuation for multiplayer vehicles (1.0 for local car)
      const distAtten = distanceMeters > 0 ? 1 / (1 + distanceMeters * 0.14) : 1.0;
      if (distAtten < 0.05) return;

      const v =
        Math.min(1.75, Math.max(0.22, intensity * exVol * sysBoost * this.exhaustAudioIntensity)) *
        this.exhaustVolume *
        distAtten;

      const isLargeBang = intensity >= 0.82;
      const isSmallPop = intensity < 0.52;

      // Layer 1: Deep tailpipe & muffler pressure thump (strongest on Large racing backfires)
      const thumpSrc = this.ctx.createBufferSource();
      thumpSrc.buffer = this.noiseBuffer;
      const thumpFilter = this.ctx.createBiquadFilter();
      thumpFilter.type = 'lowpass';
      thumpFilter.frequency.setValueAtTime(
        (isLargeBang ? 142 : isSmallPop ? 210 : 170) + Math.random() * 45,
        t
      );
      thumpFilter.frequency.exponentialRampToValueAtTime(34, t + (isLargeBang ? 0.13 : 0.09));
      const thumpGain = this.ctx.createGain();
      thumpGain.gain.setValueAtTime((isLargeBang ? 0.175 : isSmallPop ? 0.085 : 0.135) * v, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + (isLargeBang ? 0.14 : 0.095));
      thumpSrc.connect(thumpFilter);
      thumpFilter.connect(thumpGain);
      thumpGain.connect(this.masterCompressor);
      thumpSrc.start(t);
      thumpSrc.stop(t + (isLargeBang ? 0.145 : 0.1));

      // Layer 2: Crisp metallic exhaust tip detonation crack (bandpass noise transient)
      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = this.noiseBuffer;
      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      const tipPitch =
        custom?.exhaustSystem === 'titanium_race'
          ? 520
          : custom?.exhaustSystem === 'straight_pipe'
          ? 460
          : 390;
      crackFilter.frequency.setValueAtTime(tipPitch + Math.random() * 160, t);
      crackFilter.frequency.exponentialRampToValueAtTime(135, t + (isLargeBang ? 0.085 : 0.055));
      crackFilter.Q.value = isLargeBang ? 1.25 : 1.55;
      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime((isLargeBang ? 0.125 : 0.092) * v, t);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t + (isLargeBang ? 0.09 : 0.065));
      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.masterCompressor);
      crackSrc.start(t);
      crackSrc.stop(t + (isLargeBang ? 0.095 : 0.07));

      // Layer 3: Sharp tailpipe nozzle acoustic snap (high-frequency unburnt fuel ignition transient)
      const snapSrc = this.ctx.createBufferSource();
      snapSrc.buffer = this.noiseBuffer;
      const snapFilter = this.ctx.createBiquadFilter();
      snapFilter.type = 'highpass';
      snapFilter.frequency.setValueAtTime(isLargeBang ? 1280 : 1620, t);
      const snapGain = this.ctx.createGain();
      snapGain.gain.setValueAtTime((isLargeBang ? 0.088 : isSmallPop ? 0.048 : 0.068) * v, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);
      snapSrc.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(this.masterCompressor);
      snapSrc.start(t);
      snapSrc.stop(t + 0.036);
    } catch {
      // Ignore
    }
  }

  /**
   * Multi-pop deceleration exhaust overrun burbles & crackles when lifting off throttle at high RPM,
   * downshifting, or after aggressive stationary revving.
   */
  public playOverrunCrackles(
    popCount = 3,
    intensity = 0.72,
    custom?: Partial<VehicleCustomization>
  ) {
    if (this.muted) return;
    const crackleSetting = custom?.crackleIntensity ?? 0.78;
    if (crackleSetting <= 0.02) return;
    this.init();
    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return;
    const scaledCount = Math.max(
      1,
      Math.min(6, Math.round(popCount * (0.65 + crackleSetting * 0.65)))
    );
    for (let i = 0; i < scaledCount; i++) {
      const delayMs = i * (52 + Math.random() * 46);
      const popIntensity =
        intensity * crackleSetting * (0.94 - i * 0.12) * (0.86 + Math.random() * 0.26);
      setTimeout(() => {
        this.playBackfirePop(popIntensity, custom);
      }, delayMs);
    }
  }

  public playEngineRev(
    soundType: EngineSoundType = 'i6_turbo',
    profileId?: EngineAudioProfileId,
    custom?: Partial<VehicleCustomization>
  ) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const params = getEngineAcousticParameters(soundType, profileId);
      const exCfg = resolveExhaustAudioConfig(soundType, profileId, custom);
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const lpFilter = this.ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      const peakCutoff = Math.max(480, 820 + exCfg.filterCutoffBoost);
      lpFilter.frequency.setValueAtTime(280, t);
      lpFilter.frequency.exponentialRampToValueAtTime(peakCutoff, t + 0.26);
      lpFilter.frequency.exponentialRampToValueAtTime(250, t + 0.72);

      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      subOsc.type = 'triangle';
      const startF = params.baseFreq * 1.15;
      const peakF = params.maxFreq * 0.82;
      osc.frequency.setValueAtTime(startF, t);
      osc.frequency.exponentialRampToValueAtTime(peakF, t + 0.26);
      osc.frequency.exponentialRampToValueAtTime(startF * 1.02, t + 0.72);

      subOsc.frequency.setValueAtTime(startF * 0.5, t);
      subOsc.frequency.exponentialRampToValueAtTime(peakF * 0.5, t + 0.26);
      subOsc.frequency.exponentialRampToValueAtTime(startF * 0.5, t + 0.72);

      const revGain = Math.min(
        0.2,
        0.095 *
          ((this.engineVolume + this.exhaustVolume) * 0.5) *
          this.engineAudioIntensity *
          exCfg.volumeMultiplier
      );
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(revGain, t + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.74);

      osc.connect(lpFilter);
      subOsc.connect(lpFilter);
      lpFilter.connect(gain);
      gain.connect(this.masterCompressor);
      osc.start(t);
      subOsc.start(t);
      osc.stop(t + 0.76);
      subOsc.stop(t + 0.76);
      setTimeout(() => {
        if (exCfg.isEffectiveTurbo) {
          this.playBlowOffValve(soundType, profileId, custom, 0.85, 0.95);
        }
        this.playOverrunCrackles(4, 0.92, custom);
      }, 265);
    } catch {
      // Ignore
    }
  }

  /**
   * Audio Test Bench helper: plays a realistic 0.55s rubber-on-asphalt drift tire squeal sample.
   */
  public playTireSquealTest() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(880, t);
      bp.frequency.linearRampToValueAtTime(1060, t + 0.25);
      bp.frequency.linearRampToValueAtTime(840, t + 0.52);
      bp.Q.value = 2.6;
      const gain = this.ctx.createGain();
      const v = Math.max(0.15, this.tireVolume * this.sfxVolume);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.055 * v, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterCompressor);
      src.start(t);
      src.stop(t + 0.56);
    } catch {
      // Ignore
    }
  }

  /**
   * Subtle, ultra-short mechanical switch click (14ms filtered noise transient) for UI actions.
   * Never produces a pitched electronic beep!
   */
  public playUiChime(_pitch = 520) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return;
    try {
      const t = Math.max(0.001, this.ctx.currentTime);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(340, t);
      filter.Q.value = 1.5;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.018 * this.uiVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.015);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor);
      src.start(t);
      src.stop(t + 0.018);
    } catch {
      // Ignore
    }
  }
}

export const soundEngine = new SoundEngine();

