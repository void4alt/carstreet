import {
  CreateRoomPayload,
  MultiplayerMode,
  MultiplayerPlayerState,
  MultiplayerRoomInfo,
  MultiplayerRoomStore,
} from './multiplayerStore';
import {
  BodyKitType,
  CarState,
  MapId,
  PaintFinishType,
  RimStyleType,
  SpoilerStyleType,
  TimeOfDay,
  VehicleCustomization,
  WeatherMode,
} from './types';
import { createInitialCarState } from './carPhysics';
import { getMapRoadSamples } from './roadMath';

const fallbackRoomStore = new MultiplayerRoomStore();

export type MultiplayerRoomSummary = MultiplayerRoomInfo;
export type RemotePlayerState = MultiplayerPlayerState;

export interface InterpolatedRemotePlayer extends MultiplayerPlayerState {
  renderX: number;
  renderY: number;
  renderZ: number;
  renderHeading: number;
  renderSteerAngle: number;
}

export interface JoinRoomOptions {
  roomId?: string;
  inviteCode?: string;
  password?: string;
  vehicleId?: string;
  paintColor?: string;
  paintFinish?: PaintFinishType;
  bodyKit?: BodyKitType;
  spoilerStyle?: SpoilerStyleType;
  rimStyle?: RimStyleType;
  rimColor?: string;
  customization?: Partial<VehicleCustomization>;
  initialCarState?: CarState;
}

export interface CreateAndJoinRoomOptions {
  name: string;
  isPrivate?: boolean;
  password?: string;
  maxPlayers?: number;
  mapId?: MapId;
  mode?: string;
  weather?: WeatherMode;
  timeOfDay?: TimeOfDay;
  collisionsEnabled?: boolean;
  totalLaps?: number;
  vehicleRestriction?: 'any' | 'rwd_only' | 'jdm_legends';
  vehicleId?: string;
  paintColor?: string;
  paintFinish?: PaintFinishType;
  bodyKit?: BodyKitType;
  spoilerStyle?: SpoilerStyleType;
  rimStyle?: RimStyleType;
  rimColor?: string;
  customization?: Partial<VehicleCustomization>;
}

type RoomListener = (
  room: MultiplayerRoomInfo | null,
  players: MultiplayerPlayerState[],
  connectionStatus: 'disconnected' | 'connecting' | 'connected',
  errorMsg: string | null
) => void;

function normalizeMultiplayerMode(mode?: string): MultiplayerMode {
  switch (mode) {
    case 'tandem':
    case 'tandem_drift':
      return 'tandem';
    case 'drift_battle':
      return 'drift_battle';
    case 'sprint_race':
    case 'sprint':
      return 'sprint_race';
    case 'circuit_race':
    case 'circuit':
      return 'circuit_race';
    case 'touge_battle':
      return 'touge_battle';
    case 'time_attack':
      return 'time_attack';
    case 'free_drift':
    case 'free_roam':
    default:
      return 'free_drift';
  }
}

class MultiplayerClientManager {
  public playerId: string;
  public playerName: string;
  public activeRoom: MultiplayerRoomInfo | null = null;
  public connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  public lastError: string | null = null;
  public pingMs = 18;

  private ws: WebSocket | null = null;
  private remotePlayers = new Map<string, InterpolatedRemotePlayer>();
  private allPlayers: MultiplayerPlayerState[] = [];
  private listeners = new Set<RoomListener>();
  private httpSyncTimer: number | null = null;
  private pingTimer: number | null = null;
  private lastSentMs = 0;
  private broadcastChannel: BroadcastChannel | null = null;
  private companionDrifters: Array<{
    playerId: string;
    playerName: string;
    vehicleId: string;
    paintColor: string;
    paintFinish: PaintFinishType;
    sampleIdx: number;
    speedKmh: number;
    driftAngle: number;
    driftScore: number;
    steerAngle: number;
  }> = [];

