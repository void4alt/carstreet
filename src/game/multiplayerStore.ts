import { BodyKitType, MapId, PaintFinishType, RimStyle, SpoilerStyle, TimeOfDay, WeatherMode } from './types';

export type MultiplayerMode =
  | 'free_drift'
  | 'tandem'
  | 'drift_battle'
  | 'sprint_race'
  | 'circuit_race'
  | 'touge_battle'
  | 'time_attack';

export interface MultiplayerPlayerState {
  playerId: string;
  playerName: string;
  vehicleId: string;
  paintColor: string;
  paintFinish: PaintFinishType;
  bodyKit?: BodyKitType;
  spoilerStyle?: SpoilerStyle;
  rimStyle?: RimStyle;
  rimColor?: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  steerAngle: number;
  driftAngle: number;
  signedDriftAngle?: number;
  isDrifting: boolean;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle?: number;
  brake?: number;
  headlightsOn?: boolean;
  backfireActive?: boolean;
  wheelRotation?: number;
  driftScore: number;
  currentDriftPoints: number;
  driftMultiplier: number;
  tandemScore?: number;
  lapCount?: number;
  checkpointIndex?: number;
  raceProgressMeters?: number;
  raceFinishedAtMs?: number | null;
  pingMs: number;
  lastUpdatedAt: number;
}

export interface MultiplayerRoomInfo {
  id: string;
  name: string;
  region: string;
  isPrivate: boolean;
  hasPassword: boolean;
  inviteCode: string;
  hostPlayerId: string;
  mapId: MapId;
  mode: MultiplayerMode;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  maxPlayers: number;
  collisionsEnabled: boolean;
  totalLaps: number;
  vehicleRestriction: 'any' | 'rwd_only' | 'jdm_legends';
  raceStatus: 'lobby' | 'countdown' | 'active' | 'finished';
  raceCountdownStartMs: number | null;
  raceStartMs: number | null;
  playerCount: number;
  createdAt: number;
}

export interface InternalRoomRecord extends MultiplayerRoomInfo {
  password?: string;
  players: Map<string, MultiplayerPlayerState>;
}

export interface CreateRoomPayload {
  name: string;
  region?: string;
  isPrivate?: boolean;
  password?: string;
  mapId?: MapId;
  mode?: MultiplayerMode;
  weather?: WeatherMode;
  timeOfDay?: TimeOfDay;
  maxPlayers?: number;
  collisionsEnabled?: boolean;
  totalLaps?: number;
  vehicleRestriction?: 'any' | 'rwd_only' | 'jdm_legends';
  hostPlayerId: string;
}

export interface TandemTelemetryResult {
  active: boolean;
  partnerId: string | null;
  partnerName: string;
  distanceMeters: number;
  angleSyncPct: number;
  speedSyncPct: number;
  role: 'LEAD' | 'CHASE' | 'SIDE-BY-SIDE';
  bonusMultiplier: number;
  tandemMultiplierBonus: number;
  pointsPerSecondBonus: number;
  grade: 'PERFECT TANDEM' | 'DOOR-TO-DOOR' | 'CLOSE CHASE' | 'SYNCING' | 'NONE';
}

/**
 * Deterministic Multiplayer Tandem Drift Proximity & Angle Synchronization Calculator.
 * Measures real 3D world distance (meters), drift angle synchronization %, speed matching %,
 * and Lead/Chase longitudinal position relative to the nearest active partner within 32 meters.
 */
export function computeTandemTelemetry(
  local: {
    x: number;
    z: number;
    heading: number;
    driftAngle: number;
    signedDriftAngle?: number;
    isDrifting: boolean;
    speedKmh: number;
  },
  remotePlayers: MultiplayerPlayerState[],
  selfPlayerId?: string
): TandemTelemetryResult {
  let nearest: MultiplayerPlayerState | null = null;
  let minDist = Infinity;

  for (const rp of remotePlayers) {
    if (selfPlayerId && rp.playerId === selfPlayerId) continue;
    const d = Math.hypot(rp.x - local.x, rp.z - local.z);
    if (d < minDist) {
      minDist = d;
      nearest = rp;
    }
  }

  if (!nearest || minDist > 32) {
    return {
      active: false,
      partnerId: null,
      partnerName: '',
      distanceMeters: nearest ? Number(minDist.toFixed(1)) : 0,
      angleSyncPct: 0,
      speedSyncPct: 0,
      role: 'LEAD',
      bonusMultiplier: 1.0,
      tandemMultiplierBonus: 1.0,
      pointsPerSecondBonus: 0,
      grade: 'NONE',
    };
  }

  const distM = Number(Math.max(1.8, minDist).toFixed(1));
  const localForwardX = Math.sin(local.heading);
  const localForwardZ = Math.cos(local.heading);
  const toPartnerX = nearest.x - local.x;
  const toPartnerZ = nearest.z - local.z;
  const longitudinalProjection = toPartnerX * localForwardX + toPartnerZ * localForwardZ;

  const role: 'LEAD' | 'CHASE' | 'SIDE-BY-SIDE' =
    Math.abs(longitudinalProjection) < 2.4
      ? 'SIDE-BY-SIDE'
      : longitudinalProjection > 0
      ? 'CHASE'
      : 'LEAD';

  const angleDiff = Math.abs((local.driftAngle || 0) - (nearest.driftAngle || 0));
  const angleSyncPct = Math.round(Math.max(0, Math.min(100, 100 - angleDiff * 2.2)));

  const speedDiff = Math.abs((local.speedKmh || 0) - (nearest.speedKmh || 0));
  const speedSyncPct = Math.round(Math.max(0, Math.min(100, 100 - speedDiff * 1.8)));

  const bothMovingOrDrifting =
    (local.isDrifting || local.speedKmh > 24) && (nearest.isDrifting || nearest.speedKmh > 20);

  if (!bothMovingOrDrifting) {
    return {
      active: true,
      partnerId: nearest.playerId,
      partnerName: nearest.playerName,
      distanceMeters: distM,
      angleSyncPct,
      speedSyncPct,
      role,
      bonusMultiplier: 1.0,
      tandemMultiplierBonus: 1.0,
      pointsPerSecondBonus: 0,
      grade: 'SYNCING',
    };
  }

  // Proximity factor peaks between 2.2m and 9.5m (door-to-door tandem)
  const proximityFactor =
    distM <= 9.5
      ? 1.0
      : Math.max(0.15, 1.0 - (distM - 9.5) / 22.5);
  const syncQuality = (angleSyncPct * 0.55 + speedSyncPct * 0.45) / 100;
  const bothActivelyDrifting = local.isDrifting && (nearest.isDrifting || nearest.driftAngle >= 8);

  const bonusMultiplier = Number(
    (1.0 + proximityFactor * syncQuality * (bothActivelyDrifting ? 1.85 : 0.75)).toFixed(2)
  );
  const pointsPerSecondBonus = Math.round(
    proximityFactor * syncQuality * (bothActivelyDrifting ? 680 : 180)
  );

  const grade: TandemTelemetryResult['grade'] =
    bothActivelyDrifting && distM <= 7.5 && angleSyncPct >= 78
      ? 'PERFECT TANDEM'
      : bothActivelyDrifting && distM <= 12.0 && angleSyncPct >= 62
      ? 'DOOR-TO-DOOR'
      : distM <= 20.0
      ? 'CLOSE CHASE'
      : 'SYNCING';

  return {
    active: true,
    partnerId: nearest.playerId,
    partnerName: nearest.playerName,
    distanceMeters: distM,
    angleSyncPct,
    speedSyncPct,
    role,
    bonusMultiplier,
    tandemMultiplierBonus: bonusMultiplier,
    pointsPerSecondBonus,
    grade,
  };
}

function generateInviteCode(seed: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.abs((hash >> (i * 4)) ^ (i * 31)) % chars.length];
  }
  return code;
}

/**
 * Server-authoritative drift score anti-cheat & plausibility validator.
 * Rejects impossible teleports or score jumps exceeding physical drift rate limits.
 */
export function validatePlayerStateUpdate(
  prev: MultiplayerPlayerState | undefined,
  incoming: Partial<MultiplayerPlayerState>,
  nowMs: number
): { valid: boolean; sanitizedScore: number; sanitizedSpeedKmh: number } {
  const rawSpeed = Math.max(0, Math.min(395, Number(incoming.speedKmh ?? prev?.speedKmh ?? 0)));
  const rawScore = Math.max(0, Math.round(Number(incoming.driftScore ?? prev?.driftScore ?? 0)));

  if (!prev) {
    return {
      valid: true,
      sanitizedScore: Math.min(rawScore, 50000),
      sanitizedSpeedKmh: rawSpeed,
    };
  }

  const dtSec = Math.max(0.016, Math.min(10.0, (nowMs - prev.lastUpdatedAt) / 1000));
  // Max plausible score gain per second in a 5x multiplier chain is ~15,000 pts/s + combo bank buffer
  const maxAllowedDelta = Math.ceil(dtSec * 22000 + 25000);
  const scoreDelta = rawScore - prev.driftScore;

  if (scoreDelta > maxAllowedDelta) {
    return {
      valid: false,
      sanitizedScore: prev.driftScore + Math.round(dtSec * 3500),
      sanitizedSpeedKmh: rawSpeed,
    };
  }

  return {
    valid: true,
    sanitizedScore: rawScore,
    sanitizedSpeedKmh: rawSpeed,
  };
}

