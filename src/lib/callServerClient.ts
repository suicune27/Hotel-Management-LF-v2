/**
 * Call Signaling WebSocket Client
 * 
 * Connects to the local WebSocket signaling server running on
 * the front desk machine. Provides a clean API for call signaling.
 * Falls back to Supabase signaling if the server is not available.
 */

export type ClientRole = 'frontdesk' | 'guest';

export interface CallSignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
}

export interface CallServerEvents {
  onRegistered?: (role: ClientRole, name: string) => void;
  onIncomingCall?: (callId: string, guestName: string, roomNumber?: string, bookingId?: string) => void;
  onCallAccepted?: (callId: string) => void;
  onCallDeclined?: (callId: string) => void;
  onCallEnded?: (callId: string) => void;
  onSignal?: (callId: string, from: ClientRole, signal: CallSignalMessage) => void;
  onFrontDeskOffline?: () => void;
  onError?: (message: string) => void;
  onStatusChange?: (connected: boolean) => void;
}

export class CallServerClient {
  private ws: WebSocket | null = null;
  private url: string;
  private role: ClientRole = 'guest';
  private name = '';
  private roomNumber?: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private connected = false;
  private intentionalClose = false;
  private events: CallServerEvents = {};

  constructor(serverUrl?: string) {
    this.url = serverUrl || this.getDefaultUrl();
  }

  private getDefaultUrl(): string {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttps) {
      return `wss://${window.location.host}`;
    }
    // Try localhost first (front desk running on this machine)
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    // If on a guest device, they'll need to enter the front desk IP
    return `ws://${hostname}:3001`;
  }

  setUrl(url: string) {
    this.url = url;
  }

  on(events: CallServerEvents) {
    this.events = { ...this.events, ...events };
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect(role: ClientRole, name: string, roomNumber?: string) {
    this.role = role;
    this.name = name;
    this.roomNumber = roomNumber;
    this.intentionalClose = false;
    this.doConnect();
  }

  private doConnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }

    try {
      console.log(`[CallClient] Connecting to ${this.url}...`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[CallClient] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.events.onStatusChange?.(true);

        // Register with the server
        this.send({
          type: 'register',
          role: this.role,
          name: this.name,
          roomNumber: this.roomNumber,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (err) {
          console.error('[CallClient] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.events.onStatusChange?.(false);
        console.log('[CallClient] Disconnected');

        if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
          this.reconnectAttempts++;
          console.log(`[CallClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
          this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
        }
      };

      this.ws.onerror = () => {
        // onclose will fire after this
      };
    } catch (err) {
      console.error('[CallClient] Connection error:', err);
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
      }
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.events.onStatusChange?.(false);
  }

  // ─── Actions ────────────────────────────────────────────────

  /** Guest: Request a call to the front desk */
  requestCall(bookingId?: string) {
    this.send({ type: 'call:request', bookingId });
  }

  /** Guest: Cancel a pending call request */
  cancelCall() {
    this.send({ type: 'call:cancel' });
  }

  /** Front desk: Accept an incoming call */
  acceptCall(callId: string) {
    this.send({ type: 'call:accept', callId });
  }

  /** Front desk: Decline an incoming call */
  declineCall(callId: string) {
    this.send({ type: 'call:decline', callId });
  }

  /** Either side: Send a WebRTC signal (offer/answer/ICE candidate) */
  sendSignal(callId: string, signal: CallSignalMessage) {
    this.send({ type: 'signal', callId, signal });
  }

  /** Either side: Hang up the active call */
  endCall() {
    this.send({ type: 'call:end' });
  }

  /** Request server status */
  getStatus() {
    this.send({ type: 'get:status' });
  }

  // ─── Internal ────────────────────────────────────────────────

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[CallClient] Cannot send: not connected');
    }
  }

  private handleServerMessage(msg: any) {
    switch (msg.type) {
      case 'registered':
        console.log(`[CallClient] Registered as ${msg.role}: ${msg.name}`);
        this.events.onRegistered?.(msg.role, msg.name);
        break;

      case 'call:incoming':
        console.log(`[CallClient] Incoming call: ${msg.callId} from ${msg.guestName}`);
        this.events.onIncomingCall?.(msg.callId, msg.guestName, msg.roomNumber, msg.bookingId);
        break;

      case 'call:requested':
        console.log(`[CallClient] Call requested: ${msg.callId}`);
        break;

      case 'call:accepted':
        console.log(`[CallClient] Call accepted: ${msg.callId}`);
        this.events.onCallAccepted?.(msg.callId);
        break;

      case 'call:declined':
        console.log(`[CallClient] Call declined: ${msg.callId}`);
        this.events.onCallDeclined?.(msg.callId);
        break;

      case 'call:ended':
        console.log(`[CallClient] Call ended: ${msg.callId}`);
        this.events.onCallEnded?.(msg.callId);
        break;

      case 'signal':
        this.events.onSignal?.(msg.callId, msg.from, msg.signal);
        break;

      case 'frontdesk:offline':
        console.log('[CallClient] Front desk went offline');
        this.events.onFrontDeskOffline?.();
        break;

      case 'status':
        console.log('[CallClient] Server status:', msg);
        break;

      case 'error':
        console.error('[CallClient] Server error:', msg.message);
        this.events.onError?.(msg.message);
        break;
    }
  }
}

// Singleton for the app
let instance: CallServerClient | null = null;

export function getCallClient(serverUrl?: string): CallServerClient {
  if (!instance) {
    instance = new CallServerClient(serverUrl);
  }
  return instance;
}