  constructor() {
    const savedId =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('touge_mp_player_id') : null;
    if (savedId) {
      this.playerId = savedId;
    } else {
      this.playerId = `drifter_${Math.random().toString(36).slice(2, 8)}`;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('touge_mp_player_id', this.playerId);
      }
    }

    const savedName =
      typeof window !== 'undefined' ? window.localStorage.getItem('touge_mp_player_name') : null;
    this.playerName = savedName || `Takumi_${this.playerId.slice(-3).toUpperCase()}`;
  }

  public getRoom(): MultiplayerRoomInfo | null {
    return this.activeRoom;
  }

  public getPlayers(): MultiplayerPlayerState[] {
    return this.allPlayers;
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getPlayerName(): string {
    return this.playerName;
  }

  public setPlayerName(name: string) {
    const clean = name.trim().slice(0, 20) || 'TougeRunner';
    this.playerName = clean;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('touge_mp_player_name', clean);
    }
  }

  public subscribe(listener: RoomListener): () => void {
    this.listeners.add(listener);
    listener(this.activeRoom, this.allPlayers, this.connectionStatus, this.lastError);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const fn of this.listeners) {
      fn(this.activeRoom, this.allPlayers, this.connectionStatus, this.lastError);
    }
  }

  public async fetchRooms(): Promise<MultiplayerRoomInfo[]> {
    return this.fetchPublicRooms();
  }

  public async fetchPublicRooms(): Promise<MultiplayerRoomInfo[]> {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/multiplayer/rooms', { signal: controller.signal });
      clearTimeout(tid);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.rooms) && data.rooms.length > 0) {
        return data.rooms as MultiplayerRoomInfo[];
      }
    } catch {
      // Fallback to client-side store
    }
    fallbackRoomStore.pruneStalePlayers();
    return fallbackRoomStore.listRooms(false);
  }

  public async createRoom(payload: Omit<CreateRoomPayload, 'hostPlayerId'>): Promise<MultiplayerRoomInfo | null> {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/multiplayer/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          hostPlayerId: this.playerId,
        }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (data?.ok && data.room) {
        return data.room as MultiplayerRoomInfo;
      }
    } catch {
      // Fallback to client-side store
    }
    const localRoom = fallbackRoomStore.createRoom({
      ...payload,
      hostPlayerId: this.playerId,
    });
    this.broadcastMessage({ type: 'room_created', room: localRoom });
    return localRoom;
  }

  public async createAndJoinRoom(
    opts: CreateAndJoinRoomOptions
  ): Promise<{ ok: boolean; error?: string; room?: MultiplayerRoomInfo }> {
    const normalizedMode = normalizeMultiplayerMode(opts.mode);

    const room = await this.createRoom({
      name: opts.name,
      isPrivate: opts.isPrivate,
      password: opts.password,
      maxPlayers: opts.maxPlayers,
      mapId: opts.mapId,
      mode: normalizedMode,
      weather: opts.weather,
      timeOfDay: opts.timeOfDay,
      collisionsEnabled: opts.collisionsEnabled,
      totalLaps: opts.totalLaps,
      vehicleRestriction: opts.vehicleRestriction,
    });
    if (!room) {
      return { ok: false, error: 'Failed to create room.' };
    }
    return this.joinRoom({
      roomId: room.id,
      password: opts.password,
      vehicleId: opts.vehicleId,
      paintColor: opts.paintColor,
      paintFinish: opts.paintFinish,
      bodyKit: opts.bodyKit,
      spoilerStyle: opts.spoilerStyle,
      rimStyle: opts.rimStyle,
      rimColor: opts.rimColor,
      customization: opts.customization,
    });
  }

  public async startRace(
    totalLapsOrOpts?: number | { totalLaps?: number; mode?: MultiplayerMode },
    modeOverride?: MultiplayerMode
  ): Promise<{ ok: boolean; room?: MultiplayerRoomInfo; error?: string }> {
    if (!this.activeRoom) {
      return { ok: false, error: 'Not connected to a multiplayer room.' };
    }
    const totalLaps =
      typeof totalLapsOrOpts === 'object' && totalLapsOrOpts !== null
        ? totalLapsOrOpts.totalLaps
        : totalLapsOrOpts;
    const resolvedMode =
      typeof totalLapsOrOpts === 'object' && totalLapsOrOpts !== null
        ? totalLapsOrOpts.mode ?? modeOverride
        : modeOverride;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'start_race',
          roomId: this.activeRoom.id,
          totalLaps,
          mode: resolvedMode,
        })
      );
    }
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/multiplayer/race/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.activeRoom.id,
          totalLaps,
          mode: resolvedMode,
        }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (data?.ok && data.room) {
        this.activeRoom = data.room as MultiplayerRoomInfo;
        if (Array.isArray(data.players)) {
          this.ingestPlayerList(data.players);
        }
        this.notify();
        return { ok: true, room: this.activeRoom };
      }
    } catch {
      // Fallback
    }

    const localRace = fallbackRoomStore.startRace(this.activeRoom.id, totalLaps, resolvedMode);
    if (localRace.ok && localRace.room) {
      this.activeRoom = localRace.room;
      this.broadcastMessage({ type: 'race_started', room: this.activeRoom });
      this.notify();
      return { ok: true, room: this.activeRoom };
    }
    return { ok: false, error: 'Could not start race.' };
  }

  public async resetRace(): Promise<void> {
    if (!this.activeRoom) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'reset_race',
          roomId: this.activeRoom.id,
        })
      );
    }
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/multiplayer/race/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.activeRoom.id }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (data?.ok && data.room) {
        this.activeRoom = data.room as MultiplayerRoomInfo;
        if (Array.isArray(data.players)) {
          this.ingestPlayerList(data.players);
        }
        this.notify();
        return;
      }
    } catch {
      // Fallback
    }

    const localReset = fallbackRoomStore.resetRace(this.activeRoom.id);
    if (localReset.ok && localReset.room) {
      this.activeRoom = localReset.room;
      this.broadcastMessage({ type: 'race_reset', room: this.activeRoom });
      this.notify();
    }
  }

  public async joinRoom(
    roomIdOrOptions: string | JoinRoomOptions,
    initialCarState?: CarState,
    vehicleId = 'r34_gtr',
    paintColor = '#1165d8',
    paintFinish: PaintFinishType = 'metallic',
    password?: string
  ): Promise<{ ok: boolean; error?: string; room?: MultiplayerRoomInfo }> {
    let targetRoomIdOrCode: string;
    let resolvedCarState: CarState;
    let resolvedVehicleId = vehicleId;
    let resolvedPaintColor = paintColor;
    let resolvedPaintFinish = paintFinish;
    let resolvedPassword = password;
    let resolvedCustomization: Partial<VehicleCustomization> | undefined;

    if (typeof roomIdOrOptions === 'object' && roomIdOrOptions !== null) {
      targetRoomIdOrCode = (roomIdOrOptions.roomId || roomIdOrOptions.inviteCode || '').trim();
      resolvedCarState = roomIdOrOptions.initialCarState ?? createInitialCarState('mountain', 0);
      resolvedVehicleId = roomIdOrOptions.vehicleId ?? 'r34_gtr';
      resolvedPaintColor = roomIdOrOptions.paintColor ?? '#1165d8';
      resolvedPaintFinish = roomIdOrOptions.paintFinish ?? 'metallic';
      resolvedPassword = roomIdOrOptions.password;
      resolvedCustomization = {
        ...roomIdOrOptions.customization,
        ...(roomIdOrOptions.bodyKit ? { bodyKit: roomIdOrOptions.bodyKit } : {}),
        ...(roomIdOrOptions.spoilerStyle ? { spoilerStyle: roomIdOrOptions.spoilerStyle } : {}),
        ...(roomIdOrOptions.rimStyle ? { rimStyle: roomIdOrOptions.rimStyle } : {}),
        ...(roomIdOrOptions.rimColor ? { rimColor: roomIdOrOptions.rimColor } : {}),
      };
    } else {
      targetRoomIdOrCode = roomIdOrOptions;
      resolvedCarState = initialCarState ?? createInitialCarState('mountain', 0);
    }

    this.leaveRoom();
    this.connectionStatus = 'connecting';
    this.lastError = null;
    this.notify();

    const playerPayload = this.buildPlayerPayload(
      resolvedCarState,
      resolvedVehicleId,
      resolvedPaintColor,
      resolvedPaintFinish,
      resolvedCustomization
    );

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/multiplayer/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomIdOrCode: targetRoomIdOrCode,
          player: playerPayload,
          password: resolvedPassword,
        }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (data?.ok && data.room) {
        this.activeRoom = data.room as MultiplayerRoomInfo;
        this.connectionStatus = 'connected';
        this.ingestPlayerList(data.players || []);
        this.connectWebSocket(this.activeRoom.id, playerPayload, resolvedPassword);
        this.notify();
        return { ok: true, room: this.activeRoom };
      }
      if (data && !data.ok && data.error && !data.error.includes('404')) {
        this.connectionStatus = 'disconnected';
        this.lastError = data.error;
        this.notify();
        return { ok: false, error: data.error };
      }
    } catch {
      // Fallback to client-side store
    }

    const localJoin = fallbackRoomStore.joinRoom(targetRoomIdOrCode, playerPayload, resolvedPassword);
    if (!localJoin.ok || !localJoin.room) {
      this.connectionStatus = 'disconnected';
      this.lastError = localJoin.error || 'Could not join room. Check ID or code.';
      this.notify();
      return { ok: false, error: this.lastError };
    }

    this.activeRoom = localJoin.room;
    this.connectionStatus = 'connected';
    this.lastError = null;
    this.spawnRoomDrifters(this.activeRoom);
    this.initBroadcastChannel(this.activeRoom.id, playerPayload);
    const all = fallbackRoomStore.getRoomPlayers(this.activeRoom.id);
    this.ingestPlayerList(all);
    this.notify();
    return { ok: true, room: this.activeRoom };
  }

  private initBroadcastChannel(roomId: string, initialPlayer: MultiplayerPlayerState) {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.close();
      }
      this.broadcastChannel = new BroadcastChannel(`touge_drift_room_${roomId}`);
      this.broadcastChannel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'player_update' && msg.player && msg.player.playerId !== this.playerId) {
          fallbackRoomStore.updatePlayerState(roomId, msg.player);
          const all = fallbackRoomStore.getRoomPlayers(roomId);
          this.ingestPlayerList(all);
          this.notify();
        } else if (msg.type === 'race_started' && msg.room) {
          this.activeRoom = msg.room;
          this.notify();
        } else if (msg.type === 'race_reset' && msg.room) {
          this.activeRoom = msg.room;
          this.notify();
        } else if (msg.type === 'player_left' && msg.playerId) {
          fallbackRoomStore.leaveRoom(roomId, msg.playerId);
          const all = fallbackRoomStore.getRoomPlayers(roomId);
          this.ingestPlayerList(all);
          this.notify();
        }
      };
      this.broadcastMessage({ type: 'player_joined', player: initialPlayer });
    } catch {
      // BroadcastChannel not supported or error
    }
  }

  private broadcastMessage(data: unknown) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(data);
      } catch {
        // Ignore
      }
    }
  }

  private spawnRoomDrifters(room: MultiplayerRoomInfo) {
    if (room.mapId === 'mountain') {
      this.companionDrifters = [
        {
          playerId: 'bot_keisuke',
          playerName: 'Keisuke_FD',
          vehicleId: 'rx7_fd',
          paintColor: '#eab308',
          paintFinish: 'gloss',
          sampleIdx: 35,
          speedKmh: 78,
          driftAngle: 24,
          driftScore: 18500,
          steerAngle: -0.22,
        },
        {
          playerId: 'bot_ryosuke',
          playerName: 'Ryosuke_FC',
          vehicleId: 'rx7_fc',
          paintColor: '#f4f4f5',
          paintFinish: 'pearl',
          sampleIdx: 65,
          speedKmh: 82,
          driftAngle: 28,
          driftScore: 24200,
          steerAngle: 0.25,
        },
      ];
    } else {
      this.companionDrifters = [
        {
          playerId: 'bot_nobuhiko',
          playerName: 'Nobuhiko_SXE10',
          vehicleId: 'altezza_sxe10',
          paintColor: '#10b981',
          paintFinish: 'metallic',
          sampleIdx: 30,
          speedKmh: 74,
          driftAngle: 22,
          driftScore: 14600,
          steerAngle: 0.18,
        },
        {
          playerId: 'bot_hideo',
          playerName: 'Hideo_R32',
          vehicleId: 'r32_gtr',
          paintColor: '#3f3f46',
          paintFinish: 'satin',
          sampleIdx: 70,
          speedKmh: 84,
          driftAngle: 26,
          driftScore: 21900,
          steerAngle: -0.24,
        },
      ];
    }
    this.updateCompanionDrifters(0.065);
  }

  private updateCompanionDrifters(dt: number) {
    if (!this.activeRoom || this.companionDrifters.length === 0) return;
    const { mainSamples } = getMapRoadSamples(this.activeRoom.mapId);
    if (!mainSamples || mainSamples.length === 0) return;

    for (const d of this.companionDrifters) {
      const step = Math.max(1, Math.round((d.speedKmh * 0.28 * dt) / 3.8));
      d.sampleIdx = (d.sampleIdx + step) % mainSamples.length;
      const node = mainSamples[d.sampleIdx];
      const heading = Math.atan2(node.tx, node.tz);
      d.driftScore += Math.round(d.speedKmh * dt * 10);
      d.driftAngle = Math.round(18 + Math.sin(d.sampleIdx * 0.08) * 12);
      d.steerAngle = Number((-Math.sin(d.sampleIdx * 0.12) * 0.32).toFixed(3));

      const pState: MultiplayerPlayerState = {
        playerId: d.playerId,
        playerName: d.playerName,
        vehicleId: d.vehicleId,
        paintColor: d.paintColor,
        paintFinish: d.paintFinish,
        bodyKit: 'street_aero',
        spoilerStyle: 'gt_carbon',
        rimStyle: 'te37_6spoke',
        rimColor: '#18181b',
        x: Number((node.x + Math.sin(d.sampleIdx * 0.2) * node.halfWidth * 0.35).toFixed(2)),
        y: Number(node.y.toFixed(2)),
        z: Number(node.z.toFixed(2)),
        vx: Number((node.tx * d.speedKmh * 0.28).toFixed(2)),
        vz: Number((node.tz * d.speedKmh * 0.28).toFixed(2)),
        heading: Number(heading.toFixed(3)),
        steerAngle: d.steerAngle,
        driftAngle: d.driftAngle,
        signedDriftAngle: d.driftAngle,
        isDrifting: true,
        speedKmh: d.speedKmh,
        rpm: Math.round(5400 + Math.sin(d.sampleIdx * 0.2) * 1600),
        gear: 3,
        throttle: 0.85,
        brake: 0,
        headlightsOn: true,
        backfireActive: (d.sampleIdx % 32) === 0,
        wheelRotation: d.sampleIdx * 0.8,
        driftScore: d.driftScore,
        currentDriftPoints: 850,
        driftMultiplier: 2.5,
        lapCount: 1,
        raceProgressMeters: d.sampleIdx * 15,
        pingMs: 12,
        lastUpdatedAt: Date.now(),
      };
      fallbackRoomStore.updatePlayerState(this.activeRoom.id, pState);
    }
  }

  private connectWebSocket(
    roomId: string,
    playerPayload: MultiplayerPlayerState,
    password?: string
  ) {
    if (typeof window === 'undefined') return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/multiplayer`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join_room',
            roomIdOrCode: roomId,
            player: playerPayload,
            password,
          })
        );
        this.pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', clientSentAt: performance.now() }));
          }
        }, 3000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'room_snapshot' || msg.type === 'joined_room') {
            if (msg.room) {
              this.activeRoom = msg.room;
            }
            if (Array.isArray(msg.players)) {
              this.ingestPlayerList(msg.players);
              this.notify();
            }
          } else if (msg.type === 'pong' && typeof msg.clientSentAt === 'number') {
            this.pingMs = Math.max(4, Math.round(performance.now() - msg.clientSentAt));
          } else if (msg.type === 'join_error') {
            this.lastError = msg.error || 'Failed to join room';
            this.notify();
          }
        } catch {
          // Ignore
        }
      };
    } catch {
      // Fallback to HTTP sync
    }

    // Also run a lightweight HTTP sync heartbeat every 450ms to guarantee delivery even through strict proxies
    this.httpSyncTimer = window.setInterval(() => {
      if (!this.activeRoom) return;
      const latestSelf = this.allPlayers.find((p) => p.playerId === this.playerId) ?? playerPayload;
      fetch('/api/multiplayer/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.activeRoom.id,
          player: latestSelf,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && Array.isArray(data.players)) {
            if (data.room) this.activeRoom = data.room;
            this.ingestPlayerList(data.players);
            this.notify();
          }
        })
        .catch(() => {});
    }, 450);
  }

  public sendLocalState(
    carState: CarState,
    vehicleId: string,
    paintColor: string,
    paintFinish: PaintFinishType,
    customization?: Partial<VehicleCustomization>,
    headlightsOn = true
  ) {
    if (!this.activeRoom || this.connectionStatus !== 'connected') return;
    const now = performance.now();
    if (now - this.lastSentMs < 65) return; // ~15 Hz network tick
    this.lastSentMs = now;

    const payload = this.buildPlayerPayload(
      carState,
      vehicleId,
      paintColor,
      paintFinish,
      customization,
      headlightsOn
    );
    const selfIdx = this.allPlayers.findIndex((p) => p.playerId === this.playerId);
    if (selfIdx >= 0) {
      this.allPlayers[selfIdx] = payload;
    } else {
      this.allPlayers.push(payload);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'player_update',
          roomId: this.activeRoom.id,
          player: payload,
        })
      );
    } else {
      if (this.companionDrifters.length > 0) {
        this.updateCompanionDrifters(0.065);
      }
      fallbackRoomStore.updatePlayerState(this.activeRoom.id, payload);
      const all = fallbackRoomStore.getRoomPlayers(this.activeRoom.id);
      this.ingestPlayerList(all);
      this.broadcastMessage({ type: 'player_update', roomId: this.activeRoom.id, player: payload });
    }
  }

  private ingestPlayerList(players: MultiplayerPlayerState[]) {
    this.allPlayers = players;
    const seenIds = new Set<string>();

    for (const p of players) {
      if (p.playerId === this.playerId) continue;
      seenIds.add(p.playerId);
      const existing = this.remotePlayers.get(p.playerId);
      if (existing) {
        const jumpDist = Math.hypot(p.x - existing.renderX, p.z - existing.renderZ);
        this.remotePlayers.set(p.playerId, {
          ...p,
          renderX: jumpDist > 35 ? p.x : existing.renderX,
          renderY: jumpDist > 35 ? p.y : existing.renderY,
          renderZ: jumpDist > 35 ? p.z : existing.renderZ,
          renderHeading: jumpDist > 35 ? p.heading : existing.renderHeading,
          renderSteerAngle: existing.renderSteerAngle,
        });
      } else {
        this.remotePlayers.set(p.playerId, {
          ...p,
          renderX: p.x,
          renderY: p.y,
          renderZ: p.z,
          renderHeading: p.heading,
          renderSteerAngle: p.steerAngle,
        });
      }
    }

    for (const id of Array.from(this.remotePlayers.keys())) {
      if (!seenIds.has(id)) {
        this.remotePlayers.delete(id);
      }
    }
  }

  public stepRemoteInterpolation(dt: number): InterpolatedRemotePlayer[] {
    const alpha = 1 - Math.exp(-12 * dt);
    const result: InterpolatedRemotePlayer[] = [];
    for (const rp of this.remotePlayers.values()) {
      // Dead-reckoning velocity projection + smooth positional convergence
      const targetX = rp.x + rp.vx * 0.04;
      const targetZ = rp.z + rp.vz * 0.04;
      rp.renderX += (targetX - rp.renderX) * alpha;
      rp.renderY += (rp.y - rp.renderY) * alpha;
      rp.renderZ += (targetZ - rp.renderZ) * alpha;

      let hDiff = rp.heading - rp.renderHeading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      rp.renderHeading += hDiff * alpha;
      rp.renderSteerAngle += (rp.steerAngle - rp.renderSteerAngle) * alpha;
      result.push(rp);
    }
    return result;
  }

  public leaveRoom() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.httpSyncTimer !== null) {
      clearInterval(this.httpSyncTimer);
      this.httpSyncTimer = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'leave_room' }));
        }
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    if (this.activeRoom) {
      const roomId = this.activeRoom.id;
      fallbackRoomStore.leaveRoom(roomId, this.playerId);
      this.broadcastMessage({ type: 'player_left', roomId, playerId: this.playerId });
      fetch('/api/multiplayer/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, playerId: this.playerId }),
      }).catch(() => {});
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // Ignore
      }
      this.broadcastChannel = null;
    }
    this.companionDrifters = [];
    this.activeRoom = null;
    this.connectionStatus = 'disconnected';
    this.remotePlayers.clear();
    this.allPlayers = [];
    this.notify();
  }

  private buildPlayerPayload(
    cs: CarState,
    vehicleId: string,
    paintColor: string,
    paintFinish: PaintFinishType,
    customization?: Partial<VehicleCustomization>,
    headlightsOn = true
  ): MultiplayerPlayerState {
    return {
      playerId: this.playerId,
      playerName: this.playerName,
      vehicleId,
      paintColor,
      paintFinish,
      bodyKit: customization?.bodyKit ?? 'stock',
      spoilerStyle: customization?.spoilerStyle ?? 'stock',
      rimStyle: customization?.rimStyle ?? 'te37_6spoke',
      rimColor: customization?.rimColor ?? '#d97706',
      x: Number(cs.x.toFixed(2)),
      y: Number(cs.y.toFixed(2)),
      z: Number(cs.z.toFixed(2)),
      vx: Number(cs.vx.toFixed(2)),
      vz: Number(cs.vz.toFixed(2)),
      heading: Number(cs.heading.toFixed(3)),
      steerAngle: Number((cs.visualFrontSteerAngle ?? cs.steerAngle).toFixed(3)),
      driftAngle: Math.round(cs.driftAngle),
      signedDriftAngle: Math.round(cs.signedDriftAngle ?? 0),
      isDrifting: cs.isDrifting,
      speedKmh: Math.round(cs.speedKmh),
      rpm: Math.round(cs.rpm),
      gear: cs.gear,
      throttle: Number((cs.throttle ?? 0).toFixed(2)),
      brake: Number((cs.brake ?? 0).toFixed(2)),
      headlightsOn,
      backfireActive: (cs.backfireTimer ?? 0) > 0,
      wheelRotation: Number((cs.wheelRotation ?? 0).toFixed(2)),
      driftScore: Math.round(cs.totalDriftScore + cs.currentDriftPoints),
      currentDriftPoints: Math.round(cs.currentDriftPoints),
      driftMultiplier: Number(cs.driftMultiplier.toFixed(1)),
      lapCount: cs.lapCount ?? 1,
      raceProgressMeters: Math.round(cs.distanceDriven ?? 0),
      pingMs: this.pingMs,
      lastUpdatedAt: Date.now(),
    };
  }
}

export const multiplayerClient = new MultiplayerClientManager();
