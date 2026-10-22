// src/lib/techIntelThemes.js — Moteur de filtrage et classification thématique pour TechIntel (IA en vedette)

export const THEME_FILTERS = [
  { id: "all",   label: "Toutes les actus", shortLabel: "Toutes", emoji: "⚡", color: "#6366F1" },
  { id: "ai",    label: "IA & LLM",         shortLabel: "IA",     emoji: "🤖", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.16)", border: "rgba(139, 92, 246, 0.38)", rx: /\b(AI|IA|LLM|GPT|ChatGPT|Claude|Gemini|Llama|DeepSeek|Mistral|OpenAI|Anthropic|agent|agents|neural|transformer|machine learning|intelligence artificielle|générative|RAG|diffusion|prompt|copilot|qwen|vision model|grok|sora|perplexity|midjourney|reasoning|inference|deep learning|nlp|computer vision)\b/i },
  { id: "cyber", label: "Cyber & Sécu",     shortLabel: "Cyber",  emoji: "🔐", color: "#EF4444", bg: "rgba(239, 68, 68, 0.16)", border: "rgba(239, 68, 68, 0.38)", rx: /\b(security|sécurité|cyber|vulnerab|CVE|ransomware|malware|exploit|hack|zero-day|patch|breach|phishing|espionnage|ddos|backdoor|faille|infostealer|spyware)\b/i },
  { id: "cloud", label: "Cloud & Ops",      shortLabel: "Cloud",  emoji: "☁️", color: "#06B6D4", bg: "rgba(6, 182, 212, 0.16)", border: "rgba(6, 182, 212, 0.38)", rx: /\b(cloud|AWS|Azure|GCP|k8s|kubernetes|docker|linux|infra|infrastructure|devops|serverless|postgres|database|clickhouse|redis|sql|kafka|cloudflare|terraform|helm)\b/i },
  { id: "dev",   label: "Dev & Code",       shortLabel: "Dev",    emoji: "⚡", color: "#10B981", bg: "rgba(16, 185, 129, 0.16)", border: "rgba(16, 185, 129, 0.38)", rx: /\b(framework|release|library|SDK|API|code|developer|développeur|programming|open source|React|Vue|Next|Node|Python|Rust|Go|TypeScript|JavaScript|git|compiler|v8|bun|deno)\b/i },
  { id: "world", label: "Monde & Géopolitique", shortLabel: "Monde",  emoji: "🌍", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.16)", border: "rgba(245, 158, 11, 0.38)", rx: /\b(guerre|war|conflit|conflict|élection|election|président|president|gouvernement|government|ukraine|russie|russia|gaza|israël|israel|iran|otan|nato|onu|un|ue|eu|sommet|summit|traité|treaty|sanctions|séisme|earthquake|crise|crisis|attentat|attack|inflation|banque centrale|fed|bce|pétrole|oil|chine|china|nvidia|apple|google|microsoft|meta|semiconductor|puce|chine|usa|régulation|procès|antitrust|bourse|startup|licorne|investissement|tsmc|intel|amd|smartphone|android|ios|hardware|processeur|gpu|cpu|qualcomm|samsung|sony|nintendo|console|pc|mac|laptop)\b/i },
];

// Sources généralistes mondiales : leurs articles non-tech sont classés « Monde » au lieu d'être rejetés.
export const WORLD_NEWS_SOURCES = new Set(["France24","LeMondeWorld","RFI","FranceInfo","BBCWorld","AlJazeera","GuardianWorld","NYTWorld","NPRWorld","DWWorld"]);
export const CYBER_ALERT_SOURCES = new Set(["CISA","CERTFR"]);

export function getArticleTheme(item) {
  if (!item) return THEME_FILTERS[4]; // Fallback Dev
  if (CYBER_ALERT_SOURCES.has(item.source)) return THEME_FILTERS.find(f => f.id === "cyber") || THEME_FILTERS[4];
  if (WORLD_NEWS_SOURCES.has(item.source)) {
    const text0 = `${item.title || ""} ${item.titleFr || ""} ${item.description || ""}`;
    const tech = THEME_FILTERS.find(f => ["ai","cyber"].includes(f.id) && f.rx && f.rx.test(text0));
    return tech || THEME_FILTERS.find(f => f.id === "world");
  }
  const text = `${item.title || ""} ${item.titleFr || ""} ${item.description || ""} ${item.descriptionFr || ""}`;
  for (const filter of THEME_FILTERS) {
    if (filter.id !== "all" && filter.rx && filter.rx.test(text)) return filter;
  }
  return THEME_FILTERS[4]; // Dev
}
