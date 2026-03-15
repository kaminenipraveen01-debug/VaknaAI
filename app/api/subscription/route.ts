import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return NextResponse.json({ active: false });

    const data = snap.data();
    if (data.plan === "premium" && data.subscriptionExpiry) {
      const expired = new Date() > new Date(data.subscriptionExpiry);
      if (expired) {
        await updateDoc(ref, { plan: "free", subscriptionActive: false });
        return NextResponse.json({ active: false, downgraded: true });
      }
    }
    return NextResponse.json({ active: data.plan === "premium" });
  } catch (e: any) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
