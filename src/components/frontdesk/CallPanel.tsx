import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Mic, MicOff, Volume2, VolumeX, Pause, Play, X, Loader2, Clock, User, AlertTriangle } from 'lucide-react';
import { CallService } from '../../lib/callService';
import { supabase } from '../../lib/supabase';
import type { Call } from '../../types';

interface CallPanelProps {
  userProfileId: string;
  userProfileName: string;
  userRole: string;
}

export function CallPanel({ userProfileId, userProfileName, userRole }: CallPanelProps) {
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callSvc = useRef(new CallService());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Init announce channel early
  useEffect(() => { console.log('[CallPanel] Mounting'); CallService.initAnnounce(); }, []);

  useEffect(() => {
    console.log('[CallPanel] Init effect with profile:', userProfileId);
    loadHistory();
    CallService.listenForNewCalls(async (callId) => {
      console.log('[CallPanel] New call announced:', callId);
      const call = await CallService.getCall(callId);
      if (!call) return;
      if (call.receiver_id && call.receiver_id !== userProfileId) return;
      if (call.caller_id === userProfileId) return;
      if (call.status === 'ringing' || call.status === 'waiting') {
        setIncomingCall(call);
        setShowPanel(true);
        setCallError(null);
      }
    });
  }, [userProfileId]);

  useEffect(() => {
    if (activeCall?.status === 'connected' && activeCall?.start_time) {
      console.log('[CallPanel] Starting duration timer');
      const start = new Date(activeCall.start_time).getTime();
      durationRef.current = setInterval(() => setCallDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [activeCall?.status, activeCall?.start_time]);

  useEffect(() => {
    const stream = callSvc.current.remoteStream;
    const el = audioRef.current;
    console.log('[CallPanel] Remote stream effect: stream=', !!stream, 'tracks:', stream?.getAudioTracks().length, 'el=', !!el);
    if (stream && el) {
      console.log('[CallPanel] Connecting remote stream to audio element!');
      el.srcObject = stream;
      el.play().then(() => console.log('[CallPanel] Audio play SUCCESS')).catch((err) => console.log('[CallPanel] Audio play FAILED:', err));
    }
  });

  const loadHistory = async () => {
    const h = await CallService.getCallHistory();
    setCallHistory(h.filter((c) => c.caller_id === userProfileId || c.receiver_id === userProfileId));
  };

  const insertCallChatMessage = async (call: Call, message: string) => {
    if (!call.booking_id) return;
    try {
      await supabase.from('chat_messages').insert({
        booking_id: call.booking_id,
        sender_id: userProfileId,
        sender_name: userProfileName,
        sender_role: 'staff',
        message,
      });
    } catch {}
  };

  const handleAccept = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    try {
      const micOk = await callSvc.current.requestMicrophone();
      if (!micOk) { setCallError('Microphone access denied'); return; }

      callSvc.current.subscribeToSignaling(incomingCall.id, userProfileId, async (signal) => {
        if (signal.type === 'ice-candidate') callSvc.current.queueIceCandidate(signal.data);
        if (signal.type === 'ended') {
          callSvc.current.endCall();
          setActiveCall(null);
          setCallDuration(0);
          loadHistory();
        }
      });

      const fromDb = await CallService.getCall(incomingCall.id);
      if (!fromDb?.offer_data) { setCallError('No offer data from guest - call may have been cancelled'); return; }

      let offer: any;
      try { offer = JSON.parse(fromDb.offer_data); } catch { setCallError('Invalid offer data from guest'); return; }

      const answer = await callSvc.current.handleOffer(offer);
      if (!answer) { setCallError('Failed to create WebRTC answer'); return; }

      const startTime = new Date().toISOString();
      const updateOk = await CallService.updateCall(incomingCall.id, {
        status: 'connected', receiver_id: userProfileId, receiver_name: userProfileName,
        answer_data: JSON.stringify(answer), start_time: startTime,
      });
      if (!updateOk) { setCallError('Failed to save call to database - check RLS policies'); return; }

      callSvc.current.broadcastSignal('answer');
      const roomInfo = incomingCall.room_number ? ` (Room ${incomingCall.room_number})` : '';
      insertCallChatMessage(incomingCall, `📞 Call connected${roomInfo}`);

      setActiveCall({ ...incomingCall, status: 'connected', receiver_id: userProfileId, receiver_name: userProfileName, start_time: startTime });
      setIncomingCall(null);
      loadHistory();
    } catch (err: any) {
      console.error('Accept call error:', err);
      setCallError(err?.message || 'Unknown error accepting call');
    }
  }, [incomingCall, userProfileId, userProfileName]);

  const handleDecline = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    callSvc.current.subscribeToSignaling(incomingCall.id, userProfileId, () => {});
    try {
      await CallService.updateCall(incomingCall.id, { status: 'missed', end_time: new Date().toISOString() });
      callSvc.current.broadcastSignal('declined');
      const roomInfo = incomingCall.room_number ? ` (Room ${incomingCall.room_number})` : '';
      insertCallChatMessage(incomingCall, `📞 Missed call${roomInfo}`);
    } catch {}
    setIncomingCall(null);
    loadHistory();
  }, [incomingCall, userProfileId]);

  const handleEndCall = useCallback(async () => {
    if (!activeCall && !incomingCall) return;
    const target = activeCall || incomingCall;
    if (!target) return;
    const duration = activeCall?.start_time ? Math.floor((Date.now() - new Date(activeCall.start_time).getTime()) / 1000) : 0;
    try {
      await CallService.updateCall(target.id, { status: 'ended', end_time: new Date().toISOString(), duration_seconds: duration });
      if (duration > 0) {
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        const roomInfo = target.room_number ? ` (Room ${target.room_number})` : '';
        insertCallChatMessage(target, `📞 Call ended — ${mins}:${secs.toString().padStart(2, '0')}${roomInfo}`);
      }
      callSvc.current.broadcastSignal('ended');
      callSvc.current.endCall();
    } catch {}
    setActiveCall(null);
    setIncomingCall(null);
    setCallDuration(0);
    loadHistory();
  }, [activeCall, incomingCall]);

  const handleToggleMute = useCallback(() => {
    setIsMuted(callSvc.current.toggleMute());
  }, []);

  const handleHold = useCallback(async () => {
    if (!activeCall) return;
    const next = isOnHold ? 'connected' : 'on_hold';
    setIsOnHold(!isOnHold);
    await CallService.updateCall(activeCall.id, { status: next });
  }, [activeCall, isOnHold]);

  const fmtDur = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  const panelCall = activeCall || incomingCall;
  const show = showPanel && panelCall;

  return (
    <>
      <audio ref={audioRef} autoPlay />
      <button onClick={() => setShowPanel(!showPanel)}
        className={`fixed bottom-6 right-6 z-[200] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${incomingCall ? 'bg-rose-600 animate-pulse' : activeCall ? 'bg-emerald-600' : 'bg-brand-600'}`}>
        {incomingCall ? <PhoneIncoming className="w-6 h-6 text-white" /> : <Phone className="w-6 h-6 text-white" />}
      </button>

      {show && (
        <div className="fixed bottom-24 right-6 z-[200] w-80 bg-white rounded-2xl shadow-2xl border border-surface-100 overflow-hidden animate-scale-in">
          <div className="px-4 py-3 bg-brand-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span className="text-xs font-bold">Calls</span></div>
            <button onClick={() => { setShowPanel(false); }} className="p-1 hover:bg-white/20 rounded cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>

          {/* Error state */}
          {callError && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-[11px] text-amber-800">{callError}</p>
            </div>
          )}

          {incomingCall && (
            <div className="p-4 bg-rose-50 border-b border-rose-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-rose-200 flex items-center justify-center animate-pulse"><PhoneIncoming className="w-6 h-6 text-rose-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-surface-900 truncate">{incomingCall.caller_name}</p>
                  {incomingCall.room_number && <p className="text-[11px] text-surface-500">Suite #{incomingCall.room_number}</p>}
                  <p className="text-[10px] text-rose-600 font-semibold mt-0.5">Incoming call...</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleDecline} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"><PhoneOff className="w-3.5 h-3.5" /> Decline</button>
                <button onClick={handleAccept} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Accept</button>
              </div>
            </div>
          )}

          {activeCall && (
            <div className="p-4 bg-emerald-50 border-b border-emerald-100">
              <div className="text-center mb-3">
                <div className="w-16 h-16 rounded-full bg-emerald-200 flex items-center justify-center mx-auto mb-2"><User className="w-8 h-8 text-emerald-600" /></div>
                <p className="text-sm font-bold text-surface-900">{activeCall.caller_name}</p>
                {activeCall.room_number && <p className="text-[11px] text-surface-500">Suite #{activeCall.room_number}</p>}
                <div className="flex items-center justify-center gap-2 mt-1">
                  {isOnHold && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">On Hold</span>}
                  <p className="text-lg font-mono font-bold text-emerald-700">{fmtDur(callDuration)}</p>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <button onClick={handleToggleMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isMuted ? 'bg-rose-100 text-rose-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                <button onClick={() => setIsSpeaker(!isSpeaker)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isSpeaker ? 'bg-brand-100 text-brand-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isSpeaker ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
                <button onClick={handleHold} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isOnHold ? 'bg-amber-100 text-amber-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isOnHold ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
                <button onClick={handleEndCall} className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 transition-colors cursor-pointer"><PhoneOff className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {!activeCall && !incomingCall && (
            <div className="p-3 max-h-80 overflow-y-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mb-2">Call History</p>
              {callHistory.length === 0 ? <p className="text-xs text-surface-400 py-4 text-center">No calls yet</p> : (
                callHistory.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 py-2 border-b border-surface-50 last:border-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${c.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : c.status === 'missed' ? 'bg-rose-50 text-rose-500' : 'bg-surface-50 text-surface-400'}`}>
                      {c.status === 'missed' ? <PhoneOff className="w-3 h-3" /> : <PhoneOutgoing className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-surface-900 truncate">{c.caller_name}</p>
                      <p className="text-[9px] text-surface-400">{c.room_number ? `Suite #${c.room_number} · ` : ''}{fmtTime(c.created_at)}</p>
                    </div>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${c.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : c.status === 'missed' ? 'bg-rose-50 text-rose-500' : 'bg-surface-50 text-surface-400'}`}>{c.status}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
