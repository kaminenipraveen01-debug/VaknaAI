"use client";
import { useState } from "react";
import styles from "./PrivateUnlock.module.css";

const PIN = "1234";
interface Props { onUnlock: ()=>void; onCancel: ()=>void; }
export default function PrivateUnlock({ onUnlock, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function verify() {
    if (pin === PIN) { onUnlock(); }
    else { setError("Incorrect PIN. Try again."); setPin(""); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>🔒</div>
        <h2>Private Chat</h2>
        <p>Enter your PIN to access Aria</p>
        <input
          className={styles.pin}
          type="password"
          maxLength={6}
          value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && verify()}
          placeholder="Enter PIN"
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.btns}>
          <button className="btn btn-primary" onClick={verify}>Unlock</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
        <p className={styles.hint}>Default PIN: 1234</p>
      </div>
    </div>
  );
}
