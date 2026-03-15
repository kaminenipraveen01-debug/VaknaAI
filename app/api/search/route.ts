import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  images?: string[];
  answer?: string;
}

async function tavilySearch(
  query: string,
  options: {
    searchDepth?: "basic" | "advanced";
    includeImages?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
    maxResults?: number;
    topic?: "general" | "news" | "finance";
  } = {}
): Promise<TavilyResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: options.searchDepth || "basic",
      include_images: options.includeImages || false,
      include_answer: true,
      include_raw_content: false,
      max_results: options.maxResults || 6,
      topic: options.topic || "general",
      ...(options.includeDomains?.length ? { include_domains: options.includeDomains } : {}),
      ...(options.excludeDomains?.length ? { exclude_domains: options.excludeDomains } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  return res.json();
}

function detectSearchType(text: string): {
  type: "news" | "shopping" | "research" | "general";
  topic: "general" | "news" | "finance";
  includeImages: boolean;
  depth: "basic" | "advanced";
} {
  const lower = text.toLowerCase();
  if (/\b(buy|shop|price|cost|purchase|order|amazon|flipkart|deal|offer|discount|కొను|కొనాలి|ధర|కొనండి|خرید|खरीद)\b/.test(lower))
    return { type: "shopping", topic: "general", includeImages: true, depth: "basic" };
  if (/\b(news|latest|today|breaking|current|recent|happened|న్యూస్|వార్తలు|ఆజ|ताज़ा|अभी)\b/.test(lower))
    return { type: "news", topic: "news", includeImages: false, depth: "basic" };
  if (/\b(research|deep|detailed|analysis|explain|how does|why|history|science|ఏమిటి|ఎందుకు|ఎలా|कैसे|क्यों)\b/.test(lower))
    return { type: "research", topic: "general", includeImages: false, depth: "advanced" };
  return { type: "general", topic: "general", includeImages: false, depth: "basic" };
}

function detectLanguage(text: string): string {
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
  if (/[\u0C80-\u0CFF]/.test(text)) return "Kannada";
  if (/[\u0D00-\u0D7F]/.test(text)) return "Malayalam";
  return "English";
}

export async function POST(req: Request) {
  try {
    const { query, type, uid } = await req.json();
    if (!query?.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

    const searchConfig = type ? { type, topic: type === "news" ? "news" : "general" as any, includeImages: type === "shopping", depth: type === "research" ? "advanced" : "basic" as any } : detectSearchType(query);
    const language = detectLanguage(query);

    // Run Tavily search
    let tavilyData: TavilyResponse;
    try {
      tavilyData = await tavilySearch(query, {
        searchDepth: searchConfig.depth,
        includeImages: searchConfig.includeImages,
        maxResults: searchConfig.depth === "advanced" ? 8 : 5,
        topic: searchConfig.topic,
      });
    } catch (e) {
      console.error("Tavily error:", e);
      return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
    }

    // Build context from results
    const context = tavilyData.results
      .map((r, i) => `[${i + 1}] ${r.title}\nSource: ${r.url}\n${r.published_date ? `Date: ${r.published_date}\n` : ""}Content: ${r.content.slice(0, 600)}`)
      .join("\n\n---\n\n");

    const isShoppingSearch = searchConfig.type === "shopping";

    // Send to Groq with context
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1500,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are Vakna AI, an intelligent assistant. You have access to real-time web search results from Tavily.

LANGUAGE RULE: Reply in ${language} ONLY. Never switch languages.

${isShoppingSearch ? `SHOPPING MODE:
- List products with prices, links, and key details
- Compare options if multiple available
- Mention where to buy (Amazon, Flipkart, etc.)
- Format as a clear list with ₹ prices` : `SEARCH MODE:
- Synthesize information from multiple sources
- Give accurate, up-to-date answer
- Cite sources naturally in your response
- Be comprehensive but concise`}

Use markdown formatting: **bold**, bullet points, headers as needed.
Always mention when information is from a specific date/source.`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nWeb Search Results:\n${context}${tavilyData.answer ? `\n\nTavily Summary: ${tavilyData.answer}` : ""}`,
        },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "Could not generate answer.";

    return NextResponse.json({
      answer,
      sources: tavilyData.results.map(r => ({ title: r.title, url: r.url, date: r.published_date })),
      images: tavilyData.images || [],
      searchType: searchConfig.type,
    });
  } catch (e: any) {
    console.error("Search route error:", e?.message);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
