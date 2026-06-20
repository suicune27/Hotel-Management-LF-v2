import { supabase } from './supabase';
import type { Call } from '../types';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const envStunUrl = (import.meta as any).env?.VITE_ICE_STUN_URL;
const envTurnUrl = (import.meta as any).env?.VITE_ICE_TURN_URL;
const envTurnUsername = (import.meta as any).env?.VITE_ICE_TURN_USERNAME;
const envTurnCredential = (import.meta as any).env?.VITE_ICE_TURN_CREDENTIAL;

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [];

if (envStunUrl) {
  DEFAULT_ICE_SERVERS.push({ urls: envStunUrl });
}
if (envTurnUrl) {
  DEFAULT_ICE_SERVERS.push({
    urls: envTurnUrl,
    username: envTurnUsername,
    credential: envTurnCredential,
  });
}

// Fallback to standard Google stun servers to ensure maximum success across all networks
DEFAULT_ICE_SERVERS.push(
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
);


export type CallSignalType = 'offer' | 'answer' | 'ice-candidate' | 'declined' | 'ended';

export interface CallSignal {
  type: CallSignalType;
  call_id: string;
  from: string;
  to: string;
  data?: any;
}

export class CallService {
  private signalChannel: ReturnType<typeof supabase.channel> | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  private currentCallId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;
  private logTag = '';
  private iceServers: IceServerConfig[];
  private signalHandler: ((signal: CallSignal) => void) | null = null;
  private signalBroadcaster: ((type: CallSignalType, data?: any) => void) | null = null;

  constructor(iceServers?: IceServerConfig[]) {
    this.iceServers = iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
  }

  private log(...args: any[]) {
    console.log(`[CallService${this.logTag}]`, ...args);
  }

