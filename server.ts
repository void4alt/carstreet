import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  MultiplayerPlayerState,
  MultiplayerRoomStore,
} from './src/game/multiplayerStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const store = new MultiplayerRoomStore();

interface ClientSocketMeta {
  playerId: string;
  roomId: string | null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/multiplayer' });
  const socketMeta = new Map<WebSocket, ClientSocketMeta>();

  const broadcastRoomState = (roomId: string) => {
    const room = store.getRoomByIdOrCode(roomId);
    if (!room) return;
    const payload = JSON.stringify({
      type: 'room_snapshot',
      roomId: room.id,
      room: store.toPublicInfo(room),
      players: Array.from(room.players.values()),
      serverTime: Date.now(),
    });
    for (const [ws, meta] of socketMeta.entries()) {
      if (meta.roomId === room.id && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  wss.on('connection', (ws) => {
    socketMeta.set(ws, { playerId: '', roomId: null });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'join_room' && msg.player) {
          const player = msg.player as MultiplayerPlayerState;
          const res = store.joinRoom(msg.roomIdOrCode, player, msg.password);
          if (!res.ok || !res.room) {
            ws.send(JSON.stringify({ type: 'join_error', error: res.error || 'Unable to join room' }));
            return;
          }
          socketMeta.set(ws, { playerId: player.playerId, roomId: res.room.id });
          ws.send(
            JSON.stringify({
              type: 'joined_room',
              room: res.room,
              players: res.players,
              serverTime: Date.now(),
            })
          );
          broadcastRoomState(res.room.id);
        } else if (msg.type === 'player_update' && msg.roomId && msg.player) {
          const res = store.updatePlayerState(msg.roomId, msg.player as MultiplayerPlayerState);
          if (res.ok) {
            broadcastRoomState(msg.roomId);
          }
        } else if (msg.type === 'start_race' && msg.roomId) {
          const res = store.startRace(String(msg.roomId), msg.totalLaps, msg.mode);
          if (res.ok && res.room) {
            broadcastRoomState(res.room.id);
          }
        } else if (msg.type === 'reset_race' && msg.roomId) {
          const res = store.resetRace(String(msg.roomId));
          if (res.ok && res.room) {
            broadcastRoomState(res.room.id);
          }
        } else if (msg.type === 'leave_room') {
          const meta = socketMeta.get(ws);
          if (meta?.roomId && meta.playerId) {
            store.leaveRoom(meta.roomId, meta.playerId);
            broadcastRoomState(meta.roomId);
            socketMeta.set(ws, { playerId: meta.playerId, roomId: null });
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', clientSentAt: msg.clientSentAt, serverTime: Date.now() }));
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (meta?.roomId && meta.playerId) {
        store.leaveRoom(meta.roomId, meta.playerId);
        broadcastRoomState(meta.roomId);
      }
      socketMeta.delete(ws);
    });
  });

  // REST API Endpoints for Lobby Browsing, Room Creation, Joining, Race Control & HTTP Fallback Sync
  app.get('/api/multiplayer/rooms', (_req, res) => {
    res.json({
      ok: true,
      rooms: store.listRooms(false),
      serverTime: Date.now(),
    });
  });

  app.post('/api/multiplayer/rooms/create', (req, res) => {
    const body = req.body || {};
    const room = store.createRoom(body);
    if (body.player?.playerId) {
      const joined = store.joinRoom(room.id, body.player as MultiplayerPlayerState, body.password);
      if (joined.ok && joined.room) {
        broadcastRoomState(joined.room.id);
        res.json({ ok: true, room: joined.room, players: joined.players ?? [] });
        return;
      }
    }
    res.json({ ok: true, room, players: [] });
  });

  app.post('/api/multiplayer/rooms/join', (req, res) => {
    const { roomIdOrCode, player, password } = req.body || {};
    if (!roomIdOrCode || !player?.playerId) {
      res.status(400).json({ ok: false, error: 'Missing roomIdOrCode or player state.' });
      return;
    }
    const result = store.joinRoom(String(roomIdOrCode), player as MultiplayerPlayerState, password);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    if (result.room) {
      broadcastRoomState(result.room.id);
    }
    res.json(result);
  });

  app.post('/api/multiplayer/race/start', (req, res) => {
    const { roomId, totalLaps, mode } = req.body || {};
    if (!roomId) {
      res.status(400).json({ ok: false, error: 'Missing roomId.' });
      return;
    }
    const result = store.startRace(String(roomId), totalLaps, mode);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    if (result.room) {
      broadcastRoomState(result.room.id);
    }
    res.json(result);
  });

  app.post('/api/multiplayer/race/reset', (req, res) => {
    const { roomId } = req.body || {};
    if (!roomId) {
      res.status(400).json({ ok: false, error: 'Missing roomId.' });
      return;
    }
    const result = store.resetRace(String(roomId));
    if (result.room) {
      broadcastRoomState(result.room.id);
    }
    res.json(result);
  });

  const handleSyncRequest = (req: express.Request, res: express.Response) => {
    const body = req.body || {};
    const roomId = body.roomId;
    const player = body.player || body.playerState;
    if (!roomId || !player?.playerId) {
      res.status(400).json({ ok: false, error: 'Missing roomId or player.' });
      return;
    }
    const result = store.updatePlayerState(String(roomId), player as MultiplayerPlayerState);
    if (!result.ok) {
      res.status(404).json({ ok: false, error: 'Room no longer exists.' });
      return;
    }
    res.json({
      ok: true,
      room: result.room,
      players: result.players,
      serverTime: Date.now(),
    });
  };

  app.post('/api/multiplayer/sync', handleSyncRequest);
  app.post('/api/multiplayer/rooms/sync', handleSyncRequest);

  const handleLeaveRequest = (req: express.Request, res: express.Response) => {
    const { roomId, playerId } = req.body || {};
    if (roomId && playerId) {
      store.leaveRoom(String(roomId), String(playerId));
      broadcastRoomState(String(roomId));
    }
    res.json({ ok: true });
  };

  app.post('/api/multiplayer/leave', handleLeaveRequest);
  app.post('/api/multiplayer/rooms/leave', handleLeaveRequest);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Touge & Sakura Drift 3D Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
