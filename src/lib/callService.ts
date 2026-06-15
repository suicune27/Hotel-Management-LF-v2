import { supabase } from './supabase';
import type { Call } from '../types';

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  call_id: string;
  from: string;
  to: string;
  data: any;
}

export class CallService {
  private signalChannel: ReturnType<typeof supabase.channel> | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  private currentCallId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  async requestMicrophone(): Promise<boolean> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch { return false; }
  }

  private createPC() {
    this.pc = new RTCPeerConnection(STUN_SERVERS);
    if (this.localStream)
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!));
    this.pc.ontrack = (e) => { this.remoteStream = e.streams[0]; };
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.currentCallId)
        this.signalChannel?.send({ type: 'broadcast', event: 'signal', payload: { type: 'ice-candidate', call_id: this.currentCallId, from: '', to: '', data: e.candidate.toJSON() } });
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
    this.signalChannel = supabase.channel(`call:${callId}`);
    this.signalChannel.on('broadcast', { event: 'signal' }, (p) => onSignal(p.payload as CallSignal));
    this.signalChannel.subscribe();
    return () => { this.signalChannel?.unsubscribe(); this.signalChannel = null; };
  }

  async createOffer() {
    this.createPC();
    if (!this.pc) return null;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer: any) {
    this.createPC();
    if (!this.pc) return null;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescSet = true;
    this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: any) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.remoteDescSet = true;
      this.flushPendingCandidates();
    } catch {}
  }

  queueIceCandidate(candidate: any) {
    if (this.remoteDescSet && this.pc) {
      try { this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  endCall() {
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
    if (!this.localStream) return false;
    const enabled = !this.localStream.getAudioTracks()[0]?.enabled;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    return enabled;
  }

  broadcastSignal(type: string, data?: any) {
    if (!this.signalChannel || !this.currentCallId) return;
    this.signalChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { type, call_id: this.currentCallId, from: '', to: '', data }
    });
  }

  get currentCallIdVal(): string | null { return this.currentCallId; }

  // Broadcast-based call announcement — subscribe early and use httpSend for reliability
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
