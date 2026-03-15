// User Memory System — saves facts across sessions in Firestore
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export interface Memory {
  key: string;      // e.g. "name", "project", "preference"
  value: string;    // e.g. "Praveen", "YouTube channel about animation"
  savedAt: string;
}

export async function saveMemory(uid: string, key: string, value: string) {
  const ref = doc(db, "memories", uid);
  const snap = await getDoc(ref);
  const memories: Record<string, Memory> = snap.exists() ? snap.data().items || {} : {};
  memories[key.toLowerCase()] = { key, value, savedAt: new Date().toISOString() };
  await setDoc(ref, { items: memories }, { merge: true });
}

export async function getMemories(uid: string): Promise<Memory[]> {
  try {
    const ref = doc(db, "memories", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    return Object.values(snap.data().items || {});
  } catch { return []; }
}

export async function deleteMemory(uid: string, key: string) {
  const ref = doc(db, "memories", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const items = snap.data().items || {};
  delete items[key.toLowerCase()];
  await updateDoc(ref, { items });
}

// Extract memory commands from user message
export function extractMemoryCommand(text: string): { action: "save" | "recall" | null; key?: string; value?: string } {
  // "remember my name is Praveen" / "remember that my project is X"
  const saveMatch = text.match(/remember (?:that |my |that my )?(.+?) is (.+)/i) ||
                    text.match(/(?:నా|నాకు) (.+?) remember చేయి[: ]+(.+)/i) ||
                    text.match(/save (?:that |my )?(.+?)[: ]+(.+)/i);
  if (saveMatch) return { action: "save", key: saveMatch[1].trim(), value: saveMatch[2].trim() };

  // "what do you remember about me" / "what's my name"
  const recallMatch = text.match(/what(?:'s| is) my (.+)/i) ||
                      text.match(/do you remember (.+)/i);
  if (recallMatch) return { action: "recall", key: recallMatch[1].trim() };

  return { action: null };
}

export function formatMemoriesForAI(memories: Memory[]): string {
  if (!memories.length) return "";
  const items = memories.map(m => `- ${m.key}: ${m.value}`).join("\n");
  return `\n\nUSER MEMORY (things this user told you to remember):\n${items}\nUse this context naturally in your responses.`;
}