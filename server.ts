import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { createServer as createViteServer, ViteDevServer } from 'vite';

// ─── Types ────────────────────────────────────────────────────────
type ClientRole = 'frontdesk' | 'guest';

interface ClientInfo {
  ws: WebSocket;
  role: ClientRole;
  name: string;
  roomNumber?: string;
  activeCallId?: string;
}

interface CallSession {
  id: string;
  guest: ClientInfo;
  frontDesk: ClientInfo | null;
  bookingId?: string;
  status: 'ringing' | 'connected' | 'ended';
  createdAt: number;
}

// ─── State ────────────────────────────────────────────────────────
const clients = new Map<WebSocket, ClientInfo>();
const activeCalls = new Map<string, CallSession>();
let frontDeskClient: ClientInfo | null = null;
const pendingCallIds: string[] = [];

// ─── Helpers ──────────────────────────────────────────────────────
function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToFrontDesk(msg: object) {
  if (frontDeskClient && frontDeskClient.ws.readyState === WebSocket.OPEN) {
    send(frontDeskClient.ws, msg);
  }
}

function log(...args: any[]) {
  console.log(`[CallServer]`, ...args);
}

// ─── Call Management ──────────────────────────────────────────────
function createCall(guest: ClientInfo, bookingId?: string): CallSession {
  const call: CallSession = {
    id: randomUUID().slice(0, 8),
    guest,
    frontDesk: null,
    bookingId,
    status: 'ringing',
    createdAt: Date.now(),
  };
  activeCalls.set(call.id, call);
  guest.activeCallId = call.id;
  pendingCallIds.push(call.id);
  log(`Call ${call.id} created by ${guest.name} (room ${guest.roomNumber || 'N/A'})`);
  return call;
}

function connectFrontDeskToCall(callId: string, fd: ClientInfo): boolean {
  const call = activeCalls.get(callId);
  if (!call || call.status !== 'ringing') return false;
  call.frontDesk = fd;
  call.status = 'connected';
  fd.activeCallId = callId;
  const idx = pendingCallIds.indexOf(callId);
  if (idx !== -1) pendingCallIds.splice(idx, 1);
  log(`Call ${callId} accepted by front desk`);
  return true;
}

function endCall(callId: string) {
  const call = activeCalls.get(callId);
  if (!call) return;
  call.status = 'ended';
  if (call.guest.ws.readyState === WebSocket.OPEN) {
    send(call.guest.ws, { type: 'call:ended', callId });
  }
  if (call.frontDesk && call.frontDesk.ws.readyState === WebSocket.OPEN) {
    send(call.frontDesk.ws, { type: 'call:ended', callId });
  }
  call.guest.activeCallId = undefined;
  if (call.frontDesk) call.frontDesk.activeCallId = undefined;
  const idx = pendingCallIds.indexOf(callId);
  if (idx !== -1) pendingCallIds.splice(idx, 1);
  // Clean up after a short delay
  setTimeout(() => activeCalls.delete(callId), 5000);
  log(`Call ${callId} ended`);
}

// Clean up stale calls (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, call] of activeCalls) {
    if (now - call.createdAt > 5 * 60 * 1000 && call.status !== 'connected') {
      endCall(id);
    }
  }
}, 30_000);

// ─── Message Handler ──────────────────────────────────────────────
function handleMessage(ws: WebSocket, raw: string) {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  const client = clients.get(ws);
  const { type } = msg;

  switch (type) {
    case 'register': {
      const role = msg.role as ClientRole;
      if (role !== 'frontdesk' && role !== 'guest') {
        send(ws, { type: 'error', message: 'Invalid role' });
        return;
      }

      if (client) {
        if (client.activeCallId) endCall(client.activeCallId);
        if (client.role === 'frontdesk') frontDeskClient = null;
        clients.delete(ws);
      }

      const info: ClientInfo = {
        ws,
        role,
        name: msg.name || 'Unknown',
        roomNumber: msg.roomNumber,
      };
      clients.set(ws, info);

      if (role === 'frontdesk') {
        frontDeskClient = info;
        log(`Front desk registered: ${info.name}`);
        if (pendingCallIds.length > 0) {
          for (const callId of pendingCallIds) {
            const call = activeCalls.get(callId);
            if (call) {
              send(ws, {
                type: 'call:incoming',
                callId: call.id,
                guestName: call.guest.name,
                roomNumber: call.guest.roomNumber,
                bookingId: call.bookingId,
              });
            }
          }
        }
      } else {
        log(`Guest registered: ${info.name} (room ${info.roomNumber || 'N/A'})`);
      }

      send(ws, { type: 'registered', role, name: info.name });
      break;
    }

    case 'call:request': {
      if (!client || client.role !== 'guest') {
        send(ws, { type: 'error', message: 'Only guests can request calls' });
        return;
      }
      if (client.activeCallId) {
        send(ws, { type: 'error', message: 'You already have an active call' });
        return;
      }
      if (!frontDeskClient) {
        send(ws, { type: 'error', message: 'Front desk is not available' });
        return;
      }

      const call = createCall(client, msg.bookingId);
      broadcastToFrontDesk({
        type: 'call:incoming',
        callId: call.id,
        guestName: client.name,
        roomNumber: client.roomNumber,
        bookingId: msg.bookingId,
      });

      send(ws, { type: 'call:requested', callId: call.id });
      log(`Call requested: ${call.id} by ${client.name}`);
      break;
    }

    case 'call:accept': {
      if (!client || client.role !== 'frontdesk') {
        send(ws, { type: 'error', message: 'Only front desk can accept calls' });
        return;
      }
      const callId = msg.callId;
      if (!callId || !activeCalls.has(callId)) {
        send(ws, { type: 'error', message: 'Call not found' });
        return;
      }
      if (client.activeCallId) {
        send(ws, { type: 'error', message: 'Front desk already on a call' });
        return;
      }

      const call = activeCalls.get(callId)!;
      if (!connectFrontDeskToCall(callId, client)) {
        send(ws, { type: 'error', message: 'Cannot accept call' });
        return;
      }

      send(call.guest.ws, { type: 'call:accepted', callId });
      send(ws, { type: 'call:accepted', callId });
      break;
    }

    case 'call:decline': {
      if (!client || client.role !== 'frontdesk') {
        send(ws, { type: 'error', message: 'Only front desk can decline calls' });
        return;
      }
      const declineId = msg.callId;
      const declineCall = declineId ? activeCalls.get(declineId) : undefined;
      if (declineCall) {
        send(declineCall.guest.ws, { type: 'call:declined', callId: declineId });
        endCall(declineId);
      }
      send(ws, { type: 'call:declined', callId: declineId });
      break;
    }

    case 'call:cancel': {
      if (!client || client.role !== 'guest') {
        send(ws, { type: 'error', message: 'Only guests can cancel calls' });
        return;
      }
      if (!client.activeCallId) {
        send(ws, { type: 'error', message: 'No active call to cancel' });
        return;
      }
      endCall(client.activeCallId);
      break;
    }

    case 'call:end': {
      if (!client || !client.activeCallId) {
        send(ws, { type: 'error', message: 'No active call' });
        return;
      }
      endCall(client.activeCallId);
      break;
    }

    case 'signal': {
      if (!client || !client.activeCallId) {
        send(ws, { type: 'error', message: 'No active call to signal' });
        return;
      }
      const call = activeCalls.get(client.activeCallId);
      if (!call) return;

      const signal = msg.signal;
      const target = client.role === 'guest' ? call.frontDesk : call.guest;

      if (target && target.ws.readyState === WebSocket.OPEN) {
        send(target.ws, {
          type: 'signal',
          callId: call.id,
          from: client.role,
          signal,
        });
      }
      break;
    }

    case 'get:status': {
      send(ws, {
        type: 'status',
        frontDeskOnline: !!frontDeskClient,
        activeCalls: Array.from(activeCalls.entries()).map(([id, c]) => ({
          id,
          guestName: c.guest.name,
          roomNumber: c.guest.roomNumber,
          status: c.status,
          createdAt: c.createdAt,
        })),
        pendingCallIds,
      });
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${type}` });
  }
}

// ─── Express & HTTP Server Setup ──────────────────────────────────
async function start() {
  const app = express();
  const PORT = 3000;

  // Custom API / Health endpoints
  app.get('/api/call-server-status', (req, res) => {
    res.json({
      name: 'Hotel Call Signaling Server',
      version: '1.0.0',
      status: 'running',
      frontDeskOnline: !!frontDeskClient,
      activeCalls: activeCalls.size,
    });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket) => {
    log('Client connected to WebSocket server');

    ws.on('message', (data: any) => {
      try {
        handleMessage(ws, data.toString());
      } catch (err) {
        log('Error handling message:', err);
        send(ws, { type: 'error', message: 'Internal error' });
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      if (info) {
        log(`Client disconnected: ${info.name} (${info.role})`);
        if (info.activeCallId) {
          endCall(info.activeCallId);
        }
        if (info.role === 'frontdesk') {
          frontDeskClient = null;
          for (const [id, call] of activeCalls) {
            if (call.status === 'ringing') {
              send(call.guest.ws, { type: 'frontdesk:offline', message: 'Front desk disconnected' });
            }
          }
        }
        clients.delete(ws);
      }
    });

    ws.on('error', (err: any) => {
      log('WebSocket error:', err.message);
    });
  });

  let vite: ViteDevServer | null = null;
  if (process.env.NODE_ENV !== 'production') {
    // Mount Vite dev middleware
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Handle upgraded websocket requests securely, dispatching correctly between Vite and signaling server
  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.includes('vite') || url.includes('hmr')) {
      if (vite) {
        (vite.ws as any).handleUpgrade(request, socket, head);
      }
      return;
    }

    (wss as any).handleUpgrade(request, socket, head, (ws: any) => {
      wss.emit('connection', ws, request);
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[UnifiedServer] Running at http://localhost:${PORT}`);
  });
}

start().catch(console.error);
