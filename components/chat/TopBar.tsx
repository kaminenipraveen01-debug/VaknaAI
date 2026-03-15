"use client";
import { User } from "firebase/auth";
import WorldClock from "@/components/ui/WorldClock";
import styles from "./TopBar.module.css";

interface Props {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  user: User | null;
  onSettings: () => void;
  onUpgrade: () => void;
  userData: any;
}

export default function TopBar({ title, sidebarOpen, onToggleSidebar, user, onSettings, onUpgrade, userData }: Props) {
  const plan = userData?.plan || "guest";
  return (
    <div className={styles.bar}>
      <button className={styles.toggle} onClick={onToggleSidebar} title="Toggle sidebar">
        <span /><span /><span />
      </button>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.actions}>
        <WorldClock />
        {plan !== "premium" && (
          <button className="btn btn-premium" onClick={onUpgrade} style={{ fontSize: "0.8rem", padding: "0.375rem 0.875rem" }}>
            👑 Upgrade
          </button>
        )}
        {user?.photoURL
          ? <img src={user.photoURL} alt="" className={styles.avatar} onClick={onSettings} />
          : <button className={styles.avatarBtn} onClick={onSettings}>{(user?.displayName?.[0] || "U").toUpperCase()}</button>
        }
        <button className={styles.iconBtn} onClick={onSettings} title="Settings">⚙️</button>
      </div>
    </div>
  );
}