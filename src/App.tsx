/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DriftCanvas, GarageDynoLiveState } from './components/DriftCanvas';
import { GameHUD, TelemetryHandles } from './components/GameHUD';
import { multiplayerClient } from './game/multiplayerClient';
import { soundEngine } from './game/sound';
import {
  CameraMode,
  CarInput,
  CarState,
  createDefaultMobileLayouts,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_PHOTO_MODE_STATE,
  GarageCameraView,
  GameSettings,
  GameState,
  GraphicsPreset,
  MapId,
  PhotoModeState,
  ReplayState,
  TimeOfDay,
  VehicleCustomization,
} from './game/types';
import { getVehicleById, VEHICLES_CATALOG } from './game/vehiclesData';

const SETTINGS_STORAGE_KEY = 'touge_game_settings_v2';

const CAMERA_MODES: CameraMode[] = [
  'chase',
  'close',
  'hood',
  'cockpit',
  'side_drift',
  'wide',
  'orbit',
];

function createDefaultCustomization(vehicleId: string): VehicleCustomization {
  const spec = getVehicleById(vehicleId);
  return { ...spec.defaultCustomization };
}

export default function App() {
  const [mapId, setMapId] = useState<MapId>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('map') === 'blossom') return 'blossom';
    }
    return 'mountain';
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const carParam = params.get('car');
      if (carParam && VEHICLES_CATALOG.some((v) => v.id === carParam)) {
        return carParam;
      }
    }
    return 'r34_gtr';
  });

  const [customizations, setCustomizations] = useState<Record<string, VehicleCustomization>>(() => {
    const initial: Record<string, VehicleCustomization> = {};
    for (const v of VEHICLES_CATALOG) {
      initial[v.id] = { ...v.defaultCustomization };
    }
    return initial;
  });

  const [gameState, setGameState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('garage') === '1' || params.get('sheet') === '1' || params.get('dyno') === '1') {
        document.body.dataset.state = 'garage';
        return 'garage';
      }
      if (params.get('autostart') === '1') {
        document.body.dataset.state = 'playing';
        return 'playing';
      }
    }
    document.body.dataset.state = 'title';
    return 'title';
  });

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tod = params.get('tod') as TimeOfDay | null;
      if (tod && ['morning', 'afternoon', 'golden_hour', 'sunset', 'night', 'day'].includes(tod)) {
        return tod;
      }
    }
    return 'afternoon';
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [graphicsPreset, setGraphicsPreset] = useState<GraphicsPreset>('ultra');
  const [activeViewpointIdx, setActiveViewpointIdx] = useState<number>(0);
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [photoModeState, setPhotoModeState] = useState<PhotoModeState>(DEFAULT_PHOTO_MODE_STATE);
  const [captureScreenshotTrigger, setCaptureScreenshotTrigger] = useState<number>(0);
  const [replayState, setReplayState] = useState<ReplayState>({
    active: false,
    playing: true,
    playbackSpeed: 1.0,
    cameraMode: 'chase',
    currentFrame: 0,
    totalFrames: 0,
  });

  const [gameSettings, setGameSettings] = useState<GameSettings>(() => {
    let saved: Partial<GameSettings> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          saved = JSON.parse(raw) as Partial<GameSettings>;
        }
      } catch {
        // Ignore invalid localStorage payload
      }
    }

    let initHandling = saved.handlingMode ?? DEFAULT_GAME_SETTINGS.handlingMode;
    let initWeather = saved.weather ?? DEFAULT_GAME_SETTINGS.weather;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      if (
        modeParam === 'race' ||
        modeParam === 'drift' ||
        modeParam === 'performance' ||
        modeParam === 'street' ||
        modeParam === 'grip'
      ) {
        initHandling = modeParam;
      }
      const weatherParam = params.get('weather');
      if (
        weatherParam === 'clear' ||
        weatherParam === 'cloudy' ||
        weatherParam === 'light_rain' ||
        weatherParam === 'heavy_rain' ||
        weatherParam === 'foggy'
      ) {
        initWeather = weatherParam;
      }
    }
    const defaultLayouts = createDefaultMobileLayouts();
    const mergedLayouts =
      Array.isArray(saved.mobileLayouts) && saved.mobileLayouts.length >= 3
        ? saved.mobileLayouts
        : defaultLayouts;

    return {
      ...DEFAULT_GAME_SETTINGS,
      ...saved,
      handlingMode: initHandling,
      weather: initWeather,
      camera: { ...DEFAULT_CAMERA_SETTINGS, ...(saved.camera ?? {}) },
      keyBindings: { ...DEFAULT_KEY_BINDINGS, ...(saved.keyBindings ?? {}) },
      mobileLayouts: mergedLayouts,
    };
  });

  // Garage showroom specific states
  const [garageCameraView, setGarageCameraView] = useState<GarageCameraView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sheet') === '1') return 'sheet';
      if (params.get('dyno') === '1') return 'dyno';
    }
    return 'turntable';
  });
  const [garageLightsOn, setGarageLightsOn] = useState<boolean>(true);
  const [garageRevCounter, setGarageRevCounter] = useState<number>(0);
  const [garageDynoState, setGarageDynoState] = useState<GarageDynoLiveState>({
    active: false,
    rpm: 900,
    throttle: 0,
    gear: 4,
    speedKmh: 0,
    boostBar: -0.45,
    backfireActive: false,
  });

  const virtualInputRef = useRef<Partial<CarInput>>({});
  const telemetryHandlesRef = useRef<TelemetryHandles | null>(null);

  const selectedVehicle = useMemo(() => getVehicleById(selectedVehicleId), [selectedVehicleId]);
  const activeCustomization = useMemo(
    () => customizations[selectedVehicleId] ?? createDefaultCustomization(selectedVehicleId),
    [customizations, selectedVehicleId]
  );

  useEffect(() => {
    document.body.dataset.state = gameState;
    document.body.dataset.map = mapId;
    document.body.dataset.car = selectedVehicleId;
    document.body.dataset.tod = timeOfDay;
    document.body.dataset.mode = gameSettings.handlingMode;
    document.body.dataset.weather = gameSettings.weather;
  }, [gameState, mapId, selectedVehicleId, timeOfDay, gameSettings.handlingMode, gameSettings.weather]);

  useEffect(() => {
    soundEngine.setAudioSettings(gameSettings);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [gameSettings]);

  const handleUpdateSettings = useCallback((patch: Partial<GameSettings>) => {
    if (
      patch.graphicsPreset &&
      patch.graphicsPreset !== 'custom' &&
      ['low', 'medium', 'high', 'ultra'].includes(patch.graphicsPreset)
    ) {
      setGraphicsPreset(patch.graphicsPreset as GraphicsPreset);
    }
    setGameSettings((prev) => ({
      ...prev,
      ...patch,
      camera: patch.camera ? { ...prev.camera, ...patch.camera } : prev.camera,
      keyBindings: patch.keyBindings ? { ...prev.keyBindings, ...patch.keyBindings } : prev.keyBindings,
    }));
  }, []);

  const handleResetCameraSettings = useCallback(() => {
    setGameSettings((prev) => ({
      ...prev,
      camera: { ...DEFAULT_CAMERA_SETTINGS },
    }));
  }, []);

  const handleTelemetryTick = useCallback((cs: CarState) => {
    telemetryHandlesRef.current?.updateTelemetry(cs);
    (window as unknown as Record<string, unknown>).__gameState = {
      speedKmh: Math.round(cs.speedKmh),
      rpm: Math.round(cs.rpm),
      gear: cs.gear,
      driftAngle: Math.round(cs.driftAngle),
      isDrifting: cs.isDrifting,
      totalDriftScore: Math.round(cs.totalDriftScore),
      x: Number(cs.x.toFixed(1)),
      y: Number(cs.y.toFixed(2)),
      z: Number(cs.z.toFixed(1)),
    };
  }, []);

  const handleSelectMap = useCallback((id: MapId) => {
    setMapId(id);
    setActiveViewpointIdx(0);
    setPhotoModeState((prev) => ({ ...prev, active: false }));
    setReplayState((prev) => ({ ...prev, active: false }));
  }, []);

  const handleSelectVehicle = useCallback((id: string) => {
    setSelectedVehicleId(id);
  }, []);

  const handleUpdateCustomization = useCallback(
    (patch: Partial<VehicleCustomization>) => {
      setCustomizations((prev) => ({
        ...prev,
        [selectedVehicleId]: {
          ...(prev[selectedVehicleId] ?? createDefaultCustomization(selectedVehicleId)),
          ...patch,
        },
      }));
    },
    [selectedVehicleId]
  );

  const handleResetCustomization = useCallback(() => {
    setCustomizations((prev) => ({
      ...prev,
      [selectedVehicleId]: createDefaultCustomization(selectedVehicleId),
    }));
  }, [selectedVehicleId]);

  const TIME_CYCLE_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'golden_hour', 'sunset', 'night'];

  const handleToggleTimeOfDay = useCallback(() => {
    setTimeOfDay((prev) => {
      const normalized: TimeOfDay = prev === 'day' ? 'afternoon' : prev;
      const idx = TIME_CYCLE_ORDER.indexOf(normalized);
      return TIME_CYCLE_ORDER[(idx + 1) % TIME_CYCLE_ORDER.length];
    });
  }, []);

  const handleSelectTimeOfDay = useCallback((tod: TimeOfDay) => {
    setTimeOfDay(tod);
  }, []);

  useEffect(() => {
    if (!gameSettings.dynamicTimeCycle || gameState === 'paused') return;
    const timer = window.setInterval(() => {
      setTimeOfDay((prev) => {
        const normalized: TimeOfDay = prev === 'day' ? 'afternoon' : prev;
        const idx = TIME_CYCLE_ORDER.indexOf(normalized);
        return TIME_CYCLE_ORDER[(idx + 1) % TIME_CYCLE_ORDER.length];
      });
    }, 24000);
    return () => window.clearInterval(timer);
  }, [gameSettings.dynamicTimeCycle, gameState]);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) => {
      const idx = CAMERA_MODES.indexOf(prev);
      return CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
    });
  }, []);

  const handleSelectViewpoint = useCallback((idx: number) => {
    setActiveViewpointIdx(idx);
    setResetCounter((c) => c + 1);
  }, []);

  const handleResetCar = useCallback(() => {
    setResetCounter((c) => c + 1);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleStartGame = useCallback(() => {
    soundEngine.init();
    soundEngine.playEngineStartup(selectedVehicle.soundType, selectedVehicle.engineAudioProfile);
    setPhotoModeState((prev) => ({ ...prev, active: false }));
    setReplayState((prev) => ({ ...prev, active: false }));
    document.body.dataset.state = 'playing';
    setGameState('playing');
  }, [selectedVehicle.soundType, selectedVehicle.engineAudioProfile]);

  const handleOpenGarage = useCallback(() => {
    virtualInputRef.current = {};
    soundEngine.init();
    setPhotoModeState((prev) => ({ ...prev, active: false }));
    setReplayState((prev) => ({ ...prev, active: false }));
    document.body.dataset.state = 'garage';
    setGameState('garage');
  }, []);

  const handlePauseGame = useCallback(() => {
    virtualInputRef.current = {};
    document.body.dataset.state = 'paused';
    setGameState('paused');
  }, []);

  const handleResumeGame = useCallback(() => {
    document.body.dataset.state = 'playing';
    setGameState('playing');
  }, []);

  const handleReturnToTitle = useCallback(() => {
    virtualInputRef.current = {};
    setPhotoModeState((prev) => ({ ...prev, active: false }));
    setReplayState((prev) => ({ ...prev, active: false }));
    document.body.dataset.state = 'title';
    setGameState('title');
  }, []);

  const handleToggleGarageLights = useCallback(() => {
    setGarageLightsOn((prev) => !prev);
  }, []);

  const handleTriggerGarageRev = useCallback(() => {
    soundEngine.playEngineRev(
      selectedVehicle.soundType,
      selectedVehicle.engineAudioProfile,
      activeCustomization
    );
    setGarageRevCounter((c) => c + 1);
  }, [selectedVehicle.soundType, selectedVehicle.engineAudioProfile, activeCustomization]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mpRoom = params.get('mpRoom');
    const mpName = params.get('mpName');
    if (mpName) {
      multiplayerClient.setPlayerName(mpName);
    }
    if (mpRoom) {
      multiplayerClient.joinRoom({
        roomId: mpRoom,
        vehicleId: selectedVehicle.id,
        paintColor: activeCustomization.paintColor,
        paintFinish: activeCustomization.paintFinish,
        bodyKit: activeCustomization.bodyKit,
        spoilerStyle: activeCustomization.spoilerStyle,
        rimStyle: activeCustomization.rimStyle,
        rimColor: activeCustomization.rimColor,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCaptureScreenshot = useCallback(() => {
    setCaptureScreenshotTrigger((c) => c + 1);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-stone-950 select-none">
      {/* Isolated WebGL Canvas Sibling */}
      <DriftCanvas
        mapId={mapId}
        timeOfDay={timeOfDay}
        cameraMode={cameraMode}
        graphicsPreset={graphicsPreset}
        gameState={gameState}
        gameSettings={gameSettings}
        activeViewpointIdx={activeViewpointIdx}
        resetCounter={resetCounter}
        selectedVehicle={selectedVehicle}
        customization={activeCustomization}
        garageCameraView={garageCameraView}
        garageLightsOn={garageLightsOn}
        garageRevCounter={garageRevCounter}
        garageDynoState={garageDynoState}
        virtualInputRef={virtualInputRef}
        onTelemetryTick={handleTelemetryTick}
        photoModeState={photoModeState}
        captureScreenshotTrigger={captureScreenshotTrigger}
        replayState={replayState}
        onUpdateReplayState={setReplayState}
      />

      {/* World-Matched Game Shell, 3D Showroom Garage & HUD Overlay */}
      <GameHUD
        mapId={mapId}
        timeOfDay={timeOfDay}
        cameraMode={cameraMode}
        graphicsPreset={graphicsPreset}
        gameState={gameState}
        gameSettings={gameSettings}
        activeViewpointIdx={activeViewpointIdx}
        isMuted={isMuted}
        selectedVehicle={selectedVehicle}
        customization={activeCustomization}
        garageCameraView={garageCameraView}
        garageLightsOn={garageLightsOn}
        garageDynoState={garageDynoState}
        onUpdateGarageDynoState={setGarageDynoState}
        virtualInputRef={virtualInputRef}
        telemetryHandlesRef={telemetryHandlesRef}
        onSelectMap={handleSelectMap}
        onToggleTimeOfDay={handleToggleTimeOfDay}
        onSelectTimeOfDay={handleSelectTimeOfDay}
        onCycleCamera={handleCycleCamera}
        onSelectGraphicsPreset={setGraphicsPreset}
        onSelectViewpoint={handleSelectViewpoint}
        onResetCar={handleResetCar}
        onToggleMute={handleToggleMute}
        onStartGame={handleStartGame}
        onOpenGarage={handleOpenGarage}
        onPauseGame={handlePauseGame}
        onResumeGame={handleResumeGame}
        onReturnToTitle={handleReturnToTitle}
        onSelectVehicle={handleSelectVehicle}
        onUpdateCustomization={handleUpdateCustomization}
        onResetCustomization={handleResetCustomization}
        onSelectGarageCamera={setGarageCameraView}
        onToggleGarageLights={handleToggleGarageLights}
        onTriggerGarageRev={handleTriggerGarageRev}
        onUpdateSettings={handleUpdateSettings}
        onResetCameraSettings={handleResetCameraSettings}
        photoModeState={photoModeState}
        onUpdatePhotoMode={setPhotoModeState}
        onCaptureScreenshot={handleCaptureScreenshot}
        replayState={replayState}
        onUpdateReplayState={setReplayState}
      />
    </main>
  );
}
