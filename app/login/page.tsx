"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import CompassLogo from "@/components/ui/CompassLogo";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"google"|"guest"|null>(null);
  const [error, setError] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  async function handleGoogle() {
    setLoading("google"); setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.replace("/chat");
    } catch (e: any) {
      setError(e.code === "auth/popup-closed-by-user" ? "Login popup closed." : "Google sign-in failed. Check Firebase settings.");
    } finally { setLoading(null); }
  }

  async function handleGuest() {
    setLoading("guest"); setError("");
    try {
      await signInAnonymously(auth);
      router.replace("/chat");
    } catch (e: any) {
      setError("Guest login failed. Enable Anonymous auth in Firebase Console.");
    } finally { setLoading(null); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <CompassLogo size={52} spinning />
        </div>
        <h1 className={styles.title}>Vakna AI</h1>
        <p className={styles.sub}>Your intelligent AI companion</p>

        {error && <div className={styles.error}>{error}</div>}

        <button className={`${styles.btn} ${styles.google}`} onClick={handleGoogle} disabled={!!loading}>
          {loading==="google" ? <span className={styles.spinner}/> : (
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading==="google" ? "Signing in…" : "Continue with Google"}
        </button>

        <div className={styles.divider}><span>or</span></div>

        <button className={`${styles.btn} ${styles.guest}`} onClick={handleGuest} disabled={!!loading}>
          {loading==="guest" ? <span className={styles.spinner}/> : "⚡"}
          {loading==="guest" ? "Entering…" : "Continue as Guest"}
        </button>

        <p className={styles.terms}>
          By continuing you agree to our{" "}
          <button onClick={()=>setShowTerms(true)} className={styles.link}>Terms</button>
          {" "}and{" "}
          <button onClick={()=>setShowPrivacy(true)} className={styles.link}>Privacy Policy</button>
        </p>
      </div>

      {showTerms && (
        <div className={styles.modal} onClick={()=>setShowTerms(false)}>
          <div className={styles.modalBox} onClick={e=>e.stopPropagation()}>
            <h3>Terms of Service</h3>
            <p>Vakna AI is for personal, lawful use only. Do not misuse or generate harmful content. Service provided as-is.</p>
            <button className="btn btn-primary" onClick={()=>setShowTerms(false)}>Close</button>
          </div>
        </div>
      )}
      {showPrivacy && (
        <div className={styles.modal} onClick={()=>setShowPrivacy(false)}>
          <div className={styles.modalBox} onClick={e=>e.stopPropagation()}>
            <h3>Privacy Policy</h3>
            <p>We store only your chat history and usage data to provide the service. Your data is never sold to third parties.</p>
            <button className="btn btn-primary" onClick={()=>setShowPrivacy(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
