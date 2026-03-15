import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function tavilySearch(query: string, depth: "basic" | "advanced" = "advanced") {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: depth, include_answer: true, include_raw_content: false, max_results: 8 }),
  });
  if (!res.ok) throw new Error("Tavily failed");
  return res.json();
}

async function generateSubQueries(mainQuery: string): Promise<string[]> {
  const res = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    max_tokens: 200,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Break the query into 3 focused sub-questions for comprehensive research. Return JSON: {"queries": ["q1","q2","q3"]}' },
      { role: "user", content: mainQuery },
    ],
  });
  const j = JSON.parse(res.choices?.[0]?.message?.content || "{}");
  return j.queries?.slice(0, 3) || [mainQuery];
}

function detectLanguage(text: string): string {
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  return "English";
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

    const language = detectLanguage(query);

    // Step 1: Generate sub-queries
    const subQueries = await generateSubQueries(query);

    // Step 2: Search for each sub-query in parallel
    const searchResults = await Promise.allSettled(
      subQueries.map(q => tavilySearch(q, "advanced"))
    );

    // Step 3: Compile all results
    const allResults: any[] = [];
    searchResults.forEach((res, i) => {
      if (res.status === "fulfilled") {
        res.value.results?.forEach((r: any) => {
          allResults.push({ ...r, query: subQueries[i] });
        });
      }
    });

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueResults = allResults.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

    const context = uniqueResults.slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nRelevant to: ${r.query}\n${r.content?.slice(0, 500)}`)
      .join("\n\n---\n\n");

    // Step 4: Synthesize comprehensive answer
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are Vakna AI's deep research engine. Synthesize information from multiple web sources into a comprehensive, well-structured research report.

LANGUAGE: Reply in ${language} only.

Format your response as:
## Summary
[2-3 sentence overview]

## Key Findings
[Bullet points of main findings]

## Detailed Analysis
[In-depth explanation with sections]

## Sources
[Numbered source list]

Be thorough, accurate, and cite sources. This is a DEEP RESEARCH response — be comprehensive.`,
        },
        {
          role: "user",
          content: `Research Query: ${query}\n\nSub-questions researched:\n${subQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCompiled Web Sources:\n${context}`,
        },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      answer,
      sources: uniqueResults.slice(0, 10).map(r => ({ title: r.title, url: r.url, relevantTo: r.query })),
      subQueries,
    });
  } catch (e: any) {
    console.error("Research error:", e?.message);
    return NextResponse.json({ error: "Research failed. Please try again." }, { status: 500 });
  }
}
