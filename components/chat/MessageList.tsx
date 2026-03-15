"use client";
import { useEffect, useRef, useState } from "react";
import { Message } from "@/app/chat/page";
import CompassLogo from "@/components/ui/CompassLogo";
import styles from "./MessageList.module.css";

// Clear, purposeful suggestions
const SUGGESTIONS = [
  { icon: "✦", text: "Ask anything", desc: "Questions, research, advice" },
  { icon: "🎨", text: "Generate an image", desc: "AI art, photos, illustrations" },
  { icon: "💻", text: "Code assistant", desc: "Write, debug, explain code" },
  { icon: "🔍", text: "Search the web", desc: "Latest news, live data, sources" },
  { icon: "📄", text: "Analyze a file", desc: "PDF, image, CSV upload" },
  { icon: "🧠", text: "Remember something", desc: "Save info for future chats" },
];

interface Props {
  messages: Message[];
  loading: boolean;
  isPrivate: boolean;
  onSuggestion: (text: string) => void;
  onCopy: (text: string) => void;
  onShare: () => void;
  onEdit: (index: number, newContent: string) => void;
  userName?: string;
}

export default function MessageList({ messages, loading, isPrivate, onSuggestion, onCopy, onShare, onEdit, userName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function startEdit(i: number, content: string) { setEditIdx(i); setEditVal(content); }
  function saveEdit(i: number) {
    if (editVal.trim()) { onEdit(i, editVal.trim()); setEditIdx(null); }
  }

  function renderContent(text: string) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const inner = part.slice(3, -3);
        const nl = inner.indexOf("\n");
        const lang = nl > 0 ? inner.slice(0, nl).trim() : "";
        const code = nl > 0 ? inner.slice(nl + 1) : inner;
        return (
          <div key={i} className={styles.codeBlock}>
            <div className={styles.codeHeader}>
              <span className={styles.codeLang}>{lang || "code"}</span>
              <button className={styles.copyCode} onClick={() => navigator.clipboard.writeText(code)}>Copy</button>
            </div>
            <pre><code>{code}</code></pre>
          </div>
        );
      }
      const linkMap: Record<string, string> = {};
      let idx = 0;
      let html = part;
      html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_m, alt, url) => {
        const key = `__IMG_${idx++}__`;
        linkMap[key] = `<img src="${url}" alt="${alt}" style="max-width:260px;border-radius:8px;margin:6px 0;display:block;" />`;
        return key;
      });
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, title, url) => {
        const key = `__LINK_${idx++}__`;
        linkMap[key] = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="aiLink">${title}</a>`;
        return key;
      });
      html = html.replace(/(https?:\/\/[^\s<>"']+)/g, (url) => {
        if (Object.values(linkMap).some(v => v.includes(url))) return url;
        const key = `__URL_${idx++}__`;
        const display = url.length > 50 ? url.slice(0, 47) + "..." : url;
        linkMap[key] = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="aiLink">${display}</a>`;
        return key;
      });
      html = html
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/^### (.+)/gm, "<h3>$1</h3>")
        .replace(/^## (.+)/gm, "<h2>$1</h2>")
        .replace(/^# (.+)/gm, "<h1>$1</h1>")
        .replace(/^[-*] (.+)/gm, "<li>$1</li>")
        .replace(/^\d+\. (.+)/gm, "<li>$1</li>")
        .replace(/\n\n/g, "<br/><br/>")
        .replace(/\n/g, "<br/>");
      Object.entries(linkMap).forEach(([key, val]) => { html = html.replace(key, val); });
      return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
    });
  }

  if (!messages.length && !loading) {
    const greeting = userName ? `Hi ${userName.split(" ")[0]} 👋` : "How can I help you?";
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeInner}>
          <CompassLogo size={48} spinning />
          <h2 className={styles.welcomeTitle}>
            {isPrivate ? "Hey there 💕" : greeting}
          </h2>
          <p className={styles.welcomeSub}>
            {isPrivate
              ? "I'm Aria, your private companion. What's on your mind?"
              : "Ask me anything — I search the web, generate images, write code, analyze files, and more."}
          </p>
          {!isPrivate && (
            <div className={styles.grid}>
              {SUGGESTIONS.map((s) => (
                <button key={s.text} className={styles.gridCard} onClick={() => onSuggestion(s.text)}>
                  <span className={styles.gridIcon}>{s.icon}</span>
                  <div className={styles.gridInfo}>
                    <span className={styles.gridText}>{s.text}</span>
                    <span className={styles.gridDesc}>{s.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {messages.map((msg, i) => (
        <div key={i} className={`${styles.row} ${msg.role === "user" ? styles.userRow : styles.aiRow} fade-in`}>
          {msg.role === "assistant" && (
            <div className={styles.avatar}>
              <CompassLogo size={22} spinning={loading && i === messages.length - 1} />
            </div>
          )}
          <div className={styles.body}>
            {editIdx === i ? (
              <div className={styles.editBox}>
                <textarea className={styles.editArea} value={editVal} onChange={e => setEditVal(e.target.value)}
                  rows={3} autoFocus onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) saveEdit(i); }} />
                <div className={styles.editBtns}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(i)}>Save & Resend</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditIdx(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {msg.imageBase64 && (
                  <div className={styles.uploadedWrap}>
                    <img src={msg.imageBase64} alt="Uploaded" className={styles.uploadedImg} />
                    <p className={styles.uploadedHint}>💡 Describe what to change, or pick ✨ Effect</p>
                  </div>
                )}
                {msg.image ? (
                  <div className={styles.imgWrap}>
                    <img src={msg.image} alt="Generated" className={styles.genImg} />
                    <div className={styles.imgActions}>
                      <button className={styles.imgBtn} onClick={() => { const a = document.createElement("a"); a.href = msg.image!; a.download = "vakna-image.png"; a.click(); }}>⬇️ Download</button>
                      <button className={styles.imgBtn} onClick={onShare}>🔗 Share</button>
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.bubble} ${msg.role === "user" ? styles.userBubble : styles.aiBubble}`}>
                    {renderContent(msg.content || "")}
                  </div>
                )}
                <div className={styles.meta}>
                  <button className={styles.metaBtn} onClick={() => onCopy(msg.content || msg.image || "")}>📋 Copy</button>
                  {msg.role === "user" && !msg.imageBase64 && (
                    <button className={styles.metaBtn} onClick={() => startEdit(i, msg.content || "")}>✏️ Edit</button>
                  )}
                </div>
              </>
            )}
          </div>
          {msg.role === "user" && <div className={styles.userAvatar}>{userName?.[0]?.toUpperCase() || "U"}</div>}
        </div>
      ))}
      {loading && (
        <div className={`${styles.row} ${styles.aiRow}`}>
          <div className={styles.avatar}><CompassLogo size={22} spinning pulsing /></div>
          <div className={`${styles.bubble} ${styles.aiBubble} ${styles.thinkingBubble}`}>
            <div className={styles.dots}><span /><span /><span /></div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}