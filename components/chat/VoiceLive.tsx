"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./VoiceLive.module.css";

interface Props {
  isPrivate: boolean;
  userName?: string;
  onTranscript: (text: string, role: "user" | "assistant") => void;
  onClose: () => void;
}

type SessionState = "idle" | "connecting" | "listening" | "speaking" | "error";

const WS_URL = "ws://localhost:8765";

export default function VoiceLive({ isPrivate, userName, onTranscript, onClose }: Props) {
  const [state, setState] = useState<SessionState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    startSession();
    return () => endSession();
  }, []);

  async function startSession() {
    setState("connecting");
    setError("");

    try {
      // Connect WebSocket to Python backend
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Send session config
        ws.send(JSON.stringify({
          type: "config",
          isPrivate,
          userName: userName || "friend",
        }));

        // Start mic capture
        await startMicrophone(ws);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "ready") {
          setState("listening");
        }

        else if (data.type === "audio") {
          // Play Gemini audio response
          setState("speaking");
          const audioBytes = base64ToArrayBuffer(data.audio);
          audioQueueRef.current.push(audioBytes);
          if (!isPlayingRef.current) playNextAudio();
        }

        else if (data.type === "text") {
          setAiText(prev => prev + data.text);
          onTranscript(data.text, "assistant");
        }

        else if (data.type === "turn_complete") {
          setState("listening");
          if (aiText) setAiText("");
        }

        else if (data.type === "error") {
          setError(data.message);
          setState("error");
        }
      };

      ws.onclose = () => {
        if (state !== "idle") setState("idle");
      };

      ws.onerror = () => {
        setError("Cannot connect to voice server. Make sure Python server is running:\ncd backend && python voice_server.py");
        setState("error");
      };

    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }

  async function startMicrophone(ws: WebSocket) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMuted || ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(float32);
        const b64 = arrayBufferToBase64(int16.buffer);
        ws.send(JSON.stringify({ type: "audio", audio: b64 }));
      };

      source.connect(processor);
      processor.connect(ctx.destination);

    } catch (e: any) {
      setError("Microphone access denied. Please allow mic permission.");
      setState("error");
    }
  }

  async function playNextAudio() {
    if (audioQueueRef.current.length === 0) { isPlayingRef.current = false; setState("listening"); return; }
    isPlayingRef.current = true;

    const pcmData = audioQueueRef.current.shift()!;
    const ctx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 });

    try {
      // Convert PCM 24kHz to playable audio
      const int16 = new Int16Array(pcmData);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => playNextAudio();
      source.start();
    } catch { playNextAudio(); }
  }

  function endSession() {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "stop" }));
      }
      wsRef.current?.close();
    } catch {}
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    recognitionRef.current?.stop();
    setState("idle");
  }

  function toggleMute() { setIsMuted(p => !p); }

  // Helper functions
  function float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
    return int16;
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  const stateLabel: Record<SessionState, string> = {
    idle: "Starting…",
    connecting: "Connecting…",
    listening: isPrivate ? "Aria is listening 💕" : "Listening…",
    speaking: isPrivate ? "Aria is speaking 💙" : "Speaking…",
    error: "Connection error",
  };

  const stateColor: Record<SessionState, string> = {
    idle: "#6366f1", connecting: "#f59e0b",
    listening: "#10b981", speaking: "#ec4899", error: "#ef4444",
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            {isPrivate ? "💕 Voice Chat with Aria" : "🎤 Voice Chat"}
          </span>
          <button className={styles.closeBtn} onClick={() => { endSession(); onClose(); }}>✕</button>
        </div>

        {/* Main orb */}
        <div className={styles.orbWrap}>
          <div className={`${styles.orb} ${styles[`orb_${state}`]}`}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              {/* Waveform bars */}
              {[...Array(7)].map((_, i) => {
                const isActive = state === "listening" || state === "speaking";
                const h = isActive ? 8 + Math.abs(Math.sin(i * 0.9)) * 24 : 8;
                return (
                  <rect key={i}
                    x={8 + i * 7} y={(32 - h / 2)}
                    width="4" height={h}
                    rx="2" fill="white" opacity={isActive ? 0.9 : 0.4}
                    style={{ animation: isActive ? `waveBounce ${0.5 + i * 0.1}s ease-in-out infinite alternate` : "none" }}
                  />
                );
              })}
              {/* Sparkle */}
              {state === "speaking" && (
                <text x="48" y="16" fontSize="12" style={{ animation: "sparkle 1s ease-in-out infinite" }}>✦</text>
              )}
            </svg>
          </div>
          {/* Pulse rings */}
          {(state === "listening" || state === "speaking") && (
            <>
              <div className={`${styles.ring} ${styles.ring1}`} style={{ borderColor: stateColor[state] }} />
              <div className={`${styles.ring} ${styles.ring2}`} style={{ borderColor: stateColor[state] }} />
            </>
          )}
        </div>

        {/* Status */}
        <div className={styles.status} style={{ color: stateColor[state] }}>
          {stateLabel[state]}
        </div>

        {/* Transcript */}
        {aiText && (
          <div className={styles.aiText}>{aiText}</div>
        )}

        {/* Error */}
        {error && (
          <div className={styles.errorBox}>
            <p>{error}</p>
            <button className="btn btn-primary btn-sm" onClick={startSession}>Retry</button>
          </div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          <button className={`${styles.ctrlBtn} ${isMuted ? styles.ctrlMuted : ""}`} onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? "🔇" : "🎤"}
          </button>
          <button className={`${styles.ctrlBtn} ${styles.ctrlEnd}`} onClick={() => { endSession(); onClose(); }}>
            End
          </button>
        </div>

        <p className={styles.hint}>Speak naturally — Aria understands your language</p>
      </div>
    </div>
  );
}