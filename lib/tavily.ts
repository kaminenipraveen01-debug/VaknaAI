export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export interface TavilyResponse {
  query: string;
  results: TavilyResult[];
  images?: string[];
  answer?: string;
}

export type SearchType = "general" | "news" | "shopping" | "deep";

// Trusted domains per category
export const TRUSTED_DOMAINS: Record<string, string[]> = {
  sports: [
    "espncricinfo.com", "cricbuzz.com", "icc-cricket.com", "bcci.tv",
    "espn.com", "skysports.com", "goal.com", "fifa.com", "uefa.com",
    "nba.com", "nfl.com", "olympics.com", "formula1.com",
    "ndtv.com", "timesofindia.com", "sportstar.thehindu.com", "hindustantimes.com",
  ],
  news: [
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
    "ndtv.com", "thehindu.com", "hindustantimes.com",
    "timesofindia.com", "indianexpress.com", "bloomberg.com",
    "aljazeera.com", "theguardian.com", "theatlantic.com",
    "washingtonpost.com", "nytimes.com", "ft.com", "economist.com",
  ],
  tech: [
    "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com",
    "engadget.com", "cnet.com", "zdnet.com", "venturebeat.com",
    "thenextweb.com", "androidauthority.com", "gsmarena.com",
    "91mobiles.com", "digit.in",
  ],
  health: [
    "mayoclinic.org", "webmd.com", "healthline.com", "nih.gov",
    "who.int", "cdc.gov", "medlineplus.gov", "medscape.com",
    "medicalnewstoday.com", "everydayhealth.com",
  ],
  science: [
    "nature.com", "sciencedirect.com", "pubmed.ncbi.nlm.nih.gov",
    "nationalgeographic.com", "scientificamerican.com", "newscientist.com",
    "space.com", "nasa.gov", "livescience.com", "phys.org",
  ],
  finance: [
    "bloomberg.com", "reuters.com", "moneycontrol.com",
    "economictimes.indiatimes.com", "livemint.com", "businesstoday.in",
    "forbes.com", "ft.com", "wsj.com", "cnbc.com",
    "investing.com", "nseindia.com", "bseindia.com",
  ],
  general: [
    "wikipedia.org", "britannica.com", "reuters.com", "apnews.com", "bbc.com",
    "ndtv.com", "thehindu.com", "timesofindia.com", "indianexpress.com",
    "espncricinfo.com", "cricbuzz.com", "espn.com", "goal.com",
    "techcrunch.com", "theverge.com", "wired.com", "gsmarena.com",
    "mayoclinic.org", "healthline.com", "who.int",
    "nationalgeographic.com", "space.com",
    "moneycontrol.com", "economictimes.indiatimes.com", "bloomberg.com",
    "imdb.com", "rottentomatoes.com", "forbes.com",
  ],
  shopping: [
    "amazon.in", "flipkart.com", "meesho.com",
    "myntra.com", "snapdeal.com", "tatacliq.com", "ajio.com",
  ],
  deep: [
    "wikipedia.org", "britannica.com", "reuters.com", "apnews.com",
    "bbc.com", "thehindu.com", "nationalgeographic.com",
    "nature.com", "pubmed.ncbi.nlm.nih.gov", "sciencedirect.com",
    "who.int", "jstor.org", "scientificamerican.com",
  ],
};

async function fetchTavily(body: any): Promise<TavilyResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, ...body }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Multi-source deep search: runs 2 parallel searches, merges & deduplicates
export async function deepMultiSearch(
  query: string,
  type: SearchType,
  options?: { includeImages?: boolean }
): Promise<TavilyResponse | null> {

  // Smart category detection from query
  function detectCategory(q: string): string {
    const ql = q.toLowerCase();
    if (type === "news") return "news";
    if (type === "deep") return "deep";
    if (type === "shopping") return "shopping";
    if (/(cricket|icc|ipl|t20|odi|test|football|fifa|nfl|nba|nhl|formula1|f1|olympics|score|match|tournament|player|wicket|goal|runs|basketball|tennis|badminton|kabaddi|hockey)/i.test(ql)) return "sports";
    if (/(phone|mobile|laptop|computer|software|app|tech|android|iphone|samsung|gpu|cpu|processor|ram|camera|specs)/i.test(ql)) return "tech";
    if (/(health|disease|symptoms|medicine|doctor|hospital|diet|nutrition|exercise|mental health|cancer|diabetes|covid)/i.test(ql)) return "health";
    if (/(science|physics|chemistry|biology|space|planet|universe|nasa|research|study|experiment)/i.test(ql)) return "science";
    if (/(stock|share|market|crypto|bitcoin|gold|silver|sensex|nifty|rupee|economy|gdp|inflation|rbi|sebi)/i.test(ql)) return "finance";
    return "general";
  }

  const category = detectCategory(query);
  const primaryDomains = TRUSTED_DOMAINS[category] || TRUSTED_DOMAINS.general;

  // Run 2 searches in parallel:
  // 1. Trusted domains only (high quality)
  // 2. Open web (broader coverage)
  const [trustedData, openData] = await Promise.all([
    fetchTavily({
      query,
      search_depth: type === "deep" ? "advanced" : "basic",
      include_answer: true,
      include_images: options?.includeImages ?? false,
      max_results: 5,
      include_raw_content: false,
      include_domains: primaryDomains,
      ...(type === "news" ? { topic: "news", days: 7 } : {}),
    }),
    fetchTavily({
      query,
      search_depth: "basic",
      include_answer: true,
      include_images: options?.includeImages ?? false,
      max_results: 5,
      include_raw_content: false,
      ...(type === "news" ? { topic: "news", days: 7 } : {}),
      ...(type === "shopping" ? { include_domains: TRUSTED_DOMAINS.shopping } : {}),
    }),
  ]);

  if (!trustedData && !openData) return null;

  // Merge results — trusted sources first, then open, deduplicate by URL
  const seen = new Set<string>();
  const merged: TavilyResult[] = [];

  const addResults = (results: TavilyResult[] = []) => {
    for (const r of results) {
      if (!seen.has(r.url) && r.content?.trim()) {
        seen.add(r.url);
        merged.push(r);
      }
    }
  };

  addResults(trustedData?.results || []);
  addResults(openData?.results || []);

  // Prefer trusted answer, fallback to open answer
  const answer = trustedData?.answer || openData?.answer || "";
  const images = [...(trustedData?.images || []), ...(openData?.images || [])].slice(0, 4);

  return { query, results: merged.slice(0, 8), images, answer };
}

// Smart query analysis
export function analyzeQuery(text: string): { needsSearch: boolean; type: SearchType } {
  const lower = text.toLowerCase();

  // Never search conversational messages
  const conversational = [
    /^(hi|hello|hey|hii|నమస్కారం|నమస్తే|హాయ్|salam)\b/i,
    /^(how are you|how r u|good morning|good night|good evening)\b/i,
    /నీ పేరు|నీ పేరేంటి|నువ్వు ఎవరు|your name|who are you|what are you/i,
    /^(ok|okay|thanks|thank you|bye|sure|yes|no|నో|ఓకే|థాంక్స్)\b/i,
    /^(haha|lol|nice|cool|great|wow|oh|hmm|umm)\b/i,
  ];
  if (conversational.some(r => r.test(lower) || r.test(text))) {
    return { needsSearch: false, type: "general" };
  }

  // Shopping
  if (/\b(buy|purchase|price|cost|shop|₹|rs\.|rupees|కొనాలి|ధర|ఖరీదు|amazon|flipkart|meesho)\b/i.test(lower)) {
    return { needsSearch: true, type: "shopping" };
  }

  // News
  if (/\b(news|latest|breaking|today|ఈరోజు|నేడు|తాజా|వార్తలు|న్యూస్|खबर|आज|ताज़ा)\b/i.test(lower)) {
    return { needsSearch: true, type: "news" };
  }

  // Deep research
  if (/\b(research|explain in detail|deep dive|comprehensive|complete guide|అన్ని వివరాలు|పూర్తి సమాచారం)\b/i.test(lower)) {
    return { needsSearch: true, type: "deep" };
  }

  // General search triggers
  const triggers = [
    /\b(current|live|now|ప్రస్తుతం|ఇప్పుడు|abhi)\b/i,
    /(icc|ipl|t20|odi|bcci)\b/i,
    /\b(score|result|winner|match|tournament|won|cricket|football|fifa|world cup|champions|player of the match|గెలిచారు|స్కోర్|ఫలితం|మ్యాచ్)\b/i,
    /\b(stock|share|market|crypto|bitcoin|gold price|sensex|nifty)\b/i,
    /\b(weather|forecast|temperature|rain|వాతావరణం|వర్షం)\b/i,
    /\b(who is|who won|who scored|CEO|president|minister|ఎవరు|ఎవరికి)\b/i,
    /\b(release|launch|new model|update|version|review|specs|launched)\b/i,
    /\b(2024|2025|2026)\b/,
    /ఏమైంది|జరిగింది|ఫలితాలు|ఎవరు గెలిచారు|వార్తలు చెప్పు/,
  ];

  if (triggers.some(r => r.test(lower) || r.test(text))) {
    return { needsSearch: true, type: "general" };
  }

  return { needsSearch: false, type: "general" };
}

// Format results for AI — structured for deep analysis
export function formatSearchResults(data: TavilyResponse): string {
  let context = "";

  if (data.answer) {
    context += `SUMMARY ANSWER: ${data.answer}\n\n`;
  }

  if (data.results?.length) {
    context += `SOURCES (${data.results.length} results from multiple sources):\n\n`;
    data.results.forEach((r, i) => {
      const domain = new URL(r.url).hostname.replace("www.", "");
      context += `[SOURCE ${i + 1}] ${domain}\n`;
      context += `TITLE: ${r.title}\n`;
      context += `URL: ${r.url}\n`;
      if (r.published_date) context += `DATE: ${r.published_date}\n`;
      context += `CONTENT: ${r.content.slice(0, 600)}\n`;
      context += `---\n`;
    });
  }

  return context;
}