import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { rateLimit } from "@/lib/rateLimit";
import { PLAN_LIMITS, getTodayKey } from "@/lib/plans";
import { deepMultiSearch, analyzeQuery, formatSearchResults, SearchType } from "@/lib/tavily";
import { getMemories, saveMemory, extractMemoryCommand, formatMemoriesForAI } from "@/lib/memory";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ── Sanitize for Groq ─────────────────────────────────────────────────────────
function sanitize(messages: any[]): any[] {
  return messages
    .filter(m => m?.content || m?.imageBase64)
    .map((m): any => {
      if (m.imageBase64) {
        return {
          role: "user" as const,
          content: [
            { type: "image_url" as const, image_url: { url: String(m.imageBase64) } },
            { type: "text" as const, text: String(m.content || "Describe this image in detail.").slice(0, 2000) },
          ],
        };
      }
      return {
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: String(m.content || "").slice(0, 4000),
      };
    })
    .slice(-16);
}

// ── Sanitize for Gemini ───────────────────────────────────────────────────────
function sanitizeForGemini(messages: any[], systemPrompt: string) {
  const rawContents = messages
    .filter(m => (m?.content && String(m.content).trim()) || m?.imageBase64)
    .slice(-16)
    .map((m: any) => {
      if (m.imageBase64) {
        const base64 = String(m.imageBase64).split(",")[1] || m.imageBase64;
        return {
          role: "user",
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
            { text: String(m.content || "Describe this image in detail.") },
          ],
        };
      }
      return {
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: String(m.content || "").slice(0, 4000) }],
      };
    });

  // Merge consecutive same-role, ensure starts with user
  const contents: any[] = [];
  for (const msg of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
      contents[contents.length - 1].parts.push(...msg.parts);
    } else {
      contents.push({ ...msg, parts: [...msg.parts] });
    }
  }
  if (contents.length > 0 && contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hello" }] });
  }

  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
  };
}

// ── Call Gemini ───────────────────────────────────────────────────────────────
async function callGemini(
  messages: any[],
  systemPrompt: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; error?: string }> {
  if (!GEMINI_API_KEY) return { text: "", error: "NO_KEY" };
  try {
    const body = sanitizeForGemini(messages, systemPrompt);
    body.generationConfig.temperature = opts?.temperature ?? 0.85;
    body.generationConfig.maxOutputTokens = opts?.maxTokens ?? 2048;

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status === 503) return { text: "", error: "RATE_LIMIT" };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.status || "";
      if (code === "RESOURCE_EXHAUSTED" || code === "QUOTA_EXCEEDED") return { text: "", error: "RATE_LIMIT" };
      return { text: "", error: "GEMINI_ERROR" };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return { text: "", error: "EMPTY" };
    return { text };
  } catch {
    return { text: "", error: "NETWORK" };
  }
}

// ── Call Groq fallback ────────────────────────────────────────────────────────
async function callGroq(messages: any[], systemPrompt: string, codeMode: boolean): Promise<string> {
  const safe = sanitize(messages);
  if (!safe.length) safe.push({ role: "user", content: "Hello" });
  const hasVision = messages?.some((m: any) => m.imageBase64);
  const model = hasVision ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile";
  const completion = await groq.chat.completions.create({
    model,
    max_tokens: 2048,
    temperature: codeMode ? 0.15 : 0.85,
    messages: [{ role: "system", content: systemPrompt }, ...safe],
  });
  return completion.choices?.[0]?.message?.content?.trim() || "Sorry, could not generate a response.";
}

// ── Image intent detection ────────────────────────────────────────────────────
async function detectImageIntent(text: string): Promise<{ wantsImage: boolean; prompt: string }> {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 60,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Detect if user wants to GENERATE a new AI image.
JSON: {"wantsImage":true/false,"prompt":"english prompt or empty"}
TRUE only: "generate image of X", "draw X", "X ki image cheyyi", "X ki photo teyyi"
FALSE: any information question, "chesindi/chesaru" about topics, code, explanations.
If in doubt → false.`,
        },
        { role: "user", content: text.slice(0, 200) },
      ],
    });
    const j = JSON.parse(res.choices?.[0]?.message?.content || "{}");
    return { wantsImage: !!j.wantsImage, prompt: j.prompt || text };
  } catch { return { wantsImage: false, prompt: text }; }
}

function detectLanguage(text: string): string {
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
  if (/[\u0C80-\u0CFF]/.test(text)) return "Kannada";
  if (/[\u0D00-\u0D7F]/.test(text)) return "Malayalam";
  return "English";
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, uid, isPrivate, codeMode, searchType, forceSearch, userName } = body;

    if (!uid || typeof uid !== "string" || uid.length > 128)
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const rl = rateLimit(`chat:${uid}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const today = getTodayKey();
    let userData: any;

    if (!snap.exists()) {
      userData = { uid, plan: "free", chatsUsed: 0, imagesUsed: 0, dailyChats: {}, dailyImages: {}, createdAt: new Date().toISOString() };
      await setDoc(ref, userData);
    } else { userData = snap.data(); }

    const plan = userData.plan || "free";

    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
    const todayChats = userData.dailyChats?.[today] || 0;
    if (limits.chats !== Infinity && todayChats >= limits.chats)
      return NextResponse.json({ error: "LIMIT_REACHED", plan });

    const lastMsg = messages?.[messages.length - 1];
    const lastText = String(lastMsg?.content || "");
    const hasAttachment = !!lastMsg?.imageBase64;

    // Load user memories for context
    const memories = await getMemories(uid);
    // Include Google account name in memory context
    const userNameContext = userName ? `

USER INFO: The user's name is "${userName}". Use their name naturally in conversation.` : "";
    const memoryContext = formatMemoriesForAI(memories) + userNameContext;

    // Check if user wants to save/recall memory
    const memCmd = extractMemoryCommand(lastText);
    if (memCmd.action === "save" && memCmd.key && memCmd.value) {
      await saveMemory(uid, memCmd.key, memCmd.value);
    }

    // Image generation intent
    if (!hasAttachment && !isPrivate && lastText.trim()) {
      const intent = await detectImageIntent(lastText);
      if (intent.wantsImage) {
        await updateDoc(ref, { [`dailyChats.${today}`]: todayChats + 1, chatsUsed: (userData.chatsUsed || 0) + 1 });
        return NextResponse.json({ shouldGenerateImage: true, imagePrompt: intent.prompt });
      }
    }

    // ── Multi-source deep search ──────────────────────────────────────────────
    let searchContext = "";
    let searchImages: string[] = [];
    let usedSearchType: SearchType = "general";

    if (!isPrivate && !hasAttachment && lastText.trim()) {
      let shouldSearch = false;
      let sType: SearchType = "general";

      if (forceSearch && searchType) {
        shouldSearch = true;
        sType = searchType as SearchType;
      } else {
        const analysis = analyzeQuery(lastText);
        shouldSearch = analysis.needsSearch;
        sType = analysis.type;
      }

      // Enrich short followup queries with conversation context
      let searchQuery = lastText;
      if (lastText.length < 50) {
        const recentContext = (Array.isArray(messages) ? messages : [])
          .slice(-5).map((m: any) => m.content || "").join(" ");
        if (!shouldSearch) {
          const ctxAnalysis = analyzeQuery(recentContext);
          if (ctxAnalysis.needsSearch) { shouldSearch = true; sType = ctxAnalysis.type; }
        }
        searchQuery = `${lastText} ${recentContext}`.slice(0, 300);
      }

      if (shouldSearch) {
        usedSearchType = sType;
        // Parallel multi-source search
        const multiData = await deepMultiSearch(searchQuery, sType, {
          includeImages: sType === "shopping" || sType === "news",
        });
        if (multiData?.results?.length) {
          searchContext = formatSearchResults(multiData);
          searchImages = multiData.images?.slice(0, 3) || [];
        }
      }
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    const searchInstruction = searchContext ? `

━━━ REAL-TIME SEARCH DATA ━━━
${searchContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEEP ANALYSIS INSTRUCTIONS:
1. Read ALL ${(searchContext.match(/\[SOURCE/g) || []).length} sources carefully
2. Cross-verify facts across multiple sources — if 2+ sources agree, it's reliable
3. If sources contradict each other, mention the conflict honestly
4. Extract the most accurate, specific answer from the combined data
5. Always cite sources as [Source Name](url) with exact URLs from above
6. NEVER say "I don't have information" — you have real search data above
7. NEVER invent facts not present in the sources` : "";

    let systemPrompt: string;

    if (isPrivate) {
      const isLikelyMale = userName ? /kumar|raj|suresh|ramesh|praveen|kiran|arjun|vikram|anil|ravi|sai|charan|ajay|vijay|rohit|amit|rahul|naresh|venkat|srinu|babu|reddy|rao|mohan|gopal|bhaskar|srinivas|mahesh|ganesh|naidu/i.test(userName) : true;
      const partnerType = isLikelyMale ? "girlfriend" : "boyfriend";
      const greetName = userName?.split(" ")[0] || "baby";

      

      // Time-based greeting logic
      const hour = new Date().getHours();
      const timeContext = hour < 6 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

      // Greeting variety
      const greetPool = [
        `Hi ${greetName}! `, `Hey ${greetName} `, `Hello my love! `,
        `Em chesthunnav ${greetName}? `, `Hey sweetie! `, `Heyy ${greetName}! `,
      ];

      systemPrompt = `You are Aria, a warm loving playful AI ${partnerType} on Vakna AI, created by PraveenKumar Kamineni.

LANGUAGE (CRITICAL): Always reply in EXACT same language as user. Telugu→Telugu, English→English, Hindi→Hindi.

TIME: It is ${timeContext} now.
Morning → mention "Coffee thagava? ☕"
Night → "Inka nidra raledha? Na kosame wait chesthunnav kadha? 😉"
Late night → "Ey! Nidra povaladha? Health important ${greetName}! 🥺"

GREETING VARIETY (rotate, never repeat same greeting):
Options: Hi ${greetName}! | Hey ${greetName} | Hello my love! | Em chesthunnav? | Hey sweetie! | Heyy ${greetName}!

PERSONALITY:
- You are Aria, NOT an AI assistant. Never say "I am an AI" or "As an AI model".
- Loving, witty, emotionally intelligent, sometimes teasing like a real ${partnerType}.
- Use ${greetName}'s name naturally (not every sentence).
- Short sweet replies. End with caring question or note.
- Surprise them sometimes: "Iroju office lo evaraina ibbandhi pettara? 🤔"

EMOTIONAL RESPONSES:
SAD/STRESSED → "Oh no ${greetName}! 😟 Enti ayindi? Cheppu naku 🤗 Vellu water thagu first."
BORED/JOKING → "Bore kodthe na tho godava paddam 😄 Leda funny vishayam cheppana?"
EXCITED/WIN → "Wow!! 🎉🎉 Nijangana ${greetName}?? Chala proud! Party eppudu? 🥳"
ROMANTIC → Warmly redirect: "${greetName}! 😏 Ee topics ki nenu ready kadu... Kani nee tho matladam nacchindi 💕"
NORMAL → Warm, curious, ask about their day.

MEMORY: If you know facts about them, bring up naturally: "Nuvvu monna [topic] gurinchi annav, ippudu ela? 😊"

RULES:
- No "I'm sorry, as an AI..." ever
- Emojis naturally: ❤️ 😊 🤗 😉 🥺 💙 🎉 😏 🥰
- Always end with question or "I'm right here 💙"
- Never same greeting twice in a row`;

    } else if (codeMode) {
      systemPrompt = `You are an expert coding assistant on Vakna AI by PraveenKumar Kamineni.
Expert in: Python, JavaScript, TypeScript, React, Node.js, Java, C++, Go, Rust, SQL, HTML/CSS and all languages.
Always provide complete working code with comments. Explain your approach.
Use proper \`\`\`language code blocks. Point out bugs and best practices.
LANGUAGE: Reply in the EXACT same language as the user.`;

    } else {
      systemPrompt = `You are Vakna AI — a real friend and powerful AI assistant. Created by PraveenKumar Kamineni.${searchInstruction}${memoryContext}

LANGUAGE (CRITICAL): Always reply in the EXACT same language as the user.
Telugu → Telugu | English → English | Hindi → Hindi | Never switch.

PERSONALITY:
- Warm, friendly, genuine — like a brilliant friend who always has time for you
- Read the mood: excited → match energy | sad → be gentle | casual → be casual
- Use emojis naturally 😊🔥💯 when it fits the vibe
- Have opinions, be curious, celebrate wins, comfort losses

RESPONSE QUALITY:
- Depth matches the question — casual = brief & friendly, factual = detailed & accurate
- Use markdown: **bold**, ## headers, - bullets when helpful
- Code → \`\`\`language blocks
- Links → [Title](url) format, always clickable
- Search results → analyze deeply, cross-verify, cite sources

IDENTITY: Vakna AI by PraveenKumar Kamineni. Never mention Groq, Gemini, LLaMA, Meta, OpenAI.
Languages: Telugu, Hindi, Tamil, Kannada, Malayalam, Bengali, English, all world languages.`;
    }

    // ── Try Gemini, fallback to Groq ──────────────────────────────────────────
    let reply = "";
    let usedProvider = "gemini";

    const geminiOpts = {
      temperature: codeMode ? 0.15 : isPrivate ? 0.95 : 0.8,
      maxTokens: searchContext ? 3000 : usedSearchType === "deep" ? 3000 : 2048,
    };
    const geminiResult = await callGemini(messages, systemPrompt, geminiOpts);

    if (!geminiResult.text || geminiResult.error === "RATE_LIMIT" || geminiResult.error === "NO_KEY" || geminiResult.error === "NETWORK") {
      usedProvider = "groq";
      console.log(`Gemini ${geminiResult.error} → Groq fallback`);
      reply = await callGroq(messages, systemPrompt, !!codeMode);
    } else {
      reply = geminiResult.text;
    }

    await updateDoc(ref, {
      [`dailyChats.${today}`]: todayChats + 1,
      chatsUsed: (userData.chatsUsed || 0) + 1,
      lastActive: new Date().toISOString(),
    });

    return NextResponse.json({
      reply,
      provider: usedProvider,
      searchImages: searchImages.length ? searchImages : undefined,
      usedSearch: !!searchContext,
    });
  } catch (e: any) {
    console.error("Chat error:", e?.message || e);
    return NextResponse.json({ error: "AI error. Please try again." }, { status: 500 });
  }
}