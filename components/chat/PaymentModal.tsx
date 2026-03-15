"use client";
import { User } from "firebase/auth";
import { useEffect } from "react";
import styles from "./PaymentModal.module.css";

interface Props { user: User|null; onClose: ()=>void; onSuccess: (paymentId: string)=>void; }
export default function PaymentModal({ user, onClose, onSuccess }: Props) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  function handlePay() {
    const RZ = (window as any).Razorpay;
    if (!RZ) { alert("Payment gateway loading... please try again."); return; }
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: 19900,
      currency: "INR",
      name: "Vakna AI",
      description: "Premium Plan - 1 Month",
      prefill: { name: user?.displayName || "", email: user?.email || "" },
      theme: { color: "#6366f1" },
      handler: (res: any) => { onSuccess(res.razorpay_payment_id); onClose(); },
    };
    new RZ(options).open();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e=>e.stopPropagation()}>
        <div className={styles.header}>
          <h2>👑 Upgrade to Premium</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          <div className={styles.price}>₹199<span>/month</span></div>
          <ul className={styles.features}>
            {["Unlimited chats daily","Unlimited image generation","Private Chat with Aria","Priority response speed","All image effects","Multi-language support"].map(f => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </div>
        <div className={styles.footer}>
          <button className="btn btn-premium" onClick={handlePay} style={{width:"100%",justifyContent:"center",padding:"0.875rem"}}>
            Pay ₹199 with Razorpay
          </button>
          <button className="btn btn-ghost" onClick={onClose} style={{width:"100%",justifyContent:"center"}}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}
