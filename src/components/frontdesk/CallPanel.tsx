import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Mic, MicOff, Volume2, VolumeX, Pause, Play, X, Loader2, Clock, User, AlertTriangle, Volume, Wifi, WifiOff, Settings } from 'lucide-react';
import { CallService, type IceServerConfig } from '../../lib/callService';
import { supabase } from '../../lib/supabase';
import type { Call } from '../../types';
import { getCallClient, type CallServerClient, type ClientRole } from '../../lib/callServerClient';
import type { CallSignal } from '../../lib/callService';
import { AudioVisualizer } from '../AudioVisualizer';

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

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
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('default');
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callSvc = useRef<CallService | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showOutputPicker, setShowOutputPicker] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsServerUrl, setWsServerUrl] = useState('');
  const [showWsConfig, setShowWsConfig] = useState(false);
  const turnServersRef = useRef<IceServerConfig[]>([]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const wsClientRef = useRef<CallServerClient | null>(null);

  // Load TURN server config from hotel_settings
  useEffect(() => {
    CallService.loadTurnConfig().then((servers) => {
      turnServersRef.current = servers;
    });
  }, []);

  const getCallService = useCallback(() => {
    if (!callSvc.current) {
      const servers = turnServersRef.current;
      callSvc.current = servers.length > 0 ? new CallService(servers) : new CallService();
    }
    return callSvc.current;
  }, []);

  // Enumerate audio output devices
  useEffect(() => {
    const enumerate = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || d.deviceId.slice(0, 8) + '...', kind: d.kind }));
        setAudioOutputDevices(outputs);
      } catch {}
    };
    enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', enumerate);
  }, []);

  // Switch output device when selected
  useEffect(() => {
    const el = audioRef.current;
    if (el && typeof (el as any).setSinkId === 'function') {
      (el as any).setSinkId(selectedOutputDevice).catch(() => {});
    }
  }, [selectedOutputDevice]);

  // Connect to WebSocket signaling server
  useEffect(() => {
    const isHttps = window.location.protocol === 'https:';
    const defaultUrl = isHttps 
      ? `wss://${window.location.host}` 
      : `ws://${window.location.hostname}:3001`;
      
    const savedUrl = localStorage.getItem('call_server_url') || defaultUrl;
    setWsServerUrl(savedUrl);

    const client = getCallClient(savedUrl);
    wsClientRef.current = client;

    client.on({
      onStatusChange: (connected) => {
        setWsConnected(connected);
      },
      onIncomingCall: (callId, guestName, roomNumber, bookingId) => {
        // Create a Call-like object from the WS announcement
        setIncomingCall({
          id: callId,
          booking_id: bookingId || null,
          caller_id: null,
          caller_name: guestName,
          caller_role: 'guest',
          room_number: roomNumber || null,
          receiver_id: null,
          receiver_name: null,
          department: null,
          status: 'ringing',
          queue_position: null,
          offer_data: null,
          answer_data: null,
          start_time: null,
          end_time: null,
          duration_seconds: null,
          created_at: new Date().toISOString(),
        } as Call);
        setShowPanel(true);
        setCallError(null);
      },
      onCallEnded: (callId) => {
        setActiveCall(null);
        setIncomingCall(null);
        setCallDuration(0);
        callSvc.current?.endCall();
        callSvc.current = null;
        loadHistory();
      },
      onCallDeclined: (callId) => {
        setIncomingCall(null);
      },
      onFrontDeskOffline: () => {
        setCallError('Call server disconnected');
      },
      onSignal: (callId, from, signal) => {
        const svc = callSvc.current;
        if (!svc) return;
        svc.dispatchSignal({
          type: signal.type as any,
          call_id: callId,
          from: from,
          to: userProfileId,
          data: signal.data,
        });
      },
      onCallAccepted: (callId) => {
        // Already handled in accept flow
      },
    });

    client.connect('frontdesk', userProfileName || 'Front Desk');

    return () => {
      // Don't disconnect on unmount - keep the singleton alive
    };
  }, [userProfileName]);

  // Fall back to Supabase if WebSocket is not available
  useEffect(() => {
    if (wsConnected) return; // Skip Supabase announce if WS is connected

    console.log('[CallPanel] WS not connected, falling back to Supabase signaling');
    CallService.initAnnounce();
    loadHistory();
    CallService.listenForNewCalls(async (callId) => {
      console.log('[CallPanel] New call announced (Supabase):', callId);
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

    return () => {
      // cleanup is handled by CallService
    };
  }, [wsConnected, userProfileId]);

  useEffect(() => {
    if (activeCall?.status === 'connected' && activeCall?.start_time) {
      console.log('[CallPanel] Starting duration timer');
      const start = new Date(activeCall.start_time).getTime();
      durationRef.current = setInterval(() => setCallDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [activeCall?.status, activeCall?.start_time]);

  useEffect(() => {
    if (activeCall?.status !== 'connected') {
      setRemoteStream(null);
      return;
    }
    const el = audioRef.current;
    const check = setInterval(() => {
      const stream = callSvc.current?.remoteStream;
      if (stream) {
        setRemoteStream(stream);
        if (el && el.srcObject !== stream) {
          console.log('[CallPanel] Connecting remote stream to audio element!');
          el.srcObject = stream;
          el.volume = 1;
          el.muted = false;
          el.play().then(() => console.log('[CallPanel] Audio play SUCCESS')).catch((err) => console.log('[CallPanel] Audio play FAILED:', err));
          clearInterval(check);
        }
      }
    }, 200);
    return () => clearInterval(check);
  }, [activeCall?.status]);

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

    // Prime the audio element within the user gesture thread to bypass Safari/Chrome autoplay policies
    const audioEl = audioRef.current;
    if (audioEl) {
      console.log('[CallPanel] Priming audio element during user gesture');
      audioEl.play().catch((err) => {
        console.log('[CallPanel] Audio prime registration/gesture registered:', err.name || err);
      });
    }

    try {
      const svc = getCallService();
      const micOk = await svc.requestMicrophone();
      if (!micOk) { setCallError('Microphone access denied'); return; }

      // WS path: use WebSocket signaling instead of Supabase
      const wsClient = wsClientRef.current;
      if (wsConnected && wsClient) {
        const callId = incomingCall.id;

        svc.setSignalTransport(
          async (signal: CallSignal) => {
            if (signal.type === 'offer') {
              try {
                const answer = await svc.handleOffer(signal.data);
                if (answer) {
                  wsClient.sendSignal(callId, { type: 'answer', data: answer });

                  // Re-set transport for ICE candidates only
                  svc.setSignalTransport(
                    (sig) => {
                      if (sig.type === 'ice-candidate') svc.queueIceCandidate(sig.data);
                      if (sig.type === 'ended') {
                        svc.endCall();
                        callSvc.current = null;
                        setActiveCall(null);
                        setCallDuration(0);
                        loadHistory();
                      }
                    },
                    (type, data) => {
                      if (type === 'ice-candidate') wsClient.sendSignal(callId, { type: 'ice-candidate', data });
                    }
                  );

                  const startTime = new Date().toISOString();
                  const roomInfo = incomingCall.room_number ? ` (Room ${incomingCall.room_number})` : '';
                  insertCallChatMessage(incomingCall, `📞 Call connected${roomInfo}`);
                  setActiveCall({ ...incomingCall, status: 'connected', receiver_id: userProfileId, receiver_name: userProfileName, start_time: startTime });
                  setIncomingCall(null);
                  loadHistory();
                }
              } catch (err: any) {
                console.error('[CallPanel] WS offer handling error:', err);
                setCallError(err?.message || 'Failed to handle offer');
              }
            } else if (signal.type === 'ice-candidate') {
              svc.queueIceCandidate(signal.data);
            } else if (signal.type === 'ended') {
              svc.endCall();
              callSvc.current = null;
              setActiveCall(null);
              setCallDuration(0);
              loadHistory();
            }
          },
          (type, data) => {
            if (type === 'ice-candidate') wsClient.sendSignal(callId, { type: 'ice-candidate', data });
          }
        );

        svc.subscribeToSignaling(callId, userProfileId, () => {});
        wsClient.acceptCall(callId);
        return;
      }

      // Supabase path (fallback)
      svc.subscribeToSignaling(incomingCall.id, userProfileId, async (signal) => {
        if (signal.type === 'ice-candidate') svc.queueIceCandidate(signal.data);
        if (signal.type === 'ended') {
          svc.endCall();
          callSvc.current = null;
          setActiveCall(null);
          setCallDuration(0);
          loadHistory();
        }
      });

      const fromDb = await CallService.getCall(incomingCall.id);
      if (!fromDb?.offer_data) { setCallError('No offer data from guest - call may have been cancelled'); return; }

      let offer: any;
      try { offer = JSON.parse(fromDb.offer_data); } catch { setCallError('Invalid offer data from guest'); return; }

      const answer = await svc.handleOffer(offer);
      if (!answer) { setCallError('Failed to create WebRTC answer'); return; }

      const startTime = new Date().toISOString();
      const updateOk = await CallService.updateCall(incomingCall.id, {
        status: 'connected', receiver_id: userProfileId, receiver_name: userProfileName,
        answer_data: JSON.stringify(answer), start_time: startTime,
      });
      if (!updateOk) { setCallError('Failed to save call to database - check RLS policies'); return; }

      svc.broadcastSignal('answer');
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

    // WS path
    if (wsConnected && wsClientRef.current) {
      wsClientRef.current.declineCall(incomingCall.id);
      setIncomingCall(null);
      loadHistory();
      return;
    }

    // Supabase path
    const svc = getCallService();
    svc.subscribeToSignaling(incomingCall.id, userProfileId, () => {});
    try {
      await CallService.updateCall(incomingCall.id, { status: 'missed', end_time: new Date().toISOString() });
      svc.broadcastSignal('declined');
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

    // WS path
    if (wsConnected && wsClientRef.current) {
      wsClientRef.current.endCall();
      callSvc.current?.endCall();
      callSvc.current = null;
      setActiveCall(null);
      setIncomingCall(null);
      setCallDuration(0);
      loadHistory();
      return;
    }

    // Supabase path
    const duration = activeCall?.start_time ? Math.floor((Date.now() - new Date(activeCall.start_time).getTime()) / 1000) : 0;
    try {
      await CallService.updateCall(target.id, { status: 'ended', end_time: new Date().toISOString(), duration_seconds: duration });
      if (duration > 0) {
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        const roomInfo = target.room_number ? ` (Room ${target.room_number})` : '';
        insertCallChatMessage(target, `📞 Call ended — ${mins}:${secs.toString().padStart(2, '0')}${roomInfo}`);
      }
      callSvc.current?.broadcastSignal('ended');
      callSvc.current?.endCall();
      callSvc.current = null;
    } catch {}
    setActiveCall(null);
    setIncomingCall(null);
    setCallDuration(0);
    loadHistory();
  }, [activeCall, incomingCall]);

  const handleToggleMute = useCallback(() => {
    setIsMuted(callSvc.current?.toggleMute() ?? false);
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
      <audio ref={audioRef} autoPlay playsInline />
      {/* Floating call button with WS status dot */}
      <div className="fixed bottom-6 right-6 z-[200]">
        {/* WS connection dot on the outside */}
        <div
          onClick={() => setShowWsConfig(!showWsConfig)}
          className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer z-10 shadow-sm border-2 border-white transition-colors"
          title={wsConnected ? 'Call server connected' : 'Call server offline — using Supabase fallback'}
          style={{ backgroundColor: wsConnected ? '#059669' : '#dc2626' }}
        >
          {wsConnected ? <Wifi className="w-2.5 h-2.5 text-white" /> : <WifiOff className="w-2.5 h-2.5 text-white" />}
        </div>
        <button onClick={() => setShowPanel(!showPanel)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${incomingCall ? 'bg-rose-600 animate-pulse' : activeCall ? 'bg-emerald-600' : 'bg-brand-600'}`}>
          {incomingCall ? <PhoneIncoming className="w-6 h-6 text-white" /> : <Phone className="w-6 h-6 text-white" />}
        </button>

        {/* WS config tooltip */}
        {showWsConfig && (
          <div className="absolute bottom-full mb-2 right-0 w-72 bg-white border border-surface-200 rounded-xl shadow-xl p-3 z-30" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Call Server</p>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-xs font-semibold text-surface-800">
                {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
              {!wsConnected && (
                <span className="text-[9px] text-amber-600 font-medium ml-auto">Fallback: Supabase</span>
              )}
            </div>
            <div className="bg-surface-50 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-surface-500 truncate">
              {wsServerUrl}
            </div>
            <button
              onClick={() => {
                const url = prompt('Enter WebSocket server URL:', wsServerUrl);
                if (url && url.trim()) {
                  localStorage.setItem('call_server_url', url.trim());
                  window.location.reload();
                }
                setShowWsConfig(false);
              }}
              className="mt-2 w-full py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-700 text-[10px] font-semibold rounded-lg cursor-pointer transition-colors"
            >
              Change Server URL
            </button>
          </div>
        )}
      </div>

      {show && (
        <div className="fixed bottom-24 right-6 z-[200] w-80 bg-white rounded-2xl shadow-2xl border border-surface-100 overflow-hidden animate-scale-in">
          <div className="px-4 py-3 bg-brand-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="text-xs font-bold">Calls</span>
              {/* WS status badge in header */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${wsConnected ? 'bg-emerald-500/30 text-emerald-100' : 'bg-amber-500/30 text-amber-100'}`}>
                {wsConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                {wsConnected ? 'WS' : 'Supabase'}
              </div>
            </div>
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
              <div className="flex justify-center gap-3 mb-2">
                <button onClick={handleToggleMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isMuted ? 'bg-rose-100 text-rose-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                <button onClick={() => setIsSpeaker(!isSpeaker)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isSpeaker ? 'bg-brand-100 text-brand-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isSpeaker ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
                <button onClick={handleHold} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${isOnHold ? 'bg-amber-100 text-amber-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>{isOnHold ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
                <button onClick={handleEndCall} className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 transition-colors cursor-pointer"><PhoneOff className="w-4 h-4" /></button>
              </div>
              <AudioVisualizer stream={remoteStream} isActive={activeCall?.status === 'connected'} />
              {/* Audio output device selector */}
              <div className="relative">
                <button
                  onClick={() => setShowOutputPicker(!showOutputPicker)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-semibold text-surface-500 hover:text-surface-700 hover:bg-surface-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Volume className="w-3 h-3" />
                  Audio Output: {audioOutputDevices.find(d => d.deviceId === selectedOutputDevice)?.label?.replace(/^(Default|Communications)\s*/i, '')?.trim() || 'Default'}
                </button>
                {showOutputPicker && audioOutputDevices.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-surface-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                    {audioOutputDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => { setSelectedOutputDevice(device.deviceId); setShowOutputPicker(false); }}
                        className={`w-full text-left px-3 py-2 text-[10px] font-semibold hover:bg-surface-50 transition-colors cursor-pointer ${selectedOutputDevice === device.deviceId ? 'text-brand-700 bg-brand-50' : 'text-surface-700'}`}
                      >
                        {device.label || 'Unknown device'}
                      </button>
                    ))}
                  </div>
                )}
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
