"use client";
import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import styles from "./SettingsModal.module.css";

interface Props {
  user: User | null;
  userData: any;
  onClose: () => void;
  onSignOut: () => void;
}

type Tab = "general" | "appearance" | "account";

const ACCENT_COLORS = [
  { name: "Indigo",  value: "#6366f1" },
  { name: "Purple",  value: "#8b5cf6" },
  { name: "Pink",    value: "#ec4899" },
  { name: "Blue",    value: "#3b82f6" },
  { name: "Teal",    value: "#14b8a6" },
  { name: "Green",   value: "#10b981" },
  { name: "Orange",  value: "#f97316" },
  { name: "Red",     value: "#ef4444" },
];

export default function SettingsModal({ user, userData, onClose, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [notifications, setNotifications] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [accentColor, setAccentColor] = useState("#6366f1");

  const plan = userData?.plan || "guest";
  const today = new Date().toISOString().slice(0, 10);
  const chatsToday = userData?.dailyChats?.[today] || 0;
  const imgsToday = userData?.dailyImages?.[today] || 0;
  const totalChats = userData?.chatsUsed || 0;

  // Load saved settings on open
  useEffect(() => {
    const savedTheme = localStorage.getItem("vakna-theme") as any || "dark";
    const savedFs = localStorage.getItem("vakna-fontsize") as any || "medium";
    const savedSound = localStorage.getItem("vakna-sound") === "true";
    const savedColor = localStorage.getItem("vakna-accent") || "#6366f1";
    setTheme(savedTheme);
    setFontSize(savedFs);
    setSoundEnabled(savedSound);
    setAccentColor(savedColor);
    applyTheme(savedTheme);
    applyFontSize(savedFs);
    applyAccent(savedColor);
  }, []);

  function applyTheme(t: string) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (t === "dark") document.documentElement.removeAttribute("data-theme");
    else {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (dark) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "light");
    }
  }

  function applyFontSize(fs: string) {
    const map: Record<string, string> = { small: "14px", medium: "16px", large: "18px" };
    document.documentElement.style.fontSize = map[fs] || "16px";
  }

  function applyAccent(color: string) {
    // Convert hex to light variant
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent-dark", color);
    // Create lighter version
    const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
    const light = `rgb(${Math.min(r+60,255)},${Math.min(g+60,255)},${Math.min(b+60,255)})`;
    document.documentElement.style.setProperty("--accent-light", light);
  }

  function handleTheme(t: typeof theme) {
    setTheme(t); localStorage.setItem("vakna-theme", t); applyTheme(t);
  }

  function handleFontSize(fs: typeof fontSize) {
    setFontSize(fs); localStorage.setItem("vakna-fontsize", fs); applyFontSize(fs);
  }

  function handleSound(v: boolean) {
    setSoundEnabled(v); localStorage.setItem("vakna-sound", v ? "true" : "false");
  }

  function handleAccent(color: string) {
    setAccentColor(color); localStorage.setItem("vakna-accent", color); applyAccent(color);
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "account", label: "Account", icon: "👤" },
  ];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Settings</div>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ""}`} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
          <button className={styles.closeBtn} onClick={onClose}>✕ Close</button>
        </div>

        <div className={styles.content}>
          {tab === "general" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>General</h3>

              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>Sound Effects</div>
                  <div className={styles.settingDesc}>Play sounds when sending/receiving messages</div>
                </div>
                <button className={`${styles.toggle} ${soundEnabled ? styles.toggleOn : ""}`}
                  onClick={() => handleSound(!soundEnabled)}>
                  <span className={styles.toggleKnob} />
                </button>
              </div>

              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>Notifications</div>
                  <div className={styles.settingDesc}>Browser notifications (requires permission)</div>
                </div>
                <button className={`${styles.toggle} ${notifications ? styles.toggleOn : ""}`}
                  onClick={() => {
                    if (!notifications) Notification.requestPermission().then(p => setNotifications(p === "granted"));
                    else setNotifications(false);
                  }}>
                  <span className={styles.toggleKnob} />
                </button>
              </div>

              <div className={styles.divider} />

              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>Font Size</div>
                  <div className={styles.settingDesc}>Text size across the app</div>
                </div>
                <div className={styles.segmented}>
                  {(["small","medium","large"] as const).map(f => (
                    <button key={f} className={`${styles.seg} ${fontSize === f ? styles.segActive : ""}`}
                      onClick={() => handleFontSize(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "appearance" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Appearance</h3>

              <div className={styles.settingLabel} style={{ marginBottom:"0.75rem" }}>Theme</div>
              <div className={styles.themeGrid}>
                {([
                  { id:"dark",   label:"Dark",   icon:"🌙", desc:"Dark background" },
                  { id:"light",  label:"Light",  icon:"☀️", desc:"Light background" },
                  { id:"system", label:"System", icon:"💻", desc:"Follow OS" },
                ] as const).map(t => (
                  <button key={t.id} className={`${styles.themeCard} ${theme === t.id ? styles.themeActive : ""}`}
                    onClick={() => handleTheme(t.id)}>
                    <span className={styles.themeIcon}>{t.icon}</span>
                    <span className={styles.themeLabel}>{t.label}</span>
                    <span className={styles.themeDesc}>{t.desc}</span>
                    {theme === t.id && <span className={styles.themeCheck}>✓</span>}
                  </button>
                ))}
              </div>

              <div className={styles.divider} />

              <div className={styles.settingLabel} style={{ marginBottom:"0.75rem" }}>Accent Color</div>
              <div className={styles.colorGrid}>
                {ACCENT_COLORS.map(col => (
                  <button key={col.value} className={`${styles.colorBtn} ${accentColor === col.value ? styles.colorActive : ""}`}
                    style={{ background: col.value }}
                    onClick={() => handleAccent(col.value)}
                    title={col.name}>
                    {accentColor === col.value && <span className={styles.colorCheck}>✓</span>}
                  </button>
                ))}
              </div>
              <p className={styles.colorNote}>Changes buttons, links, and highlights across the app</p>
            </div>
          )}

          {tab === "account" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Account</h3>
              <div className={styles.profileCard}>
                <div className={styles.profileAvatar}>
                  {user?.photoURL
                    ? <img src={user.photoURL} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%" }} />
                    : <span>{(user?.displayName?.[0] || "U").toUpperCase()}</span>}
                </div>
                <div>
                  <div className={styles.profileName}>{user?.displayName || "Guest User"}</div>
                  <div className={styles.profileEmail}>{user?.email || "Anonymous"}</div>
                  <div className={styles.profilePlan}>{plan === "premium" ? "👑 Premium" : plan === "free" ? "⭐ Free" : "⚡ Guest"}</div>
                </div>
              </div>

              <div className={styles.divider} />
              <div className={styles.settingLabel}>Today's Usage</div>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}><div className={styles.statNum}>{chatsToday}</div><div className={styles.statLabel}>Chats</div></div>
                <div className={styles.statCard}><div className={styles.statNum}>{imgsToday}</div><div className={styles.statLabel}>Images</div></div>
                <div className={styles.statCard}><div className={styles.statNum}>{totalChats}</div><div className={styles.statLabel}>Total</div></div>
              </div>

              <div className={styles.divider} />
              <button className="btn btn-danger" onClick={onSignOut} style={{ width:"100%",justifyContent:"center" }}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}