import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { uid, paymentId } = await req.json();
    if (!uid || !paymentId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    await updateDoc(doc(db, "users", uid), {
      plan: "premium",
      subscriptionActive: true,
      subscriptionExpiry: expiry.toISOString(),
      lastPaymentId: paymentId,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Payment error:", e?.message);
    return NextResponse.json({ error: "Payment processing failed." }, { status: 500 });
  }
}