  async requestMicrophone(): Promise<boolean> {
    try {
      this.log('Requesting microphone...');
      try {
        // First try with detailed audio constraints (channelCount:1 may fail on older mobile browsers)
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (detailedErr) {
        // Fallback: simpler constraints for mobile compatibility
        this.log('Detailed constraints failed, retrying with basic audio...', detailedErr);
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const tracks = this.localStream.getAudioTracks();
      tracks.forEach((track) => {
        track.enabled = true;
        if ('contentHint' in track) {
          (track as MediaStreamTrack & { contentHint?: string }).contentHint = 'speech';
        }
      });
      this.log('Microphone granted, tracks:', tracks.length, 'enabled:', tracks.map(t => `${t.label}:${t.enabled}`));
      return true;
    } catch (err) {
      this.log('Microphone DENIED:', err);
      return false;
    }
  }

  setLogTag(tag: string) { this.logTag = `[${tag}]`; }

  /**
   * Set a custom signaling transport (e.g., WebSocket) instead of Supabase broadcast.
   * @param onSignal - Called when a signal is received from the remote peer
   * @param sendSignal - Called to send a signal to the remote peer
   */
  setSignalTransport(
    onSignal: (signal: CallSignal) => void,
    sendSignal: (type: CallSignalType, data?: any) => void,
    callId?: string,
  ) {
    this.signalHandler = onSignal;
    this.signalBroadcaster = sendSignal;
    if (callId) {
      this.currentCallId = callId;
    }
  }

  /** Dispatch an incoming signal to the handler */
  dispatchSignal(signal: CallSignal) {
    this.signalHandler?.(signal);
  }

  private createPC() {
    this.log('Creating RTCPeerConnection with', this.iceServers.length, 'ICE servers...');
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers as RTCIceServer[] });
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      this.log('Adding', tracks.length, 'local tracks to PC');
      tracks.forEach((t) => this.pc!.addTrack(t, this.localStream!));
    } else {
      this.log('WARN: No local stream to add to PC');
    }
    this.pc.ontrack = (e) => {
      let stream = this.remoteStream;
      if (!stream) {
        stream = e.streams?.[0] || new MediaStream();
      }
      if (e.track && !stream.getTracks().some((t) => t.id === e.track!.id)) {
        stream.addTrack(e.track);
      }
      this.remoteStream = stream;
      this.log('ontrack FIRED! streams:', e.streams?.length || 0, 'track kind:', e.track?.kind, 'remoteStreamTracks:', this.remoteStream.getTracks().length);
    };
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.log('Sending ICE candidate:', e.candidate.type, e.candidate.candidate.slice(0, 60));
        // Use custom signal broadcaster if set (WebSocket), otherwise fall back to Supabase broadcast
        if (this.signalBroadcaster) {
          this.signalBroadcaster('ice-candidate', e.candidate.toJSON());
        } else if (this.currentCallId) {
          this.signalChannel?.send({ type: 'broadcast', event: 'signal', payload: { type: 'ice-candidate', call_id: this.currentCallId, from: '', to: '', data: e.candidate.toJSON() } });
        }
      }
    };
    this.pc.oniceconnectionstatechange = () => {
      this.log('ICE connection state:', this.pc?.iceConnectionState);
    };
    this.pc.onconnectionstatechange = () => {
      this.log('Connection state:', this.pc?.connectionState);
    };
    this.pc.onsignalingstatechange = () => {
      this.log('Signaling state:', this.pc?.signalingState);
    };
  }

  private flushPendingCandidates() {
    if (!this.pc) return;
    for (const c of this.pendingCandidates) {
      try { this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    this.pendingCandidates = [];
  }

  subscribeToSignaling(callId: string, userId: string, onSignal: (s: CallSignal) => void) {
    this.currentCallId = callId;
    // If a custom signal transport is set (WebSocket), skip Supabase broadcast channels.
    // Signal dispatching is handled externally via dispatchSignal().
    if (this.signalHandler) {
      return () => { /* WS path: cleanup handled by WS client */ };
    }
    this.signalChannel = supabase.channel(`call:${callId}`);
    this.signalChannel.on('broadcast', { event: 'signal' }, (p) => onSignal(p.payload as CallSignal));
    this.signalChannel.subscribe();
    return () => { this.signalChannel?.unsubscribe(); this.signalChannel = null; };
  }

  async createOffer() {
    this.log('createOffer()');
    this.createPC();
    if (!this.pc) { this.log('createOffer FAILED: no PC'); return null; }
    const offer = await this.pc.createOffer();
    this.log('Offer created, type:', offer.type, 'SDP length:', offer.sdp?.length);
    await this.pc.setLocalDescription(offer);
    this.log('Local description set');
    return offer;
  }

  async handleOffer(offer: any) {
    this.log('handleOffer()');
    this.createPC();
    if (!this.pc) { this.log('handleOffer FAILED: no PC'); return null; }
    this.log('Setting remote description from offer...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescSet = true;
    this.log('Remote description set, flushing', this.pendingCandidates.length, 'pending candidates');
    this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    this.log('Answer created, type:', answer.type, 'SDP length:', answer.sdp?.length);
    await this.pc.setLocalDescription(answer);
    this.log('Local description set (answer)');
    return answer;
  }

  async handleAnswer(answer: any) {
    if (!this.pc) { this.log('handleAnswer FAILED: no PC'); return; }
    if (this.pc.signalingState !== 'stable' && this.pc.signalingState !== 'have-local-offer') {
      this.log('handleAnswer SKIPPED: signalingState is', this.pc.signalingState);
      return;
    }
    try {
      this.log('handleAnswer() - setting remote description');
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.remoteDescSet = true;
      this.log('Remote description set, flushing', this.pendingCandidates.length, 'pending candidates');
      this.flushPendingCandidates();
    } catch (err) {
      this.log('handleAnswer FAILED:', err);
    }
  }

  queueIceCandidate(candidate: any) {
    if (this.remoteDescSet && this.pc) {
      this.log('Adding remote ICE candidate immediately');
      try { this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (err) { this.log('addIceCandidate FAILED:', err); }
    } else {
      this.log('Queueing ICE candidate (remote desc not set yet)');
      this.pendingCandidates.push(candidate);
    }
  }

  endCall() {
    this.log('endCall()');
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.signalChannel?.unsubscribe();
    this.signalChannel = null;
    this.currentCallId = null;
    this.pendingCandidates = [];
    this.remoteDescSet = false;
  }

  toggleMute(): boolean {
    if (!this.localStream) { this.log('toggleMute: no local stream'); return false; }
    const enabled = !this.localStream.getAudioTracks()[0]?.enabled;
    this.log('toggleMute:', enabled ? 'UNMUTED' : 'MUTED');
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    return enabled;
  }

  broadcastSignal(type: CallSignalType, data?: any) {
    if (!this.currentCallId) {
      this.log('broadcastSignal FAILED: no callId');
      return;
    }
    this.log('Broadcasting signal:', type);
    // Use custom signal broadcaster if set (WebSocket), otherwise fall back to Supabase broadcast
    if (this.signalBroadcaster) {
      this.signalBroadcaster(type, data);
    } else if (this.signalChannel) {
      this.signalChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type, call_id: this.currentCallId, from: '', to: '', data }
      });
    } else {
      this.log('broadcastSignal FAILED: no signal channel or broadcaster');
    }
  }

  get currentCallIdVal(): string | null { return this.currentCallId; }

  // Broadcast-based call announcement
  private static announceChannel = supabase.channel('calls:announce');
  private static announceReady = false;

  static initAnnounce() {
    if (CallService.announceReady) return;
    CallService.announceChannel.subscribe();
    CallService.announceReady = true;
  }

  static announceNewCall(callId: string) {
    CallService.initAnnounce();
    CallService.announceChannel.send({ type: 'broadcast', event: 'new_call', payload: { call_id: callId } });
  }

  static listenForNewCalls(onCallId: (callId: string) => void) {
    CallService.initAnnounce();
    CallService.announceChannel.on('broadcast', { event: 'new_call' }, (p) => onCallId(p.payload.call_id));
  }

  static async loadTurnConfig(): Promise<IceServerConfig[]> {
    // Dynamic environment configuration first (allows fast deployment/local environments to override database settings)
    const envStunUrl = (import.meta as any).env?.VITE_ICE_STUN_URL;
    const envTurnUrl = (import.meta as any).env?.VITE_ICE_TURN_URL;
    if (envStunUrl || envTurnUrl) {
      const envServers: IceServerConfig[] = [];
      if (envStunUrl) {
        envServers.push({ urls: envStunUrl });
      }
      if (envTurnUrl) {
        envServers.push({
          urls: envTurnUrl,
          username: (import.meta as any).env?.VITE_ICE_TURN_USERNAME,
          credential: (import.meta as any).env?.VITE_ICE_TURN_CREDENTIAL,
        });
      }
      console.log('[CallService] loaded STUN/TURN configuration from environment overrides:', envServers);
      return envServers;
    }

    try {
      const { data } = await supabase
        .from('hotel_settings')
        .select('value')
        .eq('key', 'turn_servers')
        .maybeSingle();
      if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
        console.log('[CallService] Loaded TURN config from database settings:', data.value.length, 'servers');
        return data.value as IceServerConfig[];
      }
    } catch (err) {
      console.error('[CallService] Failed to load TURN config from database:', err);
    }

    return [];
  }

  // DB helpers
  static async createCall(data: Partial<Call>): Promise<Call | null> {
    const { data: call, error } = await supabase.from('calls').insert(data).select().single();
    if (error) { console.error('Create call error:', error.message, JSON.stringify(data)); return null; }
    return call;
  }

  static async updateCall(id: string, updates: Partial<Call>): Promise<boolean> {
    const { error } = await supabase.from('calls').update(updates).eq('id', id);
    if (error) { console.error('Update call error:', error.message, JSON.stringify(updates)); return false; }
    return true;
  }

  static async getCall(id: string): Promise<Call | null> {
    const { data } = await supabase.from('calls').select('*').eq('id', id).single();
    return data;
  }

  static async getActiveCalls(): Promise<Call[]> {
    const { data } = await supabase.from('calls').select('*').in('status', ['ringing', 'waiting', 'connected', 'on_hold']).order('created_at', { ascending: false });
    return data || [];
  }

  static async getCallHistory(): Promise<Call[]> {
    const { data } = await supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
}