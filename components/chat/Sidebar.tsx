"use client";
import { User } from "firebase/auth";
import CompassLogo from "@/components/ui/CompassLogo";
import styles from "./Sidebar.module.css";

interface Chat { id: string; title: string; isPrivate: boolean; }
interface Props {
  open: boolean;
  chatList: Chat[];
  activeChatId: string | null;
  userData: any;
  user: User | null;
  memoryCount?: number;
  onNewChat: () => void;
  onSelectChat: (c: Chat) => void;
  onDeleteChat: (id: string) => void;
  onOpenPrivate: () => void;
  onUpgrade: () => void;
  onSettings: () => void;
  onSignOut: () => void;
  onCodeMode: () => void;
  onToolSelect: (tool: string) => void;
}

const TOOLS = [
  { id: "chat",     icon: "💬", label: "Chat AI" },
  { id: "image",    icon: "🎨", label: "Image Generator" },
  { id: "code",     icon: "💻", label: "Code Assistant" },
  { id: "search",   icon: "🔍", label: "Web Search" },
  { id: "pdf",      icon: "📄", label: "File Analyzer" },
  { id: "memory",   icon: "🧠", label: "AI Memory" },
];

export default function Sidebar({
  open, chatList, activeChatId, userData, user, memoryCount = 0,
  onNewChat, onSelectChat, onDeleteChat, onOpenPrivate,
  onUpgrade, onSettings, onSignOut, onCodeMode, onToolSelect,
}: Props) {
  const plan = userData?.plan || "guest";
  const today = new Date().toISOString().slice(0, 10);
  const todayChats = userData?.dailyChats?.[today] || 0;
  const limit = plan === "premium" ? Infinity : plan === "free" ? 50 : 10;
  const pct = limit === Infinity ? 100 : Math.min((todayChats / limit) * 100, 100);
  const regularChats = chatList.filter(c => !c.isPrivate);
  const isGuest = !user?.email;

  return (
    <aside className={`${styles.sidebar} ${!open ? styles.collapsed : ""}`}>
      {/* Logo */}
      <div className={styles.top}>
        <div className={styles.logo}>
          <CompassLogo size={26} spinning />
          <span className={styles.logoText}>Vakna AI</span>
        </div>
        <button className={styles.newChat} onClick={onNewChat}>+ New Chat</button>
      </div>

      {/* AI Tools Hub */}
      <div className={styles.toolsSection}>
        <div className={styles.sectionLabel}>AI Tools</div>
        <div className={styles.toolsGrid}>
          {TOOLS.map(t => (
            <button key={t.id} className={styles.toolBtn} onClick={() => onToolSelect(t.id)} title={t.label}>
              <span className={styles.toolIcon}>{t.icon}</span>
              <span className={styles.toolLabel}>{t.label}</span>
              {t.id === "memory" && memoryCount > 0 && <span className={styles.memBadge}>{memoryCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Private Chat */}
      <div className={styles.quickActions}>
        <button className={styles.privateBtn} onClick={onOpenPrivate}>
          <span>🔒</span>
          <span>Private Chat</span>
          <span className={styles.heart}>♥</span>
        </button>
      </div>

      {/* Recent chats */}
      <div className={styles.chatList}>
        {regularChats.length > 0 ? (
          <>
            <div className={styles.sectionLabel}>Recent Chats</div>
            {regularChats.map(chat => (
              <div key={chat.id}
                className={`${styles.chatItem} ${activeChatId === chat.id ? styles.active : ""}`}
                onClick={() => onSelectChat(chat)}>
                <span className={styles.chatIcon}>💬</span>
                <span className={styles.chatName}>{chat.title || "New Chat"}</span>
                <button className={styles.del} onClick={e => { e.stopPropagation(); onDeleteChat(chat.id); }}>✕</button>
              </div>
            ))}
          </>
        ) : (
          <div className={styles.emptyChats}>Start a conversation!</div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {plan !== "premium" && (
          <button className={styles.upgradeBtn} onClick={onUpgrade}>👑 Upgrade to Premium · ₹199/mo</button>
        )}
        <div className={styles.profile}>
          <div className={styles.avatarWrap}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className={styles.avatarImg} />
              : <span className={styles.avatarLetter}>{(user?.displayName?.[0] || "U").toUpperCase()}</span>}
          </div>
          <div className={styles.profileInfo}>
            <div className={styles.profileName}>{user?.displayName || user?.email || "Guest User"}</div>
            <div className={styles.planBadge}>{plan === "premium" ? "👑 Premium" : plan === "free" ? "⭐ Free" : "⚡ Guest"}</div>
          </div>
          <button className={styles.settingsIcon} onClick={onSettings}>⚙️</button>
        </div>
        {isGuest && (
          <button className={styles.signInBtn} onClick={onSignOut}>🔑 Sign in with Google</button>
        )}
        {limit !== Infinity && (
          <div className={styles.usage}>
            <div className={styles.usageRow}>
              <span className={styles.usageText}>{todayChats} / {limit} chats today</span>
            </div>
            <div className={styles.usageBar}>
              <div className={styles.usageFill} style={{ width: `${pct}%`, background: pct > 80 ? "var(--red)" : undefined }} />
            </div>
          </div>
        )}
        {/* Trust links */}
        <div className={styles.trustLinks}>
          <a href="/privacy" target="_blank">Privacy</a>
          <span>·</span>
          <a href="/terms" target="_blank">Terms</a>
          <span>·</span>
          <a href="/about" target="_blank">About</a>
        </div>
      </div>
    </aside>
  );
}