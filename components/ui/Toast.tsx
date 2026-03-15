"use client";
import { useEffect } from "react";
import styles from "./Toast.module.css";
interface Props { message: string; type?: "success"|"error"|"info"; onClose: () => void; }
export default function Toast({ message, type = "info", onClose }: Props) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <span>{type==="error"?"✗":type==="success"?"✓":"ℹ"}</span>
      <span>{message}</span>
      <button onClick={onClose} className={styles.close}>✕</button>
    </div>
  );
}
