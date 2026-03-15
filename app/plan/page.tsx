"use client";
import { useRouter } from "next/navigation";
import styles from "./plan.module.css";

export default function PlanPage() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>← Back</button>
        <h1>Choose Your Plan</h1>
      </div>
      <div className={styles.cards}>
        {[
          { name: "Guest", price: "Free", features: ["10 chats/day","5 images/day","Basic access"], cta: "Continue as Guest", accent: false },
          { name: "Free", price: "Free", features: ["50 chats/day","10 images/day","Chat history","All languages"], cta: "Sign in with Google", accent: false },
          { name: "Premium", price: "₹199/mo", features: ["Unlimited chats","Unlimited images","Private Chat (Aria)","All image effects","Priority speed"], cta: "Upgrade Now", accent: true },
        ].map(p => (
          <div key={p.name} className={`${styles.card} ${p.accent ? styles.featured : ""}`}>
            {p.accent && <div className={styles.badge}>Most Popular</div>}
            <h2>{p.name}</h2>
            <div className={styles.price}>{p.price}</div>
            <ul className={styles.features}>
              {p.features.map(f => <li key={f}>✓ {f}</li>)}
            </ul>
            <button className={p.accent ? "btn btn-premium" : "btn btn-ghost"} onClick={() => router.push("/chat")}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
