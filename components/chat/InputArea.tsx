"use client";
import { useState, useRef, useEffect } from "react";
import styles from "./InputArea.module.css";

const EFFECTS = ["cinematic","anime","oil","watercolor","neon","vintage","sketch","3d"];

interface Props {
  onSend: (text: string, file?: { base64: string; type: string; name: string } | null, effect?: string, searchType?: string) => void;
  loading: boolean;
  isPrivate: boolean;
  userData: any;
  codeMode?: boolean;
  isAriaVoiceMode?: boolean;
  onAriaVoiceToggle?: () => void;
  onVoiceLive?: () => void;
}

type VoiceState = "idle" | "listening" | "processing";

// Detect browser/OS language
function detectUserLanguage(): string {
  const lang = navigator.language || "en";
  const code = lang.split("-")[0].toLowerCase();
  const map: Record<string, string> = {
    te: "te-IN", hi: "hi-IN", ta: "ta-IN", kn: "kn-IN",
    ml: "ml-IN", bn: "bn-BD", mr: "mr-IN", gu: "gu-IN",
    pa: "pa-IN", ur: "ur-PK", ar: "ar-SA", fr: "fr-FR",
    de: "de-DE", es: "es-ES", pt: "pt-BR", ru: "ru-RU",
    zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", id: "id-ID",
    ms: "ms-MY", tr: "tr-TR", vi: "vi-VN", th: "th-TH",
    en: "en-US",
  };
  return map[code] || "en-US";
}

