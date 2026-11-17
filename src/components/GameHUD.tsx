import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeDynoCurve,
  computeHandlingPreviewMetrics,
  getTuningPresetValues,
} from '../game/carPhysics';
import { MAPS_DATA } from '../game/mapsData';
import {
  multiplayerClient,
  MultiplayerRoomSummary,
  RemotePlayerState,
} from '../game/multiplayerClient';
import {
  computeTandemTelemetry,
  MultiplayerMode,
  TandemTelemetryResult,
} from '../game/multiplayerStore';
import { getMapRoadSamples } from '../game/roadMath';
import { soundEngine } from '../game/sound';
import {
  BlowOffValveType,
  BodyKitType,
  CameraMode,
  CarInput,
  CarState,
  ControlSchemeMode,
  createDefaultMobileLayouts,
  CustomPaintPreset,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_PHOTO_MODE_STATE,
  ExhaustStyleType,
  ExhaustSystemType,
  FrontSplitterType,
  GarageCameraView,
  GameSettings,
  GameState,
  GraphicsPreset,
  GrilleStyleType,
  HandlingMode,
  HeadlightMode,
  HoodStyleType,
  LiveryStyleType,
  MapId,
  MobileControlElementConfig,
  MobileControlId,
  MobileControllerLayoutProfile,
  MufflerType,
  OpenWorldPOI,
  PaintFinishType,
  PhotoCameraPreset,
  PhotoModeState,
  RearDiffuserType,
  ReplayCameraMode,
  ReplayState,
  RimStyleType,
  SideSkirtType,
  SpoilerStyleType,
  TimeOfDay,
  TransmissionMode,
  TuningPresetType,
  TurboSetupType,
  VehicleCustomization,
  VehicleSpec,
  WeatherMode,
} from '../game/types';
import { getVehicleById, VEHICLES_CATALOG } from '../game/vehiclesData';
import { GarageDynoLiveState } from './DriftCanvas';
import {
  canRequestFullscreen,
  exitFullscreen,
  isFullscreen,
  isIOSSafari,
  isMobileOrTouch,
  isStandalonePWA,
  requestFullscreen,
  toggleFullscreen,
} from '../utils/fullscreen';

export interface TelemetryHandles {
  updateTelemetry: (state: CarState) => void;
}

interface GameHUDProps {
  mapId: MapId;
  timeOfDay: TimeOfDay;
  cameraMode: CameraMode;
  graphicsPreset: GraphicsPreset;
  gameState: GameState;
  gameSettings?: GameSettings;
  activeViewpointIdx: number;
  isMuted: boolean;
  selectedVehicle: VehicleSpec;
  customization: VehicleCustomization;
  garageCameraView: GarageCameraView;
  garageLightsOn: boolean;
  garageDynoState?: GarageDynoLiveState;
  onUpdateGarageDynoState?: React.Dispatch<React.SetStateAction<GarageDynoLiveState>>;
  virtualInputRef: React.MutableRefObject<Partial<CarInput>>;
  telemetryHandlesRef: React.MutableRefObject<TelemetryHandles | null>;
  onSelectMap: (id: MapId) => void;
  onToggleTimeOfDay: () => void;
  onSelectTimeOfDay?: (tod: TimeOfDay) => void;
  onCycleCamera: () => void;
  onSelectGraphicsPreset: (preset: GraphicsPreset) => void;
  onSelectViewpoint: (idx: number) => void;
  onResetCar: () => void;
  onToggleMute: () => void;
  isStartingGame?: boolean;
  onStartGame: () => void;
  onOpenGarage: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onReturnToTitle: () => void;
  onSelectVehicle: (id: string) => void;
  onUpdateCustomization: (patch: Partial<VehicleCustomization>) => void;
  onResetCustomization: () => void;
  onSelectGarageCamera: (view: GarageCameraView) => void;
  onToggleGarageLights: () => void;
  onTriggerGarageRev: () => void;
  onUpdateSettings?: (patch: Partial<GameSettings>) => void;
  onResetCameraSettings?: () => void;
  photoModeState?: PhotoModeState;
  onUpdatePhotoMode?: (updater: (prev: PhotoModeState) => PhotoModeState) => void;
  onCaptureScreenshot?: () => void;
  replayState?: ReplayState;
  onUpdateReplayState?: (updater: (prev: ReplayState) => ReplayState) => void;
}

const RIM_COLORS = [
  { name: 'Volk Bronze', hex: '#855836' },
  { name: 'BBS Motorsport Gold', hex: '#d4af37' },
  { name: 'Machined Silver', hex: '#e2e8f0' },
  { name: 'Forged Gunmetal', hex: '#475569' },
  { name: 'Stealth Gloss Black', hex: '#18181b' },
  { name: 'Time Attack White', hex: '#f8fafc' },
];

export function GameHUD({
  mapId,
  timeOfDay,
  cameraMode,
  graphicsPreset,
  gameState,
  gameSettings = DEFAULT_GAME_SETTINGS,
  activeViewpointIdx,
  isMuted,
  selectedVehicle,
  customization,
  garageCameraView,
  garageLightsOn,
  garageDynoState = {
    active: false,
    rpm: 900,
    throttle: 0,
    gear: 4,
    speedKmh: 0,
    boostBar: -0.45,
    backfireActive: false,
  },
  onUpdateGarageDynoState,
  virtualInputRef,
  telemetryHandlesRef,
  onSelectMap,
  onToggleTimeOfDay,
  onSelectTimeOfDay,
  onCycleCamera,
  onSelectGraphicsPreset,
  onSelectViewpoint,
  onResetCar,
  onToggleMute,
  isStartingGame = false,
  onStartGame,
  onOpenGarage,
  onPauseGame,
  onResumeGame,
  onReturnToTitle,
  onSelectVehicle,
  onUpdateCustomization,
  onResetCustomization,
  onSelectGarageCamera,
  onToggleGarageLights,
  onTriggerGarageRev,
  onUpdateSettings,
  onResetCameraSettings,
  photoModeState = DEFAULT_PHOTO_MODE_STATE,
  onUpdatePhotoMode,
  onCaptureScreenshot,
  replayState = {
    active: false,
    playing: true,
    playbackSpeed: 1.0,
    cameraMode: 'chase',
    currentFrame: 0,
    totalFrames: 0,
  },
  onUpdateReplayState,
}: GameHUDProps) {
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [customTab, setCustomTab] = useState<
    'paint' | 'wheels' | 'aero' | 'exhaust' | 'dyno' | 'tuning'
  >(() => (garageCameraView === 'dyno' ? 'dyno' : 'paint'));
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('ALL');
  const [showBlueprintRef, setShowBlueprintRef] = useState(false);
  const [sheetUiExpanded, setSheetUiExpanded] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<
    | 'graphics'
    | 'display'
    | 'audio'
    | 'controls'
    | 'gameplay'
    | 'camera'
    | 'accessibility'
    | 'network'
    | 'weather'
  >('graphics');
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const settingsSnapshotRef = useRef<GameSettings | null>(null);
  const [showMobileLayoutEditor, setShowMobileLayoutEditor] = useState(false);
  const [selectedEditorBtn, setSelectedEditorBtn] =
    useState<MobileControlId>('steer_wheel');
  const draggingEditorBtnRef = useRef<{
    id: MobileControlId;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origXPct: number;
    origYPct: number;
    origScale: number;
  } | null>(null);
  const [, setTiltGammaDeg] = useState(0);

  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showWorldMapModal, setShowWorldMapModal] = useState(false);
  const [isTestDrive, setIsTestDrive] = useState(false);
  const [dynoPullRunning, setDynoPullRunning] = useState(false);
  const [garageLightTest, setGarageLightTest] = useState<{
    brake: boolean;
    reverse: boolean;
    indicator: 'off' | 'left' | 'right' | 'hazard';
  }>({ brake: false, reverse: false, indicator: 'off' });

  const updateGarageLightTest = (
    patch: Partial<{
      brake: boolean;
      reverse: boolean;
      indicator: 'off' | 'left' | 'right' | 'hazard';
    }>
  ) => {
    setGarageLightTest((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('garage-light-test-change', { detail: next })
        );
      }
      return next;
    });
  };

  useEffect(() => {
    if (gameState !== 'garage') {
      setGarageLightTest({ brake: false, reverse: false, indicator: 'off' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('garage-light-test-change', {
            detail: { brake: false, reverse: false, indicator: 'off' },
          })
        );
      }
    }
  }, [gameState]);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 || isMobileOrTouch() : false
  );
  const [isPortraitMobile, setIsPortraitMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.innerWidth < window.innerHeight && (window.innerWidth < 800 || isMobileOrTouch())
      : false
  );
  const [fsActive, setFsActive] = useState(() => isFullscreen());
  const [iosSafariTip, setIosSafariTip] = useState(false);
  const [mobileGarageTab, setMobileGarageTab] = useState<'specs' | 'customize' | 'roster' | 'none'>('customize');

  useEffect(() => {
    const updateFs = () => {
      const active = isFullscreen();
      setFsActive(active);
      if (active !== gameSettings.fullscreen) {
        onUpdateSettings?.({ fullscreen: active });
      }
    };
    document.addEventListener('fullscreenchange', updateFs);
    document.addEventListener('webkitfullscreenchange', updateFs);
    return () => {
      document.removeEventListener('fullscreenchange', updateFs);
      document.removeEventListener('webkitfullscreenchange', updateFs);
    };
  }, [gameSettings.fullscreen, onUpdateSettings]);

  const handleToggleFullscreen = React.useCallback(async () => {
    if (!canRequestFullscreen() && isIOSSafari() && !isStandalonePWA()) {
      setIosSafariTip(true);
      setTimeout(() => setIosSafariTip(false), 6000);
      return;
    }
    const next = await toggleFullscreen();
    setFsActive(next);
    onUpdateSettings?.({ fullscreen: next });
  }, [onUpdateSettings]);
  const [wheelVisualDeg, setWheelVisualDeg] = useState(0);
  const wheelDragOriginRef = useRef<{ cx: number; cy: number } | null>(null);
  const wheelPointerIdRef = useRef<number | null>(null);

  // Saved Custom Paint Presets
  const [savedPaintPresets, setSavedPaintPresets] = useState<CustomPaintPreset[]>(() => {
    try {
      const raw = localStorage.getItem('touge_paint_presets_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'bayside_pearl',
        name: 'Midnight Pearl Blue',
        hex: '#1d4ed8',
        finish: 'pearl',
        brightness: 1.05,
        metallicIntensity: 0.78,
        roughness: 0.14,
      },
      {
        id: 'gunmetal_satin',
        name: 'Touge Satin Gunmetal',
        hex: '#334155',
        finish: 'satin',
        brightness: 0.95,
        metallicIntensity: 0.45,
        roughness: 0.34,
      },
    ];
  });

  // Multiplayer Room & Connection State
  const [mpTab, setMpTab] = useState<'browse' | 'create' | 'code'>('browse');
  const [mpRooms, setMpRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [mpConnectedRoom, setMpConnectedRoom] = useState<MultiplayerRoomSummary | null>(
    multiplayerClient.getRoom()
  );
  const [mpRemotePlayers, setMpRemotePlayers] = useState<RemotePlayerState[]>([]);
  const [mpError, setMpError] = useState<string | null>(null);
  const [mpPlayerName, setMpPlayerName] = useState(() => multiplayerClient.getPlayerName());
  const [mpInviteCodeInput, setMpInviteCodeInput] = useState('');
  const [mpJoinPasswordInput, setMpJoinPasswordInput] = useState('');
  const [mpNewRoomName, setMpNewRoomName] = useState('Hakone Touge Tandem');
  const [mpNewRoomMode, setMpNewRoomMode] = useState<MultiplayerMode>('free_drift');
  const [mpNewRoomLaps, setMpNewRoomLaps] = useState<number>(2);
  const [mpNewRoomPrivate, setMpNewRoomPrivate] = useState(false);
  const [mpNewRoomPassword, setMpNewRoomPassword] = useState('');
  const [mpNewRoomMaxPlayers, setMpNewRoomMaxPlayers] = useState(8);
  const [mpNewRoomCollisions, setMpNewRoomCollisions] = useState(false);

  // Persistent Driver Profile stats
  const [driverProfile, setDriverProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('touge_driver_profile_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      bestDriftScore: 42850,
      bestDriftChain: 14200,
      totalDistanceKm: 18.4,
      maxSpeedKmh: 246,
      sessionsCompleted: 12,
    };
  });

  const [rebindingField, setRebindingField] = useState<
    | 'accelerateKey'
    | 'brakeKey'
    | 'leftKey'
    | 'rightKey'
    | 'handbrakeKey'
    | 'nitroKey'
    | 'upshiftKey'
    | 'downshiftKey'
    | null
  >(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareVehicleId, setCompareVehicleId] = useState<string>('supra_mk4');
  const [pauseSnapshot, setPauseSnapshot] = useState({
    totalScore: 0,
    bestChain: 0,
    distanceKm: '0.00',
    maxSpeed: 0,
    maxDriftAngle: 0,
    driftDurationSec: '0.0',
    smoothnessPct: 92,
    consistencyPct: 90,
  });

  // High-frequency DOM refs updated directly from the 60Hz loop without React state re-renders
  const speedTextRef = useRef<SVGTextElement | null>(null);
  const gearTextRef = useRef<SVGTextElement | null>(null);
  const rpmArcRef = useRef<SVGCircleElement | null>(null);
  const rpmNeedleRef = useRef<SVGGElement | null>(null);
  const rpmNumTextRef = useRef<HTMLSpanElement | null>(null);
  const turboBoostTextRef = useRef<HTMLSpanElement | null>(null);
  const shiftLedRef = useRef<HTMLSpanElement | null>(null);
  const nitroBarRef = useRef<HTMLDivElement | null>(null);
  const lapTextRef = useRef<HTMLSpanElement | null>(null);
  const lapTimerTextRef = useRef<HTMLSpanElement | null>(null);
  const driftAngleTextRef = useRef<HTMLSpanElement | null>(null);
  const driftBannerRef = useRef<HTMLDivElement | null>(null);
  const driftPointsTextRef = useRef<HTMLSpanElement | null>(null);
  const driftMultTextRef = useRef<HTMLSpanElement | null>(null);
  const totalScoreTextRef = useRef<HTMLSpanElement | null>(null);
  const zoneNameTextRef = useRef<HTMLSpanElement | null>(null);
  const surfaceBadgeRef = useRef<HTMLSpanElement | null>(null);
  const minimapCarRef = useRef<SVGGElement | null>(null);
  const driftNotificationBoxRef = useRef<HTMLDivElement | null>(null);
  const driftNotificationTextRef = useRef<HTMLSpanElement | null>(null);
  const practiceStepRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null, null]);
  // Live Vehicle Telemetry Overlay DOM refs
  const telSpeedRef = useRef<HTMLSpanElement | null>(null);
  const telRpmRef = useRef<HTMLSpanElement | null>(null);
  const telGearRef = useRef<HTMLSpanElement | null>(null);
  const telSteerRef = useRef<HTMLSpanElement | null>(null);
  const telSlipRef = useRef<HTMLSpanElement | null>(null);
  const telDriftRef = useRef<HTMLSpanElement | null>(null);
  const telLoadRef = useRef<HTMLSpanElement | null>(null);
  const latestCarRef = useRef<CarState | null>(null);
  const sessionStartMsRef = useRef<number>(performance.now());

  const mapDef = MAPS_DATA[mapId];

  // Deterministic Dyno Curve for the currently selected vehicle and installed parts
  const dynoCurve = useMemo(
    () => computeDynoCurve(selectedVehicle, customization),
    [selectedVehicle, customization]
  );

  // Stop Dyno engine when leaving the garage
  useEffect(() => {
    if (gameState !== 'garage' && garageDynoState.active) {
      setDynoPullRunning(false);
      onUpdateGarageDynoState?.((prev) => ({
        ...prev,
        active: false,
        throttle: 0,
        rpm: 900,
        speedKmh: 0,
        boostBar: -0.45,
        backfireActive: false,
      }));
    }
  }, [gameState, garageDynoState.active, onUpdateGarageDynoState]);

  // Throttled Dyno Simulation Loop when Garage Dyno is active (~18Hz React state commits, zero UI stutter)
  useEffect(() => {
    if (gameState !== 'garage' || !garageDynoState.active || !onUpdateGarageDynoState) return;
    let rafId = 0;
    let lastMs = performance.now();
    let pullPhase: 'ramp' | 'overrun' | 'idle' = dynoPullRunning ? 'ramp' : 'idle';
    let overrunTimer = 0;

    const stepDyno = (nowMs: number) => {
      const elapsedMs = nowMs - lastMs;
      if (elapsedMs < 55) {
        rafId = requestAnimationFrame(stepDyno);
        return;
      }
      const dt = Math.min(0.12, Math.max(0.016, elapsedMs / 1000));
      lastMs = nowMs;

      onUpdateGarageDynoState((prev) => {
        if (!prev.active) return prev;
        const redline = dynoCurve.redlineRpm;
        const idle = dynoCurve.idleRpm;
        const gearIdx = Math.max(0, Math.min(5, (prev.gear || 4) - 1));
        const gearRatios = selectedVehicle.physicsConfig?.gearRatios ?? [
          3.45, 2.2, 1.54, 1.18, 0.96, 0.81,
        ];
        const finalDrive =
          customization.finalDriveRatio ?? selectedVehicle.physicsConfig?.finalDrive ?? 4.05;
        const gearRatio = gearRatios[gearIdx] ?? 1.18;

        let nextRpm = prev.rpm;
        let nextThrottle = prev.throttle;
        let nextBackfire = false;

        if (dynoPullRunning) {
          if (pullPhase === 'ramp') {
            nextThrottle = 1.0;
            // Realistic dyno roller inertia climb rate based on horsepower
            const climbRate = (1180 + dynoCurve.peakWhp * 1.45) / Math.max(0.75, gearRatio * 0.85);
            nextRpm = prev.rpm + climbRate * dt;
            if (nextRpm >= redline - 60) {
              nextRpm = redline - 40;
              pullPhase = 'overrun';
              overrunTimer = 1.35;
              nextThrottle = 0;
              nextBackfire = true;
              soundEngine.playEngineRev(
                selectedVehicle.soundType,
                selectedVehicle.engineAudioProfile,
                customization
              );
            }
          } else if (pullPhase === 'overrun') {
            nextThrottle = 0;
            overrunTimer -= dt;
            nextRpm = Math.max(idle, prev.rpm - 2350 * dt);
            nextBackfire = overrunTimer > 0.35 && Math.sin(nowMs * 0.045) > 0.15;
            if (overrunTimer <= 0 || nextRpm <= idle + 250) {
              pullPhase = 'idle';
              setDynoPullRunning(false);
            }
          }
        } else {
          // Manual Throttle Control on Dyno Rollers
          const targetRpm = idle + prev.throttle * (redline - idle);
          if (targetRpm > prev.rpm) {
            const climb = (1450 + dynoCurve.peakWhp * 1.6) * dt;
            nextRpm = Math.min(redline, prev.rpm + climb);
          } else {
            const drop = 1950 * dt;
            nextRpm = Math.max(idle, prev.rpm - drop);
            if (prev.rpm > 4500 && prev.throttle < 0.08) {
              nextBackfire = Math.sin(nowMs * 0.05) > 0.35;
            }
          }
        }

        // Lookup interpolated boost at nextRpm
        const samplePt =
          dynoCurve.points.find((p) => p.rpm >= nextRpm) ??
          dynoCurve.points[dynoCurve.points.length - 1];
        const targetBoost =
          nextThrottle > 0.15 ? (samplePt?.boostBar ?? 0) * nextThrottle : -0.42;
        const nextBoost = prev.boostBar + (targetBoost - prev.boostBar) * Math.min(1, dt * 8);

        // Compute realistic roller wheel speed in km/h from RPM, gearRatio & finalDrive
        const wheelRpm = nextRpm / Math.max(0.4, gearRatio * finalDrive);
        const tireCircumferenceM = 2.04;
        const nextSpeedKmh = Math.max(0, (wheelRpm * tireCircumferenceM * 60) / 1000);

        return {
          ...prev,
          rpm: nextRpm,
          throttle: nextThrottle,
          speedKmh: nextSpeedKmh,
          boostBar: Number(nextBoost.toFixed(2)),
          backfireActive: nextBackfire,
        };
      });

      rafId = requestAnimationFrame(stepDyno);
    };

    rafId = requestAnimationFrame(stepDyno);
    return () => cancelAnimationFrame(rafId);
  }, [
    gameState,
    garageDynoState.active,
    dynoPullRunning,
    dynoCurve,
    selectedVehicle,
    customization,
    onUpdateGarageDynoState,
  ]);

  // Live Multiplayer Tandem Telemetry & Synchronized Race Countdown
  const [tandemTelemetry, setTandemTelemetry] = useState<TandemTelemetryResult | null>(null);
  const [raceCountdownLabel, setRaceCountdownLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!mpConnectedRoom) {
      setTandemTelemetry(null);
      setRaceCountdownLabel(null);
      return;
    }
    const timer = window.setInterval(() => {
      if (latestCarRef.current && mpRemotePlayers.length > 0) {
        const c = latestCarRef.current;
        const tRes = computeTandemTelemetry(
          {
            x: c.x,
            z: c.z,
            heading: c.heading,
            speedKmh: c.speedKmh,
            driftAngle: c.driftAngle,
            isDrifting: c.isDrifting,
          },
          mpRemotePlayers,
          multiplayerClient.getPlayerId()
        );
        setTandemTelemetry(tRes);
      } else {
        setTandemTelemetry(null);
      }

      const room = multiplayerClient.getRoom();
      const cdStartMs = room?.raceCountdownStartMs ?? 0;
      const raceStartMs = room?.raceStartMs ?? 0;
      if (room?.raceStatus === 'countdown' && cdStartMs > 0) {
        const elapsed = Date.now() - cdStartMs;
        const remSec = Math.ceil((3500 - elapsed) / 1000);
        if (remSec >= 3) setRaceCountdownLabel('3');
        else if (remSec === 2) setRaceCountdownLabel('2');
        else if (remSec === 1) setRaceCountdownLabel('1');
        else setRaceCountdownLabel('GO!');
      } else if (
        room?.raceStatus === 'active' &&
        raceStartMs > 0 &&
        Date.now() - raceStartMs < 1400
      ) {
        setRaceCountdownLabel('GO!');
      } else {
        setRaceCountdownLabel(null);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [mpConnectedRoom, mpRemotePlayers]);

  // Track responsive viewport width and portrait/landscape orientation for auto PC vs. Mobile controls
  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < 1024 || isMobileOrTouch());
      setIsPortraitMobile(
        window.innerWidth < window.innerHeight && (window.innerWidth < 800 || isMobileOrTouch())
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Subscribe to Multiplayer room & remote player updates
  useEffect(() => {
    const unsub = multiplayerClient.subscribe((room, remotes) => {
      setMpConnectedRoom(room ? { ...room } : null);
      setMpRemotePlayers([...remotes]);
    });
    return unsub;
  }, []);

  // Refresh public rooms when Multiplayer modal opens
  useEffect(() => {
    if (!showMultiplayerModal) return;
    multiplayerClient.fetchRooms().then((rooms) => setMpRooms(rooms));
    const timer = window.setInterval(() => {
      multiplayerClient.fetchRooms().then((rooms) => setMpRooms(rooms));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [showMultiplayerModal]);

  // Active Mobile Controller Layout Profile & Per-Button Update Helpers
  const activeMobileProfile: MobileControllerLayoutProfile = useMemo(() => {
    const defaults = createDefaultMobileLayouts();
    const allLayouts =
      Array.isArray(gameSettings.mobileLayouts) && gameSettings.mobileLayouts.length > 0
        ? gameSettings.mobileLayouts
        : defaults;
    const targetId = gameSettings.mobileLeftHanded
      ? 'default_left'
      : gameSettings.activeMobileLayoutId || 'default_right';
    const rawProf = allLayouts.find((p) => p.id === targetId) ?? allLayouts[0];
    const fallbackDef = defaults.find((d) => d.id === rawProf.id) ?? defaults[0];
    const mergedElements: Record<MobileControlId, MobileControlElementConfig> = {
      ...fallbackDef.elements,
      ...(rawProf.elements ?? rawProf.controls),
      steer_wheel: {
        ...fallbackDef.elements.steer_wheel,
        ...(rawProf.elements?.steer_wheel ?? rawProf.controls?.steer_wheel ?? {}),
      },
    };
    return {
      ...rawProf,
      steeringType: rawProf.steeringType ?? 'wheel',
      controls: mergedElements,
      elements: mergedElements,
    };
  }, [gameSettings.mobileLayouts, gameSettings.activeMobileLayoutId, gameSettings.mobileLeftHanded]);

  const effectiveControlScheme: 'pc' | 'mobile_wheel' | 'mobile_buttons' | 'mobile_tilt' = useMemo(() => {
    const mode: ControlSchemeMode = gameSettings.controlScheme ?? 'auto';
    if (mode === 'pc') return 'pc';
    if (mode === 'mobile_wheel') return 'mobile_wheel';
    if (mode === 'mobile_tilt') return 'mobile_tilt';
    if (mode === 'mobile_buttons') return 'mobile_buttons';
    if (!isMobileViewport) return 'pc';
    if (activeMobileProfile.steeringType === 'buttons') return 'mobile_buttons';
    if (activeMobileProfile.steeringType === 'tilt') return 'mobile_tilt';
    return 'mobile_wheel';
  }, [gameSettings.controlScheme, isMobileViewport, activeMobileProfile.steeringType]);

  // DeviceOrientation tilt steering listener when mobile_tilt is active
  useEffect(() => {
    if (effectiveControlScheme !== 'mobile_tilt') return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const gamma = typeof e.gamma === 'number' ? e.gamma : 0; // -90 to +90 deg
      const clampedDeg = Math.max(-38, Math.min(38, gamma));
      setTiltGammaDeg(clampedDeg);
      const norm = Math.max(-1, Math.min(1, -clampedDeg / 28));
      virtualInputRef.current.analogSteer = norm;
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      virtualInputRef.current.analogSteer = 0;
    };
  }, [effectiveControlScheme, virtualInputRef]);

  const updateMobileControlElement = (
    controlId: MobileControlId,
    patch: Partial<MobileControlElementConfig>
  ) => {
    const defaults = createDefaultMobileLayouts();
    const allLayouts =
      Array.isArray(gameSettings.mobileLayouts) && gameSettings.mobileLayouts.length > 0
        ? gameSettings.mobileLayouts
        : defaults;
    const nextLayouts = allLayouts.map((prof) => {
      if (prof.id !== activeMobileProfile.id) return prof;
      const fallbackDef = defaults.find((d) => d.id === prof.id) ?? defaults[0];
      const baseElements = {
        ...fallbackDef.elements,
        ...(prof.elements ?? prof.controls),
      };
      const cur = baseElements[controlId] ?? fallbackDef.elements[controlId];
      const nextElements = {
        ...baseElements,
        [controlId]: {
          ...cur,
          ...patch,
          xPct: Math.max(4, Math.min(96, patch.xPct ?? cur.xPct)),
          yPct: Math.max(4, Math.min(96, patch.yPct ?? cur.yPct)),
          scale: Math.max(0.6, Math.min(1.65, patch.scale ?? cur.scale)),
          opacity: Math.max(0.2, Math.min(0.95, patch.opacity ?? cur.opacity)),
        },
      };
      return {
        ...prof,
        controls: nextElements,
        elements: nextElements,
      };
    });
    onUpdateSettings?.({
      mobileLayouts: nextLayouts,
      activeMobileLayoutId: activeMobileProfile.id,
    });
  };

  const updateActiveMobileProfileSteeringType = (steeringType: 'wheel' | 'buttons' | 'tilt') => {
    const defaults = createDefaultMobileLayouts();
    const allLayouts =
      Array.isArray(gameSettings.mobileLayouts) && gameSettings.mobileLayouts.length > 0
        ? gameSettings.mobileLayouts
        : defaults;
    const nextLayouts = allLayouts.map((prof) =>
      prof.id === activeMobileProfile.id ? { ...prof, steeringType } : prof
    );
    const nextScheme: ControlSchemeMode =
      steeringType === 'wheel'
        ? 'mobile_wheel'
        : steeringType === 'buttons'
        ? 'mobile_buttons'
        : 'mobile_tilt';
    onUpdateSettings?.({
      mobileLayouts: nextLayouts,
      activeMobileLayoutId: activeMobileProfile.id,
      controlScheme: gameSettings.controlScheme === 'auto' ? 'auto' : nextScheme,
    });
  };

  const resetActiveMobileProfile = () => {
    const defaults = createDefaultMobileLayouts();
    const fresh = defaults.find((d) => d.id === activeMobileProfile.id) ?? defaults[0];
    const allLayouts =
      Array.isArray(gameSettings.mobileLayouts) && gameSettings.mobileLayouts.length > 0
        ? gameSettings.mobileLayouts
        : defaults;
    const nextLayouts = allLayouts.map((p) => (p.id === activeMobileProfile.id ? fresh : p));
    onUpdateSettings?.({
      mobileLayouts: nextLayouts,
      activeMobileLayoutId: activeMobileProfile.id,
    });
  };

  // Precompute SVG paths for the Minimap from real road geometry
  const minimapPaths = useMemo(() => {
    const { mainSamples, branchSamples } = getMapRoadSamples(mapId);
    const scale = 0.36; // Maps [-220, 220] world coords to [0, 180] SVG viewBox
    const toSvg = (wx: number, wz: number) => `${(90 + wx * scale).toFixed(1)},${(90 + wz * scale).toFixed(1)}`;

    const mainPts = mainSamples.map((s) => toSvg(s.x, s.z)).join(' L ');
    const branchPts = branchSamples.map((s) => toSvg(s.x, s.z)).join(' L ');

    return {
      mainD: `M ${mainPts} Z`,
      branchD: `M ${branchPts}`,
      scale,
    };
  }, [mapId]);

  useEffect(() => {
    telemetryHandlesRef.current = {
      updateTelemetry: (cs: CarState) => {
        latestCarRef.current = cs;
        const isMph = gameSettings.speedUnit === 'mph';
        const displaySpeed = isMph ? Math.round(cs.speedKmh * 0.621371) : Math.round(cs.speedKmh);
        if (speedTextRef.current) {
          speedTextRef.current.textContent = String(displaySpeed);
        }
        if (gearTextRef.current) {
          gearTextRef.current.textContent =
            cs.gear === -1
              ? 'R'
              : cs.gear === 0
                ? 'N'
                : String(cs.gear);
          gearTextRef.current.setAttribute(
            'fill',
            cs.shiftIndicator ? '#ef4444' : '#f97316'
          );
        }
        const rpmRatio = Math.min(1, Math.max(0, cs.rpm / 9000));
        if (rpmArcRef.current) {
          // 240-degree sweep on r=62 (circumference ~389.56 -> 240 deg = 259.7)
          const maxDash = 260;
          rpmArcRef.current.style.strokeDashoffset = String(maxDash * (1 - rpmRatio));
          rpmArcRef.current.style.stroke = cs.shiftIndicator
            ? '#ef4444'
            : rpmRatio > 0.78
              ? '#f97316'
              : '#f5f5f5';
        }
        if (rpmNeedleRef.current) {
          const needleDeg = -120 + rpmRatio * 240;
          rpmNeedleRef.current.setAttribute(
            'transform',
            `rotate(${needleDeg.toFixed(1)} 80 80)`
          );
        }
        if (rpmNumTextRef.current) {
          rpmNumTextRef.current.textContent = `${Math.round(cs.rpm).toLocaleString()} RPM`;
        }
        if (turboBoostTextRef.current) {
          const bBar = cs.turboBoostBar ?? 0;
          turboBoostTextRef.current.textContent =
            bBar >= 0 ? `+${bBar.toFixed(2)} BAR` : `${bBar.toFixed(2)} BAR`;
        }
        if (shiftLedRef.current) {
          shiftLedRef.current.style.opacity = cs.shiftIndicator ? '1' : '0.15';
        }
        if (nitroBarRef.current) {
          const nPct = Math.round(Math.max(0, Math.min(100, cs.nitroAmount ?? 100)));
          nitroBarRef.current.style.width = `${nPct}%`;
        }
        if (lapTextRef.current) {
          const lapNum = Math.max(1, Math.floor(cs.distanceDriven / 2400) + 1);
          lapTextRef.current.textContent = `LAP ${lapNum}`;
        }
        if (lapTimerTextRef.current) {
          const elapsedSec = Math.max(0, (performance.now() - sessionStartMsRef.current) / 1000);
          const mins = Math.floor(elapsedSec / 60);
          const secs = Math.floor(elapsedSec % 60);
          const tenths = Math.floor((elapsedSec % 1) * 10);
          lapTimerTextRef.current.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
        }
        if (driftAngleTextRef.current) {
          driftAngleTextRef.current.textContent = `${Math.round(cs.driftAngle)}°`;
        }
        if (totalScoreTextRef.current) {
          totalScoreTextRef.current.textContent = Math.round(
            cs.totalDriftScore + cs.currentDriftPoints
          ).toLocaleString();
        }
        if (zoneNameTextRef.current && zoneNameTextRef.current.textContent !== cs.currentZoneName) {
          zoneNameTextRef.current.textContent = cs.currentZoneName;
        }
        if (surfaceBadgeRef.current) {
          const st = cs.surfaceType ?? 'normal_asphalt';
          const gripPct = Math.round((cs.surfaceGrip ?? 1.0) * 100);
          const labelMap: Record<string, string> = {
            normal_asphalt: 'ASPHALT',
            smooth_asphalt: 'SMOOTH ASPHALT',
            wet_asphalt: 'WET ASPHALT',
            shoulder: 'SHOULDER',
            road_shoulder: 'SHOULDER',
            gravel: 'GRAVEL',
            dirt: 'DIRT',
            grass: 'GRASS',
          };
          const nextText = `${labelMap[st] ?? 'ASPHALT'} · ${gripPct}% GRIP`;
          if (surfaceBadgeRef.current.textContent !== nextText) {
            surfaceBadgeRef.current.textContent = nextText;
          }
        }
        if (driftBannerRef.current) {
          driftBannerRef.current.style.opacity = cs.isDrifting || cs.currentDriftPoints > 25 ? '1' : '0.35';
        }
        if (driftPointsTextRef.current) {
          driftPointsTextRef.current.textContent =
            cs.currentDriftPoints > 0 ? `+${Math.round(cs.currentDriftPoints)}` : 'READY';
        }
        if (driftMultTextRef.current) {
          driftMultTextRef.current.textContent = `${cs.driftMultiplier.toFixed(1)}x`;
        }
        // Live Vehicle Telemetry Overlay updates
        if (telSpeedRef.current) {
          telSpeedRef.current.textContent = `${displaySpeed} ${isMph ? 'mph' : 'km/h'}`;
        }
        if (telRpmRef.current) {
          telRpmRef.current.textContent = `${Math.round(cs.rpm)}`;
        }
        if (telGearRef.current) {
          telGearRef.current.textContent = cs.gear === -1 ? 'R' : cs.gear === 0 ? 'N' : `G${cs.gear}`;
        }
        if (telSteerRef.current) {
          const steerDeg = Math.round((cs.steerAngle * 180) / Math.PI);
          telSteerRef.current.textContent = `${steerDeg > 0 ? '+' : ''}${steerDeg}°`;
        }
        if (telSlipRef.current) {
          telSlipRef.current.textContent = `${Math.round((cs.tireSlipRatio ?? 0) * 100)}%`;
        }
        if (telDriftRef.current) {
          telDriftRef.current.textContent = `${Math.round(cs.driftAngle)}°`;
        }
        if (telLoadRef.current) {
          telLoadRef.current.textContent = `${Math.round(cs.engineLoad ?? 18)}%`;
        }
        // Silent visual drift notification banner (respects showDriftNotifications)
        if (driftNotificationBoxRef.current && driftNotificationTextRef.current) {
          const notifTimer = cs.driftNotificationTimer ?? 0;
          if (gameSettings.showDriftNotifications && notifTimer > 0 && cs.driftNotificationText) {
            driftNotificationBoxRef.current.style.opacity = String(
              Math.min(1, notifTimer * 2.2)
            );
            if (driftNotificationTextRef.current.textContent !== cs.driftNotificationText) {
              driftNotificationTextRef.current.textContent = cs.driftNotificationText;
            }
          } else {
            driftNotificationBoxRef.current.style.opacity = '0';
          }
        }
        // Live Drift Practice checklist status
        if (cs.practiceStepsCompleted) {
          for (let i = 0; i < 5; i++) {
            const el = practiceStepRefs.current[i];
            if (el) {
              const done = cs.practiceStepsCompleted[i];
              el.textContent = done ? '✓ DONE' : 'PENDING';
              el.className = done
                ? 'px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/60 text-[10px] font-mono-tabular font-bold text-emerald-300'
                : 'px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] font-mono-tabular text-stone-400';
            }
          }
        }
        if (minimapCarRef.current) {
          const sx = 90 + cs.x * minimapPaths.scale;
          const sz = 90 + cs.z * minimapPaths.scale;
          const deg = 180 - (cs.heading * 180) / Math.PI;
          minimapCarRef.current.setAttribute(
            'transform',
            `translate(${sx.toFixed(1)}, ${sz.toFixed(1)}) rotate(${deg.toFixed(1)})`
          );
        }
      },
    };
  }, [
    gameSettings.showDriftNotifications,
    gameSettings.speedUnit,
    mapDef.accentColor,
    minimapPaths.scale,
    telemetryHandlesRef,
  ]);

  // Update persistent driver profile records when pausing or leaving playing state
  useEffect(() => {
    if ((gameState === 'paused' || gameState === 'title' || gameState === 'garage') && latestCarRef.current) {
      const c = latestCarRef.current;
      const curScore = Math.round(c.totalDriftScore + c.currentDriftPoints);
      const curChain = Math.round(c.bestDriftChain);
      const curMaxSpeed = Math.round(c.maxSpeedKmh);
      setDriverProfile((prev: typeof driverProfile) => {
        const next = {
          bestDriftScore: Math.max(prev.bestDriftScore, curScore),
          bestDriftChain: Math.max(prev.bestDriftChain, curChain),
          totalDistanceKm: Number(Math.max(prev.totalDistanceKm, c.distanceDriven / 1000).toFixed(2)),
          maxSpeedKmh: Math.max(prev.maxSpeedKmh, curMaxSpeed),
          sessionsCompleted: prev.sessionsCompleted,
        };
        try {
          localStorage.setItem('touge_driver_profile_v1', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [gameState]);

  // Capture immutable snapshot when entering paused state
  useEffect(() => {
    if (gameState === 'paused' && latestCarRef.current) {
      const c = latestCarRef.current;
      setPauseSnapshot({
        totalScore: Math.round(c.totalDriftScore + c.currentDriftPoints),
        bestChain: Math.round(c.bestDriftChain),
        distanceKm: (c.distanceDriven / 1000).toFixed(2),
        maxSpeed: Math.round(c.maxSpeedKmh),
        maxDriftAngle: Math.round(c.maxDriftAngleDeg ?? c.driftAngle ?? 0),
        driftDurationSec: (c.totalDriftDurationSec ?? 0).toFixed(1),
        smoothnessPct: Math.round(c.driftSmoothnessPct ?? 92),
        consistencyPct: Math.round(c.driftConsistencyPct ?? 90),
      });
    }
  }, [gameState]);

  // Interactive Key Rebinding Listener when Settings Modal is capturing a key
  useEffect(() => {
    if (!rebindingField) return;
    const onCaptureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRebindingField(null);
        return;
      }
      soundEngine.playUiChime(600);
      onUpdateSettings?.({ [rebindingField]: e.code });
      setRebindingField(null);
    };
    window.addEventListener('keydown', onCaptureKey, true);
    return () => window.removeEventListener('keydown', onCaptureKey, true);
  }, [rebindingField, onUpdateSettings]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (rebindingField) return;
      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          soundEngine.playUiChime(580);
          onStartGame();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          soundEngine.playUiChime(520);
          onOpenGarage();
        }
        return;
      }

      if (gameState === 'garage') {
        if (e.code === 'Escape') {
          e.preventDefault();
          soundEngine.playUiChime(420);
          onReturnToTitle();
        } else if (e.code === 'Enter') {
          e.preventDefault();
          soundEngine.playUiChime(640);
          onStartGame();
        } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          e.preventDefault();
          const idx = VEHICLES_CATALOG.findIndex((v) => v.id === selectedVehicle.id);
          const nextIdx =
            e.code === 'ArrowRight'
              ? (idx + 1) % VEHICLES_CATALOG.length
              : (idx - 1 + VEHICLES_CATALOG.length) % VEHICLES_CATALOG.length;
          soundEngine.playUiChime(520);
          onSelectVehicle(VEHICLES_CATALOG[nextIdx].id);
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        soundEngine.playUiChime(440);
        if (gameState === 'playing') onPauseGame();
        else if (gameState === 'paused') onResumeGame();
        return;
      }

      if (gameState === 'paused' && e.code === 'Enter') {
        e.preventDefault();
        onResumeGame();
        return;
      }

      if (gameState !== 'playing') return;

      if (e.code === 'KeyG') {
        e.preventDefault();
        soundEngine.playUiChime(540);
        onOpenGarage();
      } else if (e.code === 'KeyC') {
        soundEngine.playUiChime(520);
        onCycleCamera();
      } else if (e.code === 'KeyN') {
        soundEngine.playUiChime(480);
        onToggleTimeOfDay();
      } else if (e.code === 'KeyR') {
        soundEngine.playUiChime(400);
        onResetCar();
      } else if (e.code === 'KeyM') {
        onToggleMute();
      } else if (e.code === 'KeyL') {
        soundEngine.playUiChime(510);
        const modes: HeadlightMode[] = ['auto', 'drl', 'low', 'high', 'off'];
        const nextMode = modes[(modes.indexOf(gameSettings.headlightMode) + 1) % modes.length];
        onUpdateSettings?.({ headlightMode: nextMode });
      } else if (e.code === 'KeyT') {
        soundEngine.playUiChime(540);
        const order: TransmissionMode[] = ['automatic', 'manual_clutch_assist', 'manual'];
        const nextMode =
          order[(order.indexOf(gameSettings.transmissionMode) + 1) % order.length];
        onUpdateSettings?.({
          transmissionMode: nextMode,
        });
      } else if (e.code === 'KeyV') {
        soundEngine.playUiChime(560);
        onUpdateSettings?.({
          handlingMode:
            (gameSettings.handlingMode ?? 'drift') === 'drift' ? 'race' : 'drift',
        });
      } else if (e.code === 'KeyH') {
        setHudCollapsed((prev) => !prev);
      } else if (e.code === 'Digit1') {
        onSelectViewpoint(0);
      } else if (e.code === 'Digit2') {
        onSelectViewpoint(1);
      } else if (e.code === 'Digit3') {
        onSelectViewpoint(2);
      } else if (e.code === 'Digit4') {
        onSelectViewpoint(3);
      } else if (e.code === 'Digit5') {
        onSelectViewpoint(4);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    rebindingField,
    gameState,
    gameSettings.headlightMode,
    gameSettings.transmissionMode,
    gameSettings.handlingMode,
    selectedVehicle.id,
    onStartGame,
    onOpenGarage,
    onReturnToTitle,
    onSelectVehicle,
    onPauseGame,
    onResumeGame,
    onCycleCamera,
    onToggleTimeOfDay,
    onResetCar,
    onToggleMute,
    onSelectViewpoint,
    onUpdateSettings,
  ]);

  const activeColorName =
    selectedVehicle.factoryColors.find((c) => c.hex.toLowerCase() === customization.paintColor.toLowerCase())
      ?.name ?? 'Custom Paint';

  // ---------------------------------------------------------------------------
  // 1. 3D UNDERGROUND JDM GARAGE & SHOWROOM UI
  // ---------------------------------------------------------------------------
  if (gameState === 'garage') {
    const currentIndex = VEHICLES_CATALOG.findIndex((v) => v.id === selectedVehicle.id);
    const isSheetMode = garageCameraView === 'sheet';
    const showWorkshopPanels = !isSheetMode || sheetUiExpanded;

    return (
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 md:p-4">
        {/* STUDIO 360° TURNAROUND MODEL SHEET OVERLAY (ALIGNMENT LINES & VIEW HEADERS) */}
        {isSheetMode && (
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Subtle horizontal blueprint alignment reference lines matching reference turnaround sheet */}
            <div className="absolute left-0 right-0 top-[24%] border-t border-dashed border-slate-600/35" />
            <div className="absolute left-0 right-0 top-[47%] border-t border-dashed border-slate-600/40" />
            <div className="absolute left-0 right-0 top-[64%] border-t border-dashed border-slate-600/35" />
            <div className="absolute left-0 right-0 top-[87%] border-t border-dashed border-slate-600/40" />

            {/* Top Row Turnaround Headers */}
            <div className="absolute left-[14.5%] top-[14%] -translate-x-1/2 text-slate-900 font-display font-extrabold text-sm md:text-base tracking-wider uppercase">
              FRONT VIEW
            </div>
            <div className="absolute left-[39.5%] top-[14%] -translate-x-1/2 text-slate-900 font-display font-extrabold text-sm md:text-base tracking-wider uppercase">
              REAR VIEW
            </div>
            <div className="absolute left-[75%] top-[14%] -translate-x-1/2 text-slate-900 font-display font-extrabold text-sm md:text-base tracking-wider uppercase">
              SIDE VIEW
            </div>

            {/* Bottom Row Turnaround Headers */}
            <div className="absolute left-[27%] top-[53.5%] -translate-x-1/2 text-slate-900 font-display font-extrabold text-sm md:text-base tracking-wider uppercase">
              TOP VIEW
            </div>
            <div className="absolute left-[74.5%] top-[53.5%] -translate-x-1/2 text-slate-900 font-display font-extrabold text-sm md:text-base tracking-wider uppercase">
              3/4 FRONT VIEW
            </div>

            {/* Bottom Spec Watermark Strip when Workshop Panels are tucked */}
            {!sheetUiExpanded && (
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-100 text-xs font-mono-tabular shadow-lg">
                <span className="font-bold text-orange-400">
                  {selectedVehicle.year} {selectedVehicle.manufacturer} {selectedVehicle.name} ({selectedVehicle.chassisCode})
                </span>
                <span className="text-slate-400">|</span>
                <span>{activeColorName}</span>
                <span className="text-slate-400">|</span>
                <span>Use ◀ ▶ Arrow Keys to Switch Cars</span>
              </div>
            )}
          </div>
        )}

        {/* TOP BAR: Showroom Header, Map Target Selector, Drive CTA */}
        <div className="relative z-10 pointer-events-auto flex items-center justify-between gap-2 bg-stone-950/92 border border-stone-800 rounded-2xl px-3.5 py-2 shadow-xl">
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(420);
                onReturnToTitle();
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-200 cursor-pointer whitespace-nowrap shrink-0"
            >
              ← Title
            </button>
            <div>
              <div className="text-[9px] font-mono-tabular uppercase tracking-widest text-orange-400 leading-tight">
                {isSheetMode
                  ? '360° CAD TURNAROUND SHEET'
                  : '地下駐車場 · TOKYO UNDERGROUND SHOWROOM'}
              </div>
              <div className="text-sm md:text-base font-display font-bold text-stone-100 tracking-wide leading-tight">
                {selectedVehicle.manufacturer.toUpperCase()} {selectedVehicle.name.toUpperCase()} ({currentIndex + 1}/{VEHICLES_CATALOG.length})
              </div>
            </div>
          </div>

          {/* Camera Inspection Angle Bar */}
          <div
            className="flex items-center gap-1 bg-stone-900/95 border border-stone-800 rounded-xl p-1"
            role="group"
            aria-label="Showroom Camera Angles"
          >
            {(
              [
                { id: 'sheet', label: '360° Sheet' },
                { id: 'turntable', label: '360° Turntable' },
                { id: 'front', label: 'Front' },
                { id: 'side', label: 'Side' },
                { id: 'rear', label: 'Rear' },
                { id: 'top', label: 'Top' },
                { id: 'interior', label: 'Cockpit' },
                { id: 'dyno', label: '📊 Dyno Bay' },
              ] as { id: GarageCameraView; label: string }[]
            ).map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => {
                  soundEngine.playUiChime(520);
                  onSelectGarageCamera(cam.id);
                  if (cam.id === 'dyno') {
                    setCustomTab('dyno');
                  }
                }}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  garageCameraView === cam.id
                    ? 'bg-orange-500 text-stone-950 font-semibold'
                    : 'text-stone-300 hover:text-white hover:bg-stone-800'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          {/* Destination Map + Primary Drive CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {isSheetMode && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiChime(500);
                  setSheetUiExpanded((prev) => !prev);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-mono-tabular font-semibold border cursor-pointer whitespace-nowrap ${
                  sheetUiExpanded
                    ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                    : 'bg-stone-900 border-stone-700 text-stone-200 hover:bg-stone-800'
                }`}
              >
                {sheetUiExpanded ? 'Hide Workshop' : '⚙️ Customize'}
              </button>
            )}
            <div className="hidden 2xl:flex items-center bg-stone-900 border border-stone-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => onSelectMap('mountain')}
                className={`px-2 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                  mapId === 'mountain'
                    ? 'bg-amber-500 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Mountain Drift
              </button>
              <button
                type="button"
                onClick={() => onSelectMap('blossom')}
                className={`px-2 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                  mapId === 'blossom'
                    ? 'bg-orange-500 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Blossom Drift
              </button>
            </div>

            {isMobileViewport && (
              <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 rounded-xl p-0.5 shrink-0 overflow-x-auto">
                {(
                  [
                    { id: 'specs', label: '🚗 Specs' },
                    { id: 'customize', label: '⚙️ Tune' },
                    { id: 'roster', label: '🏎️ Cars' },
                    { id: 'none', label: '👁️ 3D' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMobileGarageTab(t.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono-tabular font-bold cursor-pointer whitespace-nowrap ${
                      mobileGarageTab === t.id
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={isStartingGame}
              onClick={() => {
                soundEngine.playUiChime(600);
                setIsTestDrive(true);
                if (isMobileOrTouch() || gameSettings.fullscreen) {
                  requestFullscreen().catch(() => {});
                }
                onStartGame();
              }}
              className="px-3 py-1.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-wait"
              title="Test your current drift setup on the track and return to the Garage anytime"
            >
              {isStartingGame ? '🏎️ Starting...' : '🔧 Test Drive'}
            </button>

            <button
              type="button"
              data-start="true"
              disabled={isStartingGame}
              onClick={() => {
                soundEngine.playUiChime(660);
                setIsTestDrive(false);
                if (isMobileOrTouch() || gameSettings.fullscreen) {
                  requestFullscreen().catch(() => {});
                }
                onStartGame();
              }}
              className={`px-3.5 py-1.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0 shadow-lg disabled:opacity-60 disabled:cursor-wait ${
                mapId === 'mountain'
                  ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                  : 'bg-orange-500 hover:bg-orange-400 text-stone-950'
              }`}
            >
              {isStartingGame ? '🏎️ Starting...' : `Drive ${mapDef.name} →`}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(520);
                handleToggleFullscreen();
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono-tabular font-semibold border border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800 cursor-pointer whitespace-nowrap flex items-center gap-1"
              title={fsActive ? 'Exit Fullscreen' : 'Fullscreen Mode (Hide Browser Header)'}
            >
              <span>{fsActive ? '🗗' : '⛶'}</span>
              <span className="hidden sm:inline">{fsActive ? 'Window' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        {/* MIDDLE PERIMETER PANELS: Left Specs Card + Open Center 3D Viewport + Right Customization Workshop */}
        <div
          className={`relative z-10 flex-1 flex items-center justify-between gap-4 my-3 overflow-hidden ${
            showWorkshopPanels ? '' : 'hidden'
          }`}
        >
          {/* LEFT PANEL: Vehicle Specifications & Interactive Showroom Controls */}
          <div className={`pointer-events-auto w-72 md:w-80 bg-stone-950/90 border border-stone-800/95 rounded-2xl p-4 shadow-xl flex flex-col gap-3.5 max-h-full overflow-y-auto ${
            isMobileViewport && mobileGarageTab !== 'specs' ? 'hidden' : ''
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono-tabular uppercase tracking-wider text-orange-400 font-semibold">
                  {selectedVehicle.manufacturer} · {selectedVehicle.year}
                </span>
                <span className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono-tabular text-stone-200">
                  {selectedVehicle.drivetrain}
                </span>
              </div>
              <h1 className="text-xl font-display font-bold text-stone-100 tracking-wide mt-0.5">
                {selectedVehicle.name}
              </h1>
              <div className="text-xs font-mono-tabular text-stone-400 mt-0.5">
                Chassis: <span className="text-stone-200">{selectedVehicle.chassisCode}</span> · Country:{' '}
                <span className="text-stone-200">{selectedVehicle.country}</span>
              </div>
              <div className="text-xs text-amber-400 font-mono-tabular mt-1">
                {selectedVehicle.engineDescription}
              </div>
            </div>

            {/* Key Tabular Performance Metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-2 text-center">
                <div className="text-[10px] font-mono-tabular text-stone-400">POWER</div>
                <div className="text-sm font-mono-tabular font-bold text-stone-100">
                  {Math.round(selectedVehicle.horsepower * (customization.horsepowerTuning ?? 1))} HP
                </div>
              </div>
              <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-2 text-center">
                <div className="text-[10px] font-mono-tabular text-stone-400">WEIGHT</div>
                <div className="text-sm font-mono-tabular font-bold text-stone-100">
                  {selectedVehicle.weightKg} kg
                </div>
              </div>
              <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-2 text-center">
                <div className="text-[10px] font-mono-tabular text-stone-400">TOP SPEED</div>
                <div className="text-sm font-mono-tabular font-bold text-stone-100">
                  {selectedVehicle.topSpeedKmh} km/h
                </div>
              </div>
            </div>

            {/* Rating Bars */}
            <div className="flex flex-col gap-2 bg-stone-900/60 border border-stone-800/80 rounded-xl p-3">
              {[
                { label: 'DRIFT BALANCE', val: selectedVehicle.driftRating, color: 'bg-amber-400' },
                { label: 'CHASSIS HANDLING', val: selectedVehicle.handlingRating, color: 'bg-orange-400' },
                { label: 'ACCELERATION', val: selectedVehicle.accelerationRating, color: 'bg-red-500' },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-mono-tabular">
                    <span className="text-stone-400">{stat.label}</span>
                    <span className="text-stone-200 font-semibold">{stat.val.toFixed(1)} / 10</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-stone-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stat.color}`}
                      style={{ width: `${Math.min(100, stat.val * 10)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Showroom Actions: Lights, Engine Rev & Compare Specs */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiChime(500);
                  onToggleGarageLights();
                }}
                className={`py-2 px-1 rounded-xl text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center ${
                  garageLightsOn
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-stone-900 border-stone-700 text-stone-300'
                }`}
              >
                {garageLightsOn ? '💡 Lights ON' : '💡 Lights OFF'}
              </button>
              <button
                type="button"
                onClick={onTriggerGarageRev}
                className="py-2 px-1 rounded-xl text-[10px] font-mono-tabular font-semibold bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/60 text-rose-300 transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center"
              >
                🔥 Rev Engine
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiChime(560);
                  if (compareVehicleId === selectedVehicle.id) {
                    const alt = VEHICLES_CATALOG.find((v) => v.id !== selectedVehicle.id);
                    if (alt) setCompareVehicleId(alt.id);
                  }
                  setShowCompareModal(true);
                }}
                className="py-2 px-1 rounded-xl text-[10px] font-mono-tabular font-semibold bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center"
              >
                ⚖️ Compare
              </button>
            </div>

            {/* Interactive Rear Taillight & Signal Inspection Strip */}
            <div className="flex flex-col gap-1.5 bg-stone-900/70 border border-stone-800/90 rounded-xl p-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-stone-400">
                  REAR LIGHTING TEST
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(520);
                    onSelectGarageCamera('rear');
                  }}
                  className="text-[10px] font-mono-tabular text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  Rear Cam ↗
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(480);
                    updateGarageLightTest({ brake: !garageLightTest.brake });
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    garageLightTest.brake
                      ? 'bg-red-500/25 border-red-500 text-red-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  BRAKE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(510);
                    updateGarageLightTest({ reverse: !garageLightTest.reverse });
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    garageLightTest.reverse
                      ? 'bg-stone-100/20 border-stone-200 text-white'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  REV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(540);
                    updateGarageLightTest({
                      indicator:
                        garageLightTest.indicator === 'left' ? 'off' : 'left',
                    });
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    garageLightTest.indicator === 'left'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  ◀ L
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(560);
                    updateGarageLightTest({
                      indicator:
                        garageLightTest.indicator === 'hazard' ? 'off' : 'hazard',
                    });
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    garageLightTest.indicator === 'hazard'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  HAZ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(540);
                    updateGarageLightTest({
                      indicator:
                        garageLightTest.indicator === 'right' ? 'off' : 'right',
                    });
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    garageLightTest.indicator === 'right'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  R ▶
                </button>
              </div>
            </div>

            {(selectedVehicle.id === 'r34_gtr' || selectedVehicle.id === 'r33_gtr') && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(540);
                    setShowBlueprintRef((prev) => !prev);
                  }}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                    showBlueprintRef
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-500'
                  }`}
                >
                  {showBlueprintRef ? '📐 Hide 360° CAD Blueprint' : '📐 View 360° CAD Blueprint'}
                </button>
                {showBlueprintRef && (
                  <div className="rounded-xl overflow-hidden border border-white/15 bg-stone-900 p-1">
                    <img
                      src={
                        selectedVehicle.id === 'r33_gtr'
                          ? '/assets/aistudio/image_d5d9e975.png'
                          : '/assets/aistudio/image_19dc4564.png'
                      }
                      alt={`${selectedVehicle.year} ${selectedVehicle.manufacturer} ${selectedVehicle.name} Vehicle Inspection Blueprint`}
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Modular Customization Foundation */}
          <div className={`pointer-events-auto w-72 md:w-80 bg-stone-950/90 border border-stone-800/95 rounded-2xl p-4 shadow-xl flex flex-col gap-3.5 max-h-full overflow-y-auto ${
            isMobileViewport && mobileGarageTab !== 'customize' ? 'hidden' : ''
          }`}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-display font-bold uppercase tracking-wider text-stone-200">
                CUSTOMIZATION WORKSHOP
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiChime(440);
                  onResetCustomization();
                }}
                className="text-[11px] font-mono-tabular text-stone-400 hover:text-stone-200 underline cursor-pointer"
              >
                Reset OEM
              </button>
            </div>

            {/* Customization Category Tabs */}
            <div className="grid grid-cols-6 gap-1 bg-stone-900 p-1 rounded-xl border border-stone-800">
              {(
                [
                  { id: 'paint', label: 'Paint' },
                  { id: 'wheels', label: 'Wheels' },
                  { id: 'aero', label: 'Aero' },
                  { id: 'exhaust', label: 'Exhaust' },
                  { id: 'dyno', label: 'Dyno' },
                  { id: 'tuning', label: 'Tuning' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(500);
                    setCustomTab(tab.id);
                    if (tab.id === 'dyno') {
                      onSelectGarageCamera('dyno');
                    }
                  }}
                  className={`py-1.5 rounded-lg text-[10px] font-medium cursor-pointer transition-colors ${
                    customTab === tab.id
                      ? 'bg-stone-800 text-orange-400 font-semibold border border-stone-700'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: REALISTIC PBR PAINT & FINISH WORKSHOP */}
            {customTab === 'paint' && (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    FACTORY &amp; JDM PALETTE ({activeColorName})
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {selectedVehicle.factoryColors.map((sw) => {
                      const active =
                        customization.paintColor.toLowerCase() === sw.hex.toLowerCase();
                      return (
                        <button
                          key={sw.name}
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(540);
                            onUpdateCustomization({
                              paintColor: sw.hex,
                            });
                          }}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-left cursor-pointer transition-all ${
                            active
                              ? 'bg-stone-900 border-orange-500 text-stone-100'
                              : 'bg-stone-900/60 border-stone-800 text-stone-300 hover:border-stone-700'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: sw.hex }}
                          />
                          <span className="text-xs truncate">{sw.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Color Picker + Hex Code */}
                <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono-tabular uppercase text-stone-400">
                      CUSTOM SPECTRUM COLOR
                    </div>
                    <div className="text-xs font-mono-tabular font-bold text-stone-200 mt-0.5">
                      {customization.paintColor.toUpperCase()}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-stone-950 border border-stone-700 cursor-pointer text-xs text-orange-300 font-mono-tabular">
                    <input
                      type="color"
                      aria-label="Custom Paint Color Picker"
                      value={customization.paintColor}
                      onChange={(e) =>
                        onUpdateCustomization({ paintColor: e.target.value })
                      }
                      className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <span>Pick Color</span>
                  </label>
                </div>

                {/* 6 Distinct PBR Paint Finishes */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    AUTOMOTIVE PAINT FINISH (6 PBR SHADERS)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'gloss', label: 'Gloss' },
                        { id: 'metallic', label: 'Metallic' },
                        { id: 'matte', label: 'Matte' },
                        { id: 'satin', label: 'Satin' },
                        { id: 'pearl', label: 'Pearl' },
                        { id: 'chrome', label: 'Chrome' },
                      ] as { id: PaintFinishType; label: string }[]
                    ).map((fin) => (
                      <button
                        key={fin.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(500);
                          // Clear manual roughness override when switching finish preset so the finish shader shines immediately
                          onUpdateCustomization({
                            paintFinish: fin.id,
                            paintRoughness: undefined,
                            metallicIntensity: undefined,
                          });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium uppercase border cursor-pointer ${
                          customization.paintFinish === fin.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {fin.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fine Paint Material Sliders: Brightness, Metallic Flake, Roughness */}
                <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[11px] font-mono-tabular">
                      <span className="text-stone-400">Paint Brightness</span>
                      <span className="text-stone-200">
                        {Math.round((customization.paintBrightness ?? 1.0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.4}
                      step={0.05}
                      value={customization.paintBrightness ?? 1.0}
                      onChange={(e) =>
                        onUpdateCustomization({ paintBrightness: parseFloat(e.target.value) })
                      }
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[11px] font-mono-tabular">
                      <span className="text-stone-400">Metallic Flake Intensity</span>
                      <span className="text-stone-200">
                        {Math.round(
                          (customization.metallicIntensity ??
                            (customization.paintFinish === 'chrome'
                              ? 0.98
                              : customization.paintFinish === 'metallic'
                                ? 0.85
                                : customization.paintFinish === 'pearl'
                                  ? 0.65
                                  : 0.25)) * 100
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={
                        customization.metallicIntensity ??
                        (customization.paintFinish === 'chrome'
                          ? 0.98
                          : customization.paintFinish === 'metallic'
                            ? 0.85
                            : customization.paintFinish === 'pearl'
                              ? 0.65
                              : 0.25)
                      }
                      onChange={(e) =>
                        onUpdateCustomization({ metallicIntensity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[11px] font-mono-tabular">
                      <span className="text-stone-400">Surface Roughness</span>
                      <span className="text-stone-200">
                        {Math.round(
                          (customization.paintRoughness ??
                            (customization.paintFinish === 'matte'
                              ? 0.56
                              : customization.paintFinish === 'satin'
                                ? 0.32
                                : customization.paintFinish === 'chrome'
                                  ? 0.04
                                  : 0.14)) * 100
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.02}
                      max={0.8}
                      step={0.02}
                      value={
                        customization.paintRoughness ??
                        (customization.paintFinish === 'matte'
                          ? 0.56
                          : customization.paintFinish === 'satin'
                            ? 0.32
                            : customization.paintFinish === 'chrome'
                              ? 0.04
                              : 0.14)
                      }
                      onChange={(e) =>
                        onUpdateCustomization({ paintRoughness: parseFloat(e.target.value) })
                      }
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Saved Custom Paint Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono-tabular text-stone-400">
                      SAVED PAINT PRESETS
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(580);
                        const newPreset: CustomPaintPreset = {
                          id: `preset_${Date.now()}`,
                          name: `${customization.paintFinish.toUpperCase()} ${customization.paintColor.toUpperCase()}`,
                          hex: customization.paintColor,
                          finish: customization.paintFinish,
                          brightness: customization.paintBrightness ?? 1.0,
                          metallicIntensity: customization.metallicIntensity ?? 0.65,
                          roughness: customization.paintRoughness ?? 0.16,
                        };
                        const nextList = [newPreset, ...savedPaintPresets].slice(0, 6);
                        setSavedPaintPresets(nextList);
                        try {
                          localStorage.setItem('touge_paint_presets_v1', JSON.stringify(nextList));
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-[10px] font-mono-tabular text-orange-400 hover:underline cursor-pointer"
                    >
                      + Save Current Paint
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {savedPaintPresets.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({
                            paintColor: pr.hex,
                            paintFinish: pr.finish,
                            paintBrightness: pr.brightness,
                            metallicIntensity: pr.metallicIntensity,
                            paintRoughness: pr.roughness,
                          });
                        }}
                        className="flex items-center gap-1.5 p-1.5 rounded-lg bg-stone-900/70 hover:bg-stone-900 border border-stone-800 text-left cursor-pointer"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                          style={{ backgroundColor: pr.hex }}
                        />
                        <span className="text-[11px] text-stone-200 truncate">{pr.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    LIVERY &amp; DECALS
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'Clean' },
                        { id: 'touge_stripe', label: 'Touge Stripe' },
                        { id: 'door_number', label: 'Door Spec' },
                      ] as { id: LiveryStyleType; label: string }[]
                    ).map((liv) => (
                      <button
                        key={liv.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(515);
                          onUpdateCustomization({ liveryStyle: liv.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.liveryStyle ?? 'none') === liv.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {liv.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WHEELS & STANCE */}
            {customTab === 'wheels' && (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    FORGED RIM DESIGN
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'te37_6spoke', label: 'Rays TE37 6-Spoke' },
                        { id: 'bbs_mesh', label: 'BBS LM Mesh' },
                        { id: 'watanabe_8spoke', label: 'Watanabe 8-Spoke' },
                        { id: 'advan_5spoke', label: 'Advan GT Twin-5' },
                      ] as { id: RimStyleType; label: string }[]
                    ).map((rim) => (
                      <button
                        key={rim.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({ rimStyle: rim.id });
                        }}
                        className={`p-2 rounded-lg text-xs font-medium border text-left cursor-pointer ${
                          customization.rimStyle === rim.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                        }`}
                      >
                        {rim.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    WHEEL ALLOY FINISH
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {RIM_COLORS.map((rc) => (
                      <button
                        key={rc.name}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(510);
                          onUpdateCustomization({ rimColor: rc.hex });
                        }}
                        className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-xs cursor-pointer ${
                          customization.rimColor.toLowerCase() === rc.hex.toLowerCase()
                            ? 'bg-stone-900 border-orange-500 text-stone-100'
                            : 'bg-stone-900/60 border-stone-800 text-stone-400'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                          style={{ backgroundColor: rc.hex }}
                        />
                        <span className="truncate text-[11px]">{rc.name.split(' ').pop()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    COILOVER RIDE HEIGHT
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'Stock OEM', offset: 0 },
                      { label: 'Track -15mm', offset: -0.025 },
                      { label: 'Stance -30mm', offset: -0.048 },
                    ].map((st) => (
                      <button
                        key={st.label}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(490);
                          onUpdateCustomization({ rideHeightOffset: st.offset });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          Math.abs(customization.rideHeightOffset - st.offset) < 0.005
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BODY KITS, BUMPERS, SPLITTERS, DIFFUSERS, SKIRTS, GRILLE, HOOD, WING, EXHAUST & TINT */}
            {customTab === 'aero' && (
              <div className="flex flex-col gap-3">
                {/* Quick Preview Camera Jump Bar */}
                <div className="flex items-center justify-between gap-1 bg-stone-900/90 border border-stone-800 rounded-lg p-1">
                  <span className="text-[10px] font-mono-tabular text-stone-400 px-1.5">
                    PREVIEW:
                  </span>
                  {(
                    [
                      { id: 'front', label: 'Front' },
                      { id: 'side', label: 'Side' },
                      { id: 'rear', label: 'Rear' },
                      { id: 'turntable', label: '360°' },
                    ] as { id: GarageCameraView; label: string }[]
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(510);
                        onSelectGarageCamera(v.id);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular cursor-pointer ${
                        garageCameraView === v.id
                          ? 'bg-orange-500 text-stone-950 font-bold'
                          : 'text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    FULL BODY KIT &amp; OVERFENDERS
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'Factory OEM Body' },
                        { id: 'street_aero', label: 'Street Spec Aero' },
                        { id: 'widebody_aero', label: 'Widebody & Canards' },
                        { id: 'track_gt', label: 'Track GT Widebody' },
                      ] as { id: BodyKitType; label: string }[]
                    ).map((bk) => (
                      <button
                        key={bk.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(550);
                          onUpdateCustomization({ bodyKit: bk.id });
                        }}
                        className={`p-2 rounded-lg text-xs font-medium border text-left cursor-pointer ${
                          (customization.bodyKit ?? 'stock') === bk.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-300'
                        }`}
                      >
                        {bk.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    FRONT BUMPER &amp; SPLITTER
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Lip' },
                        { id: 'carbon_race', label: 'Carbon Splitter' },
                        { id: 'twin_canard', label: 'Dive Canards' },
                      ] as { id: FrontSplitterType; label: string }[]
                    ).map((fs) => (
                      <button
                        key={fs.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(535);
                          onUpdateCustomization({ frontSplitter: fs.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.frontSplitter ?? 'stock') === fs.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {fs.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    REAR BUMPER &amp; DIFFUSER
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Rear' },
                        { id: 'carbon_finned', label: 'Carbon Finned' },
                        { id: 'time_attack', label: 'Time Attack' },
                      ] as { id: RearDiffuserType; label: string }[]
                    ).map((rd) => (
                      <button
                        key={rd.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(535);
                          onUpdateCustomization({ rearDiffuser: rd.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.rearDiffuser ?? 'stock') === rd.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {rd.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    SIDE SKIRTS &amp; WINGLETS
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Sill' },
                        { id: 'aero_step', label: 'Aero Step' },
                        { id: 'carbon_blade', label: 'Carbon Blade' },
                      ] as { id: SideSkirtType; label: string }[]
                    ).map((sk) => (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({ sideSkirtStyle: sk.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.sideSkirtStyle ?? 'stock') === sk.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {sk.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    FRONT GRILLE &amp; INTERCOOLER
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Grille' },
                        { id: 'mesh_intercooler', label: 'Exposed FMIC' },
                        { id: 'sport_slat', label: 'Carbon Slats' },
                      ] as { id: GrilleStyleType; label: string }[]
                    ).map((gr) => (
                      <button
                        key={gr.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(525);
                          onUpdateCustomization({ grilleStyle: gr.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.grilleStyle ?? 'stock') === gr.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {gr.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    HOOD / BONNET
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Hood' },
                        { id: 'carbon_vented', label: 'Carbon Louver' },
                        { id: 'twin_duct', label: 'Twin NACA' },
                      ] as { id: HoodStyleType; label: string }[]
                    ).map((hd) => (
                      <button
                        key={hd.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(525);
                          onUpdateCustomization({ hoodStyle: hd.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.hoodStyle ?? 'stock') === hd.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {hd.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    REAR WING / SPOILER
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'Factory OEM Wing' },
                        { id: 'gt_carbon', label: 'Carbon GT Wing' },
                        { id: 'ducktail', label: 'Aero Ducktail Lip' },
                        { id: 'none', label: 'Wingless Clean' },
                      ] as { id: SpoilerStyleType; label: string }[]
                    ).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({ spoilerStyle: sp.id });
                        }}
                        className={`p-2 rounded-lg text-xs font-medium border text-left cursor-pointer ${
                          customization.spoilerStyle === sp.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-300'
                        }`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    EXHAUST SYSTEM
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Stock' },
                        { id: 'titanium_cannon', label: 'Ti Cannon' },
                        { id: 'dual_blast', label: 'Dual Blast Pipes' },
                        { id: 'quad_race', label: 'Quad Race Tips' },
                      ] as { id: ExhaustStyleType; label: string }[]
                    ).map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(540);
                          onUpdateCustomization({ exhaustStyle: ex.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.exhaustStyle ?? 'stock') === ex.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    CABIN GLASS TINT
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { val: 0.15, label: 'CLEAR' },
                        { val: 0.50, label: 'SMOKE' },
                        { val: 0.82, label: 'LIMO' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(490);
                          onUpdateCustomization({ windowTint: t.val });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          Math.abs((customization.windowTint ?? 0.35) - t.val) < 0.18
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DEDICATED EXHAUST, TURBO FLUTTER ("STUTUTU"), BOV & FLAME CUSTOMIZATION */}
            {customTab === 'exhaust' && (
              <div className="flex flex-col gap-3">
                {/* Live Acoustic & Visual Test Bar */}
                <div className="flex items-center justify-between gap-2 bg-stone-900/90 border border-stone-800 rounded-xl p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectGarageCamera('rear');
                      onTriggerGarageRev();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-stone-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    🔥 Rev Engine &amp; Test Exhaust
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(510);
                      onSelectGarageCamera(garageCameraView === 'rear' ? 'turntable' : 'rear');
                    }}
                    className="px-2.5 py-2 rounded-lg bg-stone-950 border border-stone-700 text-[11px] font-mono-tabular text-stone-200 hover:bg-stone-800 cursor-pointer"
                  >
                    {garageCameraView === 'rear' ? '360° View' : 'Rear View'}
                  </button>
                </div>

                {/* 1. Exhaust System Architecture */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    1. EXHAUST PIPING SYSTEM
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock_oem', label: 'Stock OEM' },
                        { id: 'sports_catback', label: 'Sports Cat-Back' },
                        { id: 'straight_pipe', label: 'Straight Pipe' },
                        { id: 'titanium_race', label: 'Titanium Race' },
                      ] as { id: ExhaustSystemType; label: string }[]
                    ).map((sys) => (
                      <button
                        key={sys.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({ exhaustSystem: sys.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.exhaustSystem ?? 'sports_catback') === sys.id
                            ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {sys.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Muffler Type */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    2. MUFFLER &amp; RESONATOR ACOUSTICS
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'chambered', label: 'Chambered Street' },
                        { id: 'resonated', label: 'Tuned Resonated' },
                        { id: 'blast_pipe', label: 'JDM Blast Pipe' },
                        { id: 'track_dump', label: 'Track Screamer' },
                      ] as { id: MufflerType; label: string }[]
                    ).map((muf) => (
                      <button
                        key={muf.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(530);
                          onUpdateCustomization({ mufflerType: muf.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.mufflerType ?? 'resonated') === muf.id
                            ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {muf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Exhaust Tip Style (3D Geometry) */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    3. 3D EXHAUST TIP GEOMETRY
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock', label: 'OEM Stock Tips' },
                        { id: 'titanium_cannon', label: 'Burnt Ti Cannon' },
                        { id: 'dual_blast', label: 'Dual Blast Pipes' },
                        { id: 'quad_race', label: 'Quad Race Tips' },
                      ] as { id: ExhaustStyleType; label: string }[]
                    ).map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(540);
                          onUpdateCustomization({ exhaustStyle: ex.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.exhaustStyle ?? 'stock') === ex.id
                            ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Turbocharger Setup */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    4. TURBOCHARGER &amp; ANTI-LAG SETUP
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'stock_na_or_oem', label: 'Factory OEM / NA' },
                        { id: 'street_spool', label: 'Street Ball-Bearing' },
                        { id: 'big_single_flutter', label: 'Big Single (STUTUTU)' },
                        { id: 'anti_lag_sequential', label: 'Anti-Lag Sequential' },
                      ] as { id: TurboSetupType; label: string }[]
                    ).map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(545);
                          onUpdateCustomization({ turboSetup: tb.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.turboSetup ?? 'stock_na_or_oem') === tb.id
                            ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Blow-Off Valve / Compressor Surge Type */}
                <div>
                  <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                    5. BLOW-OFF VALVE / COMPRESSOR SURGE
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'compressor_flutter', label: 'Flutter (STUTUTU)' },
                        { id: 'atmospheric_vent', label: 'Atmo BOV (Psshh)' },
                        { id: 'hybrid_dual', label: 'Hybrid Dual-Port' },
                        { id: 'recirculating', label: 'Plumb-Back OEM' },
                      ] as { id: BlowOffValveType; label: string }[]
                    ).map((bv) => (
                      <button
                        key={bv.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(545);
                          onUpdateCustomization({ bovType: bv.id });
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          (customization.bovType ?? 'compressor_flutter') === bv.id
                            ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {bv.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6-9. Exhaust Volume, Crackle Intensity, Backfire Frequency & Flame Intensity Sliders */}
                <div className="bg-stone-900/75 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-2">
                  {[
                    {
                      label: 'Exhaust Loudness & Presence',
                      val: customization.exhaustVolume ?? 1.1,
                      min: 0.5,
                      max: 1.5,
                      step: 0.05,
                      fmt: (v: number) => `${Math.round(v * 100)}%`,
                      key: 'exhaustVolume' as const,
                    },
                    {
                      label: 'Decel Overrun Crackle Intensity',
                      val: customization.crackleIntensity ?? 0.78,
                      min: 0.0,
                      max: 1.0,
                      step: 0.05,
                      fmt: (v: number) => `${Math.round(v * 100)}%`,
                      key: 'crackleIntensity' as const,
                    },
                    {
                      label: 'Backfire Detonation Frequency',
                      val: customization.backfireFrequency ?? 0.75,
                      min: 0.0,
                      max: 1.0,
                      step: 0.05,
                      fmt: (v: number) => `${Math.round(v * 100)}%`,
                      key: 'backfireFrequency' as const,
                    },
                    {
                      label: 'Exhaust Flame Plume Intensity',
                      val: customization.flameIntensity ?? 0.95,
                      min: 0.0,
                      max: 1.3,
                      step: 0.05,
                      fmt: (v: number) => `${Math.round(v * 100)}%`,
                      key: 'flameIntensity' as const,
                    },
                  ].map((sl) => (
                    <div key={sl.key} className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[11px] font-mono-tabular">
                        <span className="text-stone-400">{sl.label}</span>
                        <span className="text-stone-200">{sl.fmt(sl.val)}</span>
                      </div>
                      <input
                        type="range"
                        min={sl.min}
                        max={sl.max}
                        step={sl.step}
                        value={sl.val}
                        onChange={(e) =>
                          onUpdateCustomization({
                            [sl.key]: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4.5: EXHAUST SOUND & CHASSIS DYNAMOMETER FACILITY */}
            {customTab === 'dyno' && (() => {
              const curRpm = Math.round(garageDynoState.rpm);
              const curSample =
                dynoCurve.points.find((p) => p.rpm >= curRpm) ??
                dynoCurve.points[dynoCurve.points.length - 1];
              const throttleLoad = garageDynoState.active
                ? Math.max(0.18, garageDynoState.throttle)
                : 0;
              const liveWhp = garageDynoState.active
                ? Math.round((curSample?.whp ?? 45) * throttleLoad)
                : 0;
              const liveTorqueNm = garageDynoState.active
                ? Math.round((curSample?.torqueNm ?? 120) * throttleLoad)
                : 0;

              // Build SVG polyline points for WHP and Torque curves across [0..260] x [0..110]
              const maxScaleVal = Math.max(600, dynoCurve.peakWhp * 1.18, dynoCurve.peakTorqueNm * 1.15);
              const minRpm = 1000;
              const maxRpm = dynoCurve.redlineRpm;
              const toX = (rpm: number) =>
                16 + ((rpm - minRpm) / Math.max(1000, maxRpm - minRpm)) * 232;
              const toY = (val: number) => 102 - (val / maxScaleVal) * 86;

              const whpPolyline = dynoCurve.points
                .map((pt) => `${toX(pt.rpm).toFixed(1)},${toY(pt.whp).toFixed(1)}`)
                .join(' ');
              const trqPolyline = dynoCurve.points
                .map((pt) => `${toX(pt.rpm).toFixed(1)},${toY(pt.torqueNm).toFixed(1)}`)
                .join(' ');
              const playheadX = toX(Math.max(minRpm, Math.min(maxRpm, curRpm)));

              return (
                <div className="flex flex-col gap-3">
                  {/* Engine Ignition + Full 4th-Gear Dyno Pull Trigger */}
                  <div className="flex flex-col gap-1.5 bg-stone-900/90 border border-stone-800 rounded-xl p-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.init();
                          const nextActive = !garageDynoState.active;
                          if (nextActive) {
                            soundEngine.playEngineStartup(
                              selectedVehicle.soundType,
                              selectedVehicle.engineAudioProfile
                            );
                            onSelectGarageCamera('dyno');
                          } else {
                            setDynoPullRunning(false);
                          }
                          onUpdateGarageDynoState?.((prev) => ({
                            ...prev,
                            active: nextActive,
                            rpm: dynoCurve.idleRpm,
                            throttle: 0,
                            speedKmh: 0,
                            boostBar: -0.42,
                            backfireActive: false,
                          }));
                        }}
                        className={`flex-1 py-2 px-2.5 rounded-lg font-mono-tabular font-bold text-xs uppercase cursor-pointer border ${
                          garageDynoState.active
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                            : 'bg-stone-950 border-stone-700 text-stone-200 hover:bg-stone-800'
                        }`}
                      >
                        {garageDynoState.active ? '● ENGINE RUNNING' : '○ START ENGINE'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.init();
                          onSelectGarageCamera('rear');
                          onTriggerGarageRev();
                        }}
                        className="px-2.5 py-2 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-700 text-[11px] font-mono-tabular text-orange-300 cursor-pointer"
                        title="Blip throttle & inspect rear exhaust flames"
                      >
                        🔥 Blip
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.init();
                        onSelectGarageCamera('dyno');
                        setDynoPullRunning(true);
                        onUpdateGarageDynoState?.((prev) => ({
                          ...prev,
                          active: true,
                          gear: 4,
                          rpm: Math.max(1500, dynoCurve.idleRpm + 500),
                          throttle: 1.0,
                          backfireActive: false,
                        }));
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-stone-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      {dynoPullRunning
                        ? '⚡ RUNNING 4TH-GEAR DYNO SWEEP...'
                        : '⚡ Run Full 4th-Gear Dyno Pull'}
                    </button>
                  </div>

                  {/* 6-Tile Monospaced Digital Dyno Telemetry Cluster */}
                  <div className="grid grid-cols-3 gap-1.5 font-mono-tabular tabular-nums">
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">ENGINE RPM</div>
                      <div className="text-sm font-bold text-stone-100">
                        {curRpm.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">ROLLER SPD</div>
                      <div className="text-sm font-bold text-stone-100">
                        {Math.round(garageDynoState.speedKmh)} KM/H
                      </div>
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">GEAR</div>
                      <div className="text-sm font-bold text-orange-400">
                        G{garageDynoState.gear}
                      </div>
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">WHEEL HP</div>
                      <div className="text-sm font-bold text-amber-400">
                        {liveWhp || dynoCurve.peakWhp} WHP
                      </div>
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">TORQUE</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {liveTorqueNm || dynoCurve.peakTorqueNm} Nm
                      </div>
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-2">
                      <div className="text-[9px] text-stone-400">MANIFOLD</div>
                      <div className="text-sm font-bold text-stone-100">
                        {garageDynoState.boostBar >= 0
                          ? `+${garageDynoState.boostBar.toFixed(2)}`
                          : garageDynoState.boostBar.toFixed(2)}{' '}
                        BAR
                      </div>
                    </div>
                  </div>

                  {/* Real-Time SVG Horsepower (WHP) & Torque (Nm) Dyno Graph */}
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono-tabular tabular-nums">
                      <span className="text-amber-400 font-bold">
                        ━ PEAK: {dynoCurve.peakWhp} WHP @{dynoCurve.peakWhpRpm}
                      </span>
                      <span className="text-orange-400 font-bold">
                        ┄ TORQUE: {dynoCurve.peakTorqueNm} Nm @{dynoCurve.peakTorqueRpm}
                      </span>
                    </div>

                    <svg
                      viewBox="0 0 260 118"
                      className="w-full h-28 bg-stone-900/70 rounded-lg border border-stone-800/80"
                      aria-label="Dyno Horsepower and Torque Graph"
                    >
                      {/* Horizontal & Vertical Grid Lines */}
                      {[25, 50, 75, 100].map((gy) => (
                        <line
                          key={gy}
                          x1="16"
                          y1={gy}
                          x2="248"
                          y2={gy}
                          stroke="#27272a"
                          strokeWidth="1"
                        />
                      ))}
                      {[2000, 4000, 6000, 8000].map((grpm) => {
                        const gx = toX(grpm);
                        return (
                          <g key={grpm}>
                            <line
                              x1={gx}
                              y1="12"
                              x2={gx}
                              y2="102"
                              stroke="#27272a"
                              strokeWidth="1"
                              strokeDasharray="2 2"
                            />
                            <text
                              x={gx}
                              y="113"
                              textAnchor="middle"
                              fill="#71717a"
                              fontSize="7.5"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {grpm / 1000}k
                            </text>
                          </g>
                        );
                      })}

                      {/* Torque Curve (Cyan Dashed) */}
                      <polyline
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                        points={trqPolyline}
                      />

                      {/* Wheel Horsepower Curve (Amber Solid) */}
                      <polyline
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.4"
                        points={whpPolyline}
                      />

                      {/* Live RPM Playhead Vertical Cursor */}
                      <line
                        x1={playheadX}
                        y1="10"
                        x2={playheadX}
                        y2="102"
                        stroke="#f97316"
                        strokeWidth="1.6"
                      />
                      <circle
                        cx={playheadX}
                        cy={toY(curSample?.whp ?? 100)}
                        r="3.2"
                        fill="#f97316"
                        stroke="#fafafa"
                        strokeWidth="1"
                      />
                    </svg>

                    <div className="flex items-center justify-between text-[10px] font-mono-tabular text-stone-400">
                      <span>Crank: {dynoCurve.crankHp} HP</span>
                      <span>
                        Drivetrain Loss ({selectedVehicle.drivetrain}):{' '}
                        {Math.round(dynoCurve.drivetrainLossPct)}%
                      </span>
                      <span>Boost: +{dynoCurve.peakBoostBar} BAR</span>
                    </div>
                  </div>

                  {/* Manual Dyno Throttle Load Slider & 6-Speed Gear Selector */}
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-mono-tabular tabular-nums">
                        <span className="text-stone-400">Manual Dyno Throttle Load</span>
                        <span className="text-orange-400 font-bold">
                          {Math.round(garageDynoState.throttle * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Manual Dyno Throttle"
                        min={0}
                        max={1}
                        step={0.02}
                        value={garageDynoState.throttle}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          soundEngine.init();
                          setDynoPullRunning(false);
                          onUpdateGarageDynoState?.((prev) => ({
                            ...prev,
                            active: true,
                            throttle: val,
                          }));
                        }}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono-tabular text-stone-400">
                        DYNO GEAR:
                      </span>
                      <div className="grid grid-cols-6 gap-1">
                        {[1, 2, 3, 4, 5, 6].map((gNum) => (
                          <button
                            key={gNum}
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(500 + gNum * 25);
                              onUpdateGarageDynoState?.((prev) => ({
                                ...prev,
                                gear: gNum,
                              }));
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-mono-tabular font-bold cursor-pointer ${
                              garageDynoState.gear === gNum
                                ? 'bg-orange-500 text-stone-950'
                                : 'bg-stone-950 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            G{gNum}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* TAB 5: CARX DRIFT TUNING & MECHANICAL SETUP */}
            {customTab === 'tuning' && (() => {
              const previewMetrics = computeHandlingPreviewMetrics(selectedVehicle, customization);
              const activePreset: TuningPresetType = customization.tuningPreset ?? 'drift';

              return (
                <div className="flex flex-col gap-3">
                  {/* 4 Driving Presets: Street, Grip, Drift, Advanced Custom */}
                  <div>
                    <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                      DRIVING PRESET (PER-VEHICLE SETUP)
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'street', label: '1. Street' },
                          { id: 'grip', label: '2. Grip' },
                          { id: 'drift', label: '3. Drift' },
                          { id: 'custom', label: '4. Custom' },
                        ] as { id: TuningPresetType; label: string }[]
                      ).map((pr) => (
                        <button
                          key={pr.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(560);
                            const presetPatch = getTuningPresetValues(pr.id);
                            onUpdateCustomization(presetPatch);
                          }}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-mono-tabular border cursor-pointer ${
                            activePreset === pr.id
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                              : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {pr.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Handling Preview Bars */}
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-orange-400">
                      LIVE HANDLING TELEMETRY PREVIEW
                    </div>
                    {[
                      { label: 'Drift Initiation Ease', val: previewMetrics.driftEase, color: 'bg-amber-400' },
                      { label: 'Cornering Lateral Grip', val: previewMetrics.corneringGrip, color: 'bg-orange-400' },
                      { label: 'High-Speed Stability', val: previewMetrics.stability, color: 'bg-emerald-400' },
                      { label: 'Steering Lock Response', val: previewMetrics.steeringResponse, color: 'bg-red-500' },
                    ].map((bar) => (
                      <div key={bar.label} className="flex flex-col gap-0.5">
                        <div className="flex justify-between text-[10px] font-mono-tabular">
                          <span className="text-stone-400">{bar.label}</span>
                          <span className="text-stone-200 font-bold">{bar.val.toFixed(1)} / 10</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-stone-950 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${bar.color}`}
                            style={{ width: `${Math.min(100, bar.val * 10)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Engine Stage Boost */}
                  <div>
                    <div className="text-[11px] font-mono-tabular text-stone-400 mb-1.5">
                      ENGINE BOOST &amp; HORSEPOWER
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { val: 1.0, label: 'OEM 100%' },
                        { val: 1.15, label: 'Stage 1 +15%' },
                        { val: 1.3, label: 'Touge +30%' },
                      ].map((hp) => (
                        <button
                          key={hp.label}
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(560);
                            onUpdateCustomization({ horsepowerTuning: hp.val, tuningPreset: 'custom' });
                          }}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer ${
                            Math.abs((customization.horsepowerTuning ?? 1.0) - hp.val) < 0.05
                              ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-semibold'
                              : 'bg-stone-900 border-stone-800 text-stone-400'
                          }`}
                        >
                          {hp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CarX Drift Sliders */}
                  <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-2.5 flex flex-col gap-2">
                    {[
                      {
                        label: 'Front Tire Grip',
                        val: customization.frontTireGrip ?? 1.06,
                        min: 0.75,
                        max: 1.3,
                        step: 0.02,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'frontTireGrip' as const,
                      },
                      {
                        label: 'Rear Tire Grip',
                        val: customization.rearTireGrip ?? 0.88,
                        min: 0.65,
                        max: 1.25,
                        step: 0.02,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'rearTireGrip' as const,
                      },
                      {
                        label: 'Max Steering Angle (Kit)',
                        val: customization.maxSteerAngleDeg ?? 52,
                        min: 35,
                        max: 60,
                        step: 1,
                        fmt: (v: number) => `${Math.round(v)}°`,
                        key: 'maxSteerAngleDeg' as const,
                      },
                      {
                        label: 'Steering Rack Speed',
                        val: customization.steeringSensitivity ?? 1.12,
                        min: 0.75,
                        max: 1.4,
                        step: 0.05,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'steeringSensitivity' as const,
                      },
                      {
                        label: 'Front Suspension Stiffness',
                        val: customization.frontSuspensionStiffness ?? 1.1,
                        min: 0.65,
                        max: 1.45,
                        step: 0.05,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'frontSuspensionStiffness' as const,
                      },
                      {
                        label: 'Rear Suspension Stiffness',
                        val: customization.rearSuspensionStiffness ?? 0.96,
                        min: 0.65,
                        max: 1.45,
                        step: 0.05,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'rearSuspensionStiffness' as const,
                      },
                      {
                        label: '2-Way LSD Differential Lock',
                        val: customization.diffLock ?? 0.88,
                        min: 0.2,
                        max: 1.0,
                        step: 0.05,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'diffLock' as const,
                      },
                      {
                        label: 'Hydraulic Handbrake Force',
                        val: customization.handbrakeStrength ?? 1.2,
                        min: 0.7,
                        max: 1.5,
                        step: 0.05,
                        fmt: (v: number) => `${Math.round(v * 100)}%`,
                        key: 'handbrakeStrength' as const,
                      },
                      {
                        label: 'Rear Tire Pressure',
                        val: customization.tirePressurePsi ?? 26,
                        min: 18,
                        max: 42,
                        step: 1,
                        fmt: (v: number) => `${Math.round(v)} PSI`,
                        key: 'tirePressurePsi' as const,
                      },
                      {
                        label: 'Front Camber Angle',
                        val: customization.frontCamberDeg ?? -4.5,
                        min: -8.0,
                        max: 0.0,
                        step: 0.5,
                        fmt: (v: number) => `${v.toFixed(1)}°`,
                        key: 'frontCamberDeg' as const,
                      },
                      {
                        label: 'Rear Camber Angle',
                        val: customization.rearCamberDeg ?? -1.5,
                        min: -6.0,
                        max: 0.0,
                        step: 0.5,
                        fmt: (v: number) => `${v.toFixed(1)}°`,
                        key: 'rearCamberDeg' as const,
                      },
                      {
                        label: 'Front Toe Alignment',
                        val: customization.frontToeDeg ?? 0.3,
                        min: -1.5,
                        max: 1.5,
                        step: 0.1,
                        fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`,
                        key: 'frontToeDeg' as const,
                      },
                      {
                        label: 'Front Weight Bias',
                        val: customization.frontWeightBias ?? 52,
                        min: 46,
                        max: 58,
                        step: 1,
                        fmt: (v: number) => `${Math.round(v)}%`,
                        key: 'frontWeightBias' as const,
                      },
                      {
                        label: 'Final Drive Gear Ratio',
                        val:
                          customization.finalDriveRatio ??
                          selectedVehicle.physicsConfig?.finalDrive ??
                          3.95,
                        min: 3.1,
                        max: 4.9,
                        step: 0.05,
                        fmt: (v: number) => `${v.toFixed(2)}:1`,
                        key: 'finalDriveRatio' as const,
                      },
                    ].map((sl) => (
                      <div key={sl.key} className="flex flex-col gap-0.5">
                        <div className="flex justify-between text-[11px] font-mono-tabular">
                          <span className="text-stone-400">{sl.label}</span>
                          <span className="text-stone-200">{sl.fmt(sl.val)}</span>
                        </div>
                        <input
                          type="range"
                          min={sl.min}
                          max={sl.max}
                          step={sl.step}
                          value={sl.val}
                          onChange={(e) =>
                            onUpdateCustomization({
                              tuningPreset: 'custom',
                              [sl.key]: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-orange-500 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* BOTTOM ROSTER: 25-Vehicle JDM & Exotic Collection Selector with Manufacturer Filter */}
        <div
          className={`relative z-10 pointer-events-auto bg-stone-950/92 border border-stone-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 ${
            showWorkshopPanels && (!isMobileViewport || mobileGarageTab === 'roster') ? '' : 'hidden'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by Manufacturer">
              {['ALL', 'Nissan', 'Toyota', 'Mazda', 'Honda', 'Mitsubishi', 'Subaru', 'BMW', 'Ferrari'].map(
                (mfg) => {
                  const count =
                    mfg === 'ALL'
                      ? VEHICLES_CATALOG.length
                      : VEHICLES_CATALOG.filter((c) => c.manufacturer === mfg).length;
                  const active = manufacturerFilter === mfg;
                  return (
                    <button
                      key={mfg}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(510);
                        setManufacturerFilter(mfg);
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular uppercase transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-orange-500 text-stone-950 font-bold'
                          : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {mfg} ({count})
                    </button>
                  );
                }
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden xl:inline text-[11px] font-mono-tabular text-stone-400">
                DRAG 3D VIEWPORT TO ROTATE 360° · SCROLL TO ZOOM
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous Vehicle"
                  onClick={() => {
                    const prevIdx =
                      (currentIndex - 1 + VEHICLES_CATALOG.length) % VEHICLES_CATALOG.length;
                    soundEngine.playUiChime(520);
                    onSelectVehicle(VEHICLES_CATALOG[prevIdx].id);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-mono-tabular text-stone-200 cursor-pointer"
                >
                  ◀ Prev
                </button>
                <button
                  type="button"
                  aria-label="Next Vehicle"
                  onClick={() => {
                    const nextIdx = (currentIndex + 1) % VEHICLES_CATALOG.length;
                    soundEngine.playUiChime(540);
                    onSelectVehicle(VEHICLES_CATALOG[nextIdx].id);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-mono-tabular text-stone-200 cursor-pointer"
                >
                  Next ▶
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex gap-1.5 overflow-x-auto pb-1"
            role="group"
            aria-label="Vehicle Collection"
          >
            {VEHICLES_CATALOG.filter(
              (c) => manufacturerFilter === 'ALL' || c.manufacturer === manufacturerFilter
            ).map((car) => {
              const isSelected = car.id === selectedVehicle.id;
              return (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(560);
                    onSelectVehicle(car.id);
                  }}
                  className={`w-36 shrink-0 p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-stone-900 border-orange-500 shadow-md'
                      : 'bg-stone-900/60 border-stone-800/90 hover:border-stone-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono-tabular text-stone-400 truncate">
                      {car.manufacturer}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: car.defaultCustomization.paintColor }}
                    />
                  </div>
                  <div className="text-xs font-display font-bold text-stone-100 truncate mt-0.5">
                    {car.name}
                  </div>
                  <div className="text-[10px] font-mono-tabular text-stone-400 flex items-center justify-between mt-1">
                    <span>{car.chassisCode}</span>
                    <span className={isSelected ? 'text-orange-400 font-semibold' : ''}>
                      {car.horsepower}hp
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* VEHICLE PERFORMANCE & PHYSICS COMPARISON MODAL */}
        {showCompareModal && (() => {
          const rival =
            VEHICLES_CATALOG.find((v) => v.id === compareVehicleId) ??
            VEHICLES_CATALOG.find((v) => v.id !== selectedVehicle.id) ??
            VEHICLES_CATALOG[0];
          const curPw = Math.round((selectedVehicle.horsepower / selectedVehicle.weightKg) * 1000);
          const rivPw = Math.round((rival.horsepower / rival.weightKg) * 1000);
          const curCfg = selectedVehicle.physicsConfig;
          const rivCfg = rival.physicsConfig;

          const metrics = [
            {
              label: 'Horsepower',
              curVal: `${selectedVehicle.horsepower} HP`,
              rivVal: `${rival.horsepower} HP`,
              diff: selectedVehicle.horsepower - rival.horsepower,
              higherBetter: true,
              unit: 'HP',
            },
            {
              label: 'Curb Weight',
              curVal: `${selectedVehicle.weightKg} kg`,
              rivVal: `${rival.weightKg} kg`,
              diff: selectedVehicle.weightKg - rival.weightKg,
              higherBetter: false,
              unit: 'kg',
            },
            {
              label: 'Power-to-Weight',
              curVal: `${curPw} HP/t`,
              rivVal: `${rivPw} HP/t`,
              diff: curPw - rivPw,
              higherBetter: true,
              unit: 'HP/t',
            },
            {
              label: 'Top Speed',
              curVal: `${selectedVehicle.topSpeedKmh} km/h`,
              rivVal: `${rival.topSpeedKmh} km/h`,
              diff: selectedVehicle.topSpeedKmh - rival.topSpeedKmh,
              higherBetter: true,
              unit: 'km/h',
            },
            {
              label: 'Acceleration Rating',
              curVal: `${selectedVehicle.accelerationRating.toFixed(1)} / 10`,
              rivVal: `${rival.accelerationRating.toFixed(1)} / 10`,
              diff: Number((selectedVehicle.accelerationRating - rival.accelerationRating).toFixed(1)),
              higherBetter: true,
              unit: '',
            },
            {
              label: 'Chassis Handling',
              curVal: `${selectedVehicle.handlingRating.toFixed(1)} / 10`,
              rivVal: `${rival.handlingRating.toFixed(1)} / 10`,
              diff: Number((selectedVehicle.handlingRating - rival.handlingRating).toFixed(1)),
              higherBetter: true,
              unit: '',
            },
            {
              label: 'Drift Balance',
              curVal: `${selectedVehicle.driftRating.toFixed(1)} / 10`,
              rivVal: `${rival.driftRating.toFixed(1)} / 10`,
              diff: Number((selectedVehicle.driftRating - rival.driftRating).toFixed(1)),
              higherBetter: true,
              unit: '',
            },
            {
              label: 'Redline Limit',
              curVal: `${curCfg?.redlineRpm ?? 8000} RPM`,
              rivVal: `${rivCfg?.redlineRpm ?? 8000} RPM`,
              diff: (curCfg?.redlineRpm ?? 8000) - (rivCfg?.redlineRpm ?? 8000),
              higherBetter: true,
              unit: 'RPM',
            },
            {
              label: 'Front Lateral Grip',
              curVal: `${((curCfg?.frontGrip ?? 1.0) * 100).toFixed(0)}%`,
              rivVal: `${((rivCfg?.frontGrip ?? 1.0) * 100).toFixed(0)}%`,
              diff: Math.round(((curCfg?.frontGrip ?? 1.0) - (rivCfg?.frontGrip ?? 1.0)) * 100),
              higherBetter: true,
              unit: '%',
            },
            {
              label: 'Rear Traction Grip',
              curVal: `${((curCfg?.rearGrip ?? 0.9) * 100).toFixed(0)}%`,
              rivVal: `${((rivCfg?.rearGrip ?? 0.9) * 100).toFixed(0)}%`,
              diff: Math.round(((curCfg?.rearGrip ?? 0.9) - (rivCfg?.rearGrip ?? 0.9)) * 100),
              higherBetter: true,
              unit: '%',
            },
            {
              label: 'Aero Downforce',
              curVal: `${((curCfg?.downforceCoeff ?? 0.35) * 100).toFixed(0)} pts`,
              rivVal: `${((rivCfg?.downforceCoeff ?? 0.35) * 100).toFixed(0)} pts`,
              diff: Math.round(((curCfg?.downforceCoeff ?? 0.35) - (rivCfg?.downforceCoeff ?? 0.35)) * 100),
              higherBetter: true,
              unit: 'pts',
            },
            {
              label: 'Braking Force',
              curVal: `${((curCfg?.brakeStrength ?? 1.0) * 100).toFixed(0)}%`,
              rivVal: `${((rivCfg?.brakeStrength ?? 1.0) * 100).toFixed(0)}%`,
              diff: Math.round(((curCfg?.brakeStrength ?? 1.0) - (rivCfg?.brakeStrength ?? 1.0)) * 100),
              higherBetter: true,
              unit: '%',
            },
          ];

          return (
            <div
              className="fixed inset-0 z-50 pointer-events-auto bg-stone-950/88 flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="compare-modal-title"
            >
              <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                  <div>
                    <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-orange-400">
                      TELEMETRY &amp; POWERTRAIN SPEC COMPARISON
                    </div>
                    <h2
                      id="compare-modal-title"
                      className="text-lg md:text-xl font-display font-bold text-stone-100"
                    >
                      VEHICLE PERFORMANCE COMPARISON
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(false)}
                    className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono-tabular text-stone-200 cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Vehicle Headers + Rival Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-stone-950 border border-orange-500/50 rounded-xl p-3">
                    <div className="text-[10px] font-mono-tabular text-orange-400 uppercase">
                      SELECTED VEHICLE ({selectedVehicle.drivetrain})
                    </div>
                    <div className="text-sm font-display font-bold text-stone-100 mt-0.5">
                      {selectedVehicle.year} {selectedVehicle.manufacturer} {selectedVehicle.name}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-amber-400 mt-0.5">
                      {selectedVehicle.engineDescription}
                    </div>
                  </div>

                  <div className="bg-stone-950 border border-stone-700 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono-tabular text-stone-300 uppercase">
                        COMPARE AGAINST ({rival.drivetrain})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(560);
                          onSelectVehicle(rival.id);
                          setShowCompareModal(false);
                        }}
                        className="text-[10px] font-mono-tabular text-orange-400 hover:underline cursor-pointer"
                      >
                        Switch to Car →
                      </button>
                    </div>
                    <select
                      aria-label="Select Comparison Vehicle"
                      value={rival.id}
                      onChange={(e) => {
                        soundEngine.playUiChime(520);
                        setCompareVehicleId(e.target.value);
                      }}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs font-display font-bold text-stone-100 cursor-pointer"
                    >
                      {VEHICLES_CATALOG.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.year} {v.manufacturer} {v.name} ({v.chassisCode}) — {v.horsepower} HP
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] font-mono-tabular text-stone-400 truncate">
                      {rival.engineDescription}
                    </div>
                  </div>
                </div>

                {/* Side-by-Side Spec Table */}
                <div className="bg-stone-950 border border-stone-800 rounded-xl divide-y divide-stone-800/80">
                  {metrics.map((m) => {
                    const isBetter = m.higherBetter ? m.diff > 0 : m.diff < 0;
                    const isWorse = m.higherBetter ? m.diff < 0 : m.diff > 0;
                    const diffStr =
                      m.diff === 0
                        ? 'EVEN'
                        : `${m.diff > 0 ? '+' : ''}${m.diff}${m.unit ? ` ${m.unit}` : ''}`;
                    return (
                      <div
                        key={m.label}
                        className="grid grid-cols-3 items-center px-3.5 py-2 text-xs font-mono-tabular"
                      >
                        <div className="font-bold text-stone-100 flex items-center gap-2">
                          <span>{m.curVal}</span>
                          {m.diff !== 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                isBetter
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : isWorse
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : 'text-stone-400'
                              }`}
                            >
                              {diffStr}
                            </span>
                          )}
                        </div>
                        <div className="text-center text-stone-400 text-[11px] uppercase">
                          {m.label}
                        </div>
                        <div className="text-right font-semibold text-stone-300">{m.rivVal}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Gear Ratios & Final Drive Summary */}
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono-tabular">
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                    <div className="text-stone-400 mb-1">
                      {selectedVehicle.chassisCode} 6-SPEED RATIOS (FD {curCfg?.finalDrive ?? 4.1})
                    </div>
                    <div className="text-stone-200 truncate">
                      {(curCfg?.gearRatios ?? []).map((g, i) => `G${i + 1}:${g}`).join(' · ')}
                    </div>
                  </div>
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                    <div className="text-stone-400 mb-1">
                      {rival.chassisCode} 6-SPEED RATIOS (FD {rivCfg?.finalDrive ?? 4.1})
                    </div>
                    <div className="text-stone-200 truncate">
                      {(rivCfg?.gearRatios ?? []).map((g, i) => `G${i + 1}:${g}`).join(' · ')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SHARED MODALS: OPEN-WORLD MAP, MULTIPLAYER LOBBY, DRIVER PROFILE & GAME SETTINGS
  // ---------------------------------------------------------------------------
  const renderSharedModals = () => (
    <>
      {/* iOS Safari Fullscreen / Add to Home Screen Instructions */}
      {iosSafariTip && (
        <aside
          aria-label="iOS Safari Fullscreen Instructions"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-md w-[92vw] px-4 py-2.5 rounded-xl bg-neutral-950/95 border border-amber-500/70 text-amber-200 text-xs font-mono-tabular shadow-2xl flex items-center gap-2.5 backdrop-blur-md"
        >
          <span className="text-base shrink-0">📲</span>
          <span className="leading-snug">
            To hide the browser header on iPhone: Tap <strong>Share</strong> ⎋ → <strong>&apos;Add to Home Screen&apos;</strong> to launch in borderless full screen!
          </span>
          <button
            type="button"
            onClick={() => setIosSafariTip(false)}
            className="ml-auto text-neutral-400 hover:text-white p-1 text-sm shrink-0 cursor-pointer"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </aside>
      )}

      {/* OPEN-WORLD INTERACTIVE MAP, POIS & LIVE MULTIPLAYER RADAR MODAL */}
      {showWorldMapModal && (
        <div
          className="fixed inset-0 z-50 pointer-events-auto bg-zinc-950/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="world-map-modal-title"
        >
          <div className="w-full max-w-4xl bg-zinc-900 border border-white/15 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-400">
                  {mapDef.japaneseTitle} · {mapDef.totalLengthKm} · OPEN-WORLD NAVIGATION &amp; FAST TRAVEL
                </div>
                <h2
                  id="world-map-modal-title"
                  className="text-xl font-display font-bold text-zinc-100 tracking-wide"
                >
                  WORLD MAP — {mapDef.name.toUpperCase()}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(520);
                    onSelectMap(mapId === 'mountain' ? 'blossom' : 'mountain');
                  }}
                  className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-mono-tabular text-amber-300 cursor-pointer"
                >
                  Switch to {mapId === 'mountain' ? 'Sakura Pass' : 'Mt. Haruna'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWorldMapModal(false)}
                  className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono-tabular text-zinc-200 cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left 7 Cols: Interactive 2D World Road Network SVG + POIs + Live Connected Players */}
              <div className="lg:col-span-7 bg-zinc-950 border border-white/10 rounded-xl p-3 flex flex-col items-center gap-2">
                <svg
                  viewBox="0 0 180 180"
                  className="w-full max-w-[380px] aspect-square rounded-xl bg-zinc-950 border border-white/10"
                  aria-label="Interactive Open World Map"
                >
                  <circle cx="90" cy="90" r="82" fill="none" stroke="#27272a" strokeWidth="0.8" />
                  <circle
                    cx="90"
                    cy="90"
                    r="52"
                    fill="none"
                    stroke="#1f1f22"
                    strokeWidth="0.8"
                    strokeDasharray="3 3"
                  />

                  {mapDef.plazas.map((plaza) => (
                    <ellipse
                      key={plaza.id}
                      cx={90 + plaza.x * minimapPaths.scale}
                      cy={90 + plaza.z * minimapPaths.scale}
                      rx={plaza.radiusX * minimapPaths.scale}
                      ry={plaza.radiusZ * minimapPaths.scale}
                      fill="#27272a"
                      stroke="#52525b"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Secondary Branch Route */}
                  <path
                    d={minimapPaths.branchD}
                    fill="none"
                    stroke="#52525b"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />

                  {/* Primary Mountain Route */}
                  <path
                    d={minimapPaths.mainD}
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="6.5"
                    strokeLinejoin="round"
                  />

                  {/* Open-World Locations (POIs) */}
                  {(mapDef.pois ?? []).map((poi: OpenWorldPOI) => {
                    const px = 90 + poi.x * minimapPaths.scale;
                    const pz = 90 + poi.z * minimapPaths.scale;
                    return (
                      <g
                        key={poi.id}
                        transform={`translate(${px.toFixed(1)}, ${pz.toFixed(1)})`}
                        className="cursor-pointer"
                        onClick={() => {
                          soundEngine.playUiChime(580);
                          onSelectViewpoint(poi.viewpointIdx ?? 0);
                          setShowWorldMapModal(false);
                          if (poi.category === 'garage') {
                            setCustomTab('paint');
                            onOpenGarage();
                          } else if (poi.category === 'dyno') {
                            setCustomTab('dyno');
                            onSelectGarageCamera('dyno');
                            onOpenGarage();
                          } else if (poi.category === 'dealership') {
                            onSelectGarageCamera('turntable');
                            onOpenGarage();
                          } else if (gameState !== 'playing') {
                            onStartGame();
                          }
                        }}
                      >
                        <circle
                          r="4.8"
                          fill={poi.accentColor}
                          stroke="#09090b"
                          strokeWidth="1.2"
                        />
                        <text
                          y="-6.8"
                          textAnchor="middle"
                          fill="#f4f4f5"
                          fontSize="5.2"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {poi.category.toUpperCase()}
                        </text>
                      </g>
                    );
                  })}

                  {/* Connected Remote Multiplayer Players */}
                  {mpRemotePlayers.map((rp) => {
                    const rx = 90 + rp.x * minimapPaths.scale;
                    const rz = 90 + rp.z * minimapPaths.scale;
                    return (
                      <g
                        key={rp.playerId}
                        transform={`translate(${rx.toFixed(1)}, ${rz.toFixed(1)})`}
                      >
                        <circle
                          r="4.2"
                          fill={rp.paintColor || '#f59e0b'}
                          stroke="#fafafa"
                          strokeWidth="1.2"
                        />
                        <text
                          y="8.5"
                          textAnchor="middle"
                          fill="#fbbf24"
                          fontSize="5.4"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {rp.playerName}
                        </text>
                      </g>
                    );
                  })}

                  {/* Local Player Position */}
                  {(() => {
                    const lx = 90 + (latestCarRef.current?.x ?? mapDef.viewpoints[activeViewpointIdx]?.x ?? 0) * minimapPaths.scale;
                    const lz = 90 + (latestCarRef.current?.z ?? mapDef.viewpoints[activeViewpointIdx]?.z ?? -160) * minimapPaths.scale;
                    return (
                      <g transform={`translate(${lx.toFixed(1)}, ${lz.toFixed(1)})`}>
                        <circle r="5.2" fill="#f97316" stroke="#fafafa" strokeWidth="1.5" />
                        <text
                          y="-7.5"
                          textAnchor="middle"
                          fill="#fb923c"
                          fontSize="5.8"
                          fontWeight="800"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          YOU
                        </text>
                      </g>
                    );
                  })()}
                </svg>

                <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono-tabular text-zinc-400">
                  <span className="text-orange-400 font-bold">● YOU</span>
                  <span className="text-amber-400 font-bold">
                    ● ONLINE DRIVERS ({mpRemotePlayers.length})
                  </span>
                  <span>Click any location marker or card to Fast Travel</span>
                </div>
              </div>

              {/* Right 5 Cols: Open-World Facilities, POIs & Event Triggers */}
              <div className="lg:col-span-5 flex flex-col gap-2">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-zinc-300 font-bold">
                  OPEN-WORLD FACILITIES &amp; EVENT ZONES
                </div>
                {(mapDef.pois ?? []).map((poi: OpenWorldPOI) => (
                  <div
                    key={poi.id}
                    className="bg-zinc-950 border border-white/10 hover:border-white/25 rounded-xl p-3 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: poi.accentColor }}
                        />
                        <span className="text-xs font-display font-bold text-zinc-100">
                          {poi.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 leading-snug">
                        {poi.description}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(580);
                        onSelectViewpoint(poi.viewpointIdx ?? 0);
                        setShowWorldMapModal(false);
                        if (poi.category === 'garage') {
                          setCustomTab('paint');
                          onOpenGarage();
                        } else if (poi.category === 'dyno') {
                          setCustomTab('dyno');
                          onSelectGarageCamera('dyno');
                          onOpenGarage();
                        } else if (poi.category === 'dealership') {
                          onSelectGarageCamera('turntable');
                          onOpenGarage();
                        } else if (poi.category === 'race_event') {
                          onUpdateSettings?.({ handlingMode: 'race' });
                          if (gameState !== 'playing') onStartGame();
                        } else if (poi.category === 'drift_zone') {
                          onUpdateSettings?.({ handlingMode: 'drift' });
                          if (gameState !== 'playing') onStartGame();
                        } else if (gameState !== 'playing') {
                          onStartGame();
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono-tabular font-bold text-[10px] uppercase shrink-0 cursor-pointer"
                    >
                      {poi.category === 'garage'
                        ? 'Enter Garage'
                        : poi.category === 'dyno'
                          ? 'Open Dyno'
                          : poi.category === 'dealership'
                            ? 'Showroom'
                            : 'Fast Travel'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTIPLAYER LOBBY MODAL (Public Rooms, Private Password Rooms & Room Code Join) */}
      {showMultiplayerModal && (
        <div
          className="fixed inset-0 z-50 pointer-events-auto bg-zinc-950/88 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="multiplayer-modal-title"
        >
          <div className="w-full max-w-2xl bg-zinc-900 border border-white/15 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-orange-400">
                  OPEN-WORLD FREE ROAM · MULTIPLAYER RACING · TANDEM DRIFT SERVERS
                </div>
                <h2
                  id="multiplayer-modal-title"
                  className="text-xl font-display font-bold text-zinc-100 tracking-wide"
                >
                  ONLINE MULTIPLAYER LOBBY
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowMultiplayerModal(false)}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono-tabular text-zinc-200 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Driver Callsign & Active Connection Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-950 border border-white/10 rounded-xl p-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                  DRIVER CALLSIGN
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={mpPlayerName}
                  onChange={(e) => {
                    setMpPlayerName(e.target.value);
                    multiplayerClient.setPlayerName(e.target.value);
                  }}
                  className="bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular text-zinc-100"
                  placeholder="Enter Driver Name"
                />
              </div>

              <div className="flex flex-col justify-between">
                <div className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                  SESSION STATUS
                </div>
                {mpConnectedRoom ? (
                  <div className="flex items-center justify-between gap-2 bg-emerald-500/15 border border-emerald-400/50 rounded-lg px-2.5 py-1.5">
                    <div>
                      <div className="text-xs font-display font-bold text-emerald-300 truncate">
                        {mpConnectedRoom.name}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-zinc-300">
                        Code: <span className="text-amber-300 font-bold">{mpConnectedRoom.inviteCode}</span> ·{' '}
                        {mpConnectedRoom.playerCount}/{mpConnectedRoom.maxPlayers} Drivers
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(440);
                        multiplayerClient.leaveRoom();
                      }}
                      className="px-2 py-1 rounded bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-[10px] font-mono-tabular text-rose-200 cursor-pointer"
                    >
                      Leave
                    </button>
                  </div>
                ) : (
                  <div className="text-xs font-mono-tabular text-zinc-400 py-1.5">
                    Offline / Solo Session — Select or create a room below
                  </div>
                )}
              </div>
            </div>

            {mpError && (
              <div className="bg-rose-500/20 border border-rose-400/60 rounded-xl px-3 py-2 text-xs font-mono-tabular text-rose-200">
                {mpError}
              </div>
            )}

            {/* Multiplayer Tabs: Browse Public Rooms | Create Room | Join by Code */}
            <div className="grid grid-cols-3 gap-1.5 bg-zinc-950 p-1 rounded-xl border border-white/10">
              {(
                [
                  { id: 'browse', label: 'Public Rooms' },
                  { id: 'create', label: 'Create Room' },
                  { id: 'code', label: 'Join by Code' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(520);
                    setMpError(null);
                    setMpTab(t.id);
                  }}
                  className={`py-2 rounded-lg text-xs font-mono-tabular uppercase cursor-pointer ${
                    mpTab === t.id
                      ? 'bg-orange-500 text-zinc-950 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB 1: BROWSE PUBLIC ROOMS */}
            {mpTab === 'browse' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-zinc-400">
                  <span>AVAILABLE SERVERS ({mpRooms.length})</span>
                  <button
                    type="button"
                    onClick={() =>
                      multiplayerClient.fetchRooms().then((rooms) => setMpRooms(rooms))
                    }
                    className="text-orange-400 hover:underline cursor-pointer"
                  >
                    ↻ Refresh List
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {mpRooms.map((room) => {
                    const isCurrent = mpConnectedRoom?.id === room.id;
                    return (
                      <div
                        key={room.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                          isCurrent
                            ? 'bg-zinc-950 border-emerald-400/70'
                            : 'bg-zinc-950/90 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-display font-bold text-zinc-100">
                              {room.name}
                            </span>
                            {room.isPrivate && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono-tabular">
                                🔒 PRIVATE
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-orange-300 text-[10px] font-mono-tabular uppercase">
                              {room.mode.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-tabular text-zinc-400">
                            Map: <span className="text-zinc-200 uppercase">{room.mapId}</span> · Weather:{' '}
                            <span className="text-zinc-200">{room.weather}</span> · Code:{' '}
                            <span className="text-amber-300">{room.inviteCode}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-xs font-mono-tabular text-zinc-300">
                            {room.playerCount}/{room.maxPlayers}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              soundEngine.playUiChime(580);
                              setMpError(null);
                              const res = await multiplayerClient.joinRoom({
                                roomId: room.id,
                                vehicleId: selectedVehicle.id,
                                paintColor: customization.paintColor,
                                paintFinish: customization.paintFinish,
                                bodyKit: customization.bodyKit,
                                spoilerStyle: customization.spoilerStyle,
                                rimStyle: customization.rimStyle,
                                rimColor: customization.rimColor,
                              });
                              if (!res.ok) {
                                setMpError(res.error || 'Could not join room');
                              } else {
                                onSelectMap(room.mapId);
                                setShowMultiplayerModal(false);
                                if (gameState !== 'playing') {
                                  onStartGame();
                                }
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase cursor-pointer ${
                              isCurrent
                                ? 'bg-emerald-500 text-zinc-950'
                                : 'bg-orange-500 hover:bg-orange-400 text-zinc-950'
                            }`}
                          >
                            {isCurrent ? 'Drive Now' : 'Join Room'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: CREATE PUBLIC OR PRIVATE ROOM */}
            {mpTab === 'create' && (
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      ROOM NAME
                    </label>
                    <input
                      type="text"
                      maxLength={36}
                      value={mpNewRoomName}
                      onChange={(e) => setMpNewRoomName(e.target.value)}
                      className="bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular text-zinc-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      ROOM VISIBILITY
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMpNewRoomPrivate(false)}
                        className={`py-1.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                          !mpNewRoomPrivate
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold'
                            : 'bg-zinc-900 border-white/10 text-zinc-400'
                        }`}
                      >
                        🌐 Public Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setMpNewRoomPrivate(true)}
                        className={`py-1.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                          mpNewRoomPrivate
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                            : 'bg-zinc-900 border-white/10 text-zinc-400'
                        }`}
                      >
                        🔒 Private Room
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3 MULTIPLAYER MODE CATEGORIES: Free Roam | Racing | Tandem Drift */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                    MULTIPLAYER GAME MODE (OPEN-WORLD FREE ROAM · RACING · TANDEM DRIFT)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'free_drift', label: '🌐 Open-World Free Roam' },
                        { id: 'tandem', label: '🔥 Tandem Drift' },
                        { id: 'drift_battle', label: '🏆 Drift Score Battle' },
                        { id: 'touge_battle', label: '⛰️ Touge Mountain Race' },
                        { id: 'sprint_race', label: '🏁 Sprint Race' },
                        { id: 'circuit_race', label: '🔄 Circuit Laps Race' },
                      ] as { id: MultiplayerMode; label: string }[]
                    ).map((mOpt) => (
                      <button
                        key={mOpt.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(540);
                          setMpNewRoomMode(mOpt.id);
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-mono-tabular border text-left cursor-pointer ${
                          mpNewRoomMode === mOpt.id
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                            : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                        }`}
                      >
                        {mOpt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      ROOM PASSWORD (OPTIONAL)
                    </label>
                    <input
                      type="password"
                      maxLength={24}
                      value={mpNewRoomPassword}
                      onChange={(e) => setMpNewRoomPassword(e.target.value)}
                      placeholder="No password"
                      className="bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular text-zinc-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      MAX PLAYERS ({mpNewRoomMaxPlayers})
                    </label>
                    <input
                      type="range"
                      min={2}
                      max={16}
                      step={2}
                      value={mpNewRoomMaxPlayers}
                      onChange={(e) => setMpNewRoomMaxPlayers(parseInt(e.target.value, 10))}
                      className="w-full accent-orange-500 cursor-pointer mt-2"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      RACE LAPS ({mpNewRoomLaps})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={mpNewRoomLaps}
                      onChange={(e) => setMpNewRoomLaps(parseInt(e.target.value, 10))}
                      className="w-full accent-amber-400 cursor-pointer mt-2"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      PLAYER COLLISIONS
                    </label>
                    <button
                      type="button"
                      onClick={() => setMpNewRoomCollisions((prev) => !prev)}
                      className={`py-1.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                        mpNewRoomCollisions
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-zinc-900 border-white/10 text-zinc-300'
                      }`}
                    >
                      {mpNewRoomCollisions ? 'Collisions ON' : 'Ghost Tandem (Safe)'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    soundEngine.playUiChime(620);
                    setMpError(null);
                    const res = await multiplayerClient.createAndJoinRoom({
                      name: mpNewRoomName || 'Touge Drift Room',
                      isPrivate: mpNewRoomPrivate,
                      password: mpNewRoomPassword,
                      maxPlayers: mpNewRoomMaxPlayers,
                      mapId,
                      mode: mpNewRoomMode,
                      totalLaps: mpNewRoomLaps,
                      weather: gameSettings.weather ?? 'clear',
                      timeOfDay,
                      collisionsEnabled: mpNewRoomCollisions,
                      vehicleId: selectedVehicle.id,
                      paintColor: customization.paintColor,
                      paintFinish: customization.paintFinish,
                      bodyKit: customization.bodyKit,
                      spoilerStyle: customization.spoilerStyle,
                      rimStyle: customization.rimStyle,
                      rimColor: customization.rimColor,
                    });
                    if (!res.ok) {
                      setMpError(res.error || 'Failed to create room');
                    } else {
                      setShowMultiplayerModal(false);
                      if (gameState !== 'playing') {
                        onStartGame();
                      }
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                >
                  Create Room &amp; Launch Session →
                </button>
              </div>
            )}

            {/* TAB 3: JOIN BY INVITE CODE */}
            {mpTab === 'code' && (
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      6-CHAR INVITE CODE
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={mpInviteCodeInput}
                      onChange={(e) => setMpInviteCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. TOUGE1"
                      className="bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-sm font-mono-tabular uppercase text-amber-300"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono-tabular uppercase text-zinc-400">
                      PASSWORD (IF PRIVATE)
                    </label>
                    <input
                      type="password"
                      maxLength={24}
                      value={mpJoinPasswordInput}
                      onChange={(e) => setMpJoinPasswordInput(e.target.value)}
                      placeholder="Optional"
                      className="bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-sm font-mono-tabular text-zinc-100"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    soundEngine.playUiChime(600);
                    setMpError(null);
                    const res = await multiplayerClient.joinRoom({
                      inviteCode: mpInviteCodeInput.trim(),
                      password: mpJoinPasswordInput,
                      vehicleId: selectedVehicle.id,
                      paintColor: customization.paintColor,
                      paintFinish: customization.paintFinish,
                      bodyKit: customization.bodyKit,
                      spoilerStyle: customization.spoilerStyle,
                      rimStyle: customization.rimStyle,
                      rimColor: customization.rimColor,
                    });
                    if (!res.ok) {
                      setMpError(res.error || 'Invalid invite code or password');
                    } else {
                      setShowMultiplayerModal(false);
                      if (gameState !== 'playing') {
                        onStartGame();
                      }
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                >
                  Join Room by Invite Code →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRIVER PROFILE & RECORDS MODAL */}
      {showProfileModal && (
        <div
          className="fixed inset-0 z-50 pointer-events-auto bg-zinc-950/88 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <div className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-400">
                  CAREER TELEMETRY &amp; PERSONAL RECORDS
                </div>
                <h2
                  id="profile-modal-title"
                  className="text-xl font-display font-bold text-zinc-100"
                >
                  DRIVER PROFILE
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono-tabular text-zinc-200 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="bg-zinc-950 border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono-tabular text-zinc-400 uppercase">
                  CALLSIGN · SIGNATURE MACHINE
                </div>
                <div className="text-base font-display font-bold text-zinc-100 mt-0.5">
                  {mpPlayerName}
                </div>
                <div className="text-xs font-mono-tabular text-orange-400">
                  {selectedVehicle.year} {selectedVehicle.manufacturer} {selectedVehicle.name}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-xs font-mono-tabular font-bold text-amber-300">
                PRO TOUGE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                <div className="text-[10px] font-mono-tabular text-zinc-400">BEST DRIFT SCORE</div>
                <div className="text-lg font-mono-tabular font-bold text-amber-400 mt-0.5">
                  {driverProfile.bestDriftScore.toLocaleString()} PTS
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                <div className="text-[10px] font-mono-tabular text-zinc-400">BEST SINGLE CHAIN</div>
                <div className="text-lg font-mono-tabular font-bold text-orange-400 mt-0.5">
                  {driverProfile.bestDriftChain.toLocaleString()} PTS
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                <div className="text-[10px] font-mono-tabular text-zinc-400">TOTAL DISTANCE</div>
                <div className="text-lg font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {driverProfile.totalDistanceKm} km
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                <div className="text-[10px] font-mono-tabular text-zinc-400">TOP SPEED RECORD</div>
                <div className="text-lg font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {driverProfile.maxSpeedKmh} km/h
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowProfileModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      {/* COMPLETE 9-CATEGORY GAME SETTINGS MENU (Graphics, Display, Audio, Controls, Gameplay, Camera, Accessibility, Network, Weather) */}
      {showSettingsModal && (() => {
        const keyFields = [
          { field: 'accelerateKey' as const, label: 'Accelerate (Gas)' },
          { field: 'brakeKey' as const, label: 'Brake / Reverse' },
          { field: 'leftKey' as const, label: 'Steer Left' },
          { field: 'rightKey' as const, label: 'Steer Right' },
          { field: 'handbrakeKey' as const, label: 'Handbrake Drift' },
          { field: 'nitroKey' as const, label: 'N2O Boost' },
          { field: 'upshiftKey' as const, label: 'Manual Upshift' },
          { field: 'downshiftKey' as const, label: 'Manual Downshift' },
        ];
        const codeCounts: Record<string, string[]> = {};
        for (const kf of keyFields) {
          const code = gameSettings[kf.field] || DEFAULT_GAME_SETTINGS[kf.field];
          if (!codeCounts[code]) codeCounts[code] = [];
          codeCounts[code].push(kf.label);
        }
        const duplicateWarnings = Object.entries(codeCounts).filter(([, labels]) => labels.length > 1);

        const handleResetCategory = () => {
          soundEngine.playUiChime(460);
          if (settingsCategory === 'graphics') {
            onSelectGraphicsPreset('ultra');
            onUpdateSettings?.({
              graphicsPreset: 'ultra',
              renderScale: DEFAULT_GAME_SETTINGS.renderScale,
              shadowQuality: DEFAULT_GAME_SETTINGS.shadowQuality,
              reflectionQuality: DEFAULT_GAME_SETTINGS.reflectionQuality,
              antiAliasing: DEFAULT_GAME_SETTINGS.antiAliasing,
              ambientOcclusion: DEFAULT_GAME_SETTINGS.ambientOcclusion,
              effectsQuality: DEFAULT_GAME_SETTINGS.effectsQuality,
              viewDistance: DEFAULT_GAME_SETTINGS.viewDistance,
              motionBlur: DEFAULT_GAME_SETTINGS.motionBlur,
              bloomIntensity: DEFAULT_GAME_SETTINGS.bloomIntensity,
              vsync: DEFAULT_GAME_SETTINGS.vsync,
              frameRateLimit: DEFAULT_GAME_SETTINGS.frameRateLimit,
            });
          } else if (settingsCategory === 'display') {
            onUpdateSettings?.({
              fullscreen: DEFAULT_GAME_SETTINGS.fullscreen,
              aspectRatio: DEFAULT_GAME_SETTINGS.aspectRatio,
              brightness: DEFAULT_GAME_SETTINGS.brightness,
              gamma: DEFAULT_GAME_SETTINGS.gamma,
              camera: {
                ...gameSettings.camera,
                fov: DEFAULT_CAMERA_SETTINGS.fov,
                shakeIntensity: DEFAULT_CAMERA_SETTINGS.shakeIntensity,
                rotationSensitivity: DEFAULT_CAMERA_SETTINGS.rotationSensitivity,
              },
            });
          } else if (settingsCategory === 'audio') {
            onUpdateSettings?.({
              masterVolume: DEFAULT_GAME_SETTINGS.masterVolume,
              engineVolume: DEFAULT_GAME_SETTINGS.engineVolume,
              exhaustVolume: DEFAULT_GAME_SETTINGS.exhaustVolume,
              turboVolume: DEFAULT_GAME_SETTINGS.turboVolume,
              tireVolume: DEFAULT_GAME_SETTINGS.tireVolume,
              environmentVolume: DEFAULT_GAME_SETTINGS.environmentVolume,
              musicVolume: DEFAULT_GAME_SETTINGS.musicVolume,
              uiVolume: DEFAULT_GAME_SETTINGS.uiVolume,
              collisionVolume: DEFAULT_GAME_SETTINGS.collisionVolume,
              sfxVolume: DEFAULT_GAME_SETTINGS.sfxVolume,
              audioDynamicRange: DEFAULT_GAME_SETTINGS.audioDynamicRange,
              engineAudioIntensity: DEFAULT_GAME_SETTINGS.engineAudioIntensity,
              exhaustAudioIntensity: DEFAULT_GAME_SETTINGS.exhaustAudioIntensity,
            });
          } else if (settingsCategory === 'controls') {
            setRebindingField(null);
            onUpdateSettings?.({
              controlScheme: DEFAULT_GAME_SETTINGS.controlScheme,
              steeringSensitivity: DEFAULT_GAME_SETTINGS.steeringSensitivity,
              steeringLinearity: DEFAULT_GAME_SETTINGS.steeringLinearity,
              steeringDeadzone: DEFAULT_GAME_SETTINGS.steeringDeadzone,
              throttleSensitivity: DEFAULT_GAME_SETTINGS.throttleSensitivity,
              brakeSensitivity: DEFAULT_GAME_SETTINGS.brakeSensitivity,
              handbrakeSensitivity: DEFAULT_GAME_SETTINGS.handbrakeSensitivity,
              mouseSteeringEnabled: DEFAULT_GAME_SETTINGS.mouseSteeringEnabled,
              controllerVibration: DEFAULT_GAME_SETTINGS.controllerVibration,
              accelerateKey: DEFAULT_GAME_SETTINGS.accelerateKey,
              brakeKey: DEFAULT_GAME_SETTINGS.brakeKey,
              leftKey: DEFAULT_GAME_SETTINGS.leftKey,
              rightKey: DEFAULT_GAME_SETTINGS.rightKey,
              handbrakeKey: DEFAULT_GAME_SETTINGS.handbrakeKey,
              nitroKey: DEFAULT_GAME_SETTINGS.nitroKey,
              upshiftKey: DEFAULT_GAME_SETTINGS.upshiftKey,
              downshiftKey: DEFAULT_GAME_SETTINGS.downshiftKey,
              mobileLeftHanded: DEFAULT_GAME_SETTINGS.mobileLeftHanded,
              mobileButtonScale: DEFAULT_GAME_SETTINGS.mobileButtonScale,
              mobileButtonOpacity: DEFAULT_GAME_SETTINGS.mobileButtonOpacity,
              mobileLayouts: createDefaultMobileLayouts(),
              activeMobileLayoutId: 'default_right',
            });
          } else if (settingsCategory === 'gameplay') {
            onUpdateSettings?.({
              handlingMode: DEFAULT_GAME_SETTINGS.handlingMode,
              transmissionMode: DEFAULT_GAME_SETTINGS.transmissionMode,
              driftAssist: DEFAULT_GAME_SETTINGS.driftAssist,
              steeringAssist: DEFAULT_GAME_SETTINGS.steeringAssist,
              tractionControl: DEFAULT_GAME_SETTINGS.tractionControl,
              absEnabled: DEFAULT_GAME_SETTINGS.absEnabled,
              stabilityControl: DEFAULT_GAME_SETTINGS.stabilityControl,
              speedUnit: DEFAULT_GAME_SETTINGS.speedUnit,
              hudVisibility: DEFAULT_GAME_SETTINGS.hudVisibility,
              showDriftNotifications: DEFAULT_GAME_SETTINGS.showDriftNotifications,
              showTelemetryOverlay: DEFAULT_GAME_SETTINGS.showTelemetryOverlay,
            });
          } else if (settingsCategory === 'camera') {
            onResetCameraSettings?.();
          } else if (settingsCategory === 'accessibility') {
            onUpdateSettings?.({
              uiScale: DEFAULT_GAME_SETTINGS.uiScale,
              hudOpacity: DEFAULT_GAME_SETTINGS.hudOpacity,
              mobileButtonOpacity: DEFAULT_GAME_SETTINGS.mobileButtonOpacity,
              largeTextMode: DEFAULT_GAME_SETTINGS.largeTextMode,
              highContrastHud: DEFAULT_GAME_SETTINGS.highContrastHud,
              reducedMotion: DEFAULT_GAME_SETTINGS.reducedMotion,
              subtitlesEnabled: DEFAULT_GAME_SETTINGS.subtitlesEnabled,
              simplifiedHud: DEFAULT_GAME_SETTINGS.simplifiedHud,
            });
          } else if (settingsCategory === 'network') {
            onUpdateSettings?.({
              networkRegion: DEFAULT_GAME_SETTINGS.networkRegion,
              showNetworkPing: DEFAULT_GAME_SETTINGS.showNetworkPing,
              defaultPrivateRoom: DEFAULT_GAME_SETTINGS.defaultPrivateRoom,
            });
          } else if (settingsCategory === 'weather') {
            onSelectTimeOfDay?.('afternoon');
            onUpdateSettings?.({
              weather: 'clear',
              dynamicTimeCycle: false,
            });
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 pointer-events-auto bg-neutral-950/90 flex items-center justify-center p-3 md:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
            <div className="w-full max-w-4xl bg-[#0a0a0c] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
              {/* Top Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-neutral-950">
                <div>
                  <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-orange-400 font-bold">
                    PRO AUTOMOTIVE SYSTEM CONFIGURATION · 9 CATEGORIES
                  </div>
                  <h2
                    id="settings-modal-title"
                    className="text-lg md:text-xl font-display font-bold text-neutral-100 tracking-wide"
                  >
                    GAME SETTINGS
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(560);
                      setShowSettingsModal(false);
                      setShowMobileLayoutEditor(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-xs font-mono-tabular font-bold text-orange-300 cursor-pointer"
                  >
                    📱 Mobile HUD Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmResetAll(false);
                      setShowSettingsModal(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/12 text-xs font-mono-tabular text-neutral-200 cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Body: Left Category Sidebar + Right Active Category Inspector */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Category Navigation Tabs */}
                <div
                  className="md:w-52 bg-neutral-950/90 border-b md:border-b-0 md:border-r border-white/10 p-2.5 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0"
                  role="tablist"
                  aria-label="Settings Categories"
                >
                  {(
                    [
                      { id: 'graphics', label: '1. Graphics' },
                      { id: 'display', label: '2. Display' },
                      { id: 'audio', label: '3. Audio (9-Ch)' },
                      { id: 'controls', label: '4. Controls & Keys' },
                      { id: 'gameplay', label: '5. Gameplay' },
                      { id: 'camera', label: '6. Camera' },
                      { id: 'accessibility', label: '7. Accessibility' },
                      { id: 'network', label: '8. Network' },
                      { id: 'weather', label: '9. Day & Weather' },
                    ] as const
                  ).map((cat) => {
                    const active = settingsCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          soundEngine.playUiChime(520);
                          setSettingsCategory(cat.id);
                          setConfirmResetAll(false);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-mono-tabular text-left transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-orange-500 text-neutral-950 font-extrabold'
                            : 'bg-neutral-900/60 hover:bg-neutral-900 text-neutral-300 border border-white/5'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Right Content Pane */}
                <div className="flex-1 p-4 md:p-5 overflow-y-auto flex flex-col gap-4 bg-[#0d0d10]">
                  {/* CATEGORY 1: GRAPHICS SETTINGS */}
                  {settingsCategory === 'graphics' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div>
                          <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                            Graphics &amp; Rendering Quality
                          </div>
                          <div className="text-xs text-neutral-400">
                            Configure global preset, resolution scale, shadows, reflections, and post-processing.
                          </div>
                        </div>
                      </div>

                      {/* Overall Graphics Preset */}
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono-tabular text-neutral-300">
                            Graphics Quality Preset
                          </span>
                          <span className="text-xs font-mono-tabular text-orange-400 uppercase font-bold">
                            {gameSettings.graphicsPreset ?? graphicsPreset}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {(['low', 'medium', 'high', 'ultra', 'custom'] as const).map((preset) => {
                            const isSel = (gameSettings.graphicsPreset ?? graphicsPreset) === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  soundEngine.playUiChime(540);
                                  if (preset !== 'custom') {
                                    onSelectGraphicsPreset(preset);
                                  }
                                  const scaleMap = { low: 0.75, medium: 0.9, high: 1.0, ultra: 1.15, custom: gameSettings.renderScale ?? 1.0 };
                                  onUpdateSettings?.({
                                    graphicsPreset: preset,
                                    renderScale: scaleMap[preset],
                                    shadowQuality: preset === 'low' ? 'off' : preset === 'custom' ? gameSettings.shadowQuality : preset,
                                    reflectionQuality: preset === 'custom' ? gameSettings.reflectionQuality : preset,
                                    effectsQuality: preset === 'custom' ? gameSettings.effectsQuality : preset,
                                  });
                                }}
                                className={`py-1.5 rounded-lg text-xs font-mono-tabular uppercase border cursor-pointer ${
                                  isSel
                                    ? 'bg-orange-500 text-neutral-950 font-bold border-orange-400'
                                    : 'bg-neutral-900 border-white/10 text-neutral-300 hover:text-white'
                                }`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Resolution Scale & View Distance */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                          <div className="flex justify-between text-xs font-mono-tabular">
                            <span className="text-neutral-300">Resolution Scale</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round((gameSettings.renderScale ?? 1.0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label="Resolution Scale"
                            min={0.5}
                            max={1.5}
                            step={0.05}
                            value={gameSettings.renderScale ?? 1.0}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                renderScale: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                          <div className="flex justify-between text-xs font-mono-tabular">
                            <span className="text-neutral-300">View Draw Distance</span>
                            <span className="text-orange-400 font-bold">
                              {gameSettings.viewDistance ?? 650}m
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label="View Draw Distance"
                            min={350}
                            max={850}
                            step={50}
                            value={gameSettings.viewDistance ?? 650}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                viewDistance: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Granular Quality Selectors */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Shadow Quality</span>
                          <select
                            aria-label="Shadow Quality"
                            value={gameSettings.shadowQuality ?? 'high'}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                shadowQuality: e.target.value as GameSettings['shadowQuality'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="off">Off</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="ultra">Ultra</option>
                          </select>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Reflection Quality</span>
                          <select
                            aria-label="Reflection Quality"
                            value={gameSettings.reflectionQuality ?? 'ultra'}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                reflectionQuality: e.target.value as GameSettings['reflectionQuality'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="ultra">Ultra</option>
                          </select>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Anti-Aliasing</span>
                          <select
                            aria-label="Anti-Aliasing"
                            value={
                              typeof gameSettings.antiAliasing === 'boolean'
                                ? gameSettings.antiAliasing
                                  ? 'smaa'
                                  : 'off'
                                : gameSettings.antiAliasing ?? 'smaa'
                            }
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                antiAliasing: e.target.value as GameSettings['antiAliasing'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="off">Off</option>
                            <option value="fxaa">FXAA</option>
                            <option value="smaa">SMAA</option>
                          </select>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Particle &amp; Smoke Effects</span>
                          <select
                            aria-label="Effects Quality"
                            value={gameSettings.effectsQuality ?? 'ultra'}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                graphicsPreset: 'custom',
                                effectsQuality: e.target.value as GameSettings['effectsQuality'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="ultra">Ultra</option>
                          </select>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Ambient Occlusion (SSAO)</span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                ambientOcclusion: !gameSettings.ambientOcclusion,
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.ambientOcclusion
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {gameSettings.ambientOcclusion ? 'ENABLED' : 'OFF'}
                          </button>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Frame-Rate Limit</span>
                          <select
                            aria-label="Frame-Rate Limit"
                            value={String(gameSettings.frameRateLimit ?? 60)}
                            onChange={(e) => {
                              const v = e.target.value;
                              onUpdateSettings?.({
                                frameRateLimit:
                                  v === 'unlimited'
                                    ? 'unlimited'
                                    : (parseInt(v, 10) as 30 | 60 | 120),
                              });
                            }}
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="30">30 FPS</option>
                            <option value="60">60 FPS</option>
                            <option value="120">120 FPS</option>
                            <option value="unlimited">Unlimited</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 2: DISPLAY SETTINGS */}
                  {settingsCategory === 'display' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="border-b border-white/10 pb-2">
                        <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                          Display, Exposure &amp; Viewport Settings
                        </div>
                        <div className="text-xs text-neutral-400">
                          Adjust fullscreen mode, aspect ratio, brightness, gamma, and base FOV.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Display Mode</span>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(520);
                              handleToggleFullscreen();
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-bold uppercase cursor-pointer ${
                              fsActive
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-200'
                            }`}
                          >
                            {fsActive ? 'FULLSCREEN' : 'WINDOWED'}
                          </button>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Aspect Ratio</span>
                          <select
                            aria-label="Aspect Ratio"
                            value={gameSettings.aspectRatio ?? 'auto'}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                aspectRatio: e.target.value as GameSettings['aspectRatio'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="auto">Auto Detect</option>
                            <option value="16:9">16:9 Widescreen</option>
                            <option value="16:10">16:10</option>
                            <option value="21:9">21:9 Ultrawide</option>
                          </select>
                        </div>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-3">
                        {[
                          {
                            label: 'Display Brightness / Exposure',
                            val: gameSettings.brightness ?? 1.0,
                            min: 0.7,
                            max: 1.35,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            onChange: (v: number) => onUpdateSettings?.({ brightness: v }),
                          },
                          {
                            label: 'Display Gamma Calibration',
                            val: gameSettings.gamma ?? 1.0,
                            min: 0.8,
                            max: 1.25,
                            step: 0.05,
                            fmt: (v: number) => v.toFixed(2),
                            onChange: (v: number) => onUpdateSettings?.({ gamma: v }),
                          },
                          {
                            label: 'Base Field of View (FOV)',
                            val: gameSettings.camera.fov,
                            min: 50,
                            max: 78,
                            step: 1,
                            fmt: (v: number) => `${Math.round(v)}°`,
                            onChange: (v: number) =>
                              onUpdateSettings?.({ camera: { ...gameSettings.camera, fov: v } }),
                          },
                          {
                            label: 'Camera Shake Intensity',
                            val: gameSettings.camera.shakeIntensity,
                            min: 0,
                            max: 1.2,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            onChange: (v: number) =>
                              onUpdateSettings?.({
                                camera: { ...gameSettings.camera, shakeIntensity: v },
                              }),
                          },
                        ].map((sl) => (
                          <div key={sl.label} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs font-mono-tabular">
                              <span className="text-neutral-300">{sl.label}</span>
                              <span className="text-orange-400 font-bold">{sl.fmt(sl.val)}</span>
                            </div>
                            <input
                              type="range"
                              min={sl.min}
                              max={sl.max}
                              step={sl.step}
                              value={sl.val}
                              onChange={(e) => sl.onChange(parseFloat(e.target.value))}
                              className="w-full accent-orange-500 cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 3: AUDIO SETTINGS (9 CHANNELS + LIVE TEST BENCH) */}
                  {settingsCategory === 'audio' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <div>
                          <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                            9-Channel Automotive Audio Mixer &amp; Acoustic Test Bench
                          </div>
                          <div className="text-xs text-neutral-400">
                            Independently balance engine, exhaust, turbo flutter/BOV, tire screech, and collisions.
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-neutral-950 border border-white/10 rounded-lg p-1">
                          {(['standard', 'wide', 'night'] as const).map((dr) => (
                            <button
                              key={dr}
                              type="button"
                              onClick={() => onUpdateSettings?.({ audioDynamicRange: dr })}
                              className={`px-2 py-1 rounded text-[10px] font-mono-tabular uppercase cursor-pointer ${
                                (gameSettings.audioDynamicRange ?? 'standard') === dr
                                  ? 'bg-orange-500 text-neutral-950 font-bold'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              {dr} Range
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live Acoustic Test Bench */}
                      <div className="bg-neutral-950 border border-orange-500/35 rounded-xl p-3 flex flex-col gap-2">
                        <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-orange-400 font-bold">
                          LIVE AUTOMOTIVE SOUND TEST BENCH ({selectedVehicle.name} ·{' '}
                          {selectedVehicle.engineAudioProfile ?? selectedVehicle.soundType})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.init();
                              soundEngine.playEngineRev(
                                selectedVehicle.soundType,
                                selectedVehicle.engineAudioProfile,
                                customization
                              );
                            }}
                            className="py-1.5 px-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[11px] font-mono-tabular text-neutral-100 cursor-pointer"
                          >
                            🔥 Rev Engine
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.init();
                              soundEngine.playBlowOffValve(
                                selectedVehicle.soundType,
                                selectedVehicle.engineAudioProfile,
                                customization,
                                0.85,
                                1.1
                              );
                            }}
                            className="py-1.5 px-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[11px] font-mono-tabular text-neutral-100 cursor-pointer"
                          >
                            💨 Turbo STUTUTU
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.init();
                              soundEngine.playBackfirePop(0.95, customization, 0);
                            }}
                            className="py-1.5 px-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[11px] font-mono-tabular text-neutral-100 cursor-pointer"
                          >
                            💥 Backfire Bang
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.init();
                              soundEngine.playTireSquealTest();
                            }}
                            className="py-1.5 px-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[11px] font-mono-tabular text-neutral-100 cursor-pointer"
                          >
                            🛞 Tire Squeal
                          </button>
                        </div>
                      </div>

                      {/* 9 Independent Volume Sliders */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 bg-neutral-950 border border-white/10 rounded-xl p-3.5">
                        {(
                          [
                            { key: 'masterVolume', label: '1. Master Volume' },
                            { key: 'engineVolume', label: '2. Engine Mechanical Volume' },
                            { key: 'exhaustVolume', label: '3. Exhaust Resonance & Pops' },
                            { key: 'turboVolume', label: '4. Turbo Spool & STUTUTU BOV' },
                            { key: 'tireVolume', label: '5. Tire Screech & Scrub' },
                            { key: 'collisionVolume', label: '6. Collision & Chassis Impact' },
                            { key: 'environmentVolume', label: '7. Wind & Environment' },
                            { key: 'musicVolume', label: '8. Background Music' },
                            { key: 'uiVolume', label: '9. Interface & Shift Beeps' },
                          ] as const
                        ).map((ch) => {
                          const val = Number(gameSettings[ch.key] ?? DEFAULT_GAME_SETTINGS[ch.key] ?? 0.85);
                          return (
                            <div key={ch.key} className="flex flex-col gap-0.5">
                              <div className="flex justify-between text-xs font-mono-tabular">
                                <span className="text-neutral-300">{ch.label}</span>
                                <span className="text-orange-400 font-bold">
                                  {Math.round(val * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                aria-label={ch.label}
                                min={0}
                                max={1}
                                step={0.05}
                                value={val}
                                onChange={(e) =>
                                  onUpdateSettings?.({ [ch.key]: parseFloat(e.target.value) })
                                }
                                className="w-full accent-orange-500 cursor-pointer"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 4: CONTROLS (PC & MOBILE + LAYOUT EDITOR TRIGGER) */}
                  {settingsCategory === 'controls' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <div>
                          <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                            PC Keyboard, Gamepad &amp; Mobile Touch Controls
                          </div>
                          <div className="text-xs text-neutral-400">
                            Customize steering linearity, deadzones, key bindings, or open the interactive Mobile HUD Editor.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(580);
                            setShowSettingsModal(false);
                            setShowMobileLayoutEditor(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-neutral-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                        >
                          📱 Open Mobile Controller Layout Editor
                        </button>
                      </div>

                      {/* Control Scheme Selector */}
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono-tabular text-neutral-300">
                            Active Input Scheme
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                mobileLeftHanded: !gameSettings.mobileLeftHanded,
                                activeMobileLayoutId: !gameSettings.mobileLeftHanded
                                  ? 'default_left'
                                  : 'default_right',
                              })
                            }
                            className={`px-2.5 py-1 rounded text-[10px] font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.mobileLeftHanded
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            {gameSettings.mobileLeftHanded ? 'Left-Handed Flip: ON' : 'Right-Handed Standard'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                          {(
                            [
                              { id: 'auto', label: 'Auto Detect' },
                              { id: 'pc', label: 'PC Keyboard' },
                              { id: 'mobile_buttons', label: 'Touch Buttons' },
                              { id: 'mobile_wheel', label: 'Touch Wheel' },
                              { id: 'mobile_tilt', label: 'Tilt Gyro' },
                            ] as { id: ControlSchemeMode; label: string }[]
                          ).map((cm) => (
                            <button
                              key={cm.id}
                              type="button"
                              onClick={() => {
                                soundEngine.playUiChime(530);
                                onUpdateSettings?.({ controlScheme: cm.id });
                              }}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-mono-tabular border cursor-pointer ${
                                (gameSettings.controlScheme ?? 'auto') === cm.id
                                  ? 'bg-orange-500 text-neutral-950 font-bold border-orange-400'
                                  : 'bg-neutral-900 border-white/10 text-neutral-300'
                              }`}
                            >
                              {cm.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Steering Presets (Casual / Balanced / Simulation) */}
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono-tabular text-neutral-300">
                            Steering Feel &amp; Countersteer Preset
                          </span>
                          <span className="text-[10px] font-mono-tabular text-orange-400 uppercase font-bold">
                            {gameSettings.steeringPreset ?? 'balanced'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              {
                                id: 'casual',
                                label: 'Casual Drift',
                                desc: 'High countersteer assist & quick return',
                                patch: {
                                  steeringPreset: 'casual' as const,
                                  steeringSensitivity: 1.15,
                                  steeringLinearity: 0.9,
                                  steeringReturnSpeed: 1.35,
                                  maxSteeringAngleDeg: 54,
                                  driftAssist: 0.45,
                                  steeringAssist: 0.55,
                                },
                              },
                              {
                                id: 'balanced',
                                label: 'Balanced CarX',
                                desc: 'Progressive steering & natural self-align',
                                patch: {
                                  steeringPreset: 'balanced' as const,
                                  steeringSensitivity: 1.0,
                                  steeringLinearity: 1.0,
                                  steeringReturnSpeed: 1.05,
                                  maxSteeringAngleDeg: 52,
                                  driftAssist: 0.25,
                                  steeringAssist: 0.35,
                                },
                              },
                              {
                                id: 'simulation',
                                label: 'Simulation',
                                desc: 'Direct 1:1 rack & full 58° angle lock',
                                patch: {
                                  steeringPreset: 'simulation' as const,
                                  steeringSensitivity: 1.05,
                                  steeringLinearity: 1.15,
                                  steeringReturnSpeed: 0.95,
                                  maxSteeringAngleDeg: 58,
                                  driftAssist: 0.05,
                                  steeringAssist: 0.1,
                                },
                              },
                            ] as const
                          ).map((sp) => {
                            const active = (gameSettings.steeringPreset ?? 'balanced') === sp.id;
                            return (
                              <button
                                key={sp.id}
                                type="button"
                                onClick={() => {
                                  soundEngine.playUiChime(540);
                                  onUpdateSettings?.(sp.patch);
                                }}
                                className={`p-2 rounded-lg border text-left cursor-pointer ${
                                  active
                                    ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                    : 'bg-neutral-900 border-white/10 text-neutral-300 hover:border-white/25'
                                }`}
                              >
                                <div className="text-[11px] font-mono-tabular font-bold uppercase">
                                  {sp.label}
                                </div>
                                <div className="text-[9px] text-neutral-400 truncate mt-0.5">
                                  {sp.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sensitivities, Linearity, Return Speed, Max Angle, Deadzone & Mouse Steering */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 border border-white/10 rounded-xl p-3.5">
                        {[
                          {
                            label: 'Steering Sensitivity',
                            val: gameSettings.steeringSensitivity ?? 1.0,
                            min: 0.5,
                            max: 1.6,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'steeringSensitivity' as const,
                          },
                          {
                            label: 'Steering Return Speed',
                            val: gameSettings.steeringReturnSpeed ?? 1.0,
                            min: 0.5,
                            max: 2.0,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'steeringReturnSpeed' as const,
                          },
                          {
                            label: 'Maximum Steering Angle',
                            val: gameSettings.maxSteeringAngleDeg ?? 52,
                            min: 35,
                            max: 60,
                            step: 1,
                            fmt: (v: number) => `${Math.round(v)}°`,
                            key: 'maxSteeringAngleDeg' as const,
                          },
                          {
                            label: 'Steering Linearity',
                            val: gameSettings.steeringLinearity ?? 1.0,
                            min: 0.5,
                            max: 2.0,
                            step: 0.05,
                            fmt: (v: number) => v.toFixed(2),
                            key: 'steeringLinearity' as const,
                          },
                          {
                            label: 'Steering Deadzone',
                            val: gameSettings.steeringDeadzone ?? 0.02,
                            min: 0,
                            max: 0.25,
                            step: 0.01,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'steeringDeadzone' as const,
                          },
                          {
                            label: 'Throttle Sensitivity',
                            val: gameSettings.throttleSensitivity ?? 1.0,
                            min: 0.5,
                            max: 1.6,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'throttleSensitivity' as const,
                          },
                          {
                            label: 'Brake Sensitivity',
                            val: gameSettings.brakeSensitivity ?? 1.0,
                            min: 0.5,
                            max: 1.6,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'brakeSensitivity' as const,
                          },
                          {
                            label: 'Handbrake Sensitivity',
                            val: gameSettings.handbrakeSensitivity ?? 1.0,
                            min: 0.5,
                            max: 1.6,
                            step: 0.05,
                            fmt: (v: number) => `${Math.round(v * 100)}%`,
                            key: 'handbrakeSensitivity' as const,
                          },
                        ].map((sl) => (
                          <div key={sl.key} className="flex flex-col gap-0.5">
                            <div className="flex justify-between text-xs font-mono-tabular">
                              <span className="text-neutral-300">{sl.label}</span>
                              <span className="text-orange-400 font-bold">{sl.fmt(sl.val)}</span>
                            </div>
                            <input
                              type="range"
                              aria-label={sl.label}
                              min={sl.min}
                              max={sl.max}
                              step={sl.step}
                              value={sl.val}
                              onChange={(e) =>
                                onUpdateSettings?.({ [sl.key]: parseFloat(e.target.value) })
                              }
                              className="w-full accent-orange-500 cursor-pointer"
                            />
                          </div>
                        ))}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-neutral-300">PC Mouse Steering</span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                mouseSteeringEnabled: !gameSettings.mouseSteeringEnabled,
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.mouseSteeringEnabled
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {gameSettings.mouseSteeringEnabled ? 'ENABLED' : 'OFF'}
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-neutral-300">Gamepad Vibration</span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                controllerVibration: !gameSettings.controllerVibration,
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.controllerVibration
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {gameSettings.controllerVibration ? 'ENABLED' : 'OFF'}
                          </button>
                        </div>
                      </div>

                      {/* Live Mobile Controller Layout Preview & Quick Editor Access */}
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-mono-tabular uppercase text-neutral-200 font-bold">
                              LIVE MOBILE CONTROLLER PREVIEW ({activeMobileProfile.name})
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              Steering Wheel X:{activeMobileProfile.elements.steer_wheel.xPct.toFixed(0)}% Y:
                              {activeMobileProfile.elements.steer_wheel.yPct.toFixed(0)}% · Scale:{' '}
                              {Math.round(activeMobileProfile.elements.steer_wheel.scale * 100)}%
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(580);
                              setSelectedEditorBtn('steer_wheel');
                              setShowSettingsModal(false);
                              setShowMobileLayoutEditor(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-orange-500/50 text-[10px] font-mono-tabular font-bold text-orange-400 uppercase cursor-pointer"
                          >
                            Edit Steering Wheel &amp; Pedals
                          </button>
                        </div>

                        <div className="relative h-28 w-full rounded-xl bg-[#09090c] border border-white/10 overflow-hidden">
                          {(
                            [
                              { id: 'steer_wheel', label: 'WHEEL', w: 34, h: 34, round: true },
                              { id: 'handbrake', label: 'HBK', w: 20, h: 20, round: true },
                              { id: 'nitro', label: 'N2O', w: 18, h: 18, round: true },
                              { id: 'throttle', label: 'GAS', w: 22, h: 38, round: false },
                              { id: 'brake', label: 'BRK', w: 20, h: 28, round: false },
                              { id: 'gear_up', label: 'G+', w: 18, h: 14, round: false },
                              { id: 'gear_down', label: 'G-', w: 18, h: 14, round: false },
                              { id: 'camera', label: 'CAM', w: 20, h: 14, round: false },
                            ] as {
                              id: MobileControlId;
                              label: string;
                              w: number;
                              h: number;
                              round: boolean;
                            }[]
                          ).map((item) => {
                            const el = activeMobileProfile.elements[item.id];
                            if (!el || el.visible === false) return null;
                            return (
                              <div
                                key={item.id}
                                style={{
                                  left: `${el.xPct}%`,
                                  top: `${el.yPct}%`,
                                  width: `${item.w * el.scale}px`,
                                  height: `${item.h * el.scale}px`,
                                  opacity: el.opacity,
                                  transform: `translate(-50%, -50%) rotate(${el.rotationDeg}deg)`,
                                }}
                                className={`absolute border border-white/25 bg-neutral-900/90 flex items-center justify-center text-[8px] font-mono-tabular font-bold text-neutral-200 ${
                                  item.round ? 'rounded-full' : 'rounded-md'
                                } ${item.id === 'steer_wheel' ? 'border-orange-500/70 text-orange-300' : ''}`}
                              >
                                {item.label}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Keyboard Bindings + Duplicate Key Warning */}
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono-tabular uppercase text-neutral-300 font-bold">
                            KEYBOARD BINDINGS (CLICK TO REBIND)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(460);
                              setRebindingField(null);
                              onUpdateSettings?.({
                                accelerateKey: DEFAULT_GAME_SETTINGS.accelerateKey,
                                brakeKey: DEFAULT_GAME_SETTINGS.brakeKey,
                                leftKey: DEFAULT_GAME_SETTINGS.leftKey,
                                rightKey: DEFAULT_GAME_SETTINGS.rightKey,
                                handbrakeKey: DEFAULT_GAME_SETTINGS.handbrakeKey,
                                nitroKey: DEFAULT_GAME_SETTINGS.nitroKey,
                                upshiftKey: DEFAULT_GAME_SETTINGS.upshiftKey,
                                downshiftKey: DEFAULT_GAME_SETTINGS.downshiftKey,
                              });
                            }}
                            className="text-[10px] font-mono-tabular text-orange-400 hover:underline cursor-pointer"
                          >
                            Reset Default Keys
                          </button>
                        </div>

                        {duplicateWarnings.length > 0 && (
                          <div className="bg-red-950/80 border border-red-500/60 rounded-lg px-3 py-1.5 text-[11px] font-mono-tabular text-red-200">
                            ⚠️ Duplicate Key Binding Detected:{' '}
                            {duplicateWarnings
                              .map(([code, labels]) => `${code.replace(/^Key/, '')} (${labels.join(' & ')})`)
                              .join(', ')}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono-tabular">
                          {keyFields.map((kb) => {
                            const isListening = rebindingField === kb.field;
                            const rawCode = gameSettings[kb.field] || DEFAULT_GAME_SETTINGS[kb.field];
                            const isDup = (codeCounts[rawCode]?.length ?? 0) > 1;
                            const cleanLabel = rawCode
                              .replace(/^Key/, '')
                              .replace(/^Digit/, '')
                              .replace('ShiftLeft', 'L-Shift')
                              .replace('ShiftRight', 'R-Shift');
                            return (
                              <button
                                key={kb.field}
                                type="button"
                                onClick={() => {
                                  soundEngine.playUiChime(520);
                                  setRebindingField(isListening ? null : kb.field);
                                }}
                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left cursor-pointer ${
                                  isListening
                                    ? 'bg-orange-500/20 border-orange-400 text-orange-300'
                                    : isDup
                                    ? 'bg-red-950/50 border-red-500/60 text-red-200'
                                    : 'bg-neutral-900 border-white/10 text-neutral-300 hover:border-white/25'
                                }`}
                              >
                                <span className="text-[11px] text-neutral-400 truncate">
                                  {kb.label}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-neutral-950 border border-white/15 text-[11px] font-bold text-neutral-100">
                                  {isListening ? 'PRESS KEY...' : cleanLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 5: GAMEPLAY & DRIVING ASSISTS */}
                  {settingsCategory === 'gameplay' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="border-b border-white/10 pb-2">
                        <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                          Gameplay, Driving Physics Assists &amp; Speed Units
                        </div>
                        <div className="text-xs text-neutral-400">
                          Configure driving mode, drift/countersteer assist, TCS, ABS, transmission, and KM/H vs MPH.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                          <span className="text-xs text-neutral-300">Driving Handling Mode [V]</span>
                          <div className="grid grid-cols-4 gap-1">
                            {(['street', 'grip', 'drift', 'race'] as HandlingMode[]).map((hm) => (
                              <button
                                key={hm}
                                type="button"
                                onClick={() => onUpdateSettings?.({ handlingMode: hm })}
                                className={`py-1.5 rounded text-[11px] font-mono-tabular uppercase cursor-pointer ${
                                  (gameSettings.handlingMode ?? 'drift') === hm
                                    ? 'bg-orange-500 text-neutral-950 font-bold'
                                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                                }`}
                              >
                                {hm}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                          <span className="text-xs text-neutral-300">Transmission Gearbox [T]</span>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'automatic', label: 'Auto' },
                                { id: 'manual_clutch_assist', label: 'Man+Clutch' },
                                { id: 'manual', label: 'Manual' },
                              ] as { id: TransmissionMode; label: string }[]
                            ).map((tm) => (
                              <button
                                key={tm.id}
                                type="button"
                                onClick={() => onUpdateSettings?.({ transmissionMode: tm.id })}
                                className={`py-1.5 rounded text-[11px] font-mono-tabular uppercase cursor-pointer ${
                                  gameSettings.transmissionMode === tm.id
                                    ? 'bg-orange-500 text-neutral-950 font-bold'
                                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                                }`}
                              >
                                {tm.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Speedometer Units</span>
                          <div className="flex gap-1">
                            {(['kmh', 'mph'] as const).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => onUpdateSettings?.({ speedUnit: u })}
                                className={`px-3 py-1 rounded text-xs font-mono-tabular uppercase cursor-pointer ${
                                  (gameSettings.speedUnit ?? 'kmh') === u
                                    ? 'bg-orange-500 text-neutral-950 font-bold'
                                    : 'bg-neutral-900 text-neutral-400'
                                }`}
                              >
                                {u === 'kmh' ? 'KM/H' : 'MPH'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Traction Control (TCS)</span>
                          <div className="flex gap-1">
                            {(['off', 'sport', 'full'] as const).map((tcs) => (
                              <button
                                key={tcs}
                                type="button"
                                onClick={() => onUpdateSettings?.({ tractionControl: tcs })}
                                className={`px-2.5 py-1 rounded text-xs font-mono-tabular uppercase cursor-pointer ${
                                  (gameSettings.tractionControl ?? 'off') === tcs
                                    ? 'bg-orange-500 text-neutral-950 font-bold'
                                    : 'bg-neutral-900 text-neutral-400'
                                }`}
                              >
                                {tcs}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5">
                        {[
                          {
                            label: 'Drift Stabilization Assist',
                            val: gameSettings.driftAssist ?? 0.25,
                            key: 'driftAssist' as const,
                          },
                          {
                            label: 'Countersteering Assist',
                            val: gameSettings.steeringAssist ?? 0.35,
                            key: 'steeringAssist' as const,
                          },
                          {
                            label: 'Chassis Stability Control (ESP)',
                            val:
                              typeof gameSettings.stabilityControl === 'boolean'
                                ? gameSettings.stabilityControl
                                  ? 0.65
                                  : 0
                                : gameSettings.stabilityControl ?? 0.15,
                            key: 'stabilityControl' as const,
                          },
                        ].map((sl) => (
                          <div key={sl.key} className="flex flex-col gap-0.5">
                            <div className="flex justify-between text-xs font-mono-tabular">
                              <span className="text-neutral-300">{sl.label}</span>
                              <span className="text-orange-400 font-bold">
                                {Math.round(sl.val * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={sl.val}
                              onChange={(e) =>
                                onUpdateSettings?.({ [sl.key]: parseFloat(e.target.value) })
                              }
                              className="w-full accent-orange-500 cursor-pointer"
                            />
                          </div>
                        ))}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({ absEnabled: !(gameSettings.absEnabled ?? true) })
                            }
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                              gameSettings.absEnabled ?? true
                                ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 font-bold'
                                : 'bg-neutral-900 border-white/10 text-neutral-400'
                            }`}
                          >
                            ABS Brakes: {(gameSettings.absEnabled ?? true) ? 'ON' : 'OFF'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                showTelemetryOverlay: !gameSettings.showTelemetryOverlay,
                              })
                            }
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                              gameSettings.showTelemetryOverlay
                                ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 font-bold'
                                : 'bg-neutral-900 border-white/10 text-neutral-400'
                            }`}
                          >
                            Telemetry Box: {gameSettings.showTelemetryOverlay ? 'ON' : 'OFF'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                showDriftNotifications: !gameSettings.showDriftNotifications,
                              })
                            }
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                              gameSettings.showDriftNotifications
                                ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 font-bold'
                                : 'bg-neutral-900 border-white/10 text-neutral-400'
                            }`}
                          >
                            Drift Popups: {gameSettings.showDriftNotifications ? 'ON' : 'CLEAN'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 6: CAMERA SETTINGS */}
                  {settingsCategory === 'camera' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div>
                          <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                            Chase, Drift Look-Ahead &amp; Cockpit Camera Rig
                          </div>
                          <div className="text-xs text-neutral-400">
                            Fine-tune chase follow distance, height, stiffness, drift apex look-ahead, and cockpit eye offset.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(460);
                            onResetCameraSettings?.();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-white/15 text-xs font-mono-tabular text-orange-400 cursor-pointer"
                        >
                          Reset Camera
                        </button>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-3">
                        {[
                          {
                            label: 'Chase Camera Distance',
                            val: gameSettings.camera.distance,
                            min: 3.8,
                            max: 8.5,
                            step: 0.15,
                            unit: 'm',
                            key: 'distance' as const,
                          },
                          {
                            label: 'Chase Camera Height',
                            val: gameSettings.camera.height,
                            min: 1.15,
                            max: 3.2,
                            step: 0.05,
                            unit: 'm',
                            key: 'height' as const,
                          },
                          {
                            label: 'Camera Follow Stiffness / Smoothing',
                            val: gameSettings.camera.smoothing,
                            min: 5,
                            max: 20,
                            step: 0.5,
                            unit: '',
                            key: 'smoothing' as const,
                          },
                          {
                            label: 'Orbit Rotation Sensitivity',
                            val: gameSettings.camera.rotationSensitivity ?? 1.0,
                            min: 0.4,
                            max: 2.0,
                            step: 0.1,
                            unit: 'x',
                            key: 'rotationSensitivity' as const,
                          },
                          {
                            label: 'Drift Camera Apex Look-Ahead',
                            val: gameSettings.camera.driftCameraLookAhead ?? 0.65,
                            min: 0,
                            max: 1.2,
                            step: 0.05,
                            unit: '',
                            key: 'driftCameraLookAhead' as const,
                          },
                          {
                            label: 'Cockpit Seat Fore/Aft Offset',
                            val: gameSettings.camera.cockpitCameraOffset ?? 0.0,
                            min: -0.25,
                            max: 0.25,
                            step: 0.02,
                            unit: 'm',
                            key: 'cockpitCameraOffset' as const,
                          },
                        ].map((camSlider) => (
                          <div key={camSlider.key} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs font-mono-tabular">
                              <span className="text-neutral-300">{camSlider.label}</span>
                              <span className="text-orange-400 font-bold">
                                {camSlider.val.toFixed(camSlider.step < 1 ? 2 : 0)}
                                {camSlider.unit}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={camSlider.min}
                              max={camSlider.max}
                              step={camSlider.step}
                              value={camSlider.val}
                              onChange={(e) =>
                                onUpdateSettings?.({
                                  camera: {
                                    ...gameSettings.camera,
                                    [camSlider.key]: parseFloat(e.target.value),
                                  },
                                })
                              }
                              className="w-full accent-orange-500 cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 7: ACCESSIBILITY SETTINGS */}
                  {settingsCategory === 'accessibility' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="border-b border-white/10 pb-2">
                        <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                          Accessibility, UI Scaling &amp; Visual Comfort
                        </div>
                        <div className="text-xs text-neutral-400">
                          Customize HUD scale, panel transparency, high-contrast mode, and reduced camera motion.
                        </div>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs font-mono-tabular">
                            <span className="text-neutral-300">HUD Interface Scale</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round((gameSettings.uiScale ?? 1.0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.85}
                            max={1.2}
                            step={0.05}
                            value={gameSettings.uiScale ?? 1.0}
                            onChange={(e) =>
                              onUpdateSettings?.({ uiScale: parseFloat(e.target.value) })
                            }
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs font-mono-tabular">
                            <span className="text-neutral-300">HUD Panel Opacity</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round((gameSettings.hudOpacity ?? 0.9) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label="HUD Panel Transparency"
                            min={0.35}
                            max={1.0}
                            step={0.05}
                            value={gameSettings.hudOpacity ?? 0.9}
                            onChange={(e) =>
                              onUpdateSettings?.({ hudOpacity: parseFloat(e.target.value) })
                            }
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                          {[
                            {
                              key: 'largeTextMode' as const,
                              label: 'Large Telemetry Typography',
                            },
                            {
                              key: 'highContrastHud' as const,
                              label: 'High-Contrast HUD Borders',
                            },
                            {
                              key: 'reducedMotion' as const,
                              label: 'Reduced Camera Shake & Tilt',
                            },
                            {
                              key: 'simplifiedHud' as const,
                              label: 'Simplified Minimalist HUD',
                            },
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() =>
                                onUpdateSettings?.({ [item.key]: !gameSettings[item.key] })
                              }
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                                gameSettings[item.key]
                                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 font-bold'
                                  : 'bg-neutral-900 border-white/10 text-neutral-300'
                              }`}
                            >
                              <span>{item.label}</span>
                              <span>{gameSettings[item.key] ? 'ON' : 'OFF'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 8: NETWORK & MULTIPLAYER SETTINGS */}
                  {settingsCategory === 'network' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="border-b border-white/10 pb-2">
                        <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                          Multiplayer Server Region &amp; Network Diagnostics
                        </div>
                        <div className="text-xs text-neutral-400">
                          Select preferred matchmaking region, inspect connection status, or reconnect to active lobby.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">Server Region</span>
                          <select
                            aria-label="Server Region"
                            value={gameSettings.networkRegion ?? 'auto'}
                            onChange={(e) =>
                              onUpdateSettings?.({
                                networkRegion: e.target.value as GameSettings['networkRegion'],
                              })
                            }
                            className="bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono-tabular uppercase text-neutral-100 cursor-pointer"
                          >
                            <option value="auto">Global Auto-Select</option>
                            <option value="jp_east">Tokyo (JP-East)</option>
                            <option value="us_west">California (US-West)</option>
                            <option value="eu_central">Frankfurt (EU-Central)</option>
                            <option value="ap_south">Singapore (AP-South)</option>
                          </select>
                        </div>

                        <div className="bg-neutral-950 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-xs text-neutral-300">HUD Network Ping Readout</span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                showNetworkPing: !gameSettings.showNetworkPing,
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.showNetworkPing
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {gameSettings.showNetworkPing ? 'VISIBLE' : 'HIDDEN'}
                          </button>
                        </div>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-mono-tabular text-neutral-200 font-bold">
                            {mpConnectedRoom
                              ? `Connected to ${mpConnectedRoom.name} (#${mpConnectedRoom.inviteCode})`
                              : 'Multiplayer Transport Ready (20Hz WebSocket + HTTP Fallback)'}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-neutral-400">
                            Active Remote Drivers: {mpRemotePlayers.length} · Callsign: {mpPlayerName}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(580);
                            setShowSettingsModal(false);
                            setShowMultiplayerModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-orange-500 text-neutral-950 font-mono-tabular font-bold text-xs uppercase cursor-pointer"
                        >
                          Open Lobby
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 9: DAY & WEATHER SETTINGS */}
                  {settingsCategory === 'weather' && (
                    <div className="flex flex-col gap-3.5">
                      <div className="border-b border-white/10 pb-2">
                        <div className="text-sm font-display font-bold text-neutral-100 uppercase">
                          Time of Day Lighting &amp; Dynamic Weather Physics
                        </div>
                        <div className="text-xs text-neutral-400">
                          Control mountain sun elevation, night touge headlights, and wet asphalt traction conditions.
                        </div>
                      </div>

                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-3.5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono-tabular text-neutral-300">
                            Time of Day Preset [N]
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings?.({
                                dynamicTimeCycle: !gameSettings.dynamicTimeCycle,
                              })
                            }
                            className={`px-2.5 py-1 rounded text-[10px] font-mono-tabular font-bold uppercase cursor-pointer ${
                              gameSettings.dynamicTimeCycle
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            Dynamic Cycle: {gameSettings.dynamicTimeCycle ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5">
                          {(
                            [
                              { id: 'morning', label: 'Morning' },
                              { id: 'afternoon', label: 'Afternoon' },
                              { id: 'golden_hour', label: 'Golden Hr' },
                              { id: 'sunset', label: 'Sunset' },
                              { id: 'night', label: 'Night' },
                            ] as { id: TimeOfDay; label: string }[]
                          ).map((tod) => (
                            <button
                              key={tod.id}
                              type="button"
                              onClick={() => {
                                soundEngine.playUiChime(520);
                                onSelectTimeOfDay?.(tod.id);
                              }}
                              className={`py-2 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                                (timeOfDay === 'day' ? 'afternoon' : timeOfDay) === tod.id
                                  ? 'bg-orange-500 text-neutral-950 font-bold border-orange-400'
                                  : 'bg-neutral-900 border-white/10 text-neutral-300'
                              }`}
                            >
                              {tod.label}
                            </button>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                          <span className="text-xs font-mono-tabular text-neutral-300">
                            Weather &amp; Road Surface Condition
                          </span>
                          <div className="grid grid-cols-5 gap-1.5">
                            {(
                              [
                                { id: 'clear', label: 'Clear (100%)' },
                                { id: 'cloudy', label: 'Cloudy (98%)' },
                                { id: 'light_rain', label: 'Rain (83%)' },
                                { id: 'heavy_rain', label: 'Storm (74%)' },
                                { id: 'foggy', label: 'Fog (93%)' },
                              ] as { id: WeatherMode; label: string }[]
                            ).map((wm) => (
                              <button
                                key={wm.id}
                                type="button"
                                onClick={() => {
                                  soundEngine.playUiChime(500);
                                  onUpdateSettings?.({ weather: wm.id });
                                }}
                                className={`py-2 rounded-lg text-[11px] font-mono-tabular border cursor-pointer ${
                                  (gameSettings.weather ?? 'clear') === wm.id
                                    ? 'bg-orange-500 text-neutral-950 font-bold border-orange-400'
                                    : 'bg-neutral-900 border-white/10 text-neutral-300'
                                }`}
                              >
                                {wm.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Bar: Apply, Cancel, Reset Category, Restore All Defaults */}
              <div className="border-t border-white/10 bg-neutral-950 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetCategory}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-xs font-mono-tabular text-neutral-300 cursor-pointer"
                  >
                    ↺ Reset Category
                  </button>

                  {!confirmResetAll ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetAll(true)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-red-950/60 border border-white/15 hover:border-red-500/40 text-xs font-mono-tabular text-neutral-400 hover:text-red-300 cursor-pointer"
                    >
                      Restore All Defaults
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-500/60 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-mono-tabular text-red-200">
                        Reset all 9 categories?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(420);
                          onSelectGraphicsPreset('ultra');
                          onSelectTimeOfDay?.('afternoon');
                          onUpdateSettings?.({
                            ...DEFAULT_GAME_SETTINGS,
                            camera: { ...DEFAULT_CAMERA_SETTINGS },
                            keyBindings: { ...DEFAULT_KEY_BINDINGS },
                            mobileLayouts: createDefaultMobileLayouts(),
                          });
                          setConfirmResetAll(false);
                        }}
                        className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-mono-tabular font-bold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetAll(false)}
                        className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px] font-mono-tabular cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(440);
                      if (settingsSnapshotRef.current) {
                        onUpdateSettings?.(settingsSnapshotRef.current);
                      }
                      setConfirmResetAll(false);
                      setShowSettingsModal(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-xs font-mono-tabular text-neutral-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(620);
                      settingsSnapshotRef.current = null;
                      setConfirmResetAll(false);
                      setShowSettingsModal(false);
                    }}
                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-neutral-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Apply &amp; Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );

  // ---------------------------------------------------------------------------
  // 2. CLEAN AUTOMOTIVE MAIN MENU OVERLAY (`gameState === 'title'`)
  // ---------------------------------------------------------------------------
  if (gameState === 'title') {
    return (
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6 md:p-10">
        {/* Clean dark gradient on left third keeping 65% of the live 3D car & mountain viewport open */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.72) 38%, rgba(9,9,11,0.08) 72%, rgba(9,9,11,0) 100%)',
          }}
        />

        {/* Top Bar: Active Machine Summary & Primary Navigation Bar (Play, Garage, Customization, Multiplayer, Settings, Profile) */}
        <div className="relative z-10 pointer-events-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3 bg-zinc-950/90 border border-white/10 rounded-xl px-3.5 py-2">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
              style={{ backgroundColor: customization.paintColor }}
            />
            <div className="text-xs font-mono-tabular">
              <span className="text-zinc-400">{selectedVehicle.year}</span>{' '}
              <span className="font-bold text-zinc-100">
                {selectedVehicle.manufacturer} {selectedVehicle.name}
              </span>{' '}
              <span className="text-amber-400 font-semibold">
                {Math.round(selectedVehicle.horsepower * (customization.horsepowerTuning ?? 1))} HP
              </span>
            </div>
          </div>

          <nav
            className="flex flex-wrap items-center gap-1.5 bg-zinc-950/90 border border-white/10 rounded-xl p-1.5"
            aria-label="Main Menu Navigation"
          >
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(640);
                setIsTestDrive(false);
                if (isMobileOrTouch() || gameSettings.fullscreen) {
                  requestFullscreen().catch(() => {});
                }
                onStartGame();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(540);
                setCustomTab('paint');
                onOpenGarage();
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Garage ({VEHICLES_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(560);
                setSheetUiExpanded(true);
                setCustomTab('paint');
                onOpenGarage();
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Customization
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(580);
                setShowMultiplayerModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-orange-400 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Multiplayer {mpConnectedRoom ? `(${mpConnectedRoom.playerCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(550);
                setShowWorldMapModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              World Map
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(520);
                setShowSettingsModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(520);
                setShowProfileModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(520);
                handleToggleFullscreen();
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 font-display font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
              title={fsActive ? 'Exit Fullscreen' : 'Fullscreen Mode (Hide Browser Header)'}
            >
              <span>{fsActive ? '🗗' : '⛶'}</span>
              <span>{fsActive ? 'Window' : 'Fullscreen'}</span>
            </button>
          </nav>
        </div>

        {/* Left-Aligned Main Automotive Title & Configuration Stack */}
        <div className="relative z-10 max-w-xl pointer-events-auto flex flex-col gap-2.5 sm:gap-4 my-auto max-h-[calc(100dvh-80px)] overflow-y-auto pr-1">
          <div className="flex flex-col gap-1 sm:gap-1.5">
            <div className="text-[10px] sm:text-xs font-mono-tabular uppercase tracking-widest text-amber-400">
              MOUNTAIN TOUGE &amp; TANDEM DRIFT SIMULATOR
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold italic tracking-tight text-zinc-100">
              TOUGE &amp; SAKURA <span className="text-amber-400">DRIFT 3D</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-md hidden sm:block">
               Precision RWD/AWD weight-transfer drift physics, {VEHICLES_CATALOG.length} customizable JDM &amp; exotic machines, and live online tandem lobbies.
            </p>
          </div>

          {/* Driving Mode Selection: DRIFT MODE vs RACE MODE */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5" role="group" aria-label="Select Driving Mode">
            {(
              [
                {
                  id: 'drift' as HandlingMode,
                  title: 'DRIFT MODE',
                  badge: 'CARX TOUGE',
                  desc: 'Controlled oversteer, countersteer self-alignment & drift chain scoring.',
                },
                {
                  id: 'race' as HandlingMode,
                  title: 'RACE MODE',
                  badge: 'GRIP & TIME',
                  desc: 'Maximum lateral traction, stronger launch & high-speed cornering.',
                },
              ] as const
            ).map((modeCard) => {
              const isSelected =
                modeCard.id === 'drift'
                  ? (gameSettings.handlingMode ?? 'drift') === 'drift'
                  : (gameSettings.handlingMode ?? 'drift') !== 'drift';
              return (
                <button
                  key={modeCard.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(560);
                    onUpdateSettings?.({ handlingMode: modeCard.id });
                  }}
                  className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900/95 border-amber-400'
                      : 'bg-zinc-950/85 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-display font-bold text-zinc-100 tracking-wide">
                      {modeCard.title}
                    </span>
                    <span
                      className={`text-[10px] font-mono-tabular font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {modeCard.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{modeCard.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Environment Selection Cards (Map 1: Mountain Drift vs Map 2: Blossom Drift) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="group" aria-label="Select Drifting Map">
            {(['mountain', 'blossom'] as MapId[]).map((id) => {
              const m = MAPS_DATA[id];
              const active = mapId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiChime(id === 'mountain' ? 480 : 620);
                    onSelectMap(id);
                  }}
                  className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? 'bg-zinc-900/95 border-white/40'
                      : 'bg-zinc-950/85 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-mono-tabular text-zinc-400">
                      {m.japaneseTitle} · {m.totalLengthKm}
                    </span>
                    <span
                      className={`text-[11px] font-mono-tabular font-bold ${
                        active ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                    >
                      {active ? 'SELECTED' : 'SELECT'}
                    </span>
                  </div>
                  <div className="text-base font-display font-bold text-zinc-100">{m.name}</div>
                </button>
              );
            })}
          </div>

          {/* Compact Lighting, Weather & Graphics Bar */}
          <div className="flex flex-col gap-2 bg-zinc-950/90 border border-white/10 rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono-tabular uppercase text-zinc-400">
                TIME OF DAY:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'morning', label: 'Morning' },
                    { id: 'afternoon', label: 'Afternoon' },
                    { id: 'golden_hour', label: 'Golden Hr' },
                    { id: 'sunset', label: 'Sunset' },
                    { id: 'night', label: 'Night' },
                  ] as { id: TimeOfDay; label: string }[]
                ).map((t) => {
                  const normalizedTod = timeOfDay === 'day' ? 'afternoon' : timeOfDay;
                  const active = normalizedTod === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiChime(500);
                        if (onSelectTimeOfDay) onSelectTimeOfDay(t.id);
                        else onToggleTimeOfDay();
                      }}
                      className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'bg-zinc-900 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'clear', label: 'Clear' },
                    { id: 'cloudy', label: 'Cloudy' },
                    { id: 'light_rain', label: 'Rain' },
                    { id: 'heavy_rain', label: 'Storm' },
                    { id: 'foggy', label: 'Fog' },
                  ] as { id: WeatherMode; label: string }[]
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(510);
                      onUpdateSettings?.({ weather: w.id });
                    }}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded-md cursor-pointer ${
                      (gameSettings.weather ?? 'clear') === w.id
                        ? 'bg-orange-500 text-zinc-950 font-semibold'
                        : 'bg-zinc-900 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1" role="group" aria-label="Graphics Quality Preset">
                {(['low', 'medium', 'high', 'ultra'] as GraphicsPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(540);
                      onSelectGraphicsPreset(preset);
                    }}
                    className={`px-2 py-0.5 text-[11px] font-mono-tabular uppercase rounded-md cursor-pointer ${
                      graphicsPreset === preset
                        ? 'bg-amber-500/25 border border-amber-400 text-amber-300 font-semibold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Action Row */}
          <div className="flex flex-wrap items-center gap-2 pt-1 shrink-0">
            <button
              type="button"
              data-start="true"
              disabled={isStartingGame}
              onClick={(e) => {
                e.currentTarget.blur();
                soundEngine.playUiChime(640);
                setIsTestDrive(false);
                if (isMobileOrTouch() || gameSettings.fullscreen) {
                  requestFullscreen().catch(() => {});
                }
                onStartGame();
              }}
              className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-xs sm:text-base tracking-wider uppercase cursor-pointer disabled:opacity-75 disabled:cursor-wait"
            >
              {isStartingGame
                ? '🏎️ Starting Engine...'
                : `Start ${(gameSettings.handlingMode ?? 'drift') === 'drift' ? 'Drifting' : 'Racing'} — ${mapDef.name}`}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(540);
                onOpenGarage();
              }}
              className="px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-zinc-900/95 hover:bg-zinc-800 border border-white/15 text-zinc-100 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              3D Garage &amp; Tuning [G]
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiChime(580);
                setShowMultiplayerModal(true);
              }}
              className="px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-zinc-900/95 hover:bg-zinc-800 border border-white/15 text-zinc-100 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Online Multiplayer
            </button>
          </div>
        </div>

        <div className="relative z-10 text-xs text-zinc-400 font-mono-tabular tracking-wide hidden sm:block">
          WASD / Arrows Drive &nbsp;·&nbsp; Space Handbrake &nbsp;·&nbsp; Shift N2O &nbsp;·&nbsp; V Drift/Race &nbsp;·&nbsp; G Garage &nbsp;·&nbsp; C Camera
        </div>

        {renderSharedModals()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. PROFESSIONAL AUTOMOTIVE RACING HUD (TOP-LEFT CIRCULAR MINIMAP + TOP-RIGHT TACHOMETER/SPEEDOMETER)
  // ---------------------------------------------------------------------------
  const isRaceHudMode =
    (gameSettings.handlingMode ?? 'drift') === 'race' ||
    mpConnectedRoom?.mode === 'sprint_race' ||
    mpConnectedRoom?.mode === 'circuit_race' ||
    mpConnectedRoom?.mode === 'touge_battle';
  const hudPanelOpacity = Math.max(0.35, Math.min(1.0, gameSettings.hudOpacity ?? 0.9));

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* SYNCHRONIZED MULTIPLAYER RACE 3-2-1-GO! COUNTDOWN BANNER */}
      {raceCountdownLabel && !photoModeState.active && !replayState.active && (
        <div className="fixed inset-x-0 top-24 z-40 pointer-events-none flex justify-center">
          <div className="px-8 py-3 rounded-2xl bg-neutral-950/95 border-2 border-amber-400 shadow-2xl flex flex-col items-center">
            <span className="text-[10px] font-mono-tabular uppercase tracking-widest text-amber-300">
              SYNCHRONIZED MULTIPLAYER RACE START
            </span>
            <span className="text-4xl md:text-5xl font-mono-tabular tabular-nums font-extrabold text-white tracking-wider">
              {raceCountdownLabel}
            </span>
          </div>
        </div>
      )}

      {/* MOBILE PORTRAIT ORIENTATION BANNER (Prompts Landscape Mode on narrow vertical phones) */}
      {isPortraitMobile && !photoModeState.active && !replayState.active && (
        <div className="pointer-events-auto mx-auto mb-2 px-3.5 py-1.5 rounded-xl bg-neutral-950/95 border border-orange-500/50 text-[11px] font-mono-tabular text-neutral-200 flex flex-wrap items-center justify-between gap-2 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-orange-400 font-bold">↻ LANDSCAPE RECOMMENDED</span>
            <span className="text-neutral-400">Rotate device horizontally for racing controls</span>
          </div>
          {!fsActive && (
            <button
              type="button"
              onClick={() => handleToggleFullscreen()}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold uppercase text-[10px] cursor-pointer"
            >
              ⛶ Go Fullscreen
            </button>
          )}
        </div>
      )}

      {/* TOP PERIMETER: TOP-LEFT CIRCULAR MINIMAP + TOP-CENTER DRIFT READOUT + TOP-RIGHT TACHOMETER/SPEEDOMETER */}
      <div
        style={{ opacity: hudPanelOpacity }}
        className={
          photoModeState.active || replayState.active
            ? 'hidden'
            : 'flex items-start justify-between gap-3 w-full'
        }
      >
        {/* TOP-LEFT: Circular Navigation Minimap + Compact Session & Action Controls */}
        <div className="pointer-events-auto flex items-start gap-2.5">
          {!hudCollapsed && (
            <div
              onClick={() => {
                soundEngine.playUiChime(550);
                setShowWorldMapModal(true);
              }}
              title="Click Minimap to Open Full World Map & Fast Travel"
              className="relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full bg-neutral-950/90 border-2 border-white/15 hover:border-amber-400/60 shadow-2xl overflow-hidden shrink-0 cursor-pointer"
            >
              <svg
                viewBox="0 0 180 180"
                className="w-full h-full"
                aria-label="Road Network Minimap"
              >
                {/* Subtle circular radar rings */}
                <circle
                  cx="90"
                  cy="90"
                  r="76"
                  fill="none"
                  stroke="#262626"
                  strokeWidth="1"
                />
                <circle
                  cx="90"
                  cy="90"
                  r="48"
                  fill="none"
                  stroke="#1f1f22"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />

                {mapDef.plazas.map((plaza) => (
                  <ellipse
                    key={plaza.id}
                    cx={90 + plaza.x * minimapPaths.scale}
                    cy={90 + plaza.z * minimapPaths.scale}
                    rx={plaza.radiusX * minimapPaths.scale}
                    ry={plaza.radiusZ * minimapPaths.scale}
                    fill="#27272a"
                    stroke="#52525b"
                    strokeWidth="1"
                  />
                ))}

                {/* Secondary Branch Route */}
                <path
                  d={minimapPaths.branchD}
                  fill="none"
                  stroke="#52525b"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />

                {/* Primary Mountain Route */}
                <path
                  d={minimapPaths.mainD}
                  fill="none"
                  stroke="#e5e5e5"
                  strokeWidth="5.5"
                  strokeLinejoin="round"
                />

                {/* Sector Checkpoints / Viewpoints */}
                {mapDef.viewpoints.map((vp, idx) => (
                  <circle
                    key={vp.id}
                    cx={90 + vp.x * minimapPaths.scale}
                    cy={90 + vp.z * minimapPaths.scale}
                    r={activeViewpointIdx === idx ? 4.2 : 2.6}
                    fill={activeViewpointIdx === idx ? '#f97316' : '#a3a3a3'}
                    stroke="#09090b"
                    strokeWidth="1.2"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectViewpoint(idx);
                    }}
                  >
                    <title>{vp.name}</title>
                  </circle>
                ))}

                {/* Connected Remote Multiplayer Players on Minimap */}
                {mpRemotePlayers.map((rp) => {
                  const rx = 90 + rp.x * minimapPaths.scale;
                  const rz = 90 + rp.z * minimapPaths.scale;
                  return (
                    <circle
                      key={rp.playerId}
                      cx={rx}
                      cy={rz}
                      r="3.8"
                      fill={rp.paintColor || '#22d3ee'}
                      stroke="#fafafa"
                      strokeWidth="1.2"
                    >
                      <title>{rp.playerName}</title>
                    </circle>
                  );
                })}

                {/* Player Position & Heading Arrow */}
                <g ref={minimapCarRef} transform="translate(90, 30) rotate(0)">
                  <polygon
                    points="0,-8 5.5,5.5 0,2.5 -5.5,5.5"
                    fill="#f97316"
                    stroke="#fafafa"
                    strokeWidth="1.2"
                  />
                </g>
              </svg>

              {/* Cardinal North Badge */}
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-neutral-950/90 border border-white/15 text-[9px] font-mono-tabular font-bold text-neutral-300">
                N
              </span>
            </div>
          )}

          {/* Subtle Session & Utility Stack Beside Minimap */}
          <div className="flex flex-col gap-1.5">
            {/* Compact Top Action Bar (Pause, Reset, Camera, Garage, World Map, Settings) */}
            <div className="flex flex-nowrap items-center gap-1 bg-neutral-950/88 border border-white/15 rounded-xl p-1 shadow-lg max-w-[calc(100vw-150px)] sm:max-w-none overflow-x-auto">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Game"
                title="Pause [P]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(440);
                  onPauseGame();
                }}
                className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 flex items-center justify-center text-xs cursor-pointer shrink-0"
              >
                ⏸
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Reset Car to Road"
                title="Reset Car [R]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(400);
                  onResetCar();
                }}
                className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 flex items-center justify-center text-xs cursor-pointer shrink-0"
              >
                ↺
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={`Camera Mode: ${cameraMode}`}
                title="Cycle Camera Mode [C]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(520);
                  onCycleCamera();
                }}
                className="px-2 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-mono-tabular uppercase text-neutral-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                {cameraMode} [C]
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(540);
                  onOpenGarage();
                }}
                className="px-2.5 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[11px] font-display font-bold tracking-wide text-neutral-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                {isTestDrive ? '← Tune Garage' : 'Garage [G]'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Open World Map"
                title="Open World Map & Fast Travel"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(550);
                  setShowWorldMapModal(true);
                }}
                className="px-2 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-mono-tabular text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                🗺 Map
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(480);
                  onSelectMap(mapId === 'mountain' ? 'blossom' : 'mountain');
                }}
                className="px-2 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-mono-tabular text-neutral-300 hover:text-white cursor-pointer whitespace-nowrap inline-flex items-center shrink-0"
                title="Switch Mountain Map"
              >
                {mapId === 'mountain' ? 'Mt. Haruna' : 'Sakura Pass'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={`Time of Day: ${timeOfDay}`}
                title="Cycle Lighting [N]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(480);
                  onToggleTimeOfDay();
                }}
                className="px-2 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-mono-tabular capitalize text-neutral-300 cursor-pointer whitespace-nowrap inline-flex items-center shrink-0"
              >
                {timeOfDay === 'day'
                  ? 'Afternoon'
                  : timeOfDay === 'golden_hour'
                    ? 'Golden'
                    : timeOfDay}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Open Settings"
                title="Settings"
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(520);
                  setShowSettingsModal(true);
                }}
                className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 flex items-center justify-center text-xs cursor-pointer shrink-0"
              >
                ⚙
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                title="Mute / Unmute Audio [M]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 flex items-center justify-center text-xs cursor-pointer shrink-0"
              >
                {isMuted ? '🔇' : '🔊'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={fsActive ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                title={fsActive ? 'Exit Fullscreen' : 'Fullscreen Mode (Hide Browser Header)'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundEngine.playUiChime(520);
                  handleToggleFullscreen();
                }}
                className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 flex items-center justify-center text-xs cursor-pointer shrink-0"
              >
                {fsActive ? '🗗' : '⛶'}
              </button>
            </div>

            {/* Subtle Sector & Surface Strip (Only shows Lap/Timer when in Race Mode) */}
            {!hudCollapsed && (
              <div className="hidden lg:flex flex-nowrap items-center gap-2 bg-neutral-950/85 border border-white/12 rounded-xl px-2.5 py-1 text-[11px] font-mono-tabular tabular-nums text-neutral-300">
                <span ref={zoneNameTextRef} className="font-semibold text-neutral-100">
                  {mapDef.viewpoints[activeViewpointIdx]?.name.replace(/^\d+\.\s*/, '')}
                </span>
                <span className="text-neutral-600">·</span>
                <span ref={surfaceBadgeRef} className="text-neutral-400">
                  ASPHALT · 100% GRIP
                </span>
                <span
                  ref={lapTextRef}
                  className={isRaceHudMode ? 'text-orange-400 font-bold ml-1' : 'hidden'}
                >
                  LAP 1
                </span>
                <span
                  ref={lapTimerTextRef}
                  className={isRaceHudMode ? 'text-neutral-200' : 'hidden'}
                >
                  00:00.0
                </span>
              </div>
            )}

            {/* Sector Quick-Jump Pills + Secondary Utility Triggers */}
            {!hudCollapsed && (
              <div
                className="flex flex-nowrap sm:flex-wrap items-center gap-1 bg-neutral-950/82 border border-white/10 rounded-xl p-1 max-w-[calc(100vw-150px)] sm:max-w-none overflow-x-auto"
                role="group"
                aria-label="Map Viewpoints"
              >
                {mapDef.viewpoints.map((vp, idx) => {
                  const isSelected = activeViewpointIdx === idx;
                  return (
                    <button
                      key={vp.id}
                      type="button"
                      tabIndex={-1}
                      title={vp.name}
                      aria-label={vp.name}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        soundEngine.playUiChime(500 + idx * 40);
                        onSelectViewpoint(idx);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular transition-colors cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                      }`}
                    >
                      S{idx + 1}
                    </button>
                  );
                })}
                <span className="text-neutral-700 px-0.5">|</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Toggle Vehicle Telemetry"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(510);
                    onUpdateSettings?.({
                      showTelemetryOverlay: !gameSettings.showTelemetryOverlay,
                    });
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular cursor-pointer ${
                    gameSettings.showTelemetryOverlay
                      ? 'bg-orange-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  TEL
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Toggle Drift Practice Drills"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(520);
                    onUpdateSettings?.({ practiceMode: !gameSettings.practiceMode });
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular cursor-pointer ${
                    gameSettings.practiceMode
                      ? 'bg-white/20 text-white font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  DRILLS
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Open Photo Mode"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(540);
                    onUpdateReplayState?.((prev) => ({ ...prev, active: false }));
                    onUpdatePhotoMode?.((prev) => ({
                      ...prev,
                      active: !prev.active,
                      hideHud: false,
                    }));
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular text-neutral-400 hover:text-white cursor-pointer"
                >
                  PHOTO
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Open Drift Replay"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(540);
                    onUpdatePhotoMode?.((prev) => ({ ...prev, active: false }));
                    onUpdateReplayState?.((prev) => ({
                      ...prev,
                      active: !prev.active,
                      playing: true,
                    }));
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular text-neutral-400 hover:text-white cursor-pointer"
                >
                  REPLAY
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(580);
                    setShowMultiplayerModal(true);
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular text-neutral-300 hover:text-white cursor-pointer"
                >
                  {mpConnectedRoom ? `ROOM ${mpConnectedRoom.inviteCode}` : 'ONLINE'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TOP-CENTER: Clean, Restrained Automotive Drift Score Readout */}
        {!hudCollapsed && (
          <div className="flex flex-col items-center gap-1 pointer-events-none shrink-0 scale-90 sm:scale-100">
            <div
              ref={driftBannerRef}
              className="flex items-center gap-2 lg:gap-3 bg-neutral-950/88 border border-white/15 rounded-xl px-2.5 lg:px-3.5 py-1 lg:py-1.5 transition-opacity font-mono-tabular tabular-nums"
            >
              <div>
                <div className="text-[8px] lg:text-[9px] font-mono-tabular uppercase tracking-wider text-neutral-400">
                  DRIFT CHAIN
                </div>
                <div className="flex items-baseline gap-1">
                  <span
                    ref={driftPointsTextRef}
                    className="text-xs lg:text-base font-mono-tabular tabular-nums font-bold text-orange-400"
                  >
                    READY
                  </span>
                  <span
                    ref={driftMultTextRef}
                    className="text-[10px] lg:text-xs font-mono-tabular tabular-nums font-semibold text-neutral-300"
                  >
                    1.0x
                  </span>
                </div>
              </div>

              <div className="h-4 lg:h-5 w-px bg-white/12" />

              <div>
                <div className="text-[8px] lg:text-[9px] font-mono-tabular uppercase tracking-wider text-neutral-400">
                  ANGLE
                </div>
                <span
                  ref={driftAngleTextRef}
                  className="text-xs lg:text-base font-mono-tabular tabular-nums font-bold text-neutral-100"
                >
                  0°
                </span>
              </div>

              <div className="h-4 lg:h-5 w-px bg-white/12" />

              <div>
                <div className="text-[8px] lg:text-[9px] font-mono-tabular uppercase tracking-wider text-neutral-400">
                  TOTAL
                </div>
                <span
                  ref={totalScoreTextRef}
                  className="text-xs lg:text-base font-mono-tabular tabular-nums font-bold text-neutral-100"
                >
                  0
                </span>
              </div>
            </div>

            <div
              ref={driftNotificationBoxRef}
              style={{ opacity: 0 }}
              className="px-2.5 py-0.5 rounded-lg bg-neutral-950/90 border border-orange-500/40 transition-opacity duration-150"
            >
              <span
                ref={driftNotificationTextRef}
                className="text-[10px] font-mono-tabular font-bold tracking-wider uppercase text-orange-400"
              >
                READY
              </span>
            </div>
          </div>
        )}

        {/* TOP-RIGHT: Professional Circular Analog + Digital Tachometer & Speedometer Instrument Cluster */}
        {!hudCollapsed && (
          <div className="pointer-events-auto flex items-start gap-2.5 shrink-0">
            {/* Compact Powertrain & Mode Status Pill Beside Tachometer */}
            <div className="hidden xl:flex flex-col items-end gap-1.5 bg-neutral-950/88 border border-white/15 rounded-xl p-2.5 shadow-xl min-w-[122px] font-mono-tabular tabular-nums">
              <div className="flex items-center justify-between w-full gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(560);
                    const modes: HandlingMode[] = ['street', 'grip', 'drift', 'race'];
                    const cur = gameSettings.handlingMode ?? 'drift';
                    const nextMode = modes[(modes.indexOf(cur) + 1) % modes.length] ?? 'drift';
                    onUpdateSettings?.({
                      handlingMode: nextMode,
                    });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-bold uppercase border cursor-pointer ${
                    (gameSettings.handlingMode ?? 'drift') === 'drift'
                      ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                      : 'bg-neutral-800 border-white/20 text-neutral-100'
                  }`}
                >
                  {(gameSettings.handlingMode ?? 'drift').toUpperCase()}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiChime(540);
                    const order: TransmissionMode[] = [
                      'automatic',
                      'manual_clutch_assist',
                      'manual',
                    ];
                    const nextMode =
                      order[(order.indexOf(gameSettings.transmissionMode) + 1) % order.length];
                    onUpdateSettings?.({
                      transmissionMode: nextMode,
                    });
                  }}
                  className="px-1.5 py-0.5 rounded bg-neutral-900 border border-white/15 text-[10px] font-mono-tabular font-bold uppercase text-neutral-200 hover:border-white/35 cursor-pointer"
                >
                  {gameSettings.transmissionMode === 'manual'
                    ? 'MAN'
                    : gameSettings.transmissionMode === 'manual_clutch_assist'
                    ? 'M+CL'
                    : 'AUTO'}
                </button>
              </div>

              <div className="flex items-center justify-between w-full text-[10px] font-mono-tabular tabular-nums">
                <span ref={rpmNumTextRef} className="text-neutral-300">
                  900 RPM
                </span>
                <span
                  ref={shiftLedRef}
                  className="px-1.5 py-0.2 rounded bg-red-600 text-white text-[9px] font-mono-tabular font-extrabold tracking-wider transition-opacity"
                  style={{ opacity: 0.15 }}
                >
                  SHIFT
                </span>
              </div>

              <div className="flex items-center justify-between w-full text-[10px] font-mono-tabular tabular-nums">
                <span className="text-neutral-500">BOOST</span>
                <span ref={turboBoostTextRef} className="text-neutral-200 font-semibold">
                  -0.40 BAR
                </span>
              </div>

              {/* N2O & Fuel Status Bars */}
              <div className="w-full flex flex-col gap-1 pt-0.5 border-t border-white/10">
                <div className="flex items-center justify-between text-[9px] font-mono-tabular">
                  <span className="text-neutral-300 font-bold">N2O</span>
                  <span className="text-emerald-400 font-bold">FUEL 98%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    ref={nitroBarRef}
                    className="h-full bg-orange-500 transition-all duration-75"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            {/* Circular Tachometer + Digital Speedometer Dial (Reference Top-Right Cluster) */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-full bg-neutral-950/92 border-2 border-white/15 shadow-2xl flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 160 160"
                className="w-full h-full font-mono-tabular tabular-nums"
                aria-label="Speedometer and Tachometer"
              >
                {/* Outer & Inner Dial Rings */}
                <circle
                  cx="80"
                  cy="80"
                  r="74"
                  fill="#09090b"
                  stroke="#262626"
                  strokeWidth="2"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke="#1f1f22"
                  strokeWidth="6"
                  strokeDasharray="260 400"
                  strokeLinecap="round"
                  transform="rotate(150 80 80)"
                />

                {/* Redline Warning Arc Zone (7,000 - 9,000 RPM) */}
                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="6"
                  strokeOpacity="0.38"
                  strokeDasharray="58 400"
                  strokeDashoffset="-202"
                  strokeLinecap="butt"
                  transform="rotate(150 80 80)"
                />

                {/* Live Sweeping RPM Progress Arc */}
                <circle
                  ref={rpmArcRef}
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke="#f5f5f5"
                  strokeWidth="5"
                  strokeDasharray="260 400"
                  strokeDashoffset="235"
                  strokeLinecap="round"
                  transform="rotate(150 80 80)"
                />

                {/* Numbered Tachometer Scale Ticks (0..9 x1000 RPM across 240 deg sweep) */}
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                  const deg = -120 + (num / 9) * 240;
                  const rad = ((deg - 90) * Math.PI) / 180;
                  const x1 = 80 + Math.cos(rad) * 67;
                  const y1 = 80 + Math.sin(rad) * 67;
                  const x2 = 80 + Math.cos(rad) * 58;
                  const y2 = 80 + Math.sin(rad) * 58;
                  const tx = 80 + Math.cos(rad) * 48;
                  const ty = 80 + Math.sin(rad) * 48 + 3.5;
                  const isRedline = num >= 7;
                  return (
                    <g key={num}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isRedline ? '#ef4444' : '#d4d4d8'}
                        strokeWidth="2"
                      />
                      <text
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        fill={isRedline ? '#ef4444' : '#d4d4d8'}
                        fontSize="10"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {num}
                      </text>
                    </g>
                  );
                })}

                {/* x1000r/min Sub-label */}
                <text
                  x="80"
                  y="56"
                  textAnchor="middle"
                  fill="#737373"
                  fontSize="7"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  x1000r/min
                </text>

                {/* Rotating Physical RPM Needle */}
                <g ref={rpmNeedleRef} transform="rotate(-95 80 80)">
                  <line
                    x1="80"
                    y1="86"
                    x2="80"
                    y2="22"
                    stroke="#f97316"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </g>
                <circle
                  cx="80"
                  cy="80"
                  r="5.5"
                  fill="#171717"
                  stroke="#d4d4d8"
                  strokeWidth="1.5"
                />

                {/* Digital Gear Indicator Badge */}
                <rect
                  x="67"
                  y="90"
                  width="26"
                  height="20"
                  rx="4"
                  fill="#141417"
                  stroke="#3f3f46"
                  strokeWidth="1.2"
                />
                <text
                  ref={gearTextRef}
                  x="80"
                  y="105"
                  textAnchor="middle"
                  fill="#f97316"
                  fontSize="14"
                  fontWeight="800"
                  fontFamily="JetBrains Mono, monospace"
                  className="font-mono-tabular tabular-nums"
                >
                  1
                </text>

                {/* Digital Vehicle Speed Readout (km/h or mph) */}
                <text
                  ref={speedTextRef}
                  x="80"
                  y="134"
                  textAnchor="middle"
                  fill="#fafafa"
                  fontSize="24"
                  fontWeight="800"
                  fontFamily="JetBrains Mono, monospace"
                  className="font-mono-tabular tabular-nums"
                >
                  0
                </text>
                <text
                  x="80"
                  y="146"
                  textAnchor="middle"
                  fill="#a3a3a3"
                  fontSize="8.5"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                  letterSpacing="1.2"
                >
                  {gameSettings.speedUnit === 'mph' ? 'MPH' : 'KM/H'}
                </text>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* LEFT PERIMETER OVERLAYS: LIVE MULTIPLAYER LEADERBOARD, TANDEM TELEMETRY, VEHICLE TELEMETRY & DRIFT PRACTICE */}
      <div
        style={{ opacity: hudPanelOpacity }}
        className="pointer-events-none flex flex-col items-start justify-center my-auto gap-2.5 relative"
      >
        {/* Live Multiplayer Room Leaderboard, Race Controls & Tandem Proximity Sync */}
        {mpConnectedRoom && !hudCollapsed && !photoModeState.active && !replayState.active && (
          <div className="pointer-events-auto bg-neutral-950/92 border border-white/15 rounded-xl p-2.5 sm:p-3 w-56 sm:w-68 flex flex-col gap-2 font-mono-tabular tabular-nums">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-neutral-200 font-bold truncate max-w-[165px]">
                  ● {mpConnectedRoom.name}
                </span>
                <span className="text-[9px] uppercase text-neutral-400">
                  {mpConnectedRoom.mode.replace('_', ' ')} ·{' '}
                  {mpConnectedRoom.raceStatus === 'active'
                    ? `RACING (${mpConnectedRoom.totalLaps} LAPS)`
                    : mpConnectedRoom.raceStatus === 'countdown'
                      ? 'COUNTDOWN...'
                      : mpConnectedRoom.raceStatus === 'finished'
                        ? 'RACE FINISHED'
                        : 'FREE ROAM / LOBBY'}
                </span>
              </div>
              <span className="text-[10px] text-orange-400 font-bold">
                #{mpConnectedRoom.inviteCode}
              </span>
            </div>

            {/* Standings List */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-neutral-100">
                <span className="truncate">
                  ★ {mpPlayerName} <span className="text-[10px] text-neutral-400">({selectedVehicle.chassisCode})</span>
                </span>
                <span className="text-orange-400 font-bold">
                  {Math.round(
                    (latestCarRef.current?.totalDriftScore ?? 0) +
                      (latestCarRef.current?.currentDriftPoints ?? 0)
                  ).toLocaleString()}{' '}
                  PTS
                </span>
              </div>
              {mpRemotePlayers.map((rp) => {
                const vSpec = getVehicleById(rp.vehicleId);
                return (
                  <div
                    key={rp.playerId}
                    className="flex items-center justify-between text-xs text-neutral-300"
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: rp.paintColor || '#f97316' }}
                      />
                      <span>{rp.playerName}</span>
                      <span className="text-[10px] text-neutral-500">({vSpec.chassisCode})</span>
                    </span>
                    <span className="text-neutral-200 font-semibold">
                      {Math.round(rp.driftScore + rp.currentDriftPoints).toLocaleString()} PTS
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Live Tandem Drift Proximity & Angle Sync Telemetry Box */}
            {tandemTelemetry && tandemTelemetry.partnerName && (
              <div className="bg-neutral-900/95 border border-orange-500/40 rounded-lg p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-orange-400 font-extrabold uppercase">
                    ⚡ {tandemTelemetry.role} TANDEM · {tandemTelemetry.partnerName}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-orange-500 text-neutral-950 font-extrabold text-[9px]">
                    {tandemTelemetry.tandemMultiplierBonus.toFixed(2)}x
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div>
                    <div className="text-[8px] text-neutral-400">PROXIMITY</div>
                    <div className="font-bold text-neutral-100">{tandemTelemetry.distanceMeters}m</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-neutral-400">ANGLE SYNC</div>
                    <div className="font-bold text-orange-300">{tandemTelemetry.angleSyncPct}%</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-neutral-400">SPEED SYNC</div>
                    <div className="font-bold text-emerald-300">{tandemTelemetry.speedSyncPct}%</div>
                  </div>
                </div>
              </div>
            )}

            {/* Synchronized Multiplayer Race Start / Reset + On-the-Fly Car Switcher */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                {mpConnectedRoom.raceStatus === 'lobby' || mpConnectedRoom.raceStatus === 'finished' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      soundEngine.playUiChime(620);
                      await multiplayerClient.startRace({ totalLaps: mpConnectedRoom.totalLaps || 2 });
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-display font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                  >
                    🏁 Start Race (3-2-1-GO!)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      soundEngine.playUiChime(460);
                      await multiplayerClient.resetRace();
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono-tabular font-bold text-[10px] uppercase cursor-pointer"
                  >
                    ↺ Reset to Free Roam
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[9px] text-neutral-400 uppercase shrink-0">SWITCH CAR:</span>
                <select
                  aria-label="Quick Switch Multiplayer Vehicle"
                  value={selectedVehicle.id}
                  onChange={(e) => {
                    soundEngine.playUiChime(530);
                    onSelectVehicle(e.target.value);
                  }}
                  className="flex-1 bg-neutral-900 border border-white/15 rounded px-1.5 py-0.5 text-[10px] font-mono-tabular text-neutral-100 cursor-pointer truncate"
                >
                  {VEHICLES_CATALOG.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.manufacturer} {v.name} ({v.chassisCode})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Optional Toggleable Vehicle Telemetry Panel */}
        {gameSettings.showTelemetryOverlay && !hudCollapsed && !photoModeState.active && !replayState.active && (
          <div className="pointer-events-auto bg-neutral-950/90 border border-white/15 rounded-xl p-3 w-60 flex flex-col gap-1.5 font-mono-tabular tabular-nums">
            <div className="flex items-center justify-between border-b border-white/10 pb-1">
              <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-neutral-200 font-bold">
                LIVE VEHICLE TELEMETRY
              </span>
              <button
                type="button"
                onClick={() => onUpdateSettings?.({ showTelemetryOverlay: false })}
                className="text-[10px] font-mono-tabular text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono-tabular tabular-nums">
              <div className="flex justify-between">
                <span className="text-neutral-400">Speed</span>
                <span ref={telSpeedRef} className="text-neutral-100 font-bold">0 km/h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">RPM</span>
                <span ref={telRpmRef} className="text-neutral-100 font-bold">900</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Gear</span>
                <span ref={telGearRef} className="text-orange-400 font-bold">G1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Steer</span>
                <span ref={telSteerRef} className="text-neutral-200 font-bold">0°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Tire Slip</span>
                <span ref={telSlipRef} className="text-neutral-100 font-bold">0%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Drift Ang</span>
                <span ref={telDriftRef} className="text-orange-300 font-bold">0°</span>
              </div>
              <div className="flex justify-between col-span-2 pt-0.5 border-t border-white/10">
                <span className="text-neutral-400">Engine Load</span>
                <span ref={telLoadRef} className="text-neutral-200 font-bold">20%</span>
              </div>
            </div>
          </div>
        )}

        {/* Drift Practice Checklist */}
        {gameSettings.practiceMode && !hudCollapsed && !photoModeState.active && !replayState.active && (
          <div className="pointer-events-auto self-start bg-neutral-950/90 border border-white/15 rounded-xl p-3 w-68 flex flex-col gap-1.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-1">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-orange-400 font-bold">
                DRIFT PRACTICE DRILLS
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings?.({ practiceMode: false })}
                className="text-[10px] font-mono-tabular text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕ Hide
              </button>
            </div>
            {[
              { title: '1. Drift Initiation', hint: 'Steer + W or tap Space at >40 km/h' },
              { title: '2. Countersteering', hint: 'Steer into the slide to hold angle' },
              { title: '3. Throttle Control', hint: 'Modulate W to sustain >22° drift' },
              { title: '4. Handbrake Entry', hint: 'Pull Space entering a corner' },
              { title: '5. Drift Transition', hint: 'Link left-to-right S-curve slide' },
            ].map((drill, idx) => (
              <div key={drill.title} className="flex items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-medium text-neutral-200 text-[11px]">{drill.title}</div>
                  <div className="text-[10px] text-neutral-400">{drill.hint}</div>
                </div>
                <span
                  ref={(el) => {
                    practiceStepRefs.current[idx] = el;
                  }}
                  className="px-1.5 py-0.5 rounded bg-neutral-900 border border-white/10 text-[10px] font-mono-tabular text-neutral-400 shrink-0"
                >
                  PENDING
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PROFILE-DRIVEN TRANSLUCENT MOBILE CONTROLLER + INTERACTIVE MOBILE LAYOUT EDITOR */}
      {(effectiveControlScheme !== 'pc' || showMobileLayoutEditor) &&
        !hudCollapsed &&
        !photoModeState.active &&
        !replayState.active && (
          <div
            onPointerMove={(e) => {
              if (!showMobileLayoutEditor || !draggingEditorBtnRef.current) return;
              const drag = draggingEditorBtnRef.current;
              if (drag.mode === 'resize') {
                const deltaPx = (e.clientX - drag.startX + (e.clientY - drag.startY)) * 0.5;
                const nextScale = Math.round(Math.max(0.6, Math.min(1.65, drag.origScale + deltaPx / 90)) * 20) / 20;
                updateMobileControlElement(drag.id, { scale: nextScale });
                return;
              }
              const vw = Math.max(320, window.innerWidth);
              const vh = Math.max(240, window.innerHeight);
              const dxPct = ((e.clientX - drag.startX) / vw) * 100;
              const dyPct = ((e.clientY - drag.startY) / vh) * 100;
              updateMobileControlElement(drag.id, {
                xPct: Math.round((drag.origXPct + dxPct) * 2) / 2,
                yPct: Math.round((drag.origYPct + dyPct) * 2) / 2,
              });
            }}
            onPointerUp={() => {
              draggingEditorBtnRef.current = null;
            }}
            onPointerCancel={() => {
              draggingEditorBtnRef.current = null;
            }}
            className={`fixed inset-0 z-40 ${
              showMobileLayoutEditor ? 'pointer-events-auto bg-neutral-950/55' : 'pointer-events-none'
            }`}
          >
            {/* Interactive Mobile Layout Editor Grid + Inspector Bar */}
            {showMobileLayoutEditor && (
              <>
                {/* Subtle Alignment Grid Lines */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-25"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)',
                    backgroundSize: '5% 5%',
                  }}
                />
                {/* Center Vertical & Horizontal Axis Guides */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-orange-500/35 pointer-events-none" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-orange-500/25 pointer-events-none" />

                {/* Floating Editor Control Panel (Compact Top Bar for 390px Landscape) */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-[96vw] max-w-4xl bg-[#0c0c0f]/95 border border-white/20 rounded-xl px-3 py-1.5 shadow-2xl flex flex-col gap-1.5 pointer-events-auto z-30">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-orange-500 text-neutral-950 font-mono-tabular font-extrabold text-[9px] uppercase">
                        LAYOUT EDITOR
                      </span>
                      <span className="text-[11px] font-display font-bold text-white uppercase tracking-wider">
                        Drag Wheel/Buttons to Move · Drag Corner (↘) or Sliders to Resize
                      </span>
                      <span className="hidden sm:inline text-[10px] font-mono-tabular text-orange-400 font-bold">
                        [{activeMobileProfile.name.split('·')[0]?.trim()}]
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Steering Mode Switcher (Wheel / Buttons / Tilt) */}
                      <div className="flex items-center bg-neutral-900 border border-white/12 rounded-md p-0.5">
                        {(
                          [
                            { id: 'wheel', label: 'Wheel' },
                            { id: 'buttons', label: 'Buttons' },
                            { id: 'tilt', label: 'Tilt' },
                          ] as const
                        ).map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(520);
                              updateActiveMobileProfileSteeringType(st.id);
                              if (st.id === 'wheel') setSelectedEditorBtn('steer_wheel');
                              if (st.id === 'buttons') setSelectedEditorBtn('steer_left');
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-bold uppercase cursor-pointer ${
                              activeMobileProfile.steeringType === st.id
                                ? 'bg-orange-500 text-neutral-950'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => resetActiveMobileProfile()}
                        className="px-2 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-[9px] font-mono-tabular font-bold text-neutral-300 uppercase cursor-pointer"
                      >
                        ↺ Reset
                      </button>
                      <button
                        type="button"
                        data-testid="save-mobile-layout-button"
                        onClick={() => {
                          soundEngine.playUiChime(640);
                          setShowMobileLayoutEditor(false);
                        }}
                        className="px-2.5 py-1 rounded-md bg-orange-500 hover:bg-orange-400 text-neutral-950 text-[10px] font-display font-extrabold uppercase tracking-wider cursor-pointer"
                      >
                        ✓ Save &amp; Done
                      </button>
                    </div>
                  </div>

                  {/* Profile Switcher + Selected Control Selector */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono-tabular uppercase text-neutral-400 shrink-0">
                        Profile:
                      </span>
                      {(gameSettings.mobileLayouts ?? createDefaultMobileLayouts()).map((prof) => {
                        const active = prof.id === activeMobileProfile.id;
                        return (
                          <button
                            key={prof.id}
                            type="button"
                            onClick={() => {
                              soundEngine.playUiChime(520);
                              onUpdateSettings?.({
                                activeMobileLayoutId: prof.id,
                                mobileLeftHanded: prof.id === 'default_left',
                              });
                            }}
                            className={`px-2 py-0.5 rounded border text-[9px] font-mono-tabular font-bold truncate cursor-pointer ${
                              active
                                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                : 'bg-neutral-900 border-white/12 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {prof.name.split('·')[0]?.trim() || prof.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto">
                      <span className="text-[9px] font-mono-tabular uppercase text-neutral-400 shrink-0">
                        Control:
                      </span>
                      {(
                        [
                          { id: 'steer_wheel', label: 'WHEEL' },
                          { id: 'throttle', label: 'GAS' },
                          { id: 'brake', label: 'BRAKE' },
                          { id: 'handbrake', label: 'HBK' },
                          { id: 'nitro', label: 'N2O' },
                          { id: 'gear_up', label: 'G+' },
                          { id: 'gear_down', label: 'G-' },
                          { id: 'camera', label: 'CAM' },
                          { id: 'steer_left', label: 'LEFT' },
                          { id: 'steer_right', label: 'RIGHT' },
                        ] as { id: MobileControlId; label: string }[]
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playUiChime(500);
                            setSelectedEditorBtn(b.id);
                          }}
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-mono-tabular font-bold cursor-pointer shrink-0 ${
                            selectedEditorBtn === b.id
                              ? 'bg-orange-500 text-neutral-950 border-orange-400'
                              : 'bg-neutral-900 border-white/12 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selected Element Property Sliders (Size, Opacity, Rotation, Sensitivity, Visibility & Coords) */}
                  {(() => {
                    const selCfg = activeMobileProfile.elements[selectedEditorBtn];
                    if (!selCfg) return null;
                    const isVisible = selCfg.visible !== false;
                    return (
                      <div className="grid grid-cols-5 gap-2 pt-1 border-t border-white/10 items-center">
                        <div className="flex flex-col">
                          <div className="flex justify-between text-[9px] font-mono-tabular">
                            <span className="text-neutral-400">Size</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round(selCfg.scale * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.6}
                            max={1.65}
                            step={0.05}
                            aria-label="Selected Button Scale"
                            value={selCfg.scale}
                            onChange={(e) =>
                              updateMobileControlElement(selectedEditorBtn, {
                                scale: parseFloat(e.target.value),
                              })
                            }
                            className="w-full h-1.5 accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex justify-between text-[9px] font-mono-tabular">
                            <span className="text-neutral-400">Opacity</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round(selCfg.opacity * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.2}
                            max={0.95}
                            step={0.02}
                            aria-label="Selected Button Opacity"
                            value={selCfg.opacity}
                            onChange={(e) =>
                              updateMobileControlElement(selectedEditorBtn, {
                                opacity: parseFloat(e.target.value),
                              })
                            }
                            className="w-full h-1.5 accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex justify-between text-[9px] font-mono-tabular">
                            <span className="text-neutral-400">Rotation</span>
                            <span className="text-orange-400 font-bold">{selCfg.rotationDeg}°</span>
                          </div>
                          <input
                            type="range"
                            min={-45}
                            max={45}
                            step={1}
                            aria-label="Selected Button Rotation"
                            value={selCfg.rotationDeg}
                            onChange={(e) =>
                              updateMobileControlElement(selectedEditorBtn, {
                                rotationDeg: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full h-1.5 accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex justify-between text-[9px] font-mono-tabular">
                            <span className="text-neutral-400">Sensitivity</span>
                            <span className="text-orange-400 font-bold">
                              {Math.round((selCfg.sensitivity ?? 1.0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={2.0}
                            step={0.05}
                            aria-label="Selected Button Sensitivity"
                            value={selCfg.sensitivity ?? 1.0}
                            onChange={(e) =>
                              updateMobileControlElement(selectedEditorBtn, {
                                sensitivity: parseFloat(e.target.value),
                              })
                            }
                            className="w-full h-1.5 accent-orange-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-1.5 bg-neutral-900/90 border border-white/10 rounded-md px-2 py-1 text-[9px] font-mono-tabular">
                          <span className="text-neutral-300 truncate">
                            X:{selCfg.xPct.toFixed(0)}% Y:{selCfg.yPct.toFixed(0)}%
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateMobileControlElement(selectedEditorBtn, {
                                visible: !isVisible,
                              })
                            }
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono-tabular font-bold uppercase cursor-pointer shrink-0 ${
                              isVisible
                                ? 'bg-orange-500 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {isVisible ? 'SHOW' : 'HIDE'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* Render All 10 Individual Translucent Mobile Control Elements (Including Analog Steering Wheel) */}
            {(
              [
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
              ] as MobileControlId[]
            ).map((btnId) => {
              const cfg = activeMobileProfile.elements[btnId];
              if (!cfg) return null;

              // Respect element visibility when not in Layout Editor
              if (!showMobileLayoutEditor && cfg.visible === false) {
                return null;
              }

              // During live gameplay:
              // - In 'mobile_wheel' mode, show 'steer_wheel' and hide 'steer_left'/'steer_right'
              // - In 'mobile_buttons' mode, show 'steer_left'/'steer_right' and hide 'steer_wheel'
              // - In 'mobile_tilt' mode, show tilt indicator on 'steer_wheel' and hide 'steer_left'/'steer_right'
              if (!showMobileLayoutEditor) {
                if (
                  effectiveControlScheme === 'mobile_wheel' &&
                  (btnId === 'steer_left' || btnId === 'steer_right')
                ) {
                  return null;
                }
                if (effectiveControlScheme === 'mobile_buttons' && btnId === 'steer_wheel') {
                  return null;
                }
                if (
                  effectiveControlScheme === 'mobile_tilt' &&
                  (btnId === 'steer_left' || btnId === 'steer_right')
                ) {
                  return null;
                }
              } else {
                // Inside Layout Editor: hide Left/Right buttons if profile steeringType is 'wheel' unless user selected them
                if (
                  activeMobileProfile.steeringType === 'wheel' &&
                  (btnId === 'steer_left' || btnId === 'steer_right') &&
                  selectedEditorBtn !== btnId
                ) {
                  return null;
                }
                if (
                  activeMobileProfile.steeringType === 'buttons' &&
                  btnId === 'steer_wheel' &&
                  selectedEditorBtn !== 'steer_wheel'
                ) {
                  return null;
                }
              }

              const isSelectedInEditor = showMobileLayoutEditor && selectedEditorBtn === btnId;
              const combinedScale = cfg.scale * (gameSettings.mobileButtonScale ?? 1.0);
              const baseOpacity = Math.max(
                0.18,
                Math.min(0.95, cfg.opacity * (gameSettings.mobileButtonOpacity ?? 0.85))
              );

              const handleEditorPointerDown = (e: React.PointerEvent<HTMLElement>) => {
                if (!showMobileLayoutEditor) return false;
                e.stopPropagation();
                setSelectedEditorBtn(btnId);
                draggingEditorBtnRef.current = {
                  id: btnId,
                  mode: 'move',
                  startX: e.clientX,
                  startY: e.clientY,
                  origXPct: cfg.xPct,
                  origYPct: cfg.yPct,
                  origScale: cfg.scale,
                };
                return true;
              };

              const renderResizeHandle = () => {
                if (!showMobileLayoutEditor) return null;
                return (
                  <span
                    role="button"
                    aria-label={`Resize ${btnId}`}
                    title="Drag corner to resize"
                    data-testid={`mobile-resize-${btnId}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedEditorBtn(btnId);
                      draggingEditorBtnRef.current = {
                        id: btnId,
                        mode: 'resize',
                        startX: e.clientX,
                        startY: e.clientY,
                        origXPct: cfg.xPct,
                        origYPct: cfg.yPct,
                        origScale: cfg.scale,
                      };
                    }}
                    className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono-tabular font-extrabold cursor-nwse-resize select-none shadow-md z-20 ${
                      isSelectedInEditor
                        ? 'bg-orange-500 text-neutral-950 border-white'
                        : 'bg-neutral-900/95 text-orange-400 border-orange-500/60'
                    }`}
                  >
                    ↘
                  </span>
                );
              };

              const wrapperStyle: React.CSSProperties = {
                left: `${cfg.xPct}%`,
                top: `${cfg.yPct}%`,
                transform: `translate(-50%, -50%) scale(${combinedScale}) rotate(${cfg.rotationDeg}deg)`,
                backgroundColor: `rgba(14, 14, 18, ${baseOpacity})`,
              };

              const editorRingClass = isSelectedInEditor
                ? 'ring-2 ring-orange-500 border-orange-400 shadow-lg'
                : showMobileLayoutEditor
                  ? 'border-dashed border-white/45 cursor-move'
                  : 'border-white/25';

              // 0. ANALOG STEERING WHEEL (Movable & Resizable in Editor + Multitouch Pointer Capture in Gameplay)
              if (btnId === 'steer_wheel') {
                if (!showMobileLayoutEditor && effectiveControlScheme === 'mobile_tilt') {
                  return (
                    <div
                      key={btnId}
                      style={wrapperStyle}
                      className="pointer-events-none absolute px-3 py-2 rounded-xl border border-white/20 flex flex-col items-center gap-1"
                    >
                      <span className="text-[9px] font-mono-tabular uppercase text-orange-400 font-bold">
                        TILT STEER ACTIVE
                      </span>
                      <span className="text-[10px] font-mono-tabular text-neutral-300">
                        {Math.round(wheelVisualDeg)}°
                      </span>
                    </div>
                  );
                }

                const elSens = cfg.sensitivity ?? 1.0;
                return (
                  <div
                    key={btnId}
                    data-testid="mobile-editor-el-steer_wheel"
                    role="slider"
                    aria-label="Virtual Steering Wheel"
                    aria-valuemin={-100}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(wheelVisualDeg)}
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      wheelDragOriginRef.current = {
                        cx: rect.left + rect.width / 2,
                        cy: rect.top + rect.height / 2,
                      };
                      wheelPointerIdRef.current = e.pointerId;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const dx = e.clientX - wheelDragOriginRef.current.cx;
                      const clampedNorm = Math.max(
                        -1,
                        Math.min(1, (dx / Math.max(36, 56 * combinedScale)) * elSens)
                      );
                      setWheelVisualDeg(clampedNorm * 105);
                      virtualInputRef.current.analogSteer = -clampedNorm;
                    }}
                    onPointerMove={(e) => {
                      if (showMobileLayoutEditor) return;
                      if (
                        wheelPointerIdRef.current !== null &&
                        e.pointerId !== wheelPointerIdRef.current
                      ) {
                        return;
                      }
                      if (!wheelDragOriginRef.current) return;
                      const dx = e.clientX - wheelDragOriginRef.current.cx;
                      const clampedNorm = Math.max(
                        -1,
                        Math.min(1, (dx / Math.max(36, 56 * combinedScale)) * elSens)
                      );
                      setWheelVisualDeg(clampedNorm * 105);
                      virtualInputRef.current.analogSteer = -clampedNorm;
                    }}
                    onPointerUp={(e) => {
                      if (showMobileLayoutEditor) return;
                      if (
                        wheelPointerIdRef.current !== null &&
                        e.pointerId !== wheelPointerIdRef.current
                      ) {
                        return;
                      }
                      wheelPointerIdRef.current = null;
                      wheelDragOriginRef.current = null;
                      setWheelVisualDeg(0);
                      virtualInputRef.current.analogSteer = 0;
                    }}
                    onPointerCancel={(e) => {
                      if (
                        wheelPointerIdRef.current !== null &&
                        e.pointerId !== wheelPointerIdRef.current
                      ) {
                        return;
                      }
                      wheelPointerIdRef.current = null;
                      wheelDragOriginRef.current = null;
                      setWheelVisualDeg(0);
                      virtualInputRef.current.analogSteer = 0;
                    }}
                    className={`pointer-events-auto absolute w-32 h-32 rounded-full border flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none shadow-2xl ${editorRingClass}`}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      className="w-28 h-28 transition-transform duration-75 pointer-events-none"
                      style={{ transform: `rotate(${wheelVisualDeg}deg)` }}
                    >
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e5e5" strokeWidth="7.5" />
                      <rect x="47" y="8" width="6" height="9.5" rx="1.5" fill="#f97316" />
                      <line x1="12" y1="50" x2="88" y2="50" stroke="#a3a3a3" strokeWidth="6" />
                      <line x1="50" y1="50" x2="50" y2="90" stroke="#a3a3a3" strokeWidth="6" />
                      <circle cx="50" cy="50" r="11.5" fill="#09090b" stroke="#d4d4d8" strokeWidth="2" />
                    </svg>
                    {showMobileLayoutEditor && (
                      <span className="absolute -top-5 px-1.5 py-0.5 rounded bg-neutral-950/90 border border-white/15 text-[9px] font-mono-tabular font-bold text-orange-400 pointer-events-none whitespace-nowrap">
                        STEER WHEEL ({Math.round(cfg.scale * 100)}%)
                      </span>
                    )}
                    {renderResizeHandle()}
                  </div>
                );
              }

              // 1. STEER LEFT
              if (btnId === 'steer_left') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Steer Left"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.left = true;
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.left = false;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.left = false;
                    }}
                    className={`pointer-events-auto absolute w-16 h-16 rounded-full border flex items-center justify-center text-neutral-100 active:bg-white/30 active:border-orange-500 select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current pointer-events-none">
                      <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
                    </svg>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 2. STEER RIGHT
              if (btnId === 'steer_right') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Steer Right"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.right = true;
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.right = false;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.right = false;
                    }}
                    className={`pointer-events-auto absolute w-16 h-16 rounded-full border flex items-center justify-center text-neutral-100 active:bg-white/30 active:border-orange-500 select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current pointer-events-none">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                    </svg>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 3. HANDBRAKE
              if (btnId === 'handbrake') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Handbrake"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.handbrake = true;
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.handbrake = false;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.handbrake = false;
                    }}
                    className={`pointer-events-auto absolute w-14 h-14 rounded-full border flex flex-col items-center justify-center text-neutral-100 active:bg-orange-500 active:text-neutral-950 select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <span className="text-xs font-mono-tabular font-extrabold pointer-events-none">(P)</span>
                    <span className="text-[8px] font-mono-tabular text-neutral-300 pointer-events-none">HBK</span>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 4. NITRO (N2O)
              if (btnId === 'nitro') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Nitrous"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.nitro = true;
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.nitro = false;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.nitro = false;
                    }}
                    className={`pointer-events-auto absolute w-13 h-13 rounded-full border flex flex-col items-center justify-center text-neutral-100 active:bg-orange-500 active:text-neutral-950 select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <span className="text-[10px] font-mono-tabular font-extrabold tracking-tight pointer-events-none">
                      N2O
                    </span>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 5. THROTTLE (GAS PEDAL)
              if (btnId === 'throttle') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Gas Pedal"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.forward = true;
                      virtualInputRef.current.analogThrottle = Math.min(1, cfg.sensitivity ?? 1.0);
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.forward = false;
                      virtualInputRef.current.analogThrottle = 0;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.forward = false;
                      virtualInputRef.current.analogThrottle = 0;
                    }}
                    className={`pointer-events-auto absolute w-16 h-30 rounded-2xl border flex flex-col items-center justify-between py-3 text-neutral-100 active:bg-orange-500/85 active:border-orange-300 active:text-neutral-950 select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <div className="w-8 flex flex-col gap-1.5 opacity-60 pointer-events-none">
                      <div className="h-1 rounded bg-current" />
                      <div className="h-1 rounded bg-current" />
                      <div className="h-1 rounded bg-current" />
                      <div className="h-1 rounded bg-current" />
                    </div>
                    <span className="text-[11px] font-mono-tabular font-bold tracking-wider pointer-events-none">
                      GAS
                    </span>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 6. BRAKE PEDAL
              if (btnId === 'brake') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Brake Pedal"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      virtualInputRef.current.backward = true;
                      virtualInputRef.current.analogBrake = Math.min(1, cfg.sensitivity ?? 1.0);
                    }}
                    onPointerUp={() => {
                      virtualInputRef.current.backward = false;
                      virtualInputRef.current.analogBrake = 0;
                    }}
                    onPointerCancel={() => {
                      virtualInputRef.current.backward = false;
                      virtualInputRef.current.analogBrake = 0;
                    }}
                    className={`pointer-events-auto absolute w-15 h-22 rounded-2xl border flex flex-col items-center justify-between py-2.5 text-neutral-200 active:bg-red-600/80 active:border-red-400 active:text-white select-none touch-none shadow-xl ${editorRingClass}`}
                  >
                    <div className="w-8 flex flex-col gap-1 opacity-60 pointer-events-none">
                      <div className="h-1 rounded bg-current" />
                      <div className="h-1 rounded bg-current" />
                      <div className="h-1 rounded bg-current" />
                    </div>
                    <span className="text-[10px] font-mono-tabular font-bold tracking-wider pointer-events-none">
                      BRAKE
                    </span>
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 7. GEAR UP (G+)
              if (btnId === 'gear_up') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Gear Up"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      virtualInputRef.current.shiftUp = true;
                    }}
                    className={`pointer-events-auto absolute px-3.5 py-2 rounded-xl border text-xs font-mono-tabular font-bold text-neutral-100 active:bg-white/30 select-none touch-none shadow-lg ${editorRingClass}`}
                  >
                    G+
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 8. GEAR DOWN (G-)
              if (btnId === 'gear_down') {
                return (
                  <button
                    key={btnId}
                    type="button"
                    aria-label="Touch Gear Down"
                    style={wrapperStyle}
                    onPointerDown={(e) => {
                      if (handleEditorPointerDown(e)) return;
                      virtualInputRef.current.shiftDown = true;
                    }}
                    className={`pointer-events-auto absolute px-3.5 py-2 rounded-xl border text-xs font-mono-tabular font-bold text-neutral-100 active:bg-white/30 select-none touch-none shadow-lg ${editorRingClass}`}
                  >
                    G-
                    {renderResizeHandle()}
                  </button>
                );
              }

              // 9. CAMERA SWITCH (CAM)
              return (
                <button
                  key={btnId}
                  type="button"
                  aria-label="Touch Camera Switch"
                  style={wrapperStyle}
                  onPointerDown={(e) => {
                    if (handleEditorPointerDown(e)) return;
                    soundEngine.playUiChime(540);
                    onCycleCamera();
                  }}
                  className={`pointer-events-auto absolute px-3 py-1.5 rounded-xl border text-[10px] font-mono-tabular font-bold text-neutral-200 active:bg-white/30 select-none touch-none shadow-lg ${editorRingClass}`}
                >
                  CAM
                  {renderResizeHandle()}
                </button>
              );
            })}
          </div>
        )}

      {/* BOTTOM PERIMETER (Unobstructed driving view with minimal HUD toggle pill) */}
      <div
        className={
          photoModeState.active || replayState.active
            ? 'hidden'
            : 'flex items-end justify-center w-full'
        }
      >
        <div className="pointer-events-auto flex items-center gap-2 mb-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setHudCollapsed((prev) => !prev);
            }}
            className="px-2.5 py-1 rounded-lg bg-neutral-950/80 border border-white/12 text-[10px] font-mono-tabular text-neutral-400 hover:text-white cursor-pointer whitespace-nowrap"
          >
            {hudCollapsed ? '▴ Show HUD' : '▾ Minimal View'}
          </button>
        </div>
      </div>

      {renderSharedModals()}

      {/* ---------------------------------------------------------------------------
          5. PAUSE MODAL CARD (Triggered by Esc or P)
         --------------------------------------------------------------------------- */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto bg-zinc-950/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono-tabular text-zinc-400">
                  {mapDef.japaneseTitle} · {selectedVehicle.manufacturer} {selectedVehicle.name}
                </div>
                <h2
                  id="pause-modal-title"
                  className="text-2xl font-display font-bold text-zinc-100 tracking-wide"
                >
                  SESSION PAUSED
                </h2>
              </div>
              <span className="text-xs font-mono-tabular text-zinc-400">ESC / P</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">TOTAL SCORE</div>
                <div className="text-base font-mono-tabular font-bold text-amber-400 mt-0.5">
                  {pauseSnapshot.totalScore.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">BEST COMBO</div>
                <div className="text-base font-mono-tabular font-bold text-orange-400 mt-0.5">
                  {pauseSnapshot.bestChain.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">MAX DRIFT ANGLE</div>
                <div className="text-base font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {pauseSnapshot.maxDriftAngle}°
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">DRIFT DURATION</div>
                <div className="text-base font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {pauseSnapshot.driftDurationSec}s
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">SMOOTHNESS</div>
                <div className="text-base font-mono-tabular font-bold text-emerald-400 mt-0.5">
                  {pauseSnapshot.smoothnessPct}%
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">CONSISTENCY</div>
                <div className="text-base font-mono-tabular font-bold text-emerald-400 mt-0.5">
                  {pauseSnapshot.consistencyPct}%
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">DISTANCE</div>
                <div className="text-base font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {pauseSnapshot.distanceKm} km
                </div>
              </div>
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] font-mono-tabular text-zinc-400">MAX SPEED</div>
                <div className="text-base font-mono-tabular font-bold text-zinc-100 mt-0.5">
                  {pauseSnapshot.maxSpeed} km/h
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5">
              <span className="text-xs font-mono-tabular text-zinc-400">GRAPHICS PRESET</span>
              <div className="flex items-center gap-1">
                {(['low', 'medium', 'high', 'ultra'] as GraphicsPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(540);
                      onSelectGraphicsPreset(preset);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono-tabular uppercase cursor-pointer ${
                      graphicsPreset === preset
                        ? 'bg-orange-500 text-zinc-950 font-bold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResumeGame}
                className={`w-full py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider cursor-pointer ${
                  mapId === 'mountain'
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                    : 'bg-orange-500 hover:bg-orange-400 text-stone-950'
                }`}
              >
                Resume Driving [Enter]
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onResumeGame();
                    onUpdateReplayState?.((prev) => ({ ...prev, active: false }));
                    onUpdatePhotoMode?.((prev) => ({ ...prev, active: true, hideHud: false }));
                  }}
                  className="py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  📷 Photo Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResumeGame();
                    onUpdatePhotoMode?.((prev) => ({ ...prev, active: false }));
                    onUpdateReplayState?.((prev) => ({ ...prev, active: true, playing: true }));
                  }}
                  className="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  🎬 Drift Replay
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(true);
                }}
                className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-100 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
              >
                ⚙️ Transmission, Audio &amp; Camera Settings
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenGarage();
                }}
                className="w-full py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
              >
                Open 3D Garage &amp; Switch Car [G]
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectMap(mapId === 'mountain' ? 'blossom' : 'mountain');
                  onResumeGame();
                }}
                className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 font-medium text-sm cursor-pointer"
              >
                Switch to {mapId === 'mountain' ? 'Map 2: Blossom Drift' : 'Map 1: Mountain Drift'}
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetCar();
                    onResumeGame();
                  }}
                  className="py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-sm cursor-pointer"
                >
                  Reset to Viewpoint
                </button>
                <button
                  type="button"
                  onClick={onReturnToTitle}
                  className="py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-sm cursor-pointer"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------------
          6. PROFESSIONAL PHOTO MODE OVERLAY
         --------------------------------------------------------------------------- */}
      {photoModeState.active && (
        <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 md:p-6">
          {/* Optical Aperture / Depth-of-Field Vignette Frame (Pure Radial Gradient, zero backdrop-blur) */}
          {photoModeState.dofBlur > 0.02 && (
            <div
              className="fixed inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${Math.round(
                  72 - photoModeState.dofBlur * 28
                )}%, rgba(6,9,15,${(photoModeState.dofBlur * 0.68).toFixed(2)}) 100%)`,
              }}
            />
          )}

          {photoModeState.hideHud ? (
            <div className="pointer-events-auto self-end">
              <button
                type="button"
                onClick={() =>
                  onUpdatePhotoMode?.((prev) => ({ ...prev, hideHud: false }))
                }
                className="px-3 py-1.5 rounded-xl bg-stone-950/85 border border-stone-700 text-xs font-mono-tabular text-stone-200 hover:text-white cursor-pointer"
              >
                📷 Show Photo Controls
              </button>
            </div>
          ) : (
            <>
              <div className="pointer-events-auto flex items-center justify-between bg-stone-950/92 border border-stone-800 rounded-2xl px-4 py-2.5 shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-display font-bold text-xs uppercase tracking-wider">
                    📷 PHOTO MODE STUDIO
                  </span>
                  <span className="text-xs text-stone-300 hidden sm:inline">
                    Drag on canvas to orbit 360° around {selectedVehicle.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePhotoMode?.((prev) => ({ ...prev, hideHud: true }))
                    }
                    className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-mono-tabular text-stone-200 cursor-pointer"
                  >
                    Hide UI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiChime(660);
                      onCaptureScreenshot?.();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Capture Screenshot (PNG)
                  </button>
                  <button
                    type="button"
                    aria-label="Exit Photo Mode"
                    onClick={() =>
                      onUpdatePhotoMode?.((prev) => ({ ...prev, active: false }))
                    }
                    className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-mono-tabular text-stone-200 cursor-pointer"
                  >
                    ✕ Exit
                  </button>
                </div>
              </div>

              <div className="pointer-events-auto self-end w-full max-w-md bg-stone-950/92 border border-stone-800 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
                {/* Camera Angle Presets */}
                <div>
                  <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-stone-400 mb-1.5">
                    CAMERA ANGLE PRESETS
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        {
                          id: 'front_34' as PhotoCameraPreset,
                          label: 'Front 3/4',
                          yaw: 0.58,
                          pitch: 0.06,
                          dist: 4.8,
                          height: 1.15,
                          fov: 42,
                        },
                        {
                          id: 'rear_34' as PhotoCameraPreset,
                          label: 'Rear 3/4',
                          yaw: 2.55,
                          pitch: 0.08,
                          dist: 5.0,
                          height: 1.22,
                          fov: 44,
                        },
                        {
                          id: 'side_profile' as PhotoCameraPreset,
                          label: 'Side Profile',
                          yaw: Math.PI * 0.5,
                          pitch: 0.02,
                          dist: 5.8,
                          height: 0.98,
                          fov: 38,
                        },
                        {
                          id: 'low_angle' as PhotoCameraPreset,
                          label: 'Low-Angle Hero',
                          yaw: 0.46,
                          pitch: -0.03,
                          dist: 4.1,
                          height: 0.52,
                          fov: 48,
                        },
                        {
                          id: 'wide_scenic' as PhotoCameraPreset,
                          label: 'Wide Environment',
                          yaw: 0.72,
                          pitch: 0.18,
                          dist: 9.2,
                          height: 2.35,
                          fov: 58,
                        },
                        {
                          id: 'free' as PhotoCameraPreset,
                          label: 'Free Orbit',
                          yaw: photoModeState.yawOffset,
                          pitch: photoModeState.pitchOffset,
                          dist: photoModeState.distance,
                          height: photoModeState.height,
                          fov: photoModeState.fov,
                        },
                      ]
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiChime(520);
                          onUpdatePhotoMode?.((prev) => ({
                            ...prev,
                            preset: preset.id,
                            yawOffset: preset.yaw,
                            pitchOffset: preset.pitch,
                            distance: preset.dist,
                            height: preset.height,
                            fov: preset.fov,
                          }));
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular cursor-pointer ${
                          photoModeState.preset === preset.id
                            ? 'bg-amber-500 text-stone-950 font-bold'
                            : 'bg-stone-900 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders for Distance, Height, FOV, Exposure, Aperture */}
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    {
                      label: 'Distance',
                      val: photoModeState.distance,
                      min: 2.8,
                      max: 14.0,
                      step: 0.2,
                      unit: 'm',
                      key: 'distance' as const,
                    },
                    {
                      label: 'Camera Height',
                      val: photoModeState.height,
                      min: 0.35,
                      max: 5.5,
                      step: 0.1,
                      unit: 'm',
                      key: 'height' as const,
                    },
                    {
                      label: 'Field of View',
                      val: photoModeState.fov,
                      min: 24,
                      max: 85,
                      step: 1,
                      unit: '°',
                      key: 'fov' as const,
                    },
                    {
                      label: 'Exposure',
                      val: photoModeState.exposure,
                      min: 0.55,
                      max: 1.85,
                      step: 0.05,
                      unit: 'EV',
                      key: 'exposure' as const,
                    },
                    {
                      label: 'Orbit Angle',
                      val: photoModeState.yawOffset,
                      min: -3.14,
                      max: 3.14,
                      step: 0.08,
                      unit: 'rad',
                      key: 'yawOffset' as const,
                    },
                    {
                      label: 'DOF Vignette',
                      val: photoModeState.dofBlur,
                      min: 0,
                      max: 1,
                      step: 0.05,
                      unit: '',
                      key: 'dofBlur' as const,
                    },
                  ].map((s) => (
                    <div key={s.key} className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-stone-400">{s.label}</span>
                        <span className="font-mono-tabular text-stone-200">
                          {s.val.toFixed(s.step < 1 ? 2 : 0)}
                          {s.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={s.val}
                        onChange={(e) =>
                          onUpdatePhotoMode?.((prev) => ({
                            ...prev,
                            preset: 'free',
                            [s.key]: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                {/* Time of Day Lighting Selector inside Photo Mode */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-800">
                  <span className="text-[11px] font-mono-tabular uppercase text-stone-400">
                    Lighting
                  </span>
                  <div className="flex items-center gap-1">
                    {(['morning', 'afternoon', 'golden_hour', 'sunset', 'night'] as TimeOfDay[]).map(
                      (tod) => (
                        <button
                          key={tod}
                          type="button"
                          onClick={() => onSelectTimeOfDay?.(tod)}
                          className={`px-2 py-1 rounded text-[10px] font-mono-tabular uppercase cursor-pointer ${
                            timeOfDay === tod
                              ? 'bg-orange-500 text-stone-950 font-bold'
                              : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {tod === 'golden_hour' ? 'Golden' : tod}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------------
          7. CINEMATIC DRIFT REPLAY CONTROL BAR
         --------------------------------------------------------------------------- */}
      {replayState.active && (
        <div className="fixed inset-x-0 bottom-4 z-30 pointer-events-none flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-3xl bg-stone-950/94 border border-stone-800 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-orange-500 text-stone-950 font-display font-bold text-xs uppercase tracking-wider">
                  🎬 DRIFT REPLAY
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateReplayState?.((prev) => ({ ...prev, playing: !prev.playing }))
                  }
                  className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono-tabular font-bold text-stone-100 cursor-pointer"
                >
                  {replayState.playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <div className="inline-flex p-0.5 rounded-lg bg-stone-900 border border-stone-800">
                  {([0.25, 0.5, 1.0] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() =>
                        onUpdateReplayState?.((prev) => ({ ...prev, playbackSpeed: spd }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular cursor-pointer ${
                        replayState.playbackSpeed === spd
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Replay Camera Angle Selector */}
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'chase' as ReplayCameraMode, label: 'Chase' },
                    { id: 'side_tracking' as ReplayCameraMode, label: 'Side Drift' },
                    { id: 'rear_tracking' as ReplayCameraMode, label: 'Rear Track' },
                    { id: 'front_tracking' as ReplayCameraMode, label: 'Front 3/4' },
                    { id: 'wide_cinematic' as ReplayCameraMode, label: 'Wide Drone' },
                  ]
                ).map((rc) => (
                  <button
                    key={rc.id}
                    type="button"
                    onClick={() =>
                      onUpdateReplayState?.((prev) => ({ ...prev, cameraMode: rc.id }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-tabular cursor-pointer ${
                      replayState.cameraMode === rc.id
                        ? 'bg-orange-500 text-stone-950 font-bold'
                        : 'bg-stone-900 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {rc.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateReplayState?.((prev) => ({ ...prev, active: false, playing: false }));
                    onUpdatePhotoMode?.((prev) => ({ ...prev, active: true, hideHud: false }));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-mono-tabular cursor-pointer"
                >
                  📷 Photo Here
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateReplayState?.((prev) => ({ ...prev, active: false }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-mono-tabular cursor-pointer"
                >
                  ✕ Resume Driving
                </button>
              </div>
            </div>

            {/* Timeline Scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono-tabular text-stone-400 w-16">
                {((replayState.currentFrame || 0) / 60).toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, replayState.totalFrames - 1)}
                step={1}
                value={replayState.currentFrame}
                onChange={(e) =>
                  onUpdateReplayState?.((prev) => ({
                    ...prev,
                    playing: false,
                    currentFrame: parseInt(e.target.value, 10),
                  }))
                }
                className="flex-1 accent-orange-500 cursor-pointer"
              />
              <span className="text-[11px] font-mono-tabular text-stone-400 w-16 text-right">
                {(Math.max(1, replayState.totalFrames) / 60).toFixed(1)}s
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
