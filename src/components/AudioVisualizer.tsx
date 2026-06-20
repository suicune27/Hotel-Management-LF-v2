import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [hasAudioData, setHasAudioData] = useState(false);

  useEffect(() => {
    if (!isActive || !stream || stream.getAudioTracks().length === 0) {
      setHasAudioData(false);
      return;
    }

    // Set up Web Audio API
    let audioContext: AudioContext;
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('[AudioVisualizer] Web Audio API not supported', e);
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64; // Small fftSize is ideal for voice/frequency bars
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let source: MediaStreamAudioSourceNode | null = null;
    try {
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (err) {
      console.warn('[AudioVisualizer] Error connecting media stream source:', err);
    }

    audioCtxRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;

    let consecutiveSilenceFrames = 0;

    const draw = () => {
      if (!analyserRef.current || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Quantify audio energy/activity
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;

      if (average > 2) {
        setHasAudioData(true);
        consecutiveSilenceFrames = 0;
      } else {
        consecutiveSilenceFrames++;
        if (consecutiveSilenceFrames > 30) {
          setHasAudioData(false);
        }
      }

      ctx.clearRect(0, 0, width, height);

      const totalBars = bufferLength;
      const barWidth = (width / totalBars) * 1.2;
      let x = 0;

      for (let i = 0; i < totalBars; i++) {
        // Map frequency level to bar height
        const val = dataArray[i];
        const barHeight = Math.max(3, (val / 255) * height);

        const g = ctx.createLinearGradient(0, height, 0, 0);
        g.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
        g.addColorStop(0.5, 'rgba(16, 185, 129, 0.7)');
        g.addColorStop(1, 'rgba(52, 211, 153, 0.95)');

        ctx.fillStyle = g;

        // Centered layout for a modern symmetrical soundbar
        const yPos = (height - barHeight) / 2;

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, yPos, barWidth - 2, barHeight, 3);
        } else {
          ctx.rect(x, yPos, barWidth - 2, barHeight);
        }
        ctx.fill();

        x += barWidth;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stream, isActive]);

  return (
    <div className={`flex flex-col items-center justify-center gap-1 w-full my-2 p-2 rounded-xl border transition-all duration-300 ${
      !isActive 
        ? 'bg-surface-100/10 border-surface-200/10 text-surface-400' 
        : hasAudioData 
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800' 
          : 'bg-amber-500/10 border-amber-500/30 text-amber-800 animate-pulse-subtle'
    }`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
        <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          !isActive 
            ? 'bg-surface-400' 
            : hasAudioData 
              ? 'bg-emerald-500 animate-pulse' 
              : 'bg-amber-500 animate-ping'
        }`} />
        <span className={`font-mono text-[9px] ${!isActive ? 'text-surface-500' : hasAudioData ? 'text-emerald-700' : 'text-amber-700 font-extrabold'}`}>
          {!isActive 
            ? 'Call Disconnected' 
            : hasAudioData 
              ? 'Audio Incoming' 
              : 'Silent Stream - No Audio Detected'
          }
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={180}
        height={32}
        className="w-full h-8 opacity-90 transition-opacity"
      />
    </div>
  );
};