const LANG_OPTIONS = [
  { code: "auto", label: "Auto" },
  { code: "en-US", label: "English" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "മലയാളം" },
  { code: "bn-BD", label: "বাংলা" },
  { code: "ar-SA", label: "العربية" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "id-ID", label: "Bahasa" },
  { code: "zh-CN", label: "中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "ru-RU", label: "Русский" },
  { code: "pt-BR", label: "Português" },
];

export default function InputArea({ onSend, loading, isPrivate, userData, codeMode, isAriaVoiceMode, onAriaVoiceToggle, onVoiceLive }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ base64: string; type: string; name: string } | null>(null);
  const [effect, setEffect] = useState("");
  const [showEffects, setShowEffects] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceLang, setVoiceLang] = useState("auto");
  const [audioLevel, setAudioLevel] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const plan = userData?.plan || "guest";

  useEffect(() => () => stopVoice(), []);

  function stopVoice() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setVoiceState("idle");
    voiceStateRef.current = "idle";
    setAudioLevel(0);
  }

  async function startVoice() {
    if (voiceState !== "idle") { stopVoice(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported. Please use Chrome browser."); return; }

    // Audio wave animation
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setAudioLevel(Math.min(data.reduce((a, b) => a + b, 0) / data.length / 60, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* mic permission denied */ }

    const lang = voiceLang === "auto" ? detectUserLanguage() : voiceLang;
    const r = new SR();
    recognitionRef.current = r;
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;

    setVoiceState("listening");
    voiceStateRef.current = "listening";

    r.onresult = (ev: any) => {
      const t = Array.from(ev.results).map((res: any) => res[0].transcript).join("");
      setText(t);
      if (ev.results[ev.results.length - 1].isFinal) {
        setVoiceState("processing");
        voiceStateRef.current = "processing";
        setTimeout(() => {
          stopVoice();
          if (t.trim()) { onSend(t.trim(), null); setText(""); }
        }, 400);
      }
    };

    r.onerror = () => stopVoice();
    r.onend = () => { if (voiceStateRef.current === "listening") stopVoice(); };
    r.start();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleSend(forcedText?: string, searchType?: string) {
    const t = (forcedText ?? text).trim();
    if ((!t && !file) || loading) return;
    onSend(t, file, effect || undefined, searchType);
    setText(""); setFile(null); setEffect(""); setShowEffects(false); setShowPlus(false);
    if (textRef.current) textRef.current.style.height = "auto";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFile({ base64: reader.result as string, type: f.type, name: f.name });
      if (f.type.startsWith("image/")) setShowEffects(true);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  function openMaps(type: "restaurants" | "directions") {
    const fallback = type === "restaurants"
      ? "https://www.google.com/maps/search/restaurants+near+me"
      : "https://www.google.com/maps/dir/";
    if (!navigator.geolocation) { window.open(fallback, "_blank"); setShowPlus(false); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) =>
        window.open(type === "restaurants"
          ? `https://www.google.com/maps/search/restaurants/@${lat},${lng},15z`
          : `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}`, "_blank"),
      () => window.open(fallback, "_blank"),
      { timeout: 5000 }
    );
    setShowPlus(false);
  }

  const placeholder = isPrivate ? "Talk to Aria…" : codeMode ? "Write, debug, or explain code…" : "Ask anything…";

  return (
    <div className={styles.wrap}>
      {codeMode && <div className={styles.modeBar}>💻 Code Mode Active</div>}

      {/* Voice listening animation */}
      {voiceState !== "idle" && (
        <div className={styles.voiceOverlay}>
          <div className={styles.voiceWaves}>
            {[...Array(7)].map((_, i) => (
              <div key={i} className={styles.voiceBar} style={{
                animationDelay: `${i * 0.08}s`,
                height: `${12 + audioLevel * 35 + Math.abs(Math.sin(i * 1.2)) * 12}px`,
              }} />
            ))}
          </div>
          <span className={styles.voiceLabel}>
            {voiceState === "listening" ? "🎤 Listening…" : "⏳ Processing…"}
          </span>
          <button className={styles.voiceStop} onClick={stopVoice}>✕ Stop</button>
        </div>
      )}

      {file && (
        <div className={styles.filePreview}>
          {file.type.startsWith("image/") && <img src={file.base64} alt="" className={styles.previewImg} />}
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.name}</span>
            {file.type.startsWith("image/") && <span className={styles.fileHint}>✨ Pick an effect or describe what to change</span>}
          </div>
          <button className={styles.removeFile} onClick={() => { setFile(null); setShowEffects(false); setEffect(""); }}>✕</button>
        </div>
      )}

      {showEffects && (
        <div className={styles.effectsRow}>
          <span className={styles.effectLabel}>✨</span>
          {EFFECTS.map(ef => (
            <button key={ef} className={`${styles.effectBtn} ${effect === ef ? styles.effectActive : ""}`}
              onClick={() => setEffect(p => p === ef ? "" : ef)}>{ef}</button>
          ))}
        </div>
      )}

      <div className={styles.inputRow}>
        <textarea ref={textRef} className={styles.input} value={text}
          onChange={e => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={handleKey} placeholder={placeholder} rows={1} />

        <div className={styles.inputBtns}>
          {/* Voice: mic button + language select */}
          <div className={styles.voiceWrap}>
            <button className={`${styles.voiceBtn} ${voiceState === "listening" ? styles.voiceActive : ""}`}
              onClick={startVoice} title="Voice input">
              {voiceState === "idle" ? "🎤" : voiceState === "listening" ? "⏹" : "⏳"}
            </button>
            <select className={styles.langSelect} value={voiceLang} onChange={e => setVoiceLang(e.target.value)} title="Voice language">
              {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {/* Gemini Live Voice button — available in all chats */}
          {onVoiceLive && (
            <button
              className={styles.voiceLiveBtn}
              onClick={onVoiceLive}
              title="Live voice conversation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="9" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/>
                <rect x="7" y="6" width="2" height="12" rx="1" fill="currentColor" opacity="0.7"/>
                <rect x="11" y="3" width="2" height="18" rx="1" fill="currentColor"/>
                <rect x="15" y="6" width="2" height="12" rx="1" fill="currentColor" opacity="0.7"/>
                <rect x="19" y="9" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/>
                <circle cx="21" cy="4" r="3" fill="#6366f1"/>
                <text x="19.5" y="5.5" fontSize="4" fill="white">✦</text>
              </svg>
            </button>
          )}

          {/* Aria TTS toggle (private only) */}
          {isPrivate && onAriaVoiceToggle && (
            <button
              className={`${styles.ariaVoiceBtn} ${isAriaVoiceMode ? styles.ariaVoiceActive : ""}`}
              onClick={onAriaVoiceToggle}
              title="Voice conversation with Aria"
            >
              {isAriaVoiceMode ? "🔴" : "🔊"}
            </button>
          )}

          <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.csv,.js,.py,.ts,.html" onChange={handleFile} style={{ display: "none" }} />
          <button className={styles.iconBtn} onClick={() => fileRef.current?.click()} title="Attach">📎</button>

          <div className={styles.plusWrap}>
            <button className={`${styles.iconBtn} ${showPlus ? styles.plusActive : ""}`} onClick={() => setShowPlus(p => !p)}>⊕</button>
            {showPlus && (
              <div className={styles.plusMenu}>
                <div className={styles.plusGroup}>Search & Research</div>
                <button className={styles.plusItem} onClick={() => { handleSend(text || "latest news today", "news"); setShowPlus(false); }}>
                  <span className={styles.plusIcon}>📰</span><div><div className={styles.plusLabel}>Latest News</div><div className={styles.plusDesc}>Today's top stories</div></div>
                </button>
                <button className={styles.plusItem} onClick={() => { if (!text.trim()) { alert("Type a topic first"); return; } handleSend(text, "deep"); setShowPlus(false); }}>
                  <span className={styles.plusIcon}>🔬</span><div><div className={styles.plusLabel}>Deep Research</div><div className={styles.plusDesc}>Comprehensive analysis</div></div>
                </button>
                <button className={styles.plusItem} onClick={() => { if (!text.trim()) { alert("Type what to buy first"); return; } handleSend(text, "shopping"); setShowPlus(false); }}>
                  <span className={styles.plusIcon}>🛒</span><div><div className={styles.plusLabel}>Shop</div><div className={styles.plusDesc}>Find products & prices</div></div>
                </button>
                <div className={styles.plusGroup}>Location</div>
                <button className={styles.plusItem} onClick={() => openMaps("restaurants")}>
                  <span className={styles.plusIcon}>🗺️</span><div><div className={styles.plusLabel}>Restaurants Near Me</div><div className={styles.plusDesc}>Opens Google Maps</div></div>
                </button>
                <button className={styles.plusItem} onClick={() => openMaps("directions")}>
                  <span className={styles.plusIcon}>📍</span><div><div className={styles.plusLabel}>Directions</div><div className={styles.plusDesc}>Get directions via Maps</div></div>
                </button>
                <div className={styles.plusGroup}>Files</div>
                <button className={styles.plusItem} onClick={() => { fileRef.current?.click(); setShowPlus(false); }}>
                  <span className={styles.plusIcon}>📎</span><div><div className={styles.plusLabel}>Attach File / Image</div><div className={styles.plusDesc}>PDF, image, CSV</div></div>
                </button>
                {plan !== "guest" && (
                  <button className={styles.plusItem} onClick={() => { setShowEffects(p => !p); setShowPlus(false); }}>
                    <span className={styles.plusIcon}>✨</span><div><div className={styles.plusLabel}>Image Effects</div><div className={styles.plusDesc}>AI style transfer</div></div>
                  </button>
                )}
              </div>
            )}
          </div>

          <button className={`${styles.sendBtn} ${(!text.trim() && !file) || loading ? styles.sendDisabled : ""}`}
            onClick={() => handleSend()} disabled={(!text.trim() && !file) || loading}>
            {loading ? <span className={styles.spinner} /> : "↑"}
          </button>
        </div>
      </div>

      <p className={styles.footer}>Vakna AI by PraveenKumar Kamineni</p>
    </div>
  );
}