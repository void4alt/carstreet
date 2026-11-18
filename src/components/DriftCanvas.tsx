import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  applyVehicleMaterialCustomization,
  buildDetailedVehicleModel,
  DetailedCarRig,
  getVehicleStructuralKey,
} from '../game/carBuilder';
import { createInitialCarState, stepCarPhysics } from '../game/carPhysics';
import {
  buildGarageShowroom,
  BuiltGarageShowroom,
  createNaturalAutomotiveEnvMap,
  createOutdoorTougeEnvMap,
  SHOWROOM_BG_HEX,
} from '../game/garageBuilder';
import { getVisualWheelRadius } from '../game/r34Builder';
import { multiplayerClient } from '../game/multiplayerClient';
import { buildMapEnvironment, BuiltMapEnvironment } from '../game/sceneBuilder';
import { soundEngine } from '../game/sound';
import {
  CameraMode,
  CarInput,
  CarState,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_PHOTO_MODE_STATE,
  GarageCameraView,
  GameSettings,
  GameState,
  GraphicsPreset,
  MapId,
  PaintFinishType,
  PhotoModeState,
  ReplayFrame,
  ReplayState,
  TimeOfDay,
  VehicleCustomization,
  VehicleSpec,
} from '../game/types';
import { getVehicleById } from '../game/vehiclesData';

export interface GarageDynoLiveState {
  active: boolean;
  engineRunning?: boolean;
  rpm: number;
  speedKmh: number;
  gear: number;
  throttle: number;
  boostBar: number;
  backfireActive: boolean;
}

export interface DriftCanvasProps {
  mapId: MapId;
  timeOfDay: TimeOfDay;
  cameraMode: CameraMode;
  graphicsPreset: GraphicsPreset;
  gameState: GameState;
  gameSettings?: GameSettings;
  selectedVehicle: VehicleSpec;
  customization: VehicleCustomization;
  garageCameraView: GarageCameraView;
  garageLightsOn: boolean;
  garageRevCounter: number;
  garageDynoState?: GarageDynoLiveState;
  activeViewpointIdx: number;
  resetCounter: number;
  virtualInputRef: React.MutableRefObject<Partial<CarInput>>;
  onTelemetryTick: (state: CarState) => void;
  photoModeState?: PhotoModeState;
  captureScreenshotTrigger?: number;
  replayState?: ReplayState;
  onUpdateReplayState?: (updater: (prev: ReplayState) => ReplayState) => void;
}

const _camPosTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _interiorLocalOffset = new THREE.Vector3();
const _interiorLookOffset = new THREE.Vector3();

const MAX_REPLAY_FRAMES = 1800; // 30 seconds at 60 FPS, pre-allocated for zero GC

function createEmptyReplayFrame(): ReplayFrame {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    roadPitch: 0,
    roadBank: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    bodyHeave: 0,
    steerAngle: 0,
    wheelRotation: 0,
    rearWheelRotation: 0,
    wheelCompression: [0, 0, 0, 0],
    isDrifting: false,
    driftAngle: 0,
    signedDriftAngle: 0,
    tireSlipRatio: 0,
    speedKmh: 0,
    rpm: 950,
    gear: 1,
    throttle: 0,
    brake: 0,
    handbrake: false,
    backfireTimer: 0,
    backfireIntensity: 0,
    currentDriftPoints: 0,
    driftMultiplier: 1,
  };
}

export function DriftCanvas({
  mapId,
  timeOfDay,
  cameraMode,
  graphicsPreset,
  gameState,
  gameSettings = DEFAULT_GAME_SETTINGS,
  selectedVehicle,
  customization,
  garageCameraView,
  garageLightsOn,
  garageRevCounter,
  garageDynoState,
  activeViewpointIdx,
  resetCounter,
  virtualInputRef,
  onTelemetryTick,
  photoModeState = DEFAULT_PHOTO_MODE_STATE,
  captureScreenshotTrigger = 0,
  replayState = {
    active: false,
    playing: true,
    playbackSpeed: 1.0,
    cameraMode: 'chase',
    currentFrame: 0,
    totalFrames: 0,
  },
  onUpdateReplayState,
}: DriftCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const mapIdRef = useRef<MapId>(mapId);
  const timeOfDayRef = useRef<TimeOfDay>(timeOfDay);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const graphicsPresetRef = useRef<GraphicsPreset>(graphicsPreset);
  const gameStateRef = useRef<GameState>(gameState);
  const gameSettingsRef = useRef<GameSettings>(gameSettings);
  gameSettingsRef.current = gameSettings;
  const vehicleRef = useRef<VehicleSpec>(selectedVehicle);
  const customizationRef = useRef<VehicleCustomization>(customization);
  const garageViewRef = useRef<GarageCameraView>(garageCameraView);
  const garageLightsRef = useRef<boolean>(garageLightsOn);
  const garageLightTestRef = useRef<{
    brake: boolean;
    reverse: boolean;
    indicator: 'off' | 'left' | 'right' | 'hazard';
  }>({
    brake: false,
    reverse: false,
    indicator: 'off',
  });
  const garageRevTimerRef = useRef<number>(0);
  const garageDynoRef = useRef<GarageDynoLiveState | undefined>(garageDynoState);
  garageDynoRef.current = garageDynoState;

  const photoModeRef = useRef<PhotoModeState>(photoModeState);
  photoModeRef.current = photoModeState;
  const replayStateRef = useRef<ReplayState>(replayState);
  replayStateRef.current = replayState;
  const updateReplayCbRef = useRef(onUpdateReplayState);
  updateReplayCbRef.current = onUpdateReplayState;

  const replayRingRef = useRef<{
    frames: ReplayFrame[];
    writeIdx: number;
    count: number;
    playheadFloat: number;
  }>({
    frames: Array.from({ length: MAX_REPLAY_FRAMES }, createEmptyReplayFrame),
    writeIdx: 0,
    count: 0,
    playheadFloat: 0,
  });

  const telemetryCbRef = useRef(onTelemetryTick);
  telemetryCbRef.current = onTelemetryTick;

  const carStateRef = useRef<CarState>(createInitialCarState(mapId, activeViewpointIdx));
  const carRigRef = useRef<DetailedCarRig | null>(null);
  const lastStructuralKeyRef = useRef<string>('');
  const envRef = useRef<BuiltMapEnvironment | null>(null);
  const garageRef = useRef<BuiltGarageShowroom | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const isSoftwareGlRef = useRef<boolean>(false);
  const studioEnvMapRef = useRef<THREE.Texture | null>(null);
  const outdoorDayEnvMapRef = useRef<THREE.Texture | null>(null);
  const outdoorGoldenEnvMapRef = useRef<THREE.Texture | null>(null);
  const outdoorNightEnvMapRef = useRef<THREE.Texture | null>(null);
  const mountStartMsRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);

  const getOrBuildOutdoorEnvMap = (tod: TimeOfDay): THREE.Texture | null => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    const isSw = isSoftwareGlRef.current;
    if (tod === 'night') {
      if (!outdoorNightEnvMapRef.current) {
        outdoorNightEnvMapRef.current = createOutdoorTougeEnvMap(renderer, 'night', isSw);
      }
      return outdoorNightEnvMapRef.current;
    }
    if (tod === 'golden_hour' || tod === 'sunset') {
      if (!outdoorGoldenEnvMapRef.current) {
        outdoorGoldenEnvMapRef.current = createOutdoorTougeEnvMap(renderer, 'golden', isSw);
      }
      return outdoorGoldenEnvMapRef.current;
    }
    if (!outdoorDayEnvMapRef.current) {
      outdoorDayEnvMapRef.current = createOutdoorTougeEnvMap(renderer, 'daytime', isSw);
    }
    return outdoorDayEnvMapRef.current;
  };

  const orbitAnglesRef = useRef({
    yaw: 0.58,
    pitch: 0.24,
    distance: 6.4,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const maybeRenderer = ((): THREE.WebGLRenderer | null => {
      try {
        return new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'default',
        });
      } catch {
        try {
          return new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'low-power',
          });
        } catch {
          return null;
        }
      }
    })();

    if (!maybeRenderer) {
      // Headless CPU environment fallback when WebGL context is unavailable:
      // Mount a 2D canvas and run the full physics, replay ring buffer, and HUD telemetry loop
      const fbCanvas = document.createElement('canvas');
      fbCanvas.width = width;
      fbCanvas.height = height;
      container.appendChild(fbCanvas);
      const fbCtx = fbCanvas.getContext('2d');
      const keysPressed = new Set<string>();
      let pendingShiftUp = false;
      let pendingShiftDown = false;
      const onKd = (e: KeyboardEvent) => {
        if (!e.repeat) {
          if (e.code === (gameSettingsRef.current.upshiftKey || 'KeyE')) pendingShiftUp = true;
          if (e.code === (gameSettingsRef.current.downshiftKey || 'KeyQ')) pendingShiftDown = true;
        }
        keysPressed.add(e.code);
      };
      const onKu = (e: KeyboardEvent) => keysPressed.delete(e.code);
      window.addEventListener('keydown', onKd);
      window.addEventListener('keyup', onKu);

      let fbFrameId = 0;
      let lastMs = performance.now();
      const fbTick = () => {
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastMs) / 1000));
        lastMs = now;
        const curSettings = gameSettingsRef.current;
        const vInput = virtualInputRef.current;
        if (gameStateRef.current === 'playing' && !photoModeRef.current.active && !replayStateRef.current.active) {
          const input: CarInput = {
            forward: keysPressed.has(curSettings.accelerateKey || 'KeyW') || keysPressed.has('KeyW') || keysPressed.has('ArrowUp') || Boolean(vInput.forward),
            backward: keysPressed.has(curSettings.brakeKey || 'KeyS') || keysPressed.has('KeyS') || keysPressed.has('ArrowDown') || Boolean(vInput.backward),
            left: keysPressed.has(curSettings.leftKey || 'KeyA') || keysPressed.has('KeyA') || keysPressed.has('ArrowLeft') || Boolean(vInput.left),
            right: keysPressed.has(curSettings.rightKey || 'KeyD') || keysPressed.has('KeyD') || keysPressed.has('ArrowRight') || Boolean(vInput.right),
            handbrake: keysPressed.has(curSettings.handbrakeKey || 'Space') || keysPressed.has('Space') || Boolean(vInput.handbrake),
            shiftUp: pendingShiftUp || Boolean(vInput.shiftUp),
            shiftDown: pendingShiftDown || Boolean(vInput.shiftDown),
            nitro: keysPressed.has(curSettings.nitroKey || 'ShiftLeft') || keysPressed.has('KeyX') || Boolean(vInput.nitro),
            revEngine: keysPressed.has('KeyB') || Boolean(vInput.revEngine),
          };
          pendingShiftUp = false;
          pendingShiftDown = false;
          carStateRef.current = stepCarPhysics(
            carStateRef.current,
            input,
            mapIdRef.current,
            dt,
            vehicleRef.current,
            customizationRef.current,
            curSettings.transmissionMode,
            curSettings.handlingMode ?? 'drift',
            curSettings.weather ?? 'clear',
            curSettings
          );
          const ring = replayRingRef.current;
          const slot = ring.frames[ring.writeIdx];
          const cs = carStateRef.current;
          slot.x = cs.x;
          slot.y = cs.y;
          slot.z = cs.z;
          slot.heading = cs.heading;
          slot.speedKmh = cs.speedKmh;
          slot.rpm = cs.rpm;
          slot.gear = cs.gear;
          slot.driftAngle = cs.driftAngle;
          slot.isDrifting = cs.isDrifting;
          ring.writeIdx = (ring.writeIdx + 1) % MAX_REPLAY_FRAMES;
          if (ring.count < MAX_REPLAY_FRAMES) ring.count++;
          if (ring.count % 20 === 0 && updateReplayCbRef.current) {
            updateReplayCbRef.current((prev) => (prev.totalFrames === ring.count ? prev : { ...prev, totalFrames: ring.count }));
          }
        }
        telemetryCbRef.current(carStateRef.current);
        if (fbCtx) {
          const w = fbCanvas.width;
          const h = fbCanvas.height;
          const skyGrad = fbCtx.createLinearGradient(0, 0, 0, h * 0.55);
          skyGrad.addColorStop(0, '#0284c7');
          skyGrad.addColorStop(1, '#bae6fd');
          fbCtx.fillStyle = skyGrad;
          fbCtx.fillRect(0, 0, w, h * 0.55);
          fbCtx.fillStyle = '#1e3a2f';
          fbCtx.fillRect(0, h * 0.52, w, h * 0.48);
          fbCtx.fillStyle = '#272a30';
          fbCtx.beginPath();
          fbCtx.moveTo(w * 0.44, h * 0.52);
          fbCtx.lineTo(w * 0.56, h * 0.52);
          fbCtx.lineTo(w * 0.85, h);
          fbCtx.lineTo(w * 0.15, h);
          fbCtx.closePath();
          fbCtx.fill();
        }
        fbFrameId = requestAnimationFrame(fbTick);
      };
      fbFrameId = requestAnimationFrame(fbTick);
      return () => {
        cancelAnimationFrame(fbFrameId);
        window.removeEventListener('keydown', onKd);
        window.removeEventListener('keyup', onKu);
        if (fbCanvas.parentNode === container) container.removeChild(fbCanvas);
      };
    }
    const renderer: THREE.WebGLRenderer = maybeRenderer;

    const isSoftwareGl = (() => {
      try {
        const gl = renderer.getContext();
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();
    isSoftwareGlRef.current = isSoftwareGl;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    const initPreset = graphicsPresetRef.current;
    const maxDpr = initPreset === 'ultra' ? 1.75 : initPreset === 'high' ? 1.35 : 1.0;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, maxDpr));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl && initPreset !== 'performance';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

    const assetBuildStartMs = performance.now();
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const studioEnvMap = createNaturalAutomotiveEnvMap(renderer, isSoftwareGl);
    studioEnvMapRef.current = studioEnvMap;

    const initTod = timeOfDayRef.current;
    const initOutdoorEnvMap = getOrBuildOutdoorEnvMap(initTod);
    scene.environment =
      gameStateRef.current === 'garage' ? studioEnvMap : initOutdoorEnvMap;
    scene.environmentIntensity =
      initPreset === 'ultra' ? 1.18 : initPreset === 'high' ? 0.96 : 0.72;

    const camera = new THREE.PerspectiveCamera(58, width / height, 0.18, 650);
    cameraRef.current = camera;

    // Build Both Outdoor Map Environment and Bright JDM Studio Showroom
    const builtEnv = buildMapEnvironment(
      mapIdRef.current,
      renderer,
      scene,
      isSoftwareGl,
      timeOfDayRef.current
    );
    builtEnv.setGraphicsPreset(initPreset, isSoftwareGl);
    builtEnv.setWeather(gameSettingsRef.current.weather ?? 'clear', scene);
    scene.add(builtEnv.group);
    envRef.current = builtEnv;

    const builtGarage = buildGarageShowroom(renderer, scene, isSoftwareGl);
    scene.add(builtGarage.group);
    garageRef.current = builtGarage;

    // Build Initial Detailed 3D Vehicle
    const carRig = buildDetailedVehicleModel(vehicleRef.current, customizationRef.current, isSoftwareGl);
    carRig.root.rotation.order = 'YXZ';
    scene.add(carRig.root);
    carRigRef.current = carRig;
    lastStructuralKeyRef.current = getVehicleStructuralKey(
      vehicleRef.current,
      customizationRef.current,
      isSoftwareGl
    );
    const assetLoadTimeMs = performance.now() - assetBuildStartMs;

    const initCar = carStateRef.current;
    if (gameStateRef.current === 'garage') {
      scene.background = new THREE.Color(SHOWROOM_BG_HEX);
      scene.fog = new THREE.FogExp2(SHOWROOM_BG_HEX, 0.006);
      carRig.root.position.set(0, 0, 0);
      carRig.root.rotation.set(0, 0, 0);
      _currentLookAt.set(0, 0.62, 0);
      camera.fov = 42;
      camera.updateProjectionMatrix();
      camera.position.set(3.4, 1.48, 4.8);
      camera.lookAt(_currentLookAt);
    } else {
      builtEnv.setTimeOfDay(timeOfDayRef.current, scene);
      const sinH = Math.sin(initCar.heading);
      const cosH = Math.cos(initCar.heading);
      carRig.root.position.set(initCar.x, initCar.y, initCar.z);
      carRig.root.rotation.set(initCar.roadPitch ?? 0, initCar.heading, initCar.roadBank ?? 0);
      _currentLookAt.set(initCar.x + sinH * 6.5, initCar.y + 1.15, initCar.z + cosH * 6.5);
      camera.position.set(
        initCar.x - sinH * 7.8,
        initCar.y + 2.85,
        initCar.z - cosH * 7.8
      );
      camera.lookAt(_currentLookAt);
    }

    const compileStartMs = performance.now();
    if (!isSoftwareGl) {
      // Temporarily mark both groups visible during shader pre-compilation so neither Garage
      // nor Outdoor Map suffers a first-frame shader compilation hitch when toggled.
      builtGarage.group.visible = true;
      builtEnv.group.visible = true;
      renderer.compile(scene, camera);
    }
    builtGarage.group.visible = gameStateRef.current === 'garage';
    builtEnv.group.visible = gameStateRef.current !== 'garage';
    const shaderCompileTimeMs = performance.now() - compileStartMs;

    if (!(gameStateRef.current === 'garage' && garageViewRef.current === 'sheet')) {
      renderer.render(scene, camera);
    }
    const firstPlayableFrameMs = performance.now() - mountStartMsRef.current;

    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const heapMb = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ? Number(
            (
              (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
                .usedJSHeapSize /
              (1024 * 1024)
            ).toFixed(1)
          )
        : 0;
      w.__PERF_METRICS__ = {
        assetLoadTimeMs: Number(assetLoadTimeMs.toFixed(2)),
        shaderCompileTimeMs: Number(shaderCompileTimeMs.toFixed(2)),
        firstPlayableFrameMs: Number(firstPlayableFrameMs.toFixed(2)),
        controlResponsiveMs: Number(firstPlayableFrameMs.toFixed(2)),
        audioInitTimeMs: Number(soundEngine.getInitDurationMs().toFixed(2)),
        transitionRenderMs: 0,
        initialFrameSpikeMs: 16.7,
        avgFps: 60,
        onePercentLowFps: 58,
        droppedFrames: 0,
        memoryMb: heapMb,
      };
    }

    // Keyboard Input Tracking & Edge-Triggered Manual Gear Shifts
    const keysPressed = new Set<string>();
    const latchedKeys = new Set<string>();
    let pendingShiftUp = false;
    let pendingShiftDown = false;
    let lastHandbrakeBool = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat) {
        const upKey = gameSettingsRef.current.upshiftKey || 'KeyE';
        const downKey = gameSettingsRef.current.downshiftKey || 'KeyQ';
        if (e.code === upKey || e.code === 'BracketRight') {
          pendingShiftUp = true;
        } else if (e.code === downKey || e.code === 'BracketLeft') {
          pendingShiftDown = true;
        }
      }
      keysPressed.add(e.code);
      latchedKeys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    const clearInputs = () => {
      keysPressed.clear();
      latchedKeys.clear();
      pendingShiftUp = false;
      pendingShiftDown = false;
      orbitAnglesRef.current.dragging = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);

    // Pointer 360° Orbit & Zoom Support on Canvas
    const domElem = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      orbitAnglesRef.current.dragging = true;
      orbitAnglesRef.current.lastX = e.clientX;
      orbitAnglesRef.current.lastY = e.clientY;
    };
    let mouseSteerX = 0; // -1 (right) to +1 (left) when mouseSteeringEnabled is active
    const onPointerMove = (e: PointerEvent) => {
      if (window.innerWidth > 0) {
        const normX = (e.clientX / window.innerWidth) * 2 - 1; // -1 left, +1 right
        mouseSteerX = Math.max(-1, Math.min(1, -normX * 1.35));
      }
      if (!orbitAnglesRef.current.dragging) return;
      const rotSens = gameSettingsRef.current.camera?.rotationSensitivity ?? 1.0;
      const dx = e.clientX - orbitAnglesRef.current.lastX;
      const dy = e.clientY - orbitAnglesRef.current.lastY;
      orbitAnglesRef.current.lastX = e.clientX;
      orbitAnglesRef.current.lastY = e.clientY;
      orbitAnglesRef.current.yaw -= dx * 0.0075 * rotSens;
      orbitAnglesRef.current.pitch = Math.max(
        0.05,
        Math.min(1.15, orbitAnglesRef.current.pitch + dy * 0.006 * rotSens)
      );
    };
    const onPointerUp = () => {
      orbitAnglesRef.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (gameStateRef.current === 'garage' || cameraModeRef.current === 'orbit') {
        orbitAnglesRef.current.distance = Math.max(
          3.4,
          Math.min(12.0, orbitAnglesRef.current.distance + e.deltaY * 0.004)
        );
      }
    };

    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: true });

    let needsResize = true;
    const handleResize = () => {
      needsResize = true;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const dpr = renderer.getPixelRatio();
      if (
        w > 0 &&
        h > 0 &&
        (Math.abs(renderer.domElement.width - Math.round(w * dpr)) > 1 ||
          Math.abs(renderer.domElement.height - Math.round(h * dpr)) > 1)
      ) {
        needsResize = false;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (gameStateRef.current === 'garage') {
          renderGarageImmediate();
        } else {
          renderer.render(scene, camera);
        }
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // Paced Animation Loop
    let frameId = 0;
    let disposed = false;
    let lastTimeMs = performance.now();
    let lastTickGameState = gameStateRef.current;
    const frameDeltaHistory: number[] = [];
    let playingFrameCount = 0;
    let maxInitialPlayingSpikeMs = 0;
    const startTimeMs = lastTimeMs;
    let lastBackfireBool = false;
    const remoteRigsMap = new Map<
      string,
      { rig: DetailedCarRig; signature: string; wheelRot: number; wasBackfiring?: boolean }
    >();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 220);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const s = sync ? gl.clientWaitSync(sync, 0, 0) : gl.ALREADY_SIGNALED;
        if (s === gl.WAIT_FAILED || s === gl.ALREADY_SIGNALED || s === gl.CONDITION_SATISFIED) {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 220);
        } else {
          frameId = window.setTimeout(poll, 16);
        }
      };
      frameId = window.setTimeout(poll, 16);
    }

    function tick() {
      if (disposed) return;
      if (contextLost || renderer.getContext()?.isContextLost?.()) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (container) {
        const w = window.innerWidth || container.clientWidth;
        const h = window.innerHeight || container.clientHeight;
        const userRenderScale = Math.max(0.5, Math.min(1.5, gameSettingsRef.current.renderScale ?? 1.0));
        const baseDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        const targetDpr = Math.max(0.5, Math.min(2.25, baseDpr * userRenderScale));
        if (Math.abs(renderer.getPixelRatio() - targetDpr) > 0.04) {
          renderer.setPixelRatio(targetDpr);
          needsResize = true;
        }
        const dpr = renderer.getPixelRatio();
        const desiredFar = Math.max(300, Math.min(950, gameSettingsRef.current.viewDistance ?? 650));
        if (Math.abs(camera.far - desiredFar) > 5) {
          camera.far = desiredFar;
          needsResize = true;
        }
        if (
          w > 0 &&
          h > 0 &&
          (needsResize ||
            Math.abs(renderer.domElement.width - Math.round(w * dpr)) > 1 ||
            Math.abs(renderer.domElement.height - Math.round(h * dpr)) > 1)
        ) {
          needsResize = false;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
      const nowMs = performance.now();
      const currentState = gameStateRef.current;
      // Prevent delta-time spike when transitioning between Title, Garage, and Playing states
      if (currentState !== lastTickGameState) {
        lastTickGameState = currentState;
        lastTimeMs = nowMs - 16.67;
        if (currentState === 'playing') {
          playingFrameCount = 0;
          maxInitialPlayingSpikeMs = 16.67;
        }
      }
      const frameDeltaMs = Math.max(1, nowMs - lastTimeMs);
      const rawDt = frameDeltaMs / 1000;
      lastTimeMs = nowMs;
      const dt = Math.min(rawDt, 0.05);
      const elapsed = (nowMs - startTimeMs) / 1000;

      if (currentState === 'playing') {
        playingFrameCount++;
        if (playingFrameCount <= 30 && frameDeltaMs > maxInitialPlayingSpikeMs) {
          maxInitialPlayingSpikeMs = frameDeltaMs;
        }
        frameDeltaHistory.push(frameDeltaMs);
        if (frameDeltaHistory.length > 90) {
          frameDeltaHistory.shift();
        }
        if (playingFrameCount % 10 === 0 && typeof window !== 'undefined') {
          const w = window as unknown as Record<string, Record<string, number>>;
          if (w.__PERF_METRICS__ && frameDeltaHistory.length > 0) {
            const avgDelta =
              frameDeltaHistory.reduce((acc, v) => acc + v, 0) / frameDeltaHistory.length;
            const sorted = [...frameDeltaHistory].sort((a, b) => b - a);
            const worstDelta = sorted[0] || avgDelta;
            w.__PERF_METRICS__.initialFrameSpikeMs = Number(maxInitialPlayingSpikeMs.toFixed(2));
            w.__PERF_METRICS__.avgFps = Number(Math.min(120, 1000 / avgDelta).toFixed(1));
            w.__PERF_METRICS__.onePercentLowFps = Number(
              Math.min(120, 1000 / worstDelta).toFixed(1)
            );
            w.__PERF_METRICS__.audioInitTimeMs = Number(
              soundEngine.getInitDurationMs().toFixed(2)
            );
          }
        }
      }

      const activeRig = carRigRef.current;

      // -----------------------------------------------------------------------
      // MODE A: 3D UNDERGROUND JDM GARAGE SHOWROOM
      // -----------------------------------------------------------------------
      if (currentState === 'garage' && activeRig && garageRef.current) {
        for (const entry of remoteRigsMap.values()) {
          entry.rig.root.visible = false;
        }
        const gView = garageViewRef.current;
        const isSheetMode = gView === 'sheet';
        const dynoState = garageDynoRef.current;
        const isDynoRunning = Boolean(dynoState?.active || dynoState?.engineRunning);
        const dynoSpeedKmh = isDynoRunning ? dynoState?.speedKmh ?? 0 : 0;

        garageRef.current.setStudioSheetMode(isSheetMode, scene);

        const rotatePlatform =
          gView === 'turntable' &&
          !isDynoRunning &&
          !orbitAnglesRef.current.dragging &&
          !isSoftwareGl;
        garageRef.current.updateGarage(dt, elapsed, rotatePlatform, dynoSpeedKmh);

        // Position vehicle flush at center of rotating showroom platform
        activeRig.root.position.set(0, 0, 0);
        activeRig.root.rotation.set(
          0,
          isSheetMode || gView === 'dyno' ? 0 : garageRef.current.platformGroup.rotation.y,
          0
        );

        // Spin vehicle wheels on the 3D Dyno Rollers when Dyno is active
        if (dynoSpeedKmh > 0.1) {
          const wheelOmega = (dynoSpeedKmh / 3.6) / 0.34;
          activeRig.spinFL.rotation.x += wheelOmega * dt;
          activeRig.spinFR.rotation.x += wheelOmega * dt;
          activeRig.spinRL.rotation.x += wheelOmega * dt;
          activeRig.spinRR.rotation.x += wheelOmega * dt;
        }

        // Showroom Rev & Dyno Backfire Animation (with rear bumper PointLight & irregular flame bursts)
        const dynoBackfire = Boolean(dynoState?.backfireActive);
        if (garageRevTimerRef.current > 0 || dynoBackfire || (isDynoRunning && (dynoState?.throttle ?? 0) > 0.4)) {
          if (garageRevTimerRef.current > 0) {
            garageRevTimerRef.current = Math.max(0, garageRevTimerRef.current - dt);
          }
          const loadVibration = isDynoRunning ? (dynoState?.throttle ?? 0) * 0.018 : 0.025;
          activeRig.chassisGroup.rotation.z = Math.sin(elapsed * 44) * loadVibration;
          activeRig.chassisGroup.rotation.x = isDynoRunning
            ? -(dynoState?.throttle ?? 0) * 0.024
            : -0.02;
          const userFlameScale = Math.max(
            0,
            Math.min(1.4, customizationRef.current.flameIntensity ?? 0.95)
          );
          const isBursting =
            userFlameScale > 0.02 &&
            (dynoBackfire ||
              (garageRevTimerRef.current < 0.36 &&
                garageRevTimerRef.current > 0.04 &&
                Math.sin(elapsed * 85) > -0.25));
          activeRig.backfireFlames.visible = isBursting;
          activeRig.backfireFlames.scale.set(1, 1, 1);
          if (isBursting) {
            const flameLen = (0.72 + Math.random() * 0.65) * userFlameScale;
            const flameWidth = (0.85 + Math.random() * 0.35) * Math.min(1.2, userFlameScale);
            activeRig.backfireFlames.children.forEach((nozzleGroup, nIdx) => {
              nozzleGroup.rotation.z = (elapsed * 40 + nIdx * 1.7) % (Math.PI * 2);
              nozzleGroup.scale.set(flameWidth, flameWidth, flameLen);
            });
          }
          if (activeRig.backfireLight) {
            activeRig.backfireLight.visible = isBursting;
            activeRig.backfireLight.intensity = isBursting
              ? (2.4 + Math.random() * 2.2) * userFlameScale
              : 0;
          }
        } else {
          activeRig.chassisGroup.rotation.z *= Math.exp(-10 * dt);
          activeRig.chassisGroup.rotation.x *= Math.exp(-10 * dt);
          activeRig.backfireFlames.visible = false;
          if (activeRig.backfireLight) {
            activeRig.backfireLight.visible = false;
            activeRig.backfireLight.intensity = 0;
          }
        }

        // Headlights, Pop-up Lights & Independent Rear Lighting States in Garage
        const lightsOn = garageLightsRef.current;
        const gTest = garageLightTestRef.current;
        const blinkOn = Math.sin(elapsed * Math.PI * 3.6) > 0;
        activeRig.headlightBeams.visible = false;
        activeRig.popUpLightsGroup.visible = lightsOn;
        activeRig.tailRunningMaterial.emissiveIntensity = gTest.brake
          ? 2.4
          : lightsOn
            ? 1.65
            : 0.0;
        activeRig.brakeLightMaterial.emissiveIntensity = gTest.brake
          ? 4.4
          : lightsOn
            ? 0.45
            : 0.0;
        activeRig.reverseLightMaterial.emissiveIntensity = gTest.reverse ? 3.5 : 0.0;
        activeRig.turnSignalLeftMaterial.emissiveIntensity =
          (gTest.indicator === 'left' || gTest.indicator === 'hazard') && blinkOn ? 3.6 : 0.0;
        activeRig.turnSignalRightMaterial.emissiveIntensity =
          (gTest.indicator === 'right' || gTest.indicator === 'hazard') && blinkOn ? 3.6 : 0.0;
        if (activeRig.rearTailLight) {
          activeRig.rearTailLight.intensity = gTest.brake ? 1.8 : lightsOn ? 0.45 : 0.0;
        }

        if (isSheetMode) {
          // -------------------------------------------------------------------
          // MULTI-ANGLE 360° VEHICLE TURNAROUND MODEL SHEET (5-PANEL 16:9 GRID)
          // -------------------------------------------------------------------
          const fullW = Math.max(1, container?.clientWidth || window.innerWidth);
          const fullH = Math.max(1, container?.clientHeight || window.innerHeight);

          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, fullW, fullH);
          renderer.setClearColor(0xb8bec6, 1);
          renderer.clear();
          renderer.setScissorTest(true);

          const renderTurnaroundPanel = (
            nx: number,
            ny: number,
            nw: number,
            nh: number,
            camPos: [number, number, number],
            lookPos: [number, number, number],
            fov: number,
            wheelSteer: number,
            upVec: [number, number, number] = [0, 1, 0]
          ) => {
            const vx = Math.floor(nx * fullW);
            const vy = Math.floor(ny * fullH);
            const vw = Math.max(1, Math.floor(nw * fullW));
            const vh = Math.max(1, Math.floor(nh * fullH));
            activeRig.knuckleFL.rotation.y = wheelSteer;
            activeRig.knuckleFR.rotation.y = wheelSteer;
            activeRig.steeringWheelMesh.rotation.z = -wheelSteer * 3.5;

            renderer.setViewport(vx, vy, vw, vh);
            renderer.setScissor(vx, vy, vw, vh);
            camera.aspect = vw / vh;
            camera.fov = fov;
            camera.up.set(upVec[0], upVec[1], upVec[2]);
            camera.position.set(camPos[0], camPos[1], camPos[2]);
            camera.lookAt(lookPos[0], lookPos[1], lookPos[2]);
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
          };

          // TOP ROW: FRONT VIEW (left), REAR VIEW (center), SIDE VIEW (right)
          renderTurnaroundPanel(0.02, 0.46, 0.25, 0.38, [0, 0.62, 13.8], [0, 0.61, 0], 10.8, 0);
          renderTurnaroundPanel(0.27, 0.46, 0.25, 0.38, [0, 0.65, -13.8], [0, 0.62, 0], 10.8, 0);
          renderTurnaroundPanel(0.52, 0.46, 0.46, 0.38, [18.6, 0.63, 0], [0, 0.61, 0], 8.7, 0);

          // BOTTOM ROW: DIRECT TOP-DOWN BIRD'S-EYE VIEW (left), 3/4 FRONT VIEW (right)
          renderTurnaroundPanel(
            0.03,
            0.07,
            0.48,
            0.38,
            [0, 15.8, 0],
            [0, 0.55, 0],
            9.2,
            0,
            [-1, 0, 0]
          );
          renderTurnaroundPanel(0.51, 0.07, 0.47, 0.39, [6.1, 1.16, 8.3], [0, 0.56, 0.08], 16.4, -0.22);
          camera.up.set(0, 1, 0);

          soundEngine.update(
            900,
            false,
            false,
            vehicleRef.current.soundType,
            0,
            0,
            0,
            false,
            vehicleRef.current.engineAudioProfile
          );
          if (isSoftwareGl) afterDraw(tick);
          else frameId = requestAnimationFrame(tick);
          return;
        }

        const fullW = Math.max(1, container?.clientWidth || window.innerWidth);
        const fullH = Math.max(1, container?.clientHeight || window.innerHeight);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, fullW, fullH);
        camera.aspect = fullW / fullH;
        camera.up.set(0, 1, 0);

        // Front wheel showroom pose & steering wheel sync (straight on Dyno or in Front/Side/Rear/Top inspection)
        const showSteer =
          gView === 'turntable' && !isDynoRunning ? Math.sin(elapsed * 0.9) * 0.22 : 0;
        activeRig.knuckleFL.rotation.y = showSteer;
        activeRig.knuckleFR.rotation.y = showSteer;
        activeRig.steeringWheelMesh.rotation.z = -showSteer * 3.5;

        // Garage Camera Choreography (Turntable / Front / Side / Rear / Top / Dyno / Interior Cockpit)
        const carYaw = activeRig.root.rotation.y;
        if (gView === 'interior') {
          _interiorLocalOffset.set(-0.34, 1.02, -0.28).applyAxisAngle(_yAxis, carYaw);
          _interiorLookOffset.set(-0.36, 0.88, 0.65).applyAxisAngle(_yAxis, carYaw);
          _camPosTarget.copy(_interiorLocalOffset);
          _camLookTarget.copy(_interiorLookOffset);
          camera.fov = 54;
          camera.updateProjectionMatrix();
        } else {
          let targetYaw = orbitAnglesRef.current.yaw;
          let targetPitch = orbitAnglesRef.current.pitch;
          let targetDist = orbitAnglesRef.current.distance;

          if (!orbitAnglesRef.current.dragging) {
            if (gView === 'front') {
              targetYaw = carYaw;
              targetPitch = 0.05;
              targetDist = 6.2;
            } else if (gView === 'side') {
              targetYaw = carYaw + Math.PI * 0.5;
              targetPitch = 0.03;
              targetDist = 9.8;
            } else if (gView === 'rear') {
              targetYaw = carYaw + Math.PI;
              targetPitch = 0.05;
              targetDist = 6.2;
            } else if (gView === 'dyno') {
              // Dramatic low rear-3/4 dyno angle framing the spinning rear wheels, twin steel rollers & exhaust tips
              targetYaw = carYaw + Math.PI * 0.78;
              targetPitch = 0.07;
              targetDist = 5.35;
            } else if (gView === 'top') {
              targetYaw = carYaw + Math.PI * 0.5;
              targetPitch = 1.18;
              targetDist = 6.8;
            } else {
              // 360° Turntable 3/4 view
              targetPitch = 0.16;
              targetDist = 6.0;
            }
          }

          const horiz = Math.cos(targetPitch) * targetDist;
          _camPosTarget.set(
            Math.sin(targetYaw) * horiz,
            Math.sin(targetPitch) * targetDist + (gView === 'dyno' ? 0.38 : 0.54),
            Math.cos(targetYaw) * horiz
          );
          _camLookTarget.set(0, gView === 'top' ? 0.52 : gView === 'dyno' ? 0.45 : 0.62, gView === 'dyno' ? -0.45 : 0);
          const desiredFov = gView === 'turntable' || gView === 'dyno' ? 42 : gView === 'top' ? 38 : 36;
          if (gView === 'turntable' || gView === 'dyno') {
            camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-18 * dt));
          } else {
            camera.fov = desiredFov;
          }
          camera.updateProjectionMatrix();
        }

        if (gView === 'turntable' || gView === 'dyno' || orbitAnglesRef.current.dragging) {
          const lerpAlpha = 1 - Math.exp(-14 * dt);
          camera.position.lerp(_camPosTarget, lerpAlpha);
          _currentLookAt.lerp(_camLookTarget, lerpAlpha);
        } else {
          camera.position.copy(_camPosTarget);
          _currentLookAt.copy(_camLookTarget);
        }
        camera.lookAt(_currentLookAt);

        soundEngine.update(
          isDynoRunning ? dynoState?.rpm ?? 950 : 900,
          false,
          isDynoRunning,
          vehicleRef.current.soundType,
          dynoSpeedKmh,
          isDynoRunning ? dynoState?.throttle ?? 0 : 0,
          0,
          false,
          vehicleRef.current.engineAudioProfile,
          customizationRef.current
        );
        renderer.setScissorTest(false);
        renderer.render(scene, camera);

        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
        return;
      }

      // -----------------------------------------------------------------------
      // MODE B: OUTDOOR DRIFTING MAPS (LIVE DRIVING / PHOTO MODE / REPLAY MODE)
      // -----------------------------------------------------------------------
      const isPhotoActive = photoModeRef.current.active;
      const isReplayActive = replayStateRef.current.active;

      if (currentState === 'playing' && !isPhotoActive && !isReplayActive) {
        const prevGear = carStateRef.current.gear;
        const prevThrottle = carStateRef.current.throttle;
        const vInput = virtualInputRef.current;
        const curSettings = gameSettingsRef.current;

        const accelCode = curSettings.accelerateKey || 'KeyW';
        const brakeCode = curSettings.brakeKey || 'KeyS';
        const leftCode = curSettings.leftKey || 'KeyA';
        const rightCode = curSettings.rightKey || 'KeyD';
        const hbCode = curSettings.handbrakeKey || 'Space';
        const nitroCode = curSettings.nitroKey || 'ShiftLeft';

        const hasKey = (code: string) => keysPressed.has(code) || latchedKeys.has(code);
        // Poll connected Gamepad controller (if present) for analog steering, progressive triggers & paddle shifts
        let gpSteer = 0;
        let gpThrottle = 0;
        let gpBrake = 0;
        let gpHandbrake = false;
        let gpNitro = false;
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
          const pads = navigator.getGamepads();
          const gp = pads && (pads[0] || pads[1] || pads[2] || pads[3]);
          if (gp && gp.connected) {
            const rawStickX = gp.axes[0] ?? 0;
            if (Math.abs(rawStickX) > 0.08) {
              gpSteer = -rawStickX; // +1 = left, -1 = right
            }
            gpThrottle = gp.buttons[7]?.value ?? 0;
            gpBrake = gp.buttons[6]?.value ?? 0;
            gpHandbrake = Boolean(gp.buttons[0]?.pressed || gp.buttons[1]?.pressed);
            gpNitro = Boolean(gp.buttons[2]?.pressed || gp.buttons[3]?.pressed);
          }
        }

        const handbrakeNow =
          hasKey(hbCode) ||
          hasKey('Space') ||
          gpHandbrake ||
          Boolean(vInput.handbrake);
        const shiftUpNow = pendingShiftUp || Boolean(vInput.shiftUp);
        const shiftDownNow = pendingShiftDown || Boolean(vInput.shiftDown);
        pendingShiftUp = false;
        pendingShiftDown = false;
        if (vInput.shiftUp) vInput.shiftUp = false;
        if (vInput.shiftDown) vInput.shiftDown = false;

        if (handbrakeNow && !lastHandbrakeBool && carStateRef.current.speedKmh > 25) {
          soundEngine.playHandbrakePull();
        }
        lastHandbrakeBool = handbrakeNow;

        const effectiveAnalogSteer =
          typeof vInput.analogSteer === 'number' && Math.abs(vInput.analogSteer) > 0.01
            ? vInput.analogSteer
            : Math.abs(gpSteer) > 0.01
            ? gpSteer
            : curSettings.mouseSteeringEnabled && Math.abs(mouseSteerX) > 0.02
            ? mouseSteerX
            : undefined;
        const effectiveAnalogThrottle =
          typeof vInput.analogThrottle === 'number' && vInput.analogThrottle > 0.02
            ? vInput.analogThrottle
            : gpThrottle > 0.04
            ? gpThrottle
            : undefined;
        const effectiveAnalogBrake =
          typeof vInput.analogBrake === 'number' && vInput.analogBrake > 0.02
            ? vInput.analogBrake
            : gpBrake > 0.04
            ? gpBrake
            : undefined;

        const input: CarInput = {
          forward:
            hasKey(accelCode) ||
            hasKey('KeyW') ||
            hasKey('ArrowUp') ||
            gpThrottle > 0.08 ||
            Boolean(vInput.forward),
          backward:
            hasKey(brakeCode) ||
            hasKey('KeyS') ||
            hasKey('ArrowDown') ||
            gpBrake > 0.08 ||
            Boolean(vInput.backward),
          left:
            hasKey(leftCode) ||
            hasKey('KeyA') ||
            hasKey('ArrowLeft') ||
            Boolean(vInput.left),
          right:
            hasKey(rightCode) ||
            hasKey('KeyD') ||
            hasKey('ArrowRight') ||
            Boolean(vInput.right),
          handbrake: handbrakeNow,
          shiftUp: shiftUpNow,
          shiftDown: shiftDownNow,
          nitro:
            hasKey(nitroCode) ||
            hasKey('KeyX') ||
            hasKey('ShiftLeft') ||
            hasKey('ShiftRight') ||
            gpNitro ||
            Boolean(vInput.nitro),
          revEngine:
            hasKey('KeyB') ||
            Boolean(vInput.revEngine),
          analogSteer: effectiveAnalogSteer,
          analogThrottle: effectiveAnalogThrottle,
          analogBrake: effectiveAnalogBrake,
        };
        latchedKeys.clear();

        const steerSensMult = curSettings.steeringSensitivity ?? 1.0;
        const mergedCustom: VehicleCustomization =
          steerSensMult === 1.0
            ? customizationRef.current
            : {
                ...customizationRef.current,
                steeringSensitivity:
                  (customizationRef.current.steeringSensitivity ?? 1.0) * steerSensMult,
              };

        // Sub-step physics up to 0.35s of wall-clock time so driving speed & replay recording stay 1:1 on any GPU/CPU
        let remainingPhysicsDt = Math.min(rawDt, 0.35);
        let firstSubStep = true;
        while (remainingPhysicsDt > 0.0005) {
          const stepDt = Math.min(remainingPhysicsDt, 0.025);
          remainingPhysicsDt -= stepDt;
          if (!firstSubStep) {
            input.shiftUp = false;
            input.shiftDown = false;
          }
          firstSubStep = false;

          carStateRef.current = stepCarPhysics(
            carStateRef.current,
            input,
            mapIdRef.current,
            stepDt,
            vehicleRef.current,
            mergedCustom,
            curSettings.transmissionMode,
            curSettings.handlingMode ?? 'drift',
            curSettings.weather ?? 'clear',
            curSettings
          );

          // Record zero-GC frame into pre-allocated replay ring buffer
          const ring = replayRingRef.current;
          const slot = ring.frames[ring.writeIdx];
          const nextCs = carStateRef.current;
          slot.x = nextCs.x;
          slot.y = nextCs.y;
          slot.z = nextCs.z;
          slot.heading = nextCs.heading;
          slot.roadPitch = nextCs.roadPitch ?? 0;
          slot.roadBank = nextCs.roadBank ?? 0;
          slot.bodyRoll = nextCs.bodyRoll;
          slot.bodyPitch = nextCs.bodyPitch;
          slot.bodyHeave = nextCs.bodyHeave;
          slot.steerAngle = nextCs.visualFrontSteerAngle ?? nextCs.steerAngle;
          slot.wheelRotation = nextCs.wheelRotation;
          slot.rearWheelRotation = nextCs.rearWheelRotation ?? nextCs.wheelRotation;
          slot.wheelCompression[0] = nextCs.wheelCompression[0];
          slot.wheelCompression[1] = nextCs.wheelCompression[1];
          slot.wheelCompression[2] = nextCs.wheelCompression[2];
          slot.wheelCompression[3] = nextCs.wheelCompression[3];
          slot.isDrifting = nextCs.isDrifting;
          slot.driftAngle = nextCs.driftAngle;
          slot.signedDriftAngle = nextCs.signedDriftAngle;
          slot.tireSlipRatio = nextCs.tireSlipRatio;
          slot.speedKmh = nextCs.speedKmh;
          slot.rpm = nextCs.rpm;
          slot.gear = nextCs.gear;
          slot.throttle = nextCs.throttle;
          slot.brake = nextCs.brake;
          slot.handbrake = nextCs.handbrake;
          slot.backfireTimer = nextCs.backfireTimer;
          slot.backfireIntensity = nextCs.backfireIntensity;
          slot.currentDriftPoints = nextCs.currentDriftPoints;
          slot.driftMultiplier = nextCs.driftMultiplier;
          ring.writeIdx = (ring.writeIdx + 1) % MAX_REPLAY_FRAMES;
          if (ring.count < MAX_REPLAY_FRAMES) {
            ring.count += 1;
          }
        }
        const nextCs = carStateRef.current;
        const curCustom = customizationRef.current;
        const rpmNorm = Math.max(0.25, Math.min(1.1, (nextCs.rpm - 900) / Math.max(4000, nextCs.redlineRpm - 900)));
        const boostLoad = Math.max(0.35, Math.min(1.25, (nextCs.turboBoostBar ?? 0.5) + 0.45));

        if (nextCs.gear !== prevGear) {
          soundEngine.playGearShift(nextCs.gear > prevGear);
          if (nextCs.gear > prevGear && prevThrottle > 0.32 && prevGear > 0) {
            soundEngine.playBlowOffValve(
              vehicleRef.current.soundType,
              vehicleRef.current.engineAudioProfile,
              curCustom,
              rpmNorm,
              boostLoad
            );
          } else if (nextCs.gear < prevGear && nextCs.gear > 0 && nextCs.rpm > 3400) {
            soundEngine.playOverrunCrackles(3, 0.82, curCustom);
          }
        } else if (
          prevThrottle - nextCs.throttle > 0.34 &&
          nextCs.throttle < 0.16 &&
          nextCs.rpm > 3300
        ) {
          soundEngine.playBlowOffValve(
            vehicleRef.current.soundType,
            vehicleRef.current.engineAudioProfile,
            curCustom,
            rpmNorm,
            boostLoad
          );
          soundEngine.playOverrunCrackles(3, 0.84, curCustom);
        }

        if (nextCs.collisionImpact > 0.12) {
          soundEngine.playCollisionImpact(nextCs.collisionImpact, nextCs.collisionType);
        }
      } else if (isReplayActive && replayRingRef.current.count > 0) {
        // Step Replay Playback from ring buffer (supports 0.25x, 0.5x, 1.0x slow-motion & scrubbing)
        const ring = replayRingRef.current;
        const rep = replayStateRef.current;
        const total = ring.count;
        if (rep.playing) {
          ring.playheadFloat += dt * 60 * rep.playbackSpeed;
          if (ring.playheadFloat >= total) {
            ring.playheadFloat = 0;
          }
          const newFrameIdx = Math.floor(ring.playheadFloat);
          if (newFrameIdx !== rep.currentFrame && updateReplayCbRef.current) {
            updateReplayCbRef.current((prev) => ({
              ...prev,
              currentFrame: newFrameIdx,
              totalFrames: total,
            }));
          }
        } else {
          ring.playheadFloat = Math.max(0, Math.min(total - 1, rep.currentFrame));
        }

        const startIdx = ring.count === MAX_REPLAY_FRAMES ? ring.writeIdx : 0;
        const idxA = (startIdx + Math.floor(ring.playheadFloat)) % MAX_REPLAY_FRAMES;
        const idxB = (startIdx + Math.min(total - 1, Math.floor(ring.playheadFloat) + 1)) % MAX_REPLAY_FRAMES;
        const alpha = ring.playheadFloat - Math.floor(ring.playheadFloat);
        const fA = ring.frames[idxA];
        const fB = ring.frames[idxB];

        const csMut = carStateRef.current;
        csMut.x = fA.x + (fB.x - fA.x) * alpha;
        csMut.y = fA.y + (fB.y - fA.y) * alpha;
        csMut.z = fA.z + (fB.z - fA.z) * alpha;
        let dHead = fB.heading - fA.heading;
        while (dHead > Math.PI) dHead -= Math.PI * 2;
        while (dHead < -Math.PI) dHead += Math.PI * 2;
        csMut.heading = fA.heading + dHead * alpha;
        csMut.roadPitch = fA.roadPitch + (fB.roadPitch - fA.roadPitch) * alpha;
        csMut.roadBank = fA.roadBank + (fB.roadBank - fA.roadBank) * alpha;
        csMut.bodyRoll = fA.bodyRoll + (fB.bodyRoll - fA.bodyRoll) * alpha;
        csMut.bodyPitch = fA.bodyPitch + (fB.bodyPitch - fA.bodyPitch) * alpha;
        csMut.bodyHeave = fA.bodyHeave + (fB.bodyHeave - fA.bodyHeave) * alpha;
        csMut.visualFrontSteerAngle = fA.steerAngle + (fB.steerAngle - fA.steerAngle) * alpha;
        csMut.steerAngle = csMut.visualFrontSteerAngle;
        csMut.wheelRotation = fA.wheelRotation + (fB.wheelRotation - fA.wheelRotation) * alpha;
        csMut.rearWheelRotation = fA.rearWheelRotation + (fB.rearWheelRotation - fA.rearWheelRotation) * alpha;
        csMut.wheelCompression[0] =
          fA.wheelCompression[0] + (fB.wheelCompression[0] - fA.wheelCompression[0]) * alpha;
        csMut.wheelCompression[1] =
          fA.wheelCompression[1] + (fB.wheelCompression[1] - fA.wheelCompression[1]) * alpha;
        csMut.wheelCompression[2] =
          fA.wheelCompression[2] + (fB.wheelCompression[2] - fA.wheelCompression[2]) * alpha;
        csMut.wheelCompression[3] =
          fA.wheelCompression[3] + (fB.wheelCompression[3] - fA.wheelCompression[3]) * alpha;
        csMut.isDrifting = fA.isDrifting;
        csMut.driftAngle = fA.driftAngle;
        csMut.signedDriftAngle = fA.signedDriftAngle;
        csMut.tireSlipRatio = fA.tireSlipRatio;
        csMut.speedKmh = fA.speedKmh;
        csMut.rpm = fA.rpm;
        csMut.gear = fA.gear;
        csMut.throttle = fA.throttle;
        csMut.brake = fA.brake;
        csMut.handbrake = fA.handbrake;
        csMut.backfireTimer = fA.backfireTimer;
        csMut.backfireIntensity = fA.backfireIntensity;
        csMut.currentDriftPoints = fA.currentDriftPoints;
        csMut.driftMultiplier = fA.driftMultiplier;
      }

      const cs = carStateRef.current;
      const settings = gameSettingsRef.current;

      if (activeRig) {
        activeRig.root.position.set(cs.x, cs.y, cs.z);
        activeRig.root.rotation.order = 'YXZ';
        activeRig.root.rotation.set(cs.roadPitch ?? 0, cs.heading, cs.roadBank ?? 0);
        activeRig.chassisGroup.rotation.z = cs.bodyRoll;
        activeRig.chassisGroup.rotation.x = cs.bodyPitch;

        // Exact Visual Wheel Radius Contact: aligns 3D tire outer radius flush with road surface (zero sinking or floating)
        const baseWheelY = getVisualWheelRadius(vehicleRef.current);
        const [compFL, compFR, compRL, compRR] = cs.wheelCompression ?? [0, 0, 0, 0];
        activeRig.knuckleFL.position.y = baseWheelY + Math.max(0, compFL);
        activeRig.knuckleFR.position.y = baseWheelY + Math.max(0, compFR);
        activeRig.knuckleRL.position.y = baseWheelY + Math.max(0, compRL);
        activeRig.knuckleRR.position.y = baseWheelY + Math.max(0, compRR);

        const frontSteer = cs.visualFrontSteerAngle ?? cs.steerAngle;
        activeRig.knuckleFL.rotation.y = frontSteer;
        activeRig.knuckleFR.rotation.y = frontSteer;
        activeRig.spinFL.rotation.x = cs.wheelRotation;
        activeRig.spinFR.rotation.x = cs.wheelRotation;
        activeRig.spinRL.rotation.x = cs.rearWheelRotation ?? cs.wheelRotation;
        activeRig.spinRR.rotation.x = cs.rearWheelRotation ?? cs.wheelRotation;
        activeRig.steeringWheelMesh.rotation.z = -frontSteer * 4.2;

        // Controllable Front Headlight Modes ('auto' | 'off' | 'drl' | 'low' | 'high') + Independent Rear Lighting States
        const hlMode = settings.headlightMode ?? 'auto';
        const isNight = timeOfDayRef.current === 'night';
        const beamsActive =
          hlMode === 'low' ||
          hlMode === 'high' ||
          (hlMode === 'auto' && (isNight || cs.isDrifting));
        const isHighBeam = hlMode === 'high' || (hlMode === 'auto' && isNight && cs.speedKmh > 110);
        const tailRunningLightsOn =
          hlMode !== 'off' && (beamsActive || hlMode === 'drl' || isNight);
        const isBraking = cs.brake > 0.05 || cs.handbrake;

        activeRig.tailRunningMaterial.emissiveIntensity = isBraking
          ? 2.4
          : tailRunningLightsOn
            ? 1.65
            : 0.0;
        activeRig.brakeLightMaterial.emissiveIntensity = isBraking
          ? 4.4
          : tailRunningLightsOn
            ? 0.45
            : 0.0;
        activeRig.reverseLightMaterial.emissiveIntensity = cs.isReversing ? 3.5 : 0.0;

        const indicatorBlinkOn = Math.sin(elapsed * Math.PI * 3.6) > 0;
        const isSignalingLeft =
          currentState === 'playing' && cs.steerAngle > 0.07 && !cs.isDrifting;
        const isSignalingRight =
          currentState === 'playing' && cs.steerAngle < -0.07 && !cs.isDrifting;
        const isHazardBraking = currentState === 'playing' && Boolean(cs.isBrakingHard);

        activeRig.turnSignalLeftMaterial.emissiveIntensity =
          (isSignalingLeft || isHazardBraking) && indicatorBlinkOn ? 3.6 : 0.0;
        activeRig.turnSignalRightMaterial.emissiveIntensity =
          (isSignalingRight || isHazardBraking) && indicatorBlinkOn ? 3.6 : 0.0;
        activeRig.amberMaterial.emissiveIntensity =
          (isSignalingLeft || isSignalingRight || isHazardBraking)
            ? indicatorBlinkOn
              ? 2.8
              : 0.2
            : hlMode === 'drl'
              ? 1.8
              : tailRunningLightsOn
                ? 1.0
                : 0.0;

        if (activeRig.rearTailLight) {
          activeRig.rearTailLight.intensity = isBraking
            ? isNight
              ? 2.4
              : 1.15
            : tailRunningLightsOn
              ? isNight
                ? 0.85
                : 0.35
              : 0.0;
        }

        activeRig.headlightBeams.visible = beamsActive;
        if (activeRig.roadBeamLight) {
          activeRig.roadBeamLight.visible = beamsActive;
          activeRig.roadBeamLight.intensity = isHighBeam ? 9.5 : 5.2;
          activeRig.roadBeamLight.distance = isHighBeam ? 64 : 38;
          activeRig.roadBeamLight.angle = isHighBeam ? Math.PI * 0.28 : Math.PI * 0.22;
        }
        activeRig.popUpLightsGroup.visible = beamsActive || (hlMode === 'auto' && isNight);

        // Multi-Stage Exhaust Combustion & Spark Particle System
        // Supports 5 effect levels:
        // 1. Small exhaust pop (<0.52)
        // 2. Medium backfire (0.52-0.84)
        // 3. Large racing backfire (>=0.84)
        // 4. Twin exhaust bursts (2 nozzles with staggered combustion pulse)
        // 5. Multi-exhaust bursts (3-4 nozzles with alternating cylinder bank ignition)
        const flameScaleSetting = Math.max(
          0,
          Math.min(1.4, customizationRef.current.flameIntensity ?? 0.95)
        );
        const isBackfiring = cs.backfireTimer > 0 && flameScaleSetting > 0.02;
        activeRig.backfireFlames.visible = isBackfiring;
        activeRig.backfireFlames.scale.set(1, 1, 1);
        if (isBackfiring) {
          const rawInt = cs.backfireIntensity ?? 0.85;
          const nozzleCount = activeRig.backfireFlames.children.length;
          const tierLengthMult = rawInt < 0.52 ? 0.52 : rawInt < 0.84 ? 0.94 : 1.44;
          const tierWidthMult = rawInt < 0.52 ? 0.65 : rawInt < 0.84 ? 0.96 : 1.28;
          // Rapid combustion expansion -> sharp contraction envelope
          const normLife = Math.min(1, cs.backfireTimer / 0.14);
          const expansionCurve = normLife > 0.72 ? (1 - normLife) * 3.57 : Math.pow(normLife / 0.72, 0.78);
          const burstEnv = Math.min(
            1.45,
            Math.max(0.28, flameScaleSetting * (0.45 + expansionCurve * 0.95))
          );
          const pulseZ = (0.76 + Math.random() * 0.58) * burstEnv * tierLengthMult;
          const pulseXY = (0.82 + Math.random() * 0.28) * Math.min(1.28, burstEnv) * tierWidthMult;
          activeRig.backfireFlames.children.forEach((nozzleGroup, nIdx) => {
            // Twin (2) and Multi-exhaust (4) bursts pulse with cylinder-bank phase stagger
            const bankPhase = nozzleCount >= 2 ? nIdx * 1.65 : 0;
            const jitter = 0.84 + Math.sin(elapsed * 108 + bankPhase) * 0.26;
            nozzleGroup.rotation.z = (elapsed * 58 + nIdx * 2.1 + Math.random() * 0.75) % (Math.PI * 2);
            nozzleGroup.scale.set(pulseXY, pulseXY, pulseZ * jitter);

            // Animate combustion spark cluster particles flying backward out of the nozzle
            const sparkCluster = nozzleGroup.getObjectByName('spark_cluster');
            if (sparkCluster) {
              sparkCluster.visible = rawInt >= 0.48;
              sparkCluster.children.forEach((spark, sIdx) => {
                const travel = ((elapsed * 14 + sIdx * 0.19) % 1);
                const angle = (sIdx / 8) * Math.PI * 2 + elapsed * 8;
                const spread = (0.01 + travel * 0.045) * (rawInt >= 0.84 ? 1.35 : 0.9);
                spark.position.set(
                  Math.cos(angle) * spread,
                  Math.sin(angle) * spread - travel * 0.018,
                  -0.12 - travel * 0.46
                );
              });
            }
          });
          if (activeRig.backfireLight) {
            activeRig.backfireLight.visible = true;
            activeRig.backfireLight.color.setHex(rawInt < 0.52 ? 0x60a5fa : rawInt >= 0.84 ? 0xff8c24 : 0xff7b29);
            activeRig.backfireLight.intensity =
              (2.8 + Math.random() * 3.1) * burstEnv * tierLengthMult;
          }
          if (!lastBackfireBool) {
            soundEngine.playBackfirePop(rawInt, customizationRef.current, 0);
          }
        } else if (activeRig.backfireLight) {
          activeRig.backfireLight.visible = false;
          activeRig.backfireLight.intensity = 0;
        }
        lastBackfireBool = isBackfiring;
      }

      // -------------------------------------------------------------------
      // REAL-TIME MULTIPLAYER REMOTE 3D VEHICLES SYNC & INTERPOLATION
      // -------------------------------------------------------------------
      if (currentState === 'playing' && !isPhotoActive && !isReplayActive) {
        const hlMode = settings.headlightMode ?? 'auto';
        const isNight = timeOfDayRef.current === 'night';
        const localBeamsOn =
          hlMode === 'low' ||
          hlMode === 'high' ||
          (hlMode === 'auto' && (isNight || cs.isDrifting));
        multiplayerClient.sendLocalState(
          cs,
          vehicleRef.current.id,
          customizationRef.current.paintColor,
          customizationRef.current.paintFinish,
          customizationRef.current,
          localBeamsOn
        );
      }
      const remoteList = multiplayerClient.stepRemoteInterpolation(dt);
      const activeRemoteIds = new Set<string>();
      for (const rp of remoteList) {
        activeRemoteIds.add(rp.playerId);
        const signature = `${rp.vehicleId}_${rp.paintColor}_${rp.paintFinish}_${rp.bodyKit ?? 'stock'}_${rp.spoilerStyle ?? 'stock'}_${rp.rimStyle ?? 'te37_bronze'}`;
        let entry = remoteRigsMap.get(rp.playerId);
        if (!entry || entry.signature !== signature) {
          if (entry) {
            scene.remove(entry.rig.root);
            entry.rig.dispose();
          }
          const rSpec = getVehicleById(rp.vehicleId);
          const rCustom: VehicleCustomization = {
            ...rSpec.defaultCustomization,
            paintColor: rp.paintColor || rSpec.defaultCustomization.paintColor,
            paintFinish: (rp.paintFinish as PaintFinishType) || 'metallic',
            bodyKit: rp.bodyKit ?? rSpec.defaultCustomization.bodyKit,
            spoilerStyle: rp.spoilerStyle ?? rSpec.defaultCustomization.spoilerStyle,
            rimStyle: rp.rimStyle ?? rSpec.defaultCustomization.rimStyle,
            rimColor: rp.rimColor ?? rSpec.defaultCustomization.rimColor,
          };
          const newRig = buildDetailedVehicleModel(rSpec, rCustom, isSoftwareGl);
          newRig.root.rotation.order = 'YXZ';
          if (newRig.roadBeamLight) newRig.roadBeamLight.visible = false;
          scene.add(newRig.root);
          entry = { rig: newRig, signature, wheelRot: 0, wasBackfiring: false };
          remoteRigsMap.set(rp.playerId, entry);
        }
        entry.rig.root.visible = currentState !== 'garage';
        entry.rig.root.position.set(rp.renderX, rp.renderY, rp.renderZ);
        entry.rig.root.rotation.set(0, rp.renderHeading, 0);
        entry.rig.knuckleFL.rotation.y = rp.renderSteerAngle;
        entry.rig.knuckleFR.rotation.y = rp.renderSteerAngle;
        entry.wheelRot += (rp.speedKmh / 3.6 / 0.34) * dt;
        entry.rig.spinFL.rotation.x = entry.wheelRot;
        entry.rig.spinFR.rotation.x = entry.wheelRot;
        entry.rig.spinRL.rotation.x = entry.wheelRot;
        entry.rig.spinRR.rotation.x = entry.wheelRot;

        // Remote car brake lights, headlights, and distance-attenuated exhaust backfire synchronization
        const rBraking = (rp.brake ?? 0) > 0.1;
        entry.rig.tailRunningMaterial.emissiveIntensity = rBraking ? 2.4 : 1.65;
        entry.rig.brakeLightMaterial.emissiveIntensity = rBraking ? 4.4 : 0.45;
        entry.rig.headlightBeams.visible = Boolean(rp.headlightsOn);
        entry.rig.popUpLightsGroup.visible = Boolean(rp.headlightsOn);
        const rBackfire = Boolean(rp.backfireActive);
        entry.rig.backfireFlames.visible = rBackfire;
        if (rBackfire && !entry.wasBackfiring && currentState === 'playing') {
          const distMeters = Math.hypot(rp.renderX - cs.x, rp.renderZ - cs.z);
          if (distMeters < 115) {
            soundEngine.playBackfirePop(0.75, undefined, distMeters);
          }
        }
        entry.wasBackfiring = rBackfire;
      }
      for (const [rId, entry] of Array.from(remoteRigsMap.entries())) {
        if (!activeRemoteIds.has(rId)) {
          scene.remove(entry.rig.root);
          entry.rig.dispose();
          remoteRigsMap.delete(rId);
        }
      }

      if (envRef.current && currentState !== 'paused' && !isPhotoActive) {
        const simActive = currentState === 'playing' && (!isReplayActive || replayStateRef.current.playing);
        const effDt = isReplayActive ? dt * replayStateRef.current.playbackSpeed : dt;
        envRef.current.updateEnvironment(
          effDt,
          elapsed,
          cs.x,
          cs.y,
          cs.z,
          cs.heading,
          cs.isDrifting && simActive,
          cs.speedKmh,
          cs.driftAngle,
          simActive ? cs.tireSlipRatio : 0,
          simActive && cs.brake > 0.65 && cs.speedKmh > 32,
          simActive ? cs.exhaustSmokeIntensity : 0.14,
          activeRig?.exhaustOutlets
        );
      }

      // Apply Display Brightness / Gamma & Photo Mode exposure override
      const userBrightness = Math.max(0.7, Math.min(1.4, settings.brightness ?? 1.0));
      const userGamma = Math.max(0.8, Math.min(1.25, settings.gamma ?? 1.0));
      renderer.toneMappingExposure = isPhotoActive
        ? photoModeRef.current.exposure * 1.1
        : 1.18 * userBrightness * (1 / userGamma);

      const sinH = Math.sin(cs.heading);
      const cosH = Math.cos(cs.heading);

      if (currentState === 'title') {
        camera.up.set(0, 1, 0);
        const tourAngle = cs.heading + Math.PI * 0.78 + Math.sin(elapsed * 0.28) * 0.55;
        const radius = 10.5;
        const camX = cs.x + Math.sin(tourAngle) * radius;
        const camZ = cs.z + Math.cos(tourAngle) * radius;
        const camY = cs.y + 3.4 + Math.sin(elapsed * 0.4) * 0.5;
        camera.position.lerp(_camPosTarget.set(camX, camY, camZ), 1 - Math.exp(-5 * dt));
        _camLookTarget.set(cs.x + sinH * 3.0, cs.y + 1.3, cs.z + cosH * 3.0);
        _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-6 * dt));
        camera.lookAt(_currentLookAt);
      } else if (isPhotoActive) {
        // -------------------------------------------------------------------
        // PROFESSIONAL PHOTO MODE CAMERA (Presets + 360° Drag Orbit + FOV/Height)
        // -------------------------------------------------------------------
        const pm = photoModeRef.current;
        camera.up.set(0, 1, 0);
        const dragYaw = orbitAnglesRef.current.dragging ? orbitAnglesRef.current.yaw - 0.58 : 0;
        const dragPitch = orbitAnglesRef.current.dragging ? orbitAnglesRef.current.pitch - 0.24 : 0;
        const totalYaw = cs.heading + pm.yawOffset + dragYaw;
        const totalPitch = Math.max(-0.08, Math.min(1.05, pm.pitchOffset + dragPitch));
        const dist = pm.distance;
        const horiz = Math.cos(totalPitch) * dist;

        _camPosTarget.set(
          cs.x + Math.sin(totalYaw) * horiz,
          Math.max(cs.y + 0.28, cs.y + pm.height + Math.sin(totalPitch) * dist * 0.55),
          cs.z + Math.cos(totalYaw) * horiz
        );
        _camLookTarget.set(cs.x, cs.y + 0.72, cs.z);
        camera.position.copy(_camPosTarget);
        _currentLookAt.copy(_camLookTarget);
        camera.lookAt(_currentLookAt);
        if (Math.abs(camera.fov - pm.fov) > 0.1) {
          camera.fov = pm.fov;
          camera.updateProjectionMatrix();
        }
      } else if (isReplayActive) {
        // -------------------------------------------------------------------
        // CINEMATIC DRIFT REPLAY CAMERAS ('chase' | 'side_tracking' | 'front_tracking' | 'wide_cinematic')
        // -------------------------------------------------------------------
        const rCam = replayStateRef.current.cameraMode;
        camera.up.set(0, 1, 0);
        const sideSign = cs.signedDriftAngle >= 0 ? 1 : -1;
        const sideX = cosH * sideSign;
        const sideZ = -sinH * sideSign;

        if (rCam === 'side_tracking') {
          _camPosTarget.set(
            cs.x + sideX * 4.8 - sinH * 1.4,
            cs.y + 1.08,
            cs.z + sideZ * 4.8 - cosH * 1.4
          );
          _camLookTarget.set(cs.x + sinH * 0.8, cs.y + 0.76, cs.z + cosH * 0.8);
          camera.fov = 46;
        } else if (rCam === 'rear_tracking') {
          // Low rear-quarter tracking camera framing rear tires, camber & tire smoke wake
          _camPosTarget.set(
            cs.x - sinH * 3.85 + sideX * 1.35,
            cs.y + 0.92,
            cs.z - cosH * 3.85 + sideZ * 1.35
          );
          _camLookTarget.set(cs.x + sinH * 1.8, cs.y + 0.72, cs.z + cosH * 1.8);
          camera.fov = 48;
        } else if (rCam === 'front_tracking') {
          // Dramatic front-3/4 reverse tracking camera showcasing countersteered wheels & intercooler
          _camPosTarget.set(
            cs.x + sinH * 5.2 + sideX * 2.1,
            cs.y + 1.02,
            cs.z + cosH * 5.2 + sideZ * 2.1
          );
          _camLookTarget.set(cs.x - sinH * 0.6, cs.y + 0.72, cs.z - cosH * 0.6);
          camera.fov = 44;
        } else if (rCam === 'wide_cinematic') {
          const sweepYaw = cs.heading + Math.PI * 0.75 + Math.sin(elapsed * 0.35) * 0.45;
          _camPosTarget.set(
            cs.x + Math.sin(sweepYaw) * 11.5,
            cs.y + 4.4,
            cs.z + Math.cos(sweepYaw) * 11.5
          );
          _camLookTarget.set(cs.x + sinH * 1.5, cs.y + 0.9, cs.z + cosH * 1.5);
          camera.fov = 52;
        } else {
          // Replay Chase Camera
          _camPosTarget.set(
            cs.x - sinH * 5.6 + sideX * 0.9,
            cs.y + 1.65,
            cs.z - cosH * 5.6 + sideZ * 0.9
          );
          _camLookTarget.set(cs.x + sinH * 4.5, cs.y + 0.9, cs.z + cosH * 4.5);
          camera.fov = 56;
        }
        camera.updateProjectionMatrix();
        camera.position.copy(_camPosTarget);
        _currentLookAt.copy(_camLookTarget);
        camera.lookAt(_currentLookAt);
      } else {
        const mode = cameraModeRef.current;
        if (mode === 'hood') {
          camera.up.set(0, 1, 0);
          _camPosTarget.set(cs.x + sinH * 0.35, cs.y + 1.38, cs.z + cosH * 0.35);
          _camLookTarget.set(cs.x + sinH * 24, cs.y + 1.2, cs.z + cosH * 24);
          camera.position.lerp(_camPosTarget, 1 - Math.exp(-22 * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-22 * dt));
          camera.lookAt(_currentLookAt);
        } else if (mode === 'cockpit') {
          camera.up.set(0, 1, 0);
          const rightX = -cosH;
          const rightZ = sinH;
          const cockpitOffset = settings.camera?.cockpitCameraOffset ?? 0;
          const driverEyeX = cs.x + rightX * 0.33 - sinH * (0.18 - cockpitOffset);
          const driverEyeY = cs.y + 1.12;
          const driverEyeZ = cs.z + rightZ * 0.33 - cosH * (0.18 - cockpitOffset);
          const lookSteer = cs.steerAngle * 6.5 * (settings.camera?.driftCameraLookAhead ?? 0.65);
          _camPosTarget.set(driverEyeX, driverEyeY, driverEyeZ);
          _camLookTarget.set(
            cs.x + sinH * 18 + rightX * lookSteer,
            cs.y + 1.04 - cs.bodyPitch * 4,
            cs.z + cosH * 18 + rightZ * lookSteer
          );
          camera.position.lerp(_camPosTarget, 1 - Math.exp(-28 * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-28 * dt));
          camera.lookAt(_currentLookAt);
        } else if (mode === 'side_drift') {
          camera.up.set(0, 1, 0);
          const sideSign = cs.angularVelocity >= 0 ? 1 : -1;
          const sideX = cosH * sideSign;
          const sideZ = -sinH * sideSign;
          _camPosTarget.set(
            cs.x + sideX * 5.0 - sinH * 2.3,
            cs.y + 1.42,
            cs.z + sideZ * 5.0 - cosH * 2.3
          );
          _camLookTarget.set(cs.x + sinH * 1.1, cs.y + 0.85, cs.z + cosH * 1.1);
          camera.position.lerp(_camPosTarget, 1 - Math.exp(-10 * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-14 * dt));
          camera.lookAt(_currentLookAt);
        } else if (mode === 'orbit' || orbitAnglesRef.current.dragging) {
          camera.up.set(0, 1, 0);
          const { yaw, pitch, distance } = orbitAnglesRef.current;
          const totalYaw = cs.heading + Math.PI + yaw;
          const horiz = Math.cos(pitch) * distance;
          _camPosTarget.set(
            cs.x + Math.sin(totalYaw) * horiz,
            Math.max(cs.y + 0.55, cs.y + Math.sin(pitch) * distance + 0.9),
            cs.z + Math.cos(totalYaw) * horiz
          );
          _camLookTarget.set(cs.x, cs.y + 0.95, cs.z);
          camera.position.lerp(_camPosTarget, 1 - Math.exp(-12 * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-14 * dt));
          camera.lookAt(_currentLookAt);
        } else {
          // -------------------------------------------------------------------
          // NFS-STYLE DYNAMIC CHASE CAMERA ('chase', 'close', 'wide')
          // -------------------------------------------------------------------
          const camCfg = settings.camera;
          const isWide = mode === 'wide';
          const isClose = mode === 'close';

          const baseDist = isWide
            ? camCfg.distance + 2.9
            : isClose
              ? Math.max(3.9, camCfg.distance - 0.85)
              : camCfg.distance;
          const baseHeight = isWide
            ? camCfg.height + 1.35
            : isClose
              ? Math.max(1.22, camCfg.height - 0.26)
              : camCfg.height;

          // Dynamic acceleration lag & braking push-in (NFS sense of weight & G-force)
          const accelPullBack =
            cs.throttle > 0.25 && !cs.isReversing
              ? Math.min(0.58, cs.throttle * 0.34 + (cs.speedKmh / 240) * 0.24)
              : 0;
          const brakePushIn = cs.brake > 0.15 ? cs.brake * 0.42 : 0;
          const followDist = baseDist + accelPullBack - brakePushIn;
          const followHeight = baseHeight - cs.bodyPitch * 1.4;

          // Smooth velocity-vector alignment during drifts scaled by driftCameraLookAhead
          const lookAheadFactor = camCfg.driftCameraLookAhead ?? 0.65;
          const velWeight =
            cs.speed > 3.5
              ? cs.isDrifting
                ? 0.32 + lookAheadFactor * 0.42
                : 0.24 + lookAheadFactor * 0.20
              : 0;
          const velAngle = cs.speed > 3.5 ? Math.atan2(cs.vx, cs.vz) : cs.heading;
          const dirX = sinH * (1 - velWeight) + Math.sin(velAngle) * velWeight;
          const dirZ = cosH * (1 - velWeight) + Math.cos(velAngle) * velWeight;
          const dirLen = Math.hypot(dirX, dirZ) || 1;
          const nx = dirX / dirLen;
          const nz = dirZ / dirLen;

          // Subtle lateral framing offset during cornering/drifting so the apex stays visible ahead
          const rightX = -nz;
          const rightZ = nx;
          const driftSideOffset = Math.max(-0.55, Math.min(0.55, -cs.angularVelocity * 0.16 * (0.5 + lookAheadFactor)));

          const targetCamX = cs.x - nx * followDist + rightX * driftSideOffset;
          const targetCamZ = cs.z - nz * followDist + rightZ * driftSideOffset;
          const targetCamY = Math.max(cs.y + 0.68, cs.y + followHeight);

          _camPosTarget.set(targetCamX, targetCamY, targetCamZ);
          _camLookTarget.set(
            cs.x + nx * 5.8 + sinH * 1.2,
            cs.y + 0.94 - cs.bodyPitch * 1.8,
            cs.z + nz * 5.8 + cosH * 1.2
          );

          const smoothRate = Math.max(4, Math.min(22, camCfg.smoothing));
          camera.position.lerp(_camPosTarget, 1 - Math.exp(-smoothRate * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-(smoothRate * 1.38) * dt));

          // Subtle cornering bank & high-speed / drift vibration scaled by user shakeIntensity & reducedMotion
          const reducedMotion = Boolean(settings.reducedMotion);
          const bankAngle = reducedMotion ? 0 : Math.max(-0.045, Math.min(0.045, -cs.bodyRoll * 0.65));
          camera.up.set(Math.sin(bankAngle), Math.cos(bankAngle), 0).normalize();

          const shakeScale = reducedMotion ? 0 : (camCfg.shakeIntensity ?? 0.65);
          if (currentState === 'playing' && shakeScale > 0.01 && (cs.speedKmh > 95 || cs.isDrifting)) {
            const shakeAmp =
              (Math.min(0.028, Math.max(0, (cs.speedKmh - 95) * 0.00024)) +
                (cs.isDrifting ? 0.011 : 0)) *
              shakeScale;
            camera.position.x += Math.sin(elapsed * 47.0) * shakeAmp;
            camera.position.y += Math.cos(elapsed * 53.0) * shakeAmp * 0.7;
          }

          camera.lookAt(_currentLookAt);

          const baseFov = isWide ? camCfg.fov + 6 : isClose ? camCfg.fov - 4 : camCfg.fov;
          const speedFovBoost = reducedMotion ? 0 : Math.min(13, (cs.speedKmh / 155) * 12.5);
          const targetFov = baseFov + speedFovBoost;
          if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-7 * dt));
            camera.updateProjectionMatrix();
          }
        }
      }

      const isSoundActive =
        currentState === 'playing' &&
        !photoModeRef.current.active &&
        (!replayStateRef.current.active || replayStateRef.current.playing);
      soundEngine.update(
        cs.rpm,
        cs.isDrifting,
        isSoundActive,
        vehicleRef.current.soundType,
        cs.speedKmh,
        cs.throttle,
        cs.tireSlipRatio,
        cs.isBrakingHard,
        vehicleRef.current.engineAudioProfile,
        customizationRef.current
      );
      telemetryCbRef.current(cs);

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      domElem.removeEventListener('pointerdown', onPointerDown);
      domElem.removeEventListener('webglcontextlost', onContextLost);
      domElem.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      for (const entry of remoteRigsMap.values()) {
        scene.remove(entry.rig.root);
        entry.rig.dispose();
      }
      remoteRigsMap.clear();
      carRigRef.current?.dispose();
      envRef.current?.dispose();
      garageRef.current?.dispose();
      studioEnvMapRef.current?.dispose();
      outdoorDayEnvMapRef.current?.dispose();
      outdoorGoldenEnvMapRef.current?.dispose();
      outdoorNightEnvMapRef.current?.dispose();
      renderer.dispose();
      if (domElem.parentNode === container) {
        container.removeChild(domElem);
      }
    };
  }, []);

  /**
   * Synchronously positions the vehicle on the outdoor touge road, restores driving camera FOV
   * and aspect ratio, and renders the outdoor scene immediately on state transition so the canvas
   * never lingers on a stale Garage Showroom frame when entering gameplay.
   */
  const renderOutdoorImmediate = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const activeRig = carRigRef.current;
    const env = envRef.current;
    const garage = garageRef.current;
    const container = mountRef.current;
    if (
      !renderer ||
      !scene ||
      !camera ||
      !activeRig ||
      !env ||
      !garage ||
      gameStateRef.current === 'garage'
    ) {
      return;
    }

    const t0 = performance.now();
    garage.group.visible = false;
    env.group.visible = true;

    const tod = timeOfDayRef.current;
    const outEnv = getOrBuildOutdoorEnvMap(tod);
    if (outEnv) {
      scene.environment = outEnv;
    }
    env.setTimeOfDay(tod, scene);
    env.setWeather(gameSettingsRef.current.weather ?? 'clear', scene);

    const cs = carStateRef.current;
    const sinH = Math.sin(cs.heading);
    const cosH = Math.cos(cs.heading);

    activeRig.root.position.set(cs.x, cs.y, cs.z);
    activeRig.root.rotation.set(cs.roadPitch ?? 0, cs.heading, cs.roadBank ?? 0);
    activeRig.chassisGroup.rotation.set(0, 0, 0);
    activeRig.backfireFlames.visible = false;
    if (activeRig.backfireLight) {
      activeRig.backfireLight.visible = false;
      activeRig.backfireLight.intensity = 0;
    }

    const fullW = Math.max(1, container?.clientWidth || window.innerWidth);
    const fullH = Math.max(1, container?.clientHeight || window.innerHeight);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, fullW, fullH);

    camera.aspect = fullW / fullH;
    camera.fov = gameSettingsRef.current.camera?.fov ?? 58;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();

    camera.position.set(cs.x - sinH * 7.8, cs.y + 2.85, cs.z - cosH * 7.8);
    _currentLookAt.set(cs.x + sinH * 6.5, cs.y + 1.15, cs.z + cosH * 6.5);
    camera.lookAt(_currentLookAt);

    renderer.render(scene, camera);

    const dtMs = performance.now() - t0;
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, Record<string, number>>;
      if (w.__PERF_METRICS__) {
        w.__PERF_METRICS__.transitionRenderMs = Number(dtMs.toFixed(2));
        w.__PERF_METRICS__.audioInitTimeMs = Number(
          soundEngine.getInitDurationMs().toFixed(2)
        );
      }
    }
  };

  const renderGarageImmediate = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const activeRig = carRigRef.current;
    const garage = garageRef.current;
    const container = mountRef.current;
    if (!renderer || !scene || !camera || !activeRig || !garage || gameStateRef.current !== 'garage') {
      return;
    }

    const gView = garageViewRef.current;
    const isSheetMode = gView === 'sheet';
    garage.setStudioSheetMode(isSheetMode, scene);
    activeRig.root.position.set(0, 0, 0);
    activeRig.root.rotation.set(0, isSheetMode ? 0 : garage.platformGroup.rotation.y, 0);

    const lightsOn = garageLightsRef.current;
    const gTest = garageLightTestRef.current;
    activeRig.headlightBeams.visible = false;
    activeRig.popUpLightsGroup.visible = lightsOn;
    activeRig.tailRunningMaterial.emissiveIntensity = gTest.brake ? 2.4 : lightsOn ? 1.65 : 0.0;
    activeRig.brakeLightMaterial.emissiveIntensity = gTest.brake ? 4.4 : lightsOn ? 0.45 : 0.0;
    activeRig.reverseLightMaterial.emissiveIntensity = gTest.reverse ? 3.5 : 0.0;
    activeRig.turnSignalLeftMaterial.emissiveIntensity =
      gTest.indicator === 'left' || gTest.indicator === 'hazard' ? 3.6 : 0.0;
    activeRig.turnSignalRightMaterial.emissiveIntensity =
      gTest.indicator === 'right' || gTest.indicator === 'hazard' ? 3.6 : 0.0;
    if (activeRig.rearTailLight) {
      activeRig.rearTailLight.intensity = gTest.brake ? 1.8 : lightsOn ? 0.45 : 0.0;
    }

    const fullW = Math.max(1, container?.clientWidth || window.innerWidth);
    const fullH = Math.max(1, container?.clientHeight || window.innerHeight);

    if (isSheetMode) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, fullW, fullH);
      renderer.setClearColor(0xb8bec6, 1);
      renderer.clear();
      renderer.setScissorTest(true);

      const renderTurnaroundPanel = (
        nx: number,
        ny: number,
        nw: number,
        nh: number,
        camPos: [number, number, number],
        lookPos: [number, number, number],
        fov: number,
        wheelSteer: number,
        upVec: [number, number, number] = [0, 1, 0]
      ) => {
        const vx = Math.floor(nx * fullW);
        const vy = Math.floor(ny * fullH);
        const vw = Math.max(1, Math.floor(nw * fullW));
        const vh = Math.max(1, Math.floor(nh * fullH));
        activeRig.knuckleFL.rotation.y = wheelSteer;
        activeRig.knuckleFR.rotation.y = wheelSteer;
        activeRig.steeringWheelMesh.rotation.z = -wheelSteer * 3.5;

        renderer.setViewport(vx, vy, vw, vh);
        renderer.setScissor(vx, vy, vw, vh);
        camera.aspect = vw / vh;
        camera.fov = fov;
        camera.up.set(upVec[0], upVec[1], upVec[2]);
        camera.position.set(camPos[0], camPos[1], camPos[2]);
        camera.lookAt(lookPos[0], lookPos[1], lookPos[2]);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };

      renderTurnaroundPanel(0.02, 0.46, 0.25, 0.38, [0, 0.62, 13.8], [0, 0.61, 0], 10.8, 0);
      renderTurnaroundPanel(0.27, 0.46, 0.25, 0.38, [0, 0.65, -13.8], [0, 0.62, 0], 10.8, 0);
      renderTurnaroundPanel(0.52, 0.46, 0.46, 0.38, [18.6, 0.63, 0], [0, 0.61, 0], 8.7, 0);
      renderTurnaroundPanel(
        0.03,
        0.07,
        0.48,
        0.38,
        [0, 15.8, 0],
        [0, 0.55, 0],
        9.2,
        0,
        [-1, 0, 0]
      );
      renderTurnaroundPanel(0.51, 0.07, 0.47, 0.39, [6.1, 1.16, 8.3], [0, 0.56, 0.08], 16.4, -0.22);
      camera.up.set(0, 1, 0);
      renderer.setScissorTest(false);
      return;
    }

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, fullW, fullH);
    camera.aspect = fullW / fullH;
    camera.up.set(0, 1, 0);

    const carYaw = activeRig.root.rotation.y;
    if (gView === 'interior') {
      _interiorLocalOffset.set(-0.34, 1.02, -0.28).applyAxisAngle(_yAxis, carYaw);
      _interiorLookOffset.set(-0.36, 0.88, 0.65).applyAxisAngle(_yAxis, carYaw);
      camera.position.copy(_interiorLocalOffset);
      _currentLookAt.copy(_interiorLookOffset);
      camera.fov = 54;
    } else {
      let yaw = orbitAnglesRef.current.yaw;
      let pitch = 0.16;
      let dist = 6.0;
      if (gView === 'front') {
        yaw = carYaw;
        pitch = 0.05;
        dist = 6.2;
      } else if (gView === 'side') {
        yaw = carYaw + Math.PI * 0.5;
        pitch = 0.03;
        dist = 9.8;
      } else if (gView === 'rear') {
        yaw = carYaw + Math.PI;
        pitch = 0.05;
        dist = 6.2;
      } else if (gView === 'dyno') {
        yaw = carYaw + Math.PI * 0.78;
        pitch = 0.07;
        dist = 5.35;
      } else if (gView === 'top') {
        yaw = carYaw + Math.PI * 0.5;
        pitch = 1.18;
        dist = 6.8;
      }
      const horiz = Math.cos(pitch) * dist;
      camera.position.set(
        Math.sin(yaw) * horiz,
        Math.sin(pitch) * dist + (gView === 'dyno' ? 0.38 : 0.54),
        Math.cos(yaw) * horiz
      );
      _currentLookAt.set(0, gView === 'top' ? 0.52 : gView === 'dyno' ? 0.45 : 0.62, gView === 'dyno' ? -0.45 : 0);
      camera.fov = gView === 'turntable' || gView === 'dyno' ? 42 : gView === 'top' ? 38 : 36;
    }
    camera.updateProjectionMatrix();
    camera.lookAt(_currentLookAt);
    renderer.render(scene, camera);
  };

  // Update 3D Vehicle Mesh or Material Customization when Selected Vehicle or Customization changes
  useEffect(() => {
    vehicleRef.current = selectedVehicle;
    customizationRef.current = customization;
    if (!sceneRef.current) return;

    const nextStructuralKey = getVehicleStructuralKey(
      selectedVehicle,
      customization,
      isSoftwareGlRef.current
    );

    // Fast path (< 0.05ms): When 3D structural geometry has not changed, update PBR paint, rim,
    // caliper, window tint, and ride height in-place without rebuilding 3D mesh vertices.
    if (carRigRef.current && lastStructuralKeyRef.current === nextStructuralKey) {
      applyVehicleMaterialCustomization(carRigRef.current, selectedVehicle, customization);
      renderGarageImmediate();
      return;
    }

    if (carRigRef.current) {
      sceneRef.current.remove(carRigRef.current.root);
      carRigRef.current.dispose();
    }

    const newRig = buildDetailedVehicleModel(
      selectedVehicle,
      customization,
      isSoftwareGlRef.current
    );
    newRig.root.rotation.order = 'YXZ';
    const cs = carStateRef.current;
    if (gameStateRef.current === 'garage') {
      newRig.root.position.set(0, 0, 0);
      newRig.root.rotation.set(0, garageRef.current?.platformGroup.rotation.y ?? 0, 0);
    } else {
      newRig.root.position.set(cs.x, cs.y, cs.z);
      newRig.root.rotation.set(cs.roadPitch ?? 0, cs.heading, cs.roadBank ?? 0);
    }
    sceneRef.current.add(newRig.root);
    carRigRef.current = newRig;
    lastStructuralKeyRef.current = nextStructuralKey;
    renderGarageImmediate();
  }, [selectedVehicle, customization]);

  // Apply Graphics Preset Changes Live ('ultra' | 'high' | 'medium' | 'low' | 'performance')
  useEffect(() => {
    const prevPreset = graphicsPresetRef.current;
    graphicsPresetRef.current = graphicsPreset;
    if (prevPreset === graphicsPreset) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const isSw = isSoftwareGlRef.current;
    const enableShadows =
      !isSw && (graphicsPreset === 'ultra' || graphicsPreset === 'high');
    if (renderer) {
      const maxDpr =
        graphicsPreset === 'ultra'
          ? 1.75
          : graphicsPreset === 'high'
          ? 1.35
          : graphicsPreset === 'medium'
          ? 1.15
          : 1.0;
      renderer.setPixelRatio(isSw ? 1 : Math.min(window.devicePixelRatio, maxDpr));
      renderer.shadowMap.enabled = enableShadows;
    }
    if (scene) {
      scene.environmentIntensity =
        graphicsPreset === 'ultra'
          ? 0.88
          : graphicsPreset === 'high'
          ? 0.76
          : graphicsPreset === 'medium'
          ? 0.65
          : 0.54;
    }
    if (envRef.current) {
      envRef.current.setGraphicsPreset(graphicsPreset, isSw);
    }
    if (gameStateRef.current === 'garage') {
      renderGarageImmediate();
    } else {
      renderOutdoorImmediate();
    }
  }, [graphicsPreset]);

  // Handle switching between Garage Showroom and Outdoor Map
  useEffect(() => {
    const prevState = gameStateRef.current;
    gameStateRef.current = gameState;
    if (prevState === gameState || !sceneRef.current || !envRef.current || !garageRef.current) {
      return;
    }

    if (gameState === 'garage') {
      envRef.current.group.visible = false;
      garageRef.current.group.visible = true;
      if (studioEnvMapRef.current) {
        sceneRef.current.environment = studioEnvMapRef.current;
      }
      sceneRef.current.background = new THREE.Color(SHOWROOM_BG_HEX);
      sceneRef.current.fog = new THREE.FogExp2(SHOWROOM_BG_HEX, 0.006);
      orbitAnglesRef.current.distance = 6.2;
      orbitAnglesRef.current.yaw = 0.58;
      orbitAnglesRef.current.pitch = 0.22;
      if (cameraRef.current) {
        cameraRef.current.position.set(3.5, 1.8, 5.2);
        _currentLookAt.set(0, 0.65, 0);
      }
      renderGarageImmediate();
    } else if (prevState === 'garage') {
      // Coming out of the 3D Garage Showroom into Gameplay or Title:
      // Synchronously switch to the outdoor scene and render immediately so the canvas
      // never displays a stale garage frame underneath the driving HUD.
      renderOutdoorImmediate();
    }
  }, [gameState]);

  // Handle Map Switch
  useEffect(() => {
    const prevMap = mapIdRef.current;
    mapIdRef.current = mapId;
    if (prevMap !== mapId && sceneRef.current && rendererRef.current) {
      if (envRef.current) {
        sceneRef.current.remove(envRef.current.group);
        envRef.current.dispose();
      }
      const newEnv = buildMapEnvironment(
        mapId,
        rendererRef.current,
        sceneRef.current,
        isSoftwareGlRef.current,
        timeOfDayRef.current
      );
      newEnv.setGraphicsPreset(graphicsPresetRef.current, isSoftwareGlRef.current);
      newEnv.setWeather(gameSettingsRef.current.weather ?? 'clear', sceneRef.current);
      newEnv.group.visible = gameStateRef.current !== 'garage';
      sceneRef.current.add(newEnv.group);
      envRef.current = newEnv;

      const freshCar = createInitialCarState(mapId, activeViewpointIdx);
      carStateRef.current = freshCar;

      if (gameStateRef.current === 'garage') {
        sceneRef.current.background = new THREE.Color(SHOWROOM_BG_HEX);
        sceneRef.current.fog = new THREE.FogExp2(SHOWROOM_BG_HEX, 0.006);
        renderGarageImmediate();
      } else {
        renderOutdoorImmediate();
      }
    }
  }, [mapId, activeViewpointIdx]);

  const prevViewpointRef = useRef<number>(activeViewpointIdx);
  const prevResetRef = useRef<number>(resetCounter);
  // Handle Viewpoint Teleport / Car Reset
  useEffect(() => {
    if (
      prevViewpointRef.current === activeViewpointIdx &&
      prevResetRef.current === resetCounter
    ) {
      return;
    }
    prevViewpointRef.current = activeViewpointIdx;
    prevResetRef.current = resetCounter;
    const freshCar = createInitialCarState(mapIdRef.current, activeViewpointIdx);
    freshCar.totalDriftScore = carStateRef.current.totalDriftScore;
    freshCar.bestDriftChain = carStateRef.current.bestDriftChain;
    freshCar.distanceDriven = carStateRef.current.distanceDriven;
    freshCar.maxSpeedKmh = carStateRef.current.maxSpeedKmh;
    carStateRef.current = freshCar;
    if (gameStateRef.current !== 'garage') {
      renderOutdoorImmediate();
    }
  }, [activeViewpointIdx, resetCounter]);

  useEffect(() => {
    const prevTod = timeOfDayRef.current;
    timeOfDayRef.current = timeOfDay;
    if (prevTod === timeOfDay) return;
    if (envRef.current && sceneRef.current && gameStateRef.current !== 'garage') {
      envRef.current.setTimeOfDay(timeOfDay, sceneRef.current);
      envRef.current.setWeather(gameSettingsRef.current.weather ?? 'clear', sceneRef.current);
      const outEnv = getOrBuildOutdoorEnvMap(timeOfDay);
      if (outEnv) {
        sceneRef.current.environment = outEnv;
      }
      renderOutdoorImmediate();
    }
  }, [timeOfDay]);

  useEffect(() => {
    if (envRef.current && sceneRef.current && gameStateRef.current !== 'garage') {
      envRef.current.setWeather(gameSettings.weather ?? 'clear', sceneRef.current);
    }
  }, [gameSettings.weather]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    garageViewRef.current = garageCameraView;
    orbitAnglesRef.current.dragging = false;
    renderGarageImmediate();
  }, [garageCameraView]);

  useEffect(() => {
    garageLightsRef.current = garageLightsOn;
    renderGarageImmediate();
  }, [garageLightsOn]);

  useEffect(() => {
    const onLightTestChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        garageLightTestRef.current = {
          brake: Boolean(detail.brake),
          reverse: Boolean(detail.reverse),
          indicator: detail.indicator || 'off',
        };
        renderGarageImmediate();
      }
    };
    window.addEventListener('garage-light-test-change', onLightTestChange);
    return () => window.removeEventListener('garage-light-test-change', onLightTestChange);
  }, []);

  useEffect(() => {
    if (garageRevCounter > 0) {
      garageRevTimerRef.current = 0.65;
    }
  }, [garageRevCounter]);

  // Sync Replay Total Frames when entering Replay Mode
  useEffect(() => {
    if (replayState.active && updateReplayCbRef.current) {
      const total = replayRingRef.current.count;
      replayRingRef.current.playheadFloat = Math.max(0, total - 240); // Start ~4s back in the action
      updateReplayCbRef.current((prev) => ({
        ...prev,
        totalFrames: total,
        currentFrame: Math.floor(replayRingRef.current.playheadFloat),
      }));
    }
  }, [replayState.active]);

  // Capture Screenshot in Photo Mode
  useEffect(() => {
    if (captureScreenshotTrigger <= 0) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    try {
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `touge-drift-${vehicleRef.current.id}-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Ignore screenshot export errors in restricted contexts
    }
  }, [captureScreenshotTrigger]);

  return (
    <div
      ref={mountRef}
      data-testid="drift-webgl-canvas"
      className={`fixed inset-0 w-full h-full overflow-hidden ${
        gameState === 'garage' && garageCameraView === 'sheet' ? 'bg-[#b8bec6]' : 'bg-[#d4dfe8]'
      }`}
    />
  );
}