export class MultiplayerRoomStore {
  private rooms = new Map<string, InternalRoomRecord>();

  constructor() {
    this.seedDefaultPublicRooms();
  }

  private seedDefaultPublicRooms() {
    const defaults: Array<Omit<InternalRoomRecord, 'players'>> = [
      {
        id: 'pub_akina_1',
        name: 'Akina Touge Open Free Roam #1',
        region: 'JP-East',
        isPrivate: false,
        hasPassword: false,
        inviteCode: 'AKINA1',
        hostPlayerId: 'server',
        mapId: 'mountain',
        mode: 'free_drift',
        weather: 'clear',
        timeOfDay: 'sunset',
        maxPlayers: 16,
        collisionsEnabled: false,
        totalLaps: 2,
        vehicleRestriction: 'any',
        raceStatus: 'lobby',
        raceCountdownStartMs: null,
        raceStartMs: null,
        playerCount: 0,
        createdAt: Date.now(),
      },
      {
        id: 'pub_sakura_2',
        name: 'Sakura Tandem Drift Valley #2',
        region: 'US-West',
        isPrivate: false,
        hasPassword: false,
        inviteCode: 'SAKURA',
        hostPlayerId: 'server',
        mapId: 'blossom',
        mode: 'tandem',
        weather: 'clear',
        timeOfDay: 'afternoon',
        maxPlayers: 12,
        collisionsEnabled: false,
        totalLaps: 2,
        vehicleRestriction: 'any',
        raceStatus: 'lobby',
        raceCountdownStartMs: null,
        raceStartMs: null,
        playerCount: 0,
        createdAt: Date.now(),
      },
      {
        id: 'pub_battle_3',
        name: 'Midnight Touge Sprint Race #3',
        region: 'EU-Central',
        isPrivate: false,
        hasPassword: false,
        inviteCode: 'TOUGE3',
        hostPlayerId: 'server',
        mapId: 'mountain',
        mode: 'touge_battle',
        weather: 'light_rain',
        timeOfDay: 'night',
        maxPlayers: 8,
        collisionsEnabled: true,
        totalLaps: 2,
        vehicleRestriction: 'jdm_legends',
        raceStatus: 'lobby',
        raceCountdownStartMs: null,
        raceStartMs: null,
        playerCount: 0,
        createdAt: Date.now(),
      },
      {
        id: 'pub_circuit_4',
        name: 'Yoshino Blossom Circuit Cup #4',
        region: 'AP-South',
        isPrivate: false,
        hasPassword: false,
        inviteCode: 'CIRC04',
        hostPlayerId: 'server',
        mapId: 'blossom',
        mode: 'circuit_race',
        weather: 'clear',
        timeOfDay: 'morning',
        maxPlayers: 12,
        collisionsEnabled: true,
        totalLaps: 3,
        vehicleRestriction: 'any',
        raceStatus: 'lobby',
        raceCountdownStartMs: null,
        raceStartMs: null,
        playerCount: 0,
        createdAt: Date.now(),
      },
    ];

    for (const r of defaults) {
      this.rooms.set(r.id, {
        ...r,
        players: new Map(),
      });
    }
  }

  public pruneStalePlayers(nowMs = Date.now(), timeoutMs = 18000) {
    for (const [roomId, room] of this.rooms.entries()) {
      for (const [pid, pState] of room.players.entries()) {
        if (nowMs - pState.lastUpdatedAt > timeoutMs) {
          room.players.delete(pid);
        }
      }
      room.playerCount = room.players.size;
      if (room.hostPlayerId !== 'server' && room.players.size === 0 && nowMs - room.createdAt > 120000) {
        this.rooms.delete(roomId);
      }
    }
  }

  public getRoom(roomIdOrCode: string): InternalRoomRecord | undefined {
    return this.getRoomByIdOrCode(roomIdOrCode);
  }

  public getRoomPlayers(roomIdOrCode: string): MultiplayerPlayerState[] {
    const room = this.getRoomByIdOrCode(roomIdOrCode);
    if (!room) return [];
    return Array.from(room.players.values());
  }

  public tickRoomRaceState(room: InternalRoomRecord, nowMs = Date.now()) {
    if (room.raceStatus === 'countdown' && room.raceStartMs && nowMs >= room.raceStartMs) {
      room.raceStatus = 'active';
    }
    if (room.raceStatus === 'active') {
      const targetLapMeters = (room.mapId === 'mountain' ? 1420 : 1380) * Math.max(1, room.totalLaps);
      let anyFinished = false;
      for (const p of room.players.values()) {
        if (
          !p.raceFinishedAtMs &&
          ((p.lapCount ?? 1) > room.totalLaps || (p.raceProgressMeters ?? 0) >= targetLapMeters)
        ) {
          p.raceFinishedAtMs = nowMs;
        }
        if (p.raceFinishedAtMs) {
          anyFinished = true;
        }
      }
      // Transition room to finished 15 seconds after the first racer crosses the finish line, or when all finish
      if (anyFinished) {
        const allDone = Array.from(room.players.values()).every((p) => Boolean(p.raceFinishedAtMs));
        const firstFinishMs = Math.min(
          ...Array.from(room.players.values())
            .map((p) => p.raceFinishedAtMs || Infinity)
        );
        if (allDone || nowMs - firstFinishMs > 15000) {
          room.raceStatus = 'finished';
        }
      }
    }
  }

  public startRace(
    roomId: string,
    totalLaps?: number,
    modeOverride?: MultiplayerMode
  ): { ok: boolean; room?: MultiplayerRoomInfo; players?: MultiplayerPlayerState[]; error?: string } {
    const room = this.getRoomByIdOrCode(roomId);
    if (!room) {
      return { ok: false, error: 'Room not found.' };
    }
    if (typeof totalLaps === 'number' && totalLaps >= 1 && totalLaps <= 5) {
      room.totalLaps = Math.round(totalLaps);
    }
    if (modeOverride) {
      room.mode = modeOverride;
    }
    const now = Date.now();
    room.raceStatus = 'countdown';
    room.raceCountdownStartMs = now;
    room.raceStartMs = now + 3500; // 3.5 second synchronized 3-2-1-GO! countdown

    for (const p of room.players.values()) {
      p.lapCount = 1;
      p.checkpointIndex = 0;
      p.raceProgressMeters = 0;
      p.raceFinishedAtMs = null;
    }

    return {
      ok: true,
      room: this.toPublicInfo(room),
      players: Array.from(room.players.values()),
    };
  }

  public resetRace(
    roomId: string
  ): { ok: boolean; room?: MultiplayerRoomInfo; players?: MultiplayerPlayerState[] } {
    const room = this.getRoomByIdOrCode(roomId);
    if (!room) {
      return { ok: false };
    }
    room.raceStatus = 'lobby';
    room.raceCountdownStartMs = null;
    room.raceStartMs = null;
    for (const p of room.players.values()) {
      p.raceFinishedAtMs = null;
      p.raceProgressMeters = 0;
      p.lapCount = 1;
    }
    return {
      ok: true,
      room: this.toPublicInfo(room),
      players: Array.from(room.players.values()),
    };
  }

  public listRooms(includePrivate = false): MultiplayerRoomInfo[] {
    this.pruneStalePlayers();
    const list: MultiplayerRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (!includePrivate && room.isPrivate) continue;
      this.tickRoomRaceState(room);
      list.push(this.toPublicInfo(room));
    }
    return list;
  }

  public getRoomByIdOrCode(idOrCode: string): InternalRoomRecord | undefined {
    if (!idOrCode) return undefined;
    const direct = this.rooms.get(idOrCode);
    if (direct) return direct;
    const upper = String(idOrCode).trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room.inviteCode.toUpperCase() === upper) {
        return room;
      }
    }
    return undefined;
  }

  public createRoom(payload: CreateRoomPayload): MultiplayerRoomInfo {
    const id = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const inviteCode = generateInviteCode(`${id}_${payload.name}`);
    const password = payload.password?.trim() || undefined;
    const record: InternalRoomRecord = {
      id,
      name: (payload.name || 'Touge Drift Lobby').slice(0, 40),
      region: payload.region || 'Global',
      isPrivate: Boolean(payload.isPrivate),
      hasPassword: Boolean(password),
      password,
      inviteCode,
      hostPlayerId: payload.hostPlayerId || 'host',
      mapId: payload.mapId === 'blossom' ? 'blossom' : 'mountain',
      mode: payload.mode || 'free_drift',
      weather: payload.weather || 'clear',
      timeOfDay: payload.timeOfDay || 'afternoon',
      maxPlayers: Math.max(2, Math.min(24, Number(payload.maxPlayers) || 12)),
      collisionsEnabled: Boolean(payload.collisionsEnabled),
      totalLaps: Math.max(1, Math.min(5, Number(payload.totalLaps) || 2)),
      vehicleRestriction: payload.vehicleRestriction || 'any',
      raceStatus: 'lobby',
      raceCountdownStartMs: null,
      raceStartMs: null,
      playerCount: 0,
      createdAt: Date.now(),
      players: new Map(),
    };
    this.rooms.set(id, record);
    return this.toPublicInfo(record);
  }

  public joinRoom(
    roomIdOrCode: string,
    player: MultiplayerPlayerState,
    password?: string
  ): { ok: boolean; error?: string; room?: MultiplayerRoomInfo; players?: MultiplayerPlayerState[] } {
    this.pruneStalePlayers();
    const room = this.getRoomByIdOrCode(roomIdOrCode);
    if (!room) {
      return { ok: false, error: 'Room not found. Check room ID or invite code.' };
    }
    if (room.hasPassword && room.password && room.password !== (password ?? '').trim()) {
      return { ok: false, error: 'Incorrect room password.' };
    }
    // Remove any stale session from the same playerName so reconnecting never leaves a ghost/bot car behind
    for (const [pid, existing] of room.players.entries()) {
      if (pid !== player.playerId && existing.playerName === player.playerName) {
        room.players.delete(pid);
      }
    }

    if (!room.players.has(player.playerId) && room.players.size >= room.maxPlayers) {
      return { ok: false, error: 'Room is full.' };
    }

    room.players.set(player.playerId, {
      ...player,
      lastUpdatedAt: Date.now(),
    });
    room.playerCount = room.players.size;
    this.tickRoomRaceState(room);

    return {
      ok: true,
      room: this.toPublicInfo(room),
      players: Array.from(room.players.values()),
    };
  }

  public updatePlayerState(
    roomId: string,
    playerState: MultiplayerPlayerState
  ): { ok: boolean; players: MultiplayerPlayerState[]; room?: MultiplayerRoomInfo } {
    const room = this.rooms.get(roomId);
    if (!room || !playerState?.playerId) {
      return { ok: false, players: [] };
    }
    // In private rooms, strictly reject updates from any playerId that has not explicitly joined the room
    if (room.isPrivate && !room.players.has(playerState.playerId)) {
      return { ok: false, players: Array.from(room.players.values()), room: this.toPublicInfo(room) };
    }
    const now = Date.now();
    const prev = room.players.get(playerState.playerId);
    const validation = validatePlayerStateUpdate(prev, playerState, now);

    const updated: MultiplayerPlayerState = {
      ...prev,
      ...playerState,
      driftScore: validation.sanitizedScore,
      speedKmh: validation.sanitizedSpeedKmh,
      raceFinishedAtMs: prev?.raceFinishedAtMs ?? playerState.raceFinishedAtMs ?? null,
      lastUpdatedAt: now,
    };
    room.players.set(playerState.playerId, updated);
    room.playerCount = room.players.size;
    this.tickRoomRaceState(room, now);

    return {
      ok: true,
      room: this.toPublicInfo(room),
      players: Array.from(room.players.values()),
    };
  }

  public leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players.delete(playerId);
    room.playerCount = room.players.size;
  }

  public toPublicInfo(room: InternalRoomRecord): MultiplayerRoomInfo {
    return {
      id: room.id,
      name: room.name,
      region: room.region,
      isPrivate: room.isPrivate,
      hasPassword: room.hasPassword,
      inviteCode: room.inviteCode,
      hostPlayerId: room.hostPlayerId,
      mapId: room.mapId,
      mode: room.mode,
      weather: room.weather,
      timeOfDay: room.timeOfDay,
      maxPlayers: room.maxPlayers,
      collisionsEnabled: room.collisionsEnabled,
      totalLaps: room.totalLaps,
      vehicleRestriction: room.vehicleRestriction,
      raceStatus: room.raceStatus,
      raceCountdownStartMs: room.raceCountdownStartMs,
      raceStartMs: room.raceStartMs,
      playerCount: room.players.size,
      createdAt: room.createdAt,
    };
  }
}
