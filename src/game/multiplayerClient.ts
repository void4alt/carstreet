import {
  CreateRoomPayload,
  MultiplayerMode,
  MultiplayerPlayerState,
  MultiplayerRoomInfo,
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
      const res = await fetch('/api/multiplayer/rooms');
      const data = await res.json();
      if (data?.ok && Array.isArray(data.rooms)) {
        return data.rooms as MultiplayerRoomInfo[];
      }
    } catch {
      // Ignore network error
    }
    return [];
  }

  public async createRoom(payload: Omit<CreateRoomPayload, 'hostPlayerId'>): Promise<MultiplayerRoomInfo | null> {
    try {
      const res = await fetch('/api/multiplayer/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          hostPlayerId: this.playerId,
        }),
      });
      const data = await res.json();
      if (data?.ok && data.room) {
        return data.room as MultiplayerRoomInfo;
      }
    } catch {
      // Ignore
    }
    return null;
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
      return { ok: false, error: 'Failed to create room on server.' };
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
      const res = await fetch('/api/multiplayer/race/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.activeRoom.id,
          totalLaps,
          mode: resolvedMode,
        }),
      });
      const data = await res.json();
      if (data?.ok && data.room) {
        this.activeRoom = data.room as MultiplayerRoomInfo;
        if (Array.isArray(data.players)) {
          this.ingestPlayerList(data.players);
        }
        this.notify();
        return { ok: true, room: this.activeRoom };
      }
      return { ok: false, error: data?.error || 'Could not start race.' };
    } catch {
      return { ok: false, error: 'Network error starting race.' };
    }
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
      const res = await fetch('/api/multiplayer/race/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.activeRoom.id }),
      });
      const data = await res.json();
      if (data?.ok && data.room) {
        this.activeRoom = data.room as MultiplayerRoomInfo;
        if (Array.isArray(data.players)) {
          this.ingestPlayerList(data.players);
        }
        this.notify();
      }
    } catch {
      // Ignore
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
      const res = await fetch('/api/multiplayer/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomIdOrCode: targetRoomIdOrCode,
          player: playerPayload,
          password: resolvedPassword,
        }),
      });
      const data = await res.json();
      if (!data?.ok || !data.room) {
        this.connectionStatus = 'disconnected';
        this.lastError = data?.error || 'Could not join room.';
        this.notify();
        return { ok: false, error: this.lastError ?? undefined };
      }

      this.activeRoom = data.room as MultiplayerRoomInfo;
      this.connectionStatus = 'connected';
      this.ingestPlayerList(data.players || []);
      this.connectWebSocket(this.activeRoom.id, playerPayload, resolvedPassword);
      this.notify();
      return { ok: true, room: this.activeRoom };
    } catch {
      this.connectionStatus = 'disconnected';
      this.lastError = 'Network error connecting to multiplayer server.';
      this.notify();
      return { ok: false, error: this.lastError };
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
      fetch('/api/multiplayer/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, playerId: this.playerId }),
      }).catch(() => {});
    }
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
