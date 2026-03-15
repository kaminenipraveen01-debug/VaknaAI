import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { rateLimit } from "@/lib/rateLimit";
import { PLAN_LIMITS, getTodayKey } from "@/lib/plans";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BLOCKED = ["nude","naked","nsfw","porn","explicit","sexual","violence","gore","child","minor","underage","blood","weapon"];

const EFFECTS: Record<string, string> = {
  cinematic: "cinematic photography, dramatic lighting, film still, 8k, ultra realistic",
  anime:     "anime art style, studio ghibli inspired, vibrant colors, beautiful illustration",
  oil:       "oil painting masterpiece, fine art, visible brush strokes, museum quality",
  watercolor:"soft watercolor painting, artistic, pastel colors, fluid brushwork",
  neon:      "neon cyberpunk aesthetic, glowing neon lights, dark futuristic city, vivid",
  vintage:   "vintage 1970s photograph, film grain, warm sepia tones, retro aesthetic",
  sketch:    "detailed pencil sketch, fine hand-drawn linework, artistic illustration",
  "3d":      "3D render, octane render, photorealistic CGI, studio lighting, 8k sharp",
};

async function analyzeImageWithVision(imageBase64: string, userRequest: string, effect?: string): Promise<string> {
  try {
    const res = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 300,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: [
          { type: "image_url" as const, image_url: { url: imageBase64 } },
          {
            type: "text" as const,
            text: `Analyze this image deeply and create a detailed image generation prompt.
User request: "${userRequest}"
${effect ? `Desired style: ${EFFECTS[effect] || effect}` : ""}
Return ONLY a detailed English prompt (2-3 sentences) describing the subject, composition, colors, mood, and style. No explanations.`,
          },
        ],
      }],
    });
    return res.choices?.[0]?.message?.content?.trim() || userRequest;
  } catch { return userRequest; }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, uid, effect, sourceImageBase64 } = body;

    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const lower = String(prompt).toLowerCase();
    if (BLOCKED.some(w => lower.includes(w)))
      return NextResponse.json({ error: "Content not allowed." }, { status: 400 });

    const rl = rateLimit(`img:${uid}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const today = getTodayKey();
    let userData: any;

    if (!snap.exists()) {
      userData = { plan: "free", dailyImages: {}, imagesUsed: 0 };
      await setDoc(ref, { uid, ...userData, createdAt: new Date().toISOString() });
    } else { userData = snap.data(); }

    const plan = userData.plan || "free";
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
    const todayImages = userData.dailyImages?.[today] || 0;
    if (limits.images !== Infinity && todayImages >= limits.images)
      return NextResponse.json({ error: "LIMIT_REACHED", plan });

    let finalPrompt = String(prompt).slice(0, 400);

    // Image-to-image: deep analysis via vision model
    if (sourceImageBase64) {
      finalPrompt = await analyzeImageWithVision(sourceImageBase64, finalPrompt, effect);
    }

    // Apply effect
    if (effect && EFFECTS[effect]) {
      finalPrompt = `${finalPrompt}, ${EFFECTS[effect]}`;
    }

    // Add quality boosters
    finalPrompt += ", high quality, detailed, professional";

    // Generate via FLUX
    const hfRes = await fetch(
      "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: finalPrompt }),
      }
    );

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => "");
      console.error("HF error:", hfRes.status, errText);
      return NextResponse.json({ error: "Image generation failed. Try again." }, { status: 500 });
    }

    const buf = await hfRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");

    await updateDoc(ref, {
      [`dailyImages.${today}`]: todayImages + 1,
      imagesUsed: (userData.imagesUsed || 0) + 1,
      lastActive: new Date().toISOString(),
    });

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (e: any) {
    console.error("Image error:", e?.message || e);
    return NextResponse.json({ error: "Image generation failed. Try again." }, { status: 500 });
  }
}
