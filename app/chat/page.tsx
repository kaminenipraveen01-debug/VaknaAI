"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, getDocs, query, where, orderBy, deleteDoc } from "firebase/firestore";
import Sidebar from "@/components/chat/Sidebar";
import TopBar from "@/components/chat/TopBar";
import MessageList from "@/components/chat/MessageList";
import InputArea from "@/components/chat/InputArea";
import SettingsModal from "@/components/chat/SettingsModal";
import PaymentModal from "@/components/chat/PaymentModal";
import PrivateUnlock from "@/components/chat/PrivateUnlock";
import Toast from "@/components/ui/Toast";
import VoiceLive from "@/components/chat/VoiceLive";
import { getMemories, deleteMemory } from "@/lib/memory";
import styles from "./chat.module.css";

export interface Message {
  role: "user" | "assistant";
  content?: string;
  image?: string;
  imageBase64?: string;
  timestamp: number;
  sources?: { title: string; url: string }[];
  mapsUrl?: string;
  searchImages?: string[];
}

interface Chat { id: string; title: string; isPrivate: boolean; createdAt: string; }

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privateUnlocked, setPrivateUnlocked] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [guestPopup, setGuestPopup] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [ariaVoiceMode, setAriaVoiceMode] = useState(false);
  const [showVoiceLive, setShowVoiceLive] = useState(false);
  const [isLikelyMaleUser, setIsLikelyMaleUser] = useState(true);

  function showToast(msg: string, type: "success"|"error"|"info" = "info") { setToast({ msg, type }); }

  useEffect(() => {
    const saved = localStorage.getItem("vakna-theme");
    if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (saved === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches)
      document.documentElement.setAttribute("data-theme", "light");
    const fsMap: Record<string, string> = { small: "14px", medium: "16px", large: "18px" };
    const savedFs = localStorage.getItem("vakna-fontsize");
    if (savedFs && fsMap[savedFs]) document.documentElement.style.fontSize = fsMap[savedFs];
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) { router.replace("/login"); return; }
      setUser(u); await loadUserData(u.uid); await loadChatList(u.uid); await loadMemoryCount(u.uid); setAuthLoading(false);
    });
    return unsub;
  }, []);

  async function loadMemoryCount(uid: string) {
    try {
      const mems = await getMemories(uid);
      setMemoryCount(mems.length);
    } catch { }
  }

  // Sound effects
  function playSound(type: "send" | "receive") {
    try {
      const soundEnabled = localStorage.getItem("vakna-sound") === "true";
      if (!soundEnabled) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "send") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
      }
    } catch {}
  }

  // Aria Voice-to-Voice TTS
  function speakAsAria(text: string, isFemalePerspective: boolean) {
    if (!ariaVoiceMode) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[^\x00-\x7F\u0C00-\u0C7F\u0900-\u097F]/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    // Find natural-sounding voice
    const preferFemale = isFemalePerspective; // Aria is female for male users
    const voice = voices.find(v =>
      preferFemale
        ? v.name.toLowerCase().includes("female") || v.name.includes("Zira") || v.name.includes("Hazel") || v.name.includes("Susan")
        : v.name.toLowerCase().includes("male") || v.name.includes("David") || v.name.includes("Mark")
    ) || voices.find(v => v.lang.startsWith("en")) || voices[0];
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.pitch = preferFemale ? 1.15 : 0.9;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function loadUserData(uid: string) {
    try {
      const ref = doc(db, "users", uid); const snap = await getDoc(ref);
      if (snap.exists()) { setUserData(snap.data()); }
      else { const nd = { uid, plan: "free", chatsUsed: 0, imagesUsed: 0, dailyChats: {}, dailyImages: {}, createdAt: new Date().toISOString() }; await setDoc(ref, nd); setUserData(nd); }
    } catch (e) { console.error(e); }
  }

  async function loadChatList(uid: string) {
    try {
      const q = query(collection(db, "chats"), where("uid", "==", uid), orderBy("createdAt", "desc"));
      setChatList((await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() } as Chat)));
    } catch {
      try {
        const q2 = query(collection(db, "chats"), where("uid", "==", uid));
        setChatList((await getDocs(q2)).docs.map(d => ({ id: d.id, ...d.data() } as Chat)).sort((a, b) => b.createdAt?.localeCompare(a.createdAt || "") || 0));
      } catch {}
    }
  }

  async function saveChat(msgs: Message[], title: string) {
    if (!user) return;
    // Firestore doesn't accept undefined — strip all undefined fields
    const clean = cleanMsgs(msgs);
    try {
      if (chatId) {
        await updateDoc(doc(db, "chats", chatId), { messages: clean, updatedAt: new Date().toISOString() });
      } else {
        const d = { uid: user.uid, title: title.slice(0, 60), messages: clean, isPrivate, createdAt: new Date().toISOString() };
        const r = await addDoc(collection(db, "chats"), d);
        setChatId(r.id);
        setChatList(p => [{ id: r.id, title: d.title, isPrivate, createdAt: d.createdAt }, ...p]);
      }
    } catch (e) { console.error("saveChat:", e); }
  }

  // Strip all undefined/null fields before saving to Firestore
  function cleanMsgs(msgs: Message[]) {
    return msgs.map(m => {
      const obj: any = {
        role: m.role,
        content: m.content || "",
        timestamp: m.timestamp || Date.now(),
      };
      if (m.image) obj.image = m.image;
      // Never save full imageBase64 to Firestore (too large + causes errors)
      return obj;
    });
  }

  function newChat() { setMessages([]); setChatId(null); setIsPrivate(false); setPrivateUnlocked(false); setCodeMode(false); }

  async function openChat(chat: Chat) {
    if (chat.isPrivate && !privateUnlocked) { setIsPrivate(true); return; }
    setMessages([]); setChatId(chat.id); setIsPrivate(chat.isPrivate); setCodeMode(false);
    try { const s = await getDoc(doc(db, "chats", chat.id)); if (s.exists()) setMessages(s.data().messages || []); } catch {}
  }

  async function deleteChat(id: string) {
    try { await deleteDoc(doc(db, "chats", id)); if (chatId === id) newChat(); setChatList(p => p.filter(c => c.id !== id)); } catch {}
  }

  async function generateImage(prompt: string, src?: string, effect?: string) {
    const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, uid: user!.uid, sourceImageBase64: src, effect }) });
    return res.json();
  }

  async function typeReply(text: string, prev: Message[], extra?: Partial<Message>): Promise<Message[]> {
    const all: Message[] = [...prev, { role: "assistant", content: "", timestamp: Date.now(), ...extra }];
    setMessages([...all]);
    let cur = ""; const delay = text.length > 600 ? 1 : 3;
    for (const ch of text) { cur += ch; all[all.length - 1] = { ...all[all.length - 1], content: cur }; setMessages([...all]); await new Promise(r => setTimeout(r, delay)); }
    return all;
  }

  // Handle special features: search, research, shopping, maps, thinking
  async function handleSpecial(type: "search" | "research" | "shopping" | "maps" | "thinking", query: string) {
    if (!user || loading) return;
    const plan = userData?.plan || "guest";

    const userMsg: Message = { role: "user", content: type === "maps" && !query.includes(",") ? `📍 ${query || "Restaurants near me"}` : `${type === "research" ? "🔬 Deep Research: " : type === "shopping" ? "🛒 Shopping: " : type === "thinking" ? "🧠 " : "🔍 "}${query}`, timestamp: Date.now() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs); setLoading(true);

    try {
      if (type === "maps") {
        // Google Maps embed
        setLoadingLabel("📍 Finding location…");
        let mapsQuery = query;
        let lat = "", lng = "";
        if (query.includes(",") && /[-\d.]+,[-\d.]+/.test(query)) {
          const parts = query.split("restaurants near ")[1] || query;
          const coords = parts.match(/([-\d.]+),([-\d.]+)/);
          if (coords) { lat = coords[1]; lng = coords[2]; mapsQuery = `restaurants near ${lat},${lng}`; }
        }
        const mapsEmbedUrl = lat && lng
          ? `https://www.google.com/maps/embed/v1/search?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=restaurants&center=${lat},${lng}&zoom=14`
          : `https://www.google.com/maps/embed/v1/search?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(mapsQuery || "restaurants near me")}&zoom=13`;
        const aiMsg: Message = { role: "assistant", content: "Here are the results on Google Maps. Click any marker for details, directions, and reviews.", timestamp: Date.now(), mapsUrl: mapsEmbedUrl };
        const final = [...newMsgs, aiMsg]; setMessages(final); await saveChat(final, userMsg.content || "Maps");
      } else if (type === "research") {
        setLoadingLabel("🔬 Researching across the web…");
        const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        const data = await res.json();
        if (data.error) { showToast(data.error, "error"); return; }
        const final = await typeReply(data.answer, newMsgs, { sources: data.sources });
        await saveChat(final, query);
      } else if (type === "shopping" || type === "search") {
        setLoadingLabel(type === "shopping" ? "🛒 Searching products…" : "🔍 Searching the web…");
        const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, type, uid: user.uid }) });
        const data = await res.json();
        if (data.error) { showToast(data.error, "error"); return; }
        const final = await typeReply(data.answer, newMsgs, { sources: data.sources, searchImages: data.images });
        await saveChat(final, query);
      } else if (type === "thinking") {
        setLoadingLabel("🧠 Thinking step by step…");
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content || "" })), uid: user.uid, isPrivate: false, codeMode: false, thinkingMode: true }) });
        const data = await res.json();
        if (data.error) { showToast(data.error, "error"); return; }
        const final = await typeReply(data.reply, newMsgs);
        await saveChat(final, query);
      }
      if (plan === "guest") localStorage.setItem("guestChats", String(parseInt(localStorage.getItem("guestChats") || "0") + 1));
      await loadUserData(user.uid);
    } catch { showToast("Something went wrong. Please try again.", "error"); }
    finally { setLoading(false); setLoadingLabel(""); }
  }

  function handleMapsQuery(inputText: string): boolean {
    const lower = inputText.toLowerCase();
    // Detect if user is asking for directions to a specific place
    const directionsMatch = lower.match(/directions?\s+to\s+(.+)|(.+)\s+ki\s+directions?|(.+)\s+కి\s+దారి|(.+)\s+ka\s+rasta/i);
    if (directionsMatch) {
      const destination = (directionsMatch[1] || directionsMatch[2] || directionsMatch[3] || directionsMatch[4] || "").trim();
      if (destination) {
        const encoded = encodeURIComponent(destination);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude: lat, longitude: lng } = pos.coords;
              window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encoded}`, "_blank");
            },
            () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank"),
            { timeout: 5000 }
          );
        } else {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
        }
        return true;
      }
    }

    // Detect restaurants/places near me
    const nearbyMatch = lower.match(/restaurants?\s+near\s+me|nearby\s+restaurants?|food\s+near\s+me|దగ్గర\s+హోటల్|దగ్గర\s+రెస్టారెంట్|నా\s+దగ్గర\s+తినడానికి|mujhe\s+restaurant|paas\s+restaurant/i);
    if (nearbyMatch) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            window.open(`https://www.google.com/maps/search/restaurants/@${lat},${lng},15z`, "_blank");
          },
          () => window.open("https://www.google.com/maps/search/restaurants+near+me", "_blank"),
          { timeout: 5000 }
        );
      } else {
        window.open("https://www.google.com/maps/search/restaurants+near+me", "_blank");
      }
      return true;
    }

    // Detect search on maps
    const mapsSearchMatch = lower.match(/find\s+(.+)\s+on\s+maps?|maps?\s+lo\s+(.+)\s+chupinchu|(.+)\s+maps?\s+lo\s+search/i);
    if (mapsSearchMatch) {
      const place = (mapsSearchMatch[1] || mapsSearchMatch[2] || mapsSearchMatch[3] || "").trim();
      if (place) {
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(place)}`, "_blank");
        return true;
      }
    }

    return false;
  }

  async function sendMessage(inputText: string, file?: { base64: string; type: string; name: string } | null, effect?: string, searchType?: string) {
    if ((!inputText.trim() && !file) || loading || !user) return;
    const plan = userData?.plan || "guest";
    const gC = parseInt(localStorage.getItem("guestChats") || "0");
    const gI = parseInt(localStorage.getItem("guestImages") || "0");
    if (plan === "guest" && !file && gC >= 10) { setGuestPopup(true); return; }
    if (plan === "guest" && file && gI >= 5) { setGuestPopup(true); return; }

    const userMsg: Message = { role: "user", content: inputText || (file ? `[${file.name}]` : ""), imageBase64: file?.type.startsWith("image/") ? file.base64 : undefined, timestamp: Date.now() };
    const newMsgs = [...messages, userMsg]; setMessages(newMsgs); setLoading(true);

    try {
      if (file?.type.startsWith("image/") && effect) {
        // Effect selected → generate new image with effect
        setLoadingLabel("🎨 Generating image…");
        const data = await generateImage(inputText || "apply effect to this image", file.base64, effect);
        if (data.error === "LIMIT_REACHED") { handleLimit(data.plan); return; }
        if (data.error) { showToast(data.error, "error"); return; }
        const final = [...newMsgs, { role: "assistant" as const, image: data.image, timestamp: Date.now() }];
        setMessages(final); if (plan === "guest") localStorage.setItem("guestImages", String(gI + 1));
        await saveChat(final, inputText || "Image effect"); await loadUserData(user.uid); return;
      }
      // Image without effect → go to vision AI for analysis/explanation
      setLoadingLabel("");
      const apiMsgs = newMsgs.map(m => ({ role: m.role, content: m.content || "", imageBase64: m.imageBase64 }));
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: apiMsgs, uid: user.uid, isPrivate, codeMode }) });
      const data = await res.json();
      if (data.error === "LIMIT_REACHED") { handleLimit(data.plan); return; }
      if (data.error) { showToast(data.error, "error"); return; }
      if (data.shouldGenerateImage) {
        if (plan === "guest" && gI >= 5) { setGuestPopup(true); return; }
        setLoadingLabel("🎨 Generating image…");
        const imgData = await generateImage(data.imagePrompt);
        if (imgData.error) { showToast(imgData.error, "error"); return; }
        const final = [...newMsgs, { role: "assistant" as const, image: imgData.image, timestamp: Date.now() }];
        setMessages(final); if (plan === "guest") localStorage.setItem("guestImages", String(gI + 1));
        await saveChat(final, inputText);
      } else {
        const final = await typeReply(data.reply, newMsgs, { sources: data.sources });
        if (plan === "guest") localStorage.setItem("guestChats", String(gC + 1));
        await saveChat(final, inputText);
      }
      await loadUserData(user.uid);
    } catch (e) { console.error(e); showToast("Something went wrong. Please try again.", "error"); }
    finally { setLoading(false); setLoadingLabel(""); }
  }

  async function editMessage(index: number, newContent: string) {
    if (!user) return;
    const history = messages.slice(0, index); setMessages(history);
    if (chatId) await updateDoc(doc(db, "chats", chatId), { messages: cleanMsgs(history) }).catch(() => {});
    const userMsg: Message = { role: "user", content: newContent, timestamp: Date.now() };
    const newMsgs = [...history, userMsg]; setMessages(newMsgs); setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content || "" })), uid: user.uid, isPrivate, codeMode, userName: user.displayName || user.email || "" }) });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      if (data.shouldGenerateImage) {
        const imgData = await generateImage(data.imagePrompt);
        if (imgData.error) { showToast(imgData.error, "error"); return; }
        const final = [...newMsgs, { role: "assistant" as const, image: imgData.image, timestamp: Date.now() }];
        setMessages(final); await saveChat(final, newContent);
      } else { const final = await typeReply(data.reply, newMsgs); await saveChat(final, newContent); }
      await loadUserData(user.uid);
    } catch { showToast("Something went wrong.", "error"); }
    finally { setLoading(false); }
  }

  function handleLimit(plan: string) {
    if (plan === "guest") {
      setGuestPopup(true);
    } else if (isPrivate) {
      const greetName = user?.displayName?.split(" ")[0] || "baby";
      const ariaMsg: Message = {
        role: "assistant",
        content: `${greetName}, mana iroju kaburlu chala bagunnayi! ❤️ Kani ippatiki naku konchem rest kavali 🥺\n\nMalli repu matladukundhama? Ledha neeku ippude inka matladali ante, mana Premium ki upgrade avvu — nenu nee kosam eppudu ready ga untanu! 💙✨`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, ariaMsg]);
    } else {
      showToast("Daily limit reached. Upgrade to Premium!", "error");
    }
    setLoading(false);
  }
  async function handleUpgrade(paymentId: string) {
    if (!user) return;
    await fetch("/api/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: user.uid, paymentId }) });
    await loadUserData(user.uid); showToast("🎉 Premium activated!", "success");
  }
  function handleSignOut() { signOut(auth); router.replace("/login"); }

  if (authLoading) return <div className={styles.splash}><div className={styles.loader} /></div>;
  if (isPrivate && !privateUnlocked) return <PrivateUnlock onUnlock={() => { setPrivateUnlocked(true); setMessages([]); setChatId(null); }} onCancel={() => setIsPrivate(false)} />;

  const title = isPrivate ? "💕 Private Chat" : codeMode ? "💻 Code Assistant" : chatId ? (chatList.find(c => c.id === chatId)?.title || "Chat") : "New Chat";

  return (
    <div className={styles.app}>
      <Sidebar open={sidebarOpen} chatList={chatList} activeChatId={chatId} userData={userData} user={user}
        onNewChat={newChat} onSelectChat={openChat} onDeleteChat={deleteChat}
        onOpenPrivate={() => { const p = userData?.plan || "guest"; if (p === "guest") { showToast("Sign in to chat with Aria! 💕", "info"); return; } setIsPrivate(true); }}
        onUpgrade={() => setShowPayment(true)} onSettings={() => setShowSettings(true)}
        onSignOut={handleSignOut}
        onCodeMode={() => { newChat(); setCodeMode(true); }}
        memoryCount={memoryCount}
        onToolSelect={(tool: string) => {
          if (tool === "chat") newChat();
          else if (tool === "code") { newChat(); setCodeMode(true); }
          else if (tool === "image") { newChat(); setTimeout(() => sendMessage("Generate a beautiful image for me"), 100); }
          else if (tool === "search") { newChat(); setTimeout(() => sendMessage("Search the web for latest news today"), 100); }
          else if (tool === "pdf") { newChat(); showToast("Upload a PDF or image using the 📎 button", "info"); }
          else if (tool === "memory") { newChat(); setTimeout(() => sendMessage("What do you remember about me?"), 100); }
        }}
      />

      <div className={styles.main}>
        <TopBar title={title} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(p => !p)} user={user} onSettings={() => setShowSettings(true)} onUpgrade={() => setShowPayment(true)} userData={userData} />
        <MessageList messages={messages} loading={loading} isPrivate={isPrivate}
          onSuggestion={t => sendMessage(t)} onCopy={t => { navigator.clipboard.writeText(t).catch(() => {}); showToast("Copied!", "success"); }}
          onShare={() => { navigator.clipboard.writeText(window.location.href).catch(() => {}); showToast("Link copied!", "success"); }}
          onEdit={editMessage}
          userName={user?.displayName || undefined} />
        <InputArea onSend={sendMessage} loading={loading} isPrivate={isPrivate} userData={userData} codeMode={codeMode} isAriaVoiceMode={ariaVoiceMode} onAriaVoiceToggle={() => { setAriaVoiceMode(p => !p); window.speechSynthesis.cancel(); }} onVoiceLive={() => setShowVoiceLive(true)} />
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {guestPopup && (
        <div className={styles.overlay} onClick={() => setGuestPopup(false)}>
          <div className={styles.guestBox} onClick={e => e.stopPropagation()}>
            <h3>⚡ Limit Reached</h3>
            <p>Sign in with Google for 50 free chats/day, 10 images/day, and more!</p>
            <div className={styles.guestBtns}>
              <button className="btn btn-primary" onClick={handleSignOut}>Sign in with Google</button>
              <button className="btn btn-ghost" onClick={() => setGuestPopup(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {showVoiceLive && (
        <VoiceLive
          isPrivate={isPrivate}
          userName={user?.displayName || undefined}
          onTranscript={(text, role) => {
            const msg: Message = { role, content: text, timestamp: Date.now() };
            setMessages(prev => {
              const updated = [...prev, msg];
              // Save to Firestore after assistant reply
              if (role === "assistant") {
                saveChat(updated, text.slice(0, 50));
              }
              return updated;
            });
          }}
          onClose={() => setShowVoiceLive(false)}
        />
      )}

      {showSettings && <SettingsModal user={user} userData={userData} onClose={() => setShowSettings(false)} onSignOut={handleSignOut} />}
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} onSuccess={handleUpgrade} />}
    </div>
    
  );
}