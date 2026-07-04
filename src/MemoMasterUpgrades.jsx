// MemoMasterUpgrades.jsx — God-tier add-on pack pour MemoMaster
// ─────────────────────────────────────────────────────────────────────────────
// Module 100% additif : à importer dans MemoMaster.jsx, aucune modif destructive.
// Toutes les fonctions/composants sont autonomes et acceptent des props.
//
// Dépendances attendues côté parent (passées en props) :
//   - callClaude(system, user) => Promise<string>
//   - storage  : { get, set }
//   - showToast(msg, type?)
//   - theme, isDarkMode
//   - expressions : array
//   - stats       : { streak, totalReviews, ... }
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, ArcElement
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, ArcElement);


/* ════════════════════════════════════════════════════════════════════════════
 * 1. UTILS PARTAGÉS
 * ════════════════════════════════════════════════════════════════════════════ */

export const localToday = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};

export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};

export const safeParseJSON = (str) => {
  if (!str) return null;
  let s = str.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch {}
  // Réparation : équilibrer accolades/crochets ouverts
  let opens = 0, closes = 0, opensB = 0, closesB = 0;
  for (const c of s) {
    if (c === "{") opens++; else if (c === "}") closes++;
    if (c === "[") opensB++; else if (c === "]") closesB++;
  }
  let fixed = s.replace(/,\s*$/, "");
  while (closesB < opensB) { fixed += "]"; closesB++; }
  while (closes < opens) { fixed += "}"; closes++; }
  try { return JSON.parse(fixed); } catch { return null; }
};

/* ════════════════════════════════════════════════════════════════════════════
 * 1.5. VUE FICHES — Minimap (VS Code style scroll contextuel)
 * ════════════════════════════════════════════════════════════════════════════ */
export function Minimap({ cards, onPixelClick, theme }) {
  const minimapRef = useRef(null);

  const getColorForCard = (card) => {
    if ((card.level || 0) >= 7) return "#22C55E"; // Mastered - green
    if ((card.nextReview || "") <= localToday()) return "#EF4444"; // Due - red
    if ((card.level || 0) >= 4) return "#3B82F6"; // Good - blue
    if ((card.level || 0) >= 1) return "#F59E0B"; // Learning - yellow
    return "var(--mm-fg-muted)"; // New - gray
  };

  const handleClick = (e) => {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    const index = Math.floor(ratio * cards.length);
    onPixelClick(index);
  };

  return (
    <div
      ref={minimapRef}
      onClick={handleClick}
      style={{
        position: 'fixed', top: '100px', right: '10px', width: '18px',
        height: 'calc(100vh - 120px)', background: theme.inputBg,
        borderRadius: '9px', padding: '4px 2px', cursor: 'pointer', zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: '1px',
        boxShadow: '0 4px 12px rgba(77,107,254,0.1)',
      }}
    >
      {cards.map(card => (
        <div key={card.id} style={{ flex: '1 1 0', background: getColorForCard(card), borderRadius: '1px', minHeight: '2px' }} title={card.front} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. ACCUEIL — YearHeatmap (style GitHub contributions)
 * ════════════════════════════════════════════════════════════════════════════
 * Props : sessionHistory = [{ date: "YYYY-MM-DD", count: number }, ...]
 *         onClickDay(date) optionnel
 */
export function YearHeatmap({ sessionHistory = [], onClickDay, theme, isDarkMode }) {
  const map = useMemo(() => {
    const m = new Map();
    sessionHistory.forEach(s => m.set(s.date, (m.get(s.date) || 0) + (s.count || 0)));
    return m;
  }, [sessionHistory]);

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 364);
  // Aligner sur lundi
  const dayOfWeek = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOfWeek);

  const weeks = [];
  let cursor = new Date(start);
  while (cursor <= today) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
      week.push({ date: dateStr, count: map.get(dateStr) || 0, future: cursor > today });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const max = Math.max(1, ...Array.from(map.values()));
  const colorFor = (count) => {
    if (!count) return isDarkMode ? "#1a1f3a" : "#ebedf0";
    const intensity = Math.min(1, count / max);
    if (intensity < 0.25) return "#9be9a8";
    if (intensity < 0.5) return "#40c463";
    if (intensity < 0.75) return "#30a14e";
    return "#216e39";
  };

  const monthLabels = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
  const totalDays = sessionHistory.reduce((a, s) => a + (s.count || 0), 0);
  const activeDays = map.size;

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 20, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.text, fontSize: 16 }}>📅 Activité — 365 derniers jours</h3>
        <div style={{ fontSize: 12, color: theme.textMuted }}>
          <strong style={{ color: theme.highlight }}>{totalDays}</strong> reviews · <strong style={{ color: theme.highlight }}>{activeDays}</strong> jours actifs
        </div>
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "inline-flex", gap: 3, alignItems: "flex-start" }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((d, di) => (
                <div
                  key={di}
                  onClick={() => !d.future && onClickDay?.(d.date)}
                  title={d.future ? "" : `${d.date} — ${d.count} review${d.count > 1 ? "s" : ""}`}
                  style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: d.future ? "transparent" : colorFor(d.count),
                    cursor: d.future ? "default" : "pointer",
                    transition: "transform 0.1s",
                  }}
                  onMouseEnter={e => !d.future && (e.currentTarget.style.transform = "scale(1.4)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Légende */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: theme.textMuted }}>
        <span>Moins</span>
        {[0, 1, 0.4, 0.7, 1].map((i, k) => (
          <div key={k} style={{ width: 12, height: 12, borderRadius: 3, background: i === 0 ? (isDarkMode ? "#1a1f3a" : "#ebedf0") : colorFor(Math.ceil(i * max)) }} />
        ))}
        <span>Plus</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. ACCUEIL — ResumeCarousel (Reprends où tu t'es arrêté)
 * ════════════════════════════════════════════════════════════════════════════
 * Props : items = [{ icon, label, sublabel, onClick }]
 */
export function ResumeCarousel({ items = [], theme }) {
  if (!items.length) return null;
  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 20, border: `1px solid ${theme.border}` }}>
      <h3 style={{ margin: "0 0 14px", fontWeight: 800, color: theme.text, fontSize: 16 }}>↻ Reprends où tu t'es arrêté</h3>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory" }}>
        {items.map((it, i) => (
          <button
            key={i}
            onClick={it.onClick}
            className="hov"
            style={{
              flex: "0 0 220px", scrollSnapAlign: "start",
              padding: 16, borderRadius: 14,
              background: `linear-gradient(135deg, ${theme.highlight}18, ${theme.highlight}05)`,
              border: `1px solid ${theme.border}`, color: theme.text,
              cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 6,
            }}
          >
            <div style={{ fontSize: 24 }}>{it.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{it.sublabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. ACCUEIL — SmartSessionRecommender
 * ════════════════════════════════════════════════════════════════════════════
 * Suggère le mode de session selon l'heure et le streak.
 */
export function getSmartSessionRecommendation({ dueCount = 0, streak = 0, hour = new Date().getHours() }) {
  if (dueCount === 0) return { mode: "explore", icon: "🔭", label: "Explore le Lab", reason: "Aucune fiche due aujourd'hui — parfait pour analyser un nouveau document." };
  if (hour >= 5 && hour < 11) return { mode: "wakeup", icon: "🌅", label: "Réveil express", reason: `${Math.min(5, dueCount)} fiches faciles pour démarrer en douceur.` };
  if (hour >= 11 && hour < 18) return { mode: "express", icon: "⚡", label: "Review express", reason: `${dueCount} fiches en ${Math.ceil(dueCount * 0.5)} min.` };
  if (hour >= 18 && hour < 22) return { mode: "deep", icon: "🌙", label: "Consolidation", reason: "Soirée idéale pour les fiches difficiles." };
  return { mode: "light", icon: "🛏️", label: "Touche finale", reason: "Une mini-session avant de dormir consolide la mémoire." };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 5. AJOUTER — SmartPasteBox (universal quick-add)
 * ════════════════════════════════════════════════════════════════════════════
 * Détecte automatiquement : URL, texte, code, JSON, liste.
 */
export async function profileContent(raw, callClaude) {
  const reply = await callClaude(
    "Analyse ce contenu pédagogique. Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans texte avant ou après.",
    `Contenu: ${raw.slice(0, 2000)}
Réponds avec exactement ce format JSON :
{
  "conceptCount": nombre de concepts distincts détectés,
  "contentType": "table" | "code" | "mixed" | "definition" | "list",
  "language": "Common Lisp" | "Java" | "Python" | "SQL" | "non-code",
  "recommendedCardCount": nombre idéal de fiches à générer,
  "concepts": ["nom du concept 1", "nom du concept 2", ...]
}`
  );
  return safeParseJSON(reply);
}

export function SmartPasteBox({ onGenerate, theme, isDarkMode, callClaude }) {
  const [value, setValue] = useState("");
  const [style, setStyle] = useState("recall"); // recall | cloze | application
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiling, setProfiling] = useState(false);

  const detect = (s) => {
    const t = s.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return "url";
    if (/^[\s\S]*[{};]\s*$/m.test(t) && /\b(function|const|let|var|class|def|import|return)\b/.test(t)) return "code";
    if (/^[\s\[\{]/.test(t) && (t.includes("\":") || t.includes("\":"))) return "json";
    if (/^(\d+\.|\-|\*)\s/m.test(t)) return "list";

    // Tableau markdown (pipes)
    if (/\|\s*.+\s*\|/.test(t) || /^[-|]+$/.test(t))
      return "table";

    // HTML copié depuis un cours (balises table, pre, code)
    if (/<(table|thead|tbody|tr|td|th|pre|code)[\s>]/.test(t))
      return "html-section";

    // Section de cours numérotée avec bloc de code
    if (/^\s*[\d]+\.\d*\s+\S/m.test(t) && /```/.test(t))
      return "lesson-section";

    // Bloc code + texte explicatif autour (contenu mixte)
    if (/```[\s\S]+```/.test(t) && t.length > 300)
      return "code-with-context";

    // Table sans pipes copiée depuis HTML (commence par un mot-clé de colonne)
    if (/^(Prédicat|Fonction|Commande|Syntaxe|Exemple|Keyword|Method|Operator)/im.test(t))
      return "table";

    return "text";
  };

  const kind = detect(value);

  const analyze = async () => {
    if (!value.trim() || profiling) return;
    setProfiling(true);
    try {
      const result = await profileContent(value.trim(), callClaude);
      setProfile(result);
    } finally {
      setProfiling(false);
    }
  };

  const submit = async () => {
    if (!value.trim() || loading) return;
    setLoading(true);
    try {
      await onGenerate({ raw: value.trim(), kind, style });
      setValue("");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const styleOptions = [
    { id: "recall",      icon: "💡", label: "Recall",      desc: "Question → réponse courte" },
    { id: "cloze",       icon: "▭",  label: "Texte à trous", desc: "Lacunaire (cloze)" },
    { id: "application", icon: "🎯", label: "Application", desc: "Mini-cas pratique" },
    { id: "input-output", icon: "⇒", label: "Input → Output", desc: "Appel de fonction → résultat attendu" }
  ];

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `2px dashed ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.text, fontSize: 16 }}>⚡ Quick Add — colle n'importe quoi</h3>
        {kind && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: theme.highlight + "22", color: theme.highlight, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{kind}</span>}
      </div>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Colle un texte, une URL, un bloc de code, du JSON, une liste… L'IA détecte et génère."
        style={{
          width: "100%", minHeight: 120, padding: 14, borderRadius: 12,
          background: theme.inputBg, border: `1px solid ${theme.border}`,
          color: theme.text, fontFamily: "inherit", fontSize: 14, resize: "vertical",
        }}
      />
      {/* Style chooser */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {styleOptions.map(o => (
          <button
            key={o.id} onClick={() => setStyle(o.id)} className="hov"
            style={{
              flex: 1, minWidth: 140, padding: "10px 12px", borderRadius: 12,
              border: `2px solid ${style === o.id ? theme.highlight : theme.border}`,
              background: style === o.id ? theme.highlight + "12" : "transparent",
              color: style === o.id ? theme.highlight : theme.textMuted,
              cursor: "pointer", textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>{o.icon} {o.label}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{o.desc}</div>
          </button>
        ))}
      </div>
      {profile && (
        <div style={{
          margin: "12px 0",
          padding: "12px 16px",
          borderRadius: 12,
          background: theme.highlight + "10",
          border: `1px solid ${theme.highlight}30`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: theme.highlight, marginBottom: 6 }}>
            🔍 {profile.conceptCount} concept{profile.conceptCount > 1 ? "s" : ""} détecté{profile.conceptCount > 1 ? "s" : ""} → {profile.recommendedCardCount} fiches recommandées
          </div>
          {profile.language && profile.language !== "non-code" && (
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
              Langage : {profile.language}
            </div>
          )}
          {profile.concepts && profile.concepts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {profile.concepts.slice(0, 8).map((c, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 99,
                  background: theme.highlight + "20", color: theme.highlight,
                  fontWeight: 600,
                }}>{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {profile === null ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={analyze} disabled={!value.trim() || profiling} className="hov"
            style={{
              width: "100%", padding: 14, borderRadius: 12,
              background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white",
              border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer",
              opacity: !value.trim() || profiling ? 0.5 : 1,
            }}
          >
            {profiling ? "🔍 Analyse en cours…" : "🔍 Analyser"}
          </button>
          <div
            onClick={submit}
            style={{
              textAlign: "center", fontSize: 12, color: theme.textMuted,
              cursor: (!value.trim() || loading) ? "default" : "pointer",
              textDecoration: "underline", opacity: (!value.trim() || loading) ? 0.5 : 1
            }}
          >
            Générer sans analyser
          </div>
        </div>
      ) : (
        <button
          onClick={submit} disabled={!value.trim() || loading} className="hov"
          style={{
            marginTop: 12, width: "100%", padding: 14, borderRadius: 12,
            background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white",
            border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer",
            opacity: !value.trim() || loading ? 0.5 : 1,
          }}
        >
          {loading ? "🧠 Génération…" : "✨ Générer les fiches"}
        </button>
      )}
    </div>
  );
}

// Helper : appel IA standardisé pour SmartPasteBox.onGenerate
export async function generateCardsFromSmartPaste({ raw, kind, style, callClaude, category = "Quick Add" }) {
  const ATOMIC_RULE = `
RÈGLE ABSOLUE : 1 fiche = 1 seul concept testable.
Ne fusionne jamais 2 concepts en 1 fiche.
Un tableau de 8 lignes doit donner au minimum 8 fiches séparées.
`;

  const kindInstr = {
    table: `
    Chaque LIGNE du tableau = 1 fiche distincte. Ne les fusionne jamais.
    front = nom exact de la fonction, prédicat, commande ou opérateur.
    back = définition précise + comportement exact.
    example = 1 appel concret avec sa sortie attendue (notation →).
  `,
    "html-section": `
    Ignore toutes les balises HTML. Traite le contenu pur.
    Chaque concept dans un tableau = 1 fiche.
    Chaque bloc de code = 1 ou plusieurs fiches selon les patterns distincts.
    Préserve les exemples de code exactement tels quels dans le champ example.
  `,
    "lesson-section": `
    Respecte la structure numérotée du cours.
    1 fiche par sous-concept ou par règle identifiée.
    front = titre du concept ou question directe sur la règle.
    back = la règle + explication concise en 2-3 lignes max.
    example = l'exemple du cours, reproduit exactement.
  `,
    "code-with-context": `
    Identifie chaque concept ou pattern distinct dans le code.
    front = "Que fait [fonction/expression] ?" ou "Comment [pattern] fonctionne-t-il ?"
    back = explication du rôle + syntaxe exacte.
    example = extrait minimal du code fourni illustrant ce concept.
    Génère aussi 1 fiche sur le pattern global si pertinent.
  `,
  };

  const styleInstr = {
    recall: "Format : 5-10 fiches { front (question directe), back (réponse courte et précise), example }.",
    cloze: "Format : 5-10 fiches { front (phrase avec [BLANK] sur le mot clé), back (le mot retiré), example }.",
    application: "Format : 3-6 fiches { front (mini scénario ou problème concret), back (démarche + réponse), example }.",
    "input-output": `
    Format : fiches de type trace d'exécution.
    front = l'appel ou l'expression exacte tirée du code.
    back = le résultat/output + 1 ligne d'explication du pourquoi.
    example = variante ou cas limite.
  `,
  }[style] || "";

  const combinedInstr = (kindInstr[kind] || "") + "\n" + styleInstr + "\n" + ATOMIC_RULE;

  function detectLanguage(text) {
    if (/\(defun|\(defvar|\(assoc|\(car |\(cdr |\(cons |\(let |\(cond /.test(text))
      return "Common Lisp";
    if (/@SpringBootApplication|@RestController|@Service|import java\./.test(text))
      return "Java / Spring Boot";
    if (/def |import numpy|import pandas|\.py\b/.test(text))
      return "Python";
    if (/SELECT|INSERT|UPDATE|FROM|WHERE/i.test(text) && !/function|const/.test(text))
      return "SQL";
    return null;
  }

  const detectedLang = detectLanguage(raw);
  const langCtx = detectedLang
    ? `Ce contenu est en ${detectedLang}. Utilise la terminologie exacte de ce langage. Les exemples dans le champ "example" doivent être syntaxiquement valides en ${detectedLang}.`
    : "";

  const sys = "Tu es un générateur de flashcards pédagogiques polymorphes (God Mode). Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de prose.";
  const user = `À partir de cet input (type détecté: ${kind}), génère des flashcards en français.
${langCtx}
${combinedInstr}

RÈGLE D'ARCHITECTURE (God Mode) :
Chaque carte doit identifier un "coreConcept" fondamental.
En plus du front/back classique, génère une liste de "facets" (angles d'attaque alternatifs).
Par exemple: {"type": "scenario", "front": "Mise en situation...", "back": "Explication..."} ou {"type": "code-debug", "front": "Trouve l'erreur...", "back": "Correction..."}

JSON STRICT FORMAT ATTENDU : 
{
  "cards": [
    {
      "front": "Question principale concise",
      "back": "Réponse détaillée",
      "example": "Exemple d'utilisation",
      "coreConcept": "Le concept sous-jacent abstrait",
      "facets": [
         { "type": "scenario", "front": "...", "back": "..." }
      ]
    }
  ]
}

INPUT:
${raw}`;

  const reply = await callClaude(sys, user);
  const parsed = safeParseJSON(reply);
  const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
  return cards.map(c => ({
    front: c.front || "",
    back: c.back || "",
    example: c.example || "",
    coreConcept: c.coreConcept || c.front,
    facets: Array.isArray(c.facets) ? c.facets : [],
    category,
    style,
  })).filter(c => c.front && c.back);
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6. AJOUTER — Smart-merge detection
 * ════════════════════════════════════════════════════════════════════════════ */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length; if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function findSimilarCards(front, expressions, threshold = 0.75) {
  const norm = s => (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const target = norm(front);
  if (target.length < 3) return [];
  return expressions
    .map(e => {
      const f = norm(e.front);
      if (!f) return null;
      const dist = levenshtein(target, f);
      const sim = 1 - dist / Math.max(target.length, f.length);
      return sim >= threshold ? { card: e, similarity: sim } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

/* ════════════════════════════════════════════════════════════════════════════
 * 7. FICHES — Health badge
 * ════════════════════════════════════════════════════════════════════════════ */
export function getCardHealth(card) {
  const history = card.reviewHistory || [];
  if (history.length < 3) return { status: "new", label: "Nouvelle", color: "var(--mm-fg-muted)" };
  const recent = history.slice(-10);
  const failures = recent.filter(h => h.rating === "again" || h.rating === 1 || h.success === false).length;
  const rate = failures / recent.length;
  if (rate >= 0.5) return { status: "trap", label: "⚠️ Piège", color: "#EF4444" };
  if (rate >= 0.3) return { status: "shaky", label: "⚡ Fragile", color: "#F59E0B" };
  return { status: "healthy", label: "✓ Solide", color: "#10B981" };
}

export function CardHealthBadge({ card }) {
  const h = getCardHealth(card);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: h.color + "22", color: h.color, textTransform: "uppercase", letterSpacing: 0.5,
    }}>{h.label}</span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 8. FICHES — Saved filter views (localStorage via storage)
 * ════════════════════════════════════════════════════════════════════════════ */
export function useSavedViews({ storage, key = "memo_saved_views" }) {
  const [views, setViews] = useState([]);
  useEffect(() => { storage.get(key).then(v => Array.isArray(v) && setViews(v)); }, [key, storage]);
  const persist = useCallback(async (next) => { setViews(next); await storage.set(key, next); }, [storage, key]);
  return {
    views,
    saveView: (name, filters) => persist([...views.filter(v => v.name !== name), { name, filters, createdAt: localToday() }]),
    deleteView: (name) => persist(views.filter(v => v.name !== name)),
    loadView: (name) => views.find(v => v.name === name),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 9. STATS — FSRS Forecast 30 jours
 * ════════════════════════════════════════════════════════════════════════════
 * Calcule combien de fiches seront dues chaque jour des 30 prochains.
 */
function computeFsrsForecast(expressions, days = 30) {
  const buckets = new Map();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= days; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  expressions.forEach(e => {
    const next = e.nextReview || e.dueDate;
    if (!next) return;
    if (buckets.has(next)) buckets.set(next, buckets.get(next) + 1);
  });
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export function FsrsForecastChart({ expressions, theme, isDarkMode }) {
    const data = useMemo(() => computeFsrsForecast(expressions, 7), [expressions]);
    const total = data.reduce((a, d) => a + d.count, 0);
    
    const textColor = isDarkMode ? "#F8FAFF" : "#0F172A";
    const textMuted = isDarkMode ? "#94a3b8" : "#64748b";
    const tooltipBg = isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
    const borderColor = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  
    return (
      <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontWeight: 900, color: theme.text, fontSize: 18 }}>🔮 Charge prévue (7 jours)</h3>
          <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}><strong style={{ color: theme.highlight, fontWeight: 900, fontSize: 14 }}>{total}</strong> à venir</div>
        </div>
        <div style={{ height: 220, width: "100%", display: "flex", justifyContent: "center" }}>
          <Doughnut 
            data={{
              labels: data.map(d => {
                const date = new Date(d.date);
                return date.toLocaleDateString('fr-FR', { weekday: 'long' });
              }),
              datasets: [{
                data: data.map(d => d.count),
                backgroundColor: [
                  "#3B82F6", "#8B5CF6", "#EC4899", "#F43F5E", 
                  "#F59E0B", "#10B981", "#14B8A6"
                ],
                borderWidth: 2,
                borderColor: theme.cardBg,
                hoverOffset: 4
              }]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              cutout: '65%',
              plugins: {
                legend: { position: 'right', labels: { color: textMuted, font: { weight: 'bold' } } },
                tooltip: {
                  backgroundColor: tooltipBg, titleColor: textColor, bodyColor: textColor,
                  borderColor: borderColor, borderWidth: 1, padding: 12,
                  callbacks: { label: (ctx) => ` ${ctx.raw} révisions` }
                }
              }
            }}
          />
        </div>
      </div>
    );
}


/* ════════════════════════════════════════════════════════════════════════════
 * 10. STATS — Forgetting curve
 * ════════════════════════════════════════════════════════════════════════════ */
export function ForgettingCurveChart({ expressions, theme, isDarkMode }) {
  // Approx Ebbinghaus : R(t) = exp(-t / S), avec S = stability moyenne par bucket
  const points = useMemo(() => {
    const intervals = [0, 1, 2, 4, 7, 14, 30, 60];
    const avgStability = expressions.reduce((a, e) => a + (e.interval || 1), 0) / Math.max(1, expressions.length);
    return intervals.map(t => ({ day: t, retention: Math.round(Math.exp(-t / Math.max(1, avgStability)) * 100) }));
  }, [expressions]);

  const textColor = isDarkMode ? "#F8FAFF" : "#0F172A";
  const textMuted = isDarkMode ? "#94a3b8" : "#64748b";
  const tooltipBg = isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const borderColor = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const cardBg = isDarkMode ? "#1e293b" : "#ffffff";

  return (
    <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
      <h3 style={{ margin: "0 0 16px", fontWeight: 900, color: theme.text, fontSize: 18 }}>📉 Courbe d'oubli</h3>
      <div style={{ height: 160, width: "100%" }}>
        <Line 
          data={{
            labels: points.map(p => `J${p.day}`),
            datasets: [{
              label: 'Rétention',
              data: points.map(p => p.retention),
              borderColor: "#4D6BFE",
              borderWidth: 3,
              backgroundColor: "rgba(77, 107, 254, 0.2)",
              fill: true,
              tension: 0.4,
              pointBackgroundColor: cardBg,
              pointBorderColor: "#4D6BFE",
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
            }]
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: tooltipBg,
                titleColor: textColor,
                bodyColor: textColor,
                borderColor: borderColor,
                borderWidth: 1, padding: 12, displayColors: false,
                callbacks: { label: (ctx) => `${ctx.raw}% de rétention` }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: textMuted, font: { weight: 'bold' } } },
              y: { display: false, min: 0, max: 100 }
            }
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 16, fontWeight: 500, lineHeight: 1.4 }}>
        Sans review, ta rétention chute selon cette courbe (Ebbinghaus, calibrée sur ton stability moyen).
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 11. STATS — Top piégées + IA rewrite
 * ════════════════════════════════════════════════════════════════════════════ */
export function TopTrappedCards({ expressions, callClaude, showToast, onUpdate, theme }) {
  const [rewriting, setRewriting] = useState(null);
  const trapped = useMemo(() =>
    expressions
      .map(e => ({ ...e, _health: getCardHealth(e) }))
      .filter(e => e._health.status === "trap" || e._health.status === "shaky")
      .sort((a, b) => (b.reviewHistory?.length || 0) - (a.reviewHistory?.length || 0))
      .slice(0, 10),
    [expressions]
  );

  const rewrite = async (card) => {
    setRewriting(card.id);
    try {
      const reply = await callClaude(
        "Tu es un coach pédagogique. Réécris cette flashcard pour qu'elle soit plus claire, sans ambiguïté. Réponds UNIQUEMENT en JSON.",
        `Carte actuelle:\nFront: ${card.front}\nBack: ${card.back}\nExemple: ${card.example || "(aucun)"}\n\nJSON: {"front":"...","back":"...","example":"...","reason":"pourquoi cette version est meilleure"}`
      );
      const parsed = safeParseJSON(reply);
      if (parsed?.front && parsed?.back) {
        onUpdate?.({ ...card, front: parsed.front, back: parsed.back, example: parsed.example || card.example });
        showToast?.(`✏️ Réécrite : ${parsed.reason || "version améliorée"}`, "success");
      } else {
        showToast?.("L'IA n'a pas réussi à proposer une meilleure version.", "error");
      }
    } catch { showToast?.("Erreur lors de la réécriture.", "error"); }
    finally { setRewriting(null); }
  };

  if (!trapped.length) {
    return (
      <div style={{ background: theme.cardBg, borderRadius: 24, padding: 32, border: `1px solid ${theme.border}`, textAlign: "center", color: theme.textMuted, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Aucune fiche piégée détectée.</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>Ta rétention est solide !</div>
      </div>
    );
  }

  return (
    <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, background: "radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <h3 style={{ margin: "0 0 16px", fontWeight: 900, color: theme.text, fontSize: 18 }}>⚠️ Top fiches piégées</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {trapped.map(c => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: theme.inputBg, border: `1px solid ${theme.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.front}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: c._health.color, fontWeight: 800, background: c._health.color + "15", padding: "2px 8px", borderRadius: 100 }}>{c._health.label}</span>
                <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>{c.reviewHistory?.length} rév.</span>
              </div>
            </div>
            <button
              onClick={() => rewrite(c)} disabled={rewriting === c.id} className="hov"
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${theme.highlight}, ${theme.highlight}dd)`, color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 12px ${theme.highlight}40` }}
            >
              {rewriting === c.id ? "…" : "✨ Réécrire"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 12. STATS — Comparison vs 30 days ago
 * ════════════════════════════════════════════════════════════════════════════ */
export function ComparisonVs30Days({ sessionHistory = [], expressions, theme, isDarkMode }) {
    const today = new Date();
    const sliceCount = (start, end) => {
      return sessionHistory.filter(s => {
        const d = new Date(s.date);
        return d >= start && d <= end;
      }).reduce((a, s) => a + (s.count || 0), 0);
    };

    const last30Start = new Date(today); last30Start.setDate(today.getDate() - 30);
    const prev30Start = new Date(today); prev30Start.setDate(today.getDate() - 60);
    const prev30End = new Date(today); prev30End.setDate(today.getDate() - 31);
  
    const recent = sliceCount(last30Start, today);
    const prev = sliceCount(prev30Start, prev30End);
    const delta = prev === 0 ? (recent > 0 ? 100 : 0) : Math.round(((recent - prev) / prev) * 100);
    const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const trendColor = trend === "up" ? "#10B981" : trend === "down" ? "#EF4444" : "var(--mm-fg-muted)";
    
    const recentColor = "#38bdf8"; 
    const prevColor = isDarkMode ? "#64748b" : "#cbd5e1"; 
    
    // If both are 0, we show a full grey ring to avoid an empty invisible chart
    const isEmpty = recent === 0 && prev === 0;
    const chartData = isEmpty ? [1] : [recent, prev];
    const chartColors = isEmpty ? [(isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")] : [recentColor, prevColor];
    const chartLabels = isEmpty ? ['Aucune donnée'] : ['Derniers 30 jours', 'Période précédente'];

    return (
      <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontWeight: 900, color: theme.text, fontSize: 18 }}>⚔️ Toi vs il y a 30 jours</h3>
          <div style={{ fontSize: 15, fontWeight: 900, color: trendColor }}>
            {delta > 0 ? "+" : ""}{delta}%
          </div>
        </div>
        
        <div style={{ height: 260, width: "100%", position: "relative" }}>
          <Doughnut 
            data={{
              labels: chartLabels,
              datasets: [
                {
                  data: chartData,
                  backgroundColor: chartColors,
                  borderWidth: 2,
                  borderColor: theme.cardBg,
                  borderRadius: 4,
                  hoverOffset: 4
                }
              ]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              cutout: '70%', 
              layout: {
                padding: { bottom: 20 }
              },
              plugins: {
                legend: { 
                  display: !isEmpty,
                  position: 'bottom', 
                  labels: { 
                    padding: 20,
                    color: isDarkMode ? "#94a3b8" : "#64748b", 
                    font: { weight: 'bold' }
                  } 
                },
                tooltip: {
                  enabled: !isEmpty,
                  backgroundColor: isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255,255,255,0.95)", 
                  titleColor: isDarkMode ? "#fff" : "#000", 
                  bodyColor: isDarkMode ? "#fff" : "#000",
                  borderColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", 
                  borderWidth: 1, padding: 12,
                  callbacks: {
                    label: function(context) {
                      return ` ${context.label}: ${context.raw} révisions`;
                    }
                  }
                }
              }
            }}
          />
          
          <div style={{ position: "absolute", top: isEmpty ? "50%" : "42%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: isEmpty ? (isDarkMode ? "#64748b" : "#94a3b8") : recentColor, lineHeight: 1 }}>{recent}</div>
            <div style={{ fontSize: 11, color: isDarkMode ? "#94a3b8" : "#64748b", fontWeight: 800, textTransform: "uppercase", marginTop: 4 }}>révisions</div>
          </div>
        </div>
      </div>
    );
  }



  /* ════════════════════════════════════════════════════════════════════════════
 * 13. STATS — Weekly digest IA
 * ════════════════════════════════════════════════════════════════════════════ */
export async function generateWeeklyDigest({ expressions, sessionHistory, stats, callClaude }) {
  const weekHistory = sessionHistory.filter(s => {
    const d = new Date(s.date);
    return (Date.now() - d.getTime()) / 86400000 <= 7;
  });
  const totalThisWeek = weekHistory.reduce((a, s) => a + (s.count || 0), 0);
  const trapped = expressions.filter(e => getCardHealth(e).status === "trap").length;
  const newCards = expressions.filter(e => {
    const c = e.createdAt; if (!c) return false;
    return (Date.now() - new Date(c).getTime()) / 86400000 <= 7;
  }).length;

  const reply = await callClaude(
    "Tu es un coach d'apprentissage à la voix bienveillante mais lucide. Tu écris un mini-bilan hebdomadaire en français (style 'Spotify Wrapped' : punchy, chiffré, motivant). Format : 4 sections courtes — 'Ce que tu as fait', 'Ce qui coince', 'Ta force', 'Le défi de la semaine'. 80 mots max au total. Pas de bullets longues, écriture vive.",
    `Stats de la semaine:
- Reviews: ${totalThisWeek}
- Streak actuel: ${stats?.streak || 0} jours
- Nouvelles fiches créées: ${newCards}
- Fiches piégées détectées: ${trapped}
- Total fiches: ${expressions.length}

Génère le digest.`
  );
  return reply.trim();
}

/* ════════════════════════════════════════════════════════════════════════════
 * 14. LAB — Pomodoro Study Session (25 min guidée)
 * ════════════════════════════════════════════════════════════════════════════ */
export function PomodoroStudy({ theme, onPhaseChange, showToast }) {
  const PHASES = [
    { id: "read",    label: "📖 Lecture active",   minutes: 5,  color: "#4D6BFE" },
    { id: "summary", label: "✍️ Synthèse",         minutes: 10, color: "#10B981" },
    { id: "quiz",    label: "❓ Auto-quiz",         minutes: 5,  color: "#F59E0B" },
    { id: "flash",   label: "🃏 Flashcards",       minutes: 5,  color: "#4D6BFE" },
  ];
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PHASES[0].minutes * 60);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          // Phase suivante
          setPhaseIdx(idx => {
            const next = idx + 1;
            if (next >= PHASES.length) {
              setRunning(false);
              showToast?.("🏆 Session 25 min terminée ! Bravo.", "success");
              return 0;
            }
            const nextPhase = PHASES[next];
            onPhaseChange?.(nextPhase);
            showToast?.(`→ ${nextPhase.label}`, "info");
            return next;
          });
          return PHASES[Math.min(phaseIdx + 1, PHASES.length - 1)].minutes * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, phaseIdx]);

  const reset = () => { setRunning(false); setPhaseIdx(0); setSecondsLeft(PHASES[0].minutes * 60); };
  const phase = PHASES[phaseIdx];
  const totalSec = phase.minutes * 60;
  const progress = ((totalSec - secondsLeft) / totalSec) * 100;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.text, fontSize: 16 }}>🍅 Session 25 min — Pomodoro guidé</h3>
        <span style={{ fontSize: 12, color: theme.textMuted }}>Phase {phaseIdx + 1}/{PHASES.length}</span>
      </div>
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ fontSize: 14, color: phase.color, fontWeight: 700, marginBottom: 6 }}>{phase.label}</div>
        <div style={{ fontSize: 56, fontWeight: 900, color: theme.text, fontVariantNumeric: "tabular-nums" }}>
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: theme.inputBg, overflow: "hidden" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: phase.color, transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
        <button
          onClick={() => setRunning(r => !r)} className="hov"
          style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: phase.color, color: "white", fontWeight: 800, cursor: "pointer" }}
        >
          {running ? "⏸ Pause" : "▶ Démarrer"}
        </button>
        <button
          onClick={reset} className="hov"
          style={{ padding: "10px 16px", borderRadius: 12, border: `1px solid ${theme.border}`, background: "transparent", color: theme.textMuted, fontWeight: 700, cursor: "pointer" }}
        >
          ↺ Reset
        </button>
      </div>
      {/* Phase pills */}
      <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
        {PHASES.map((p, i) => (
          <div key={p.id} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < phaseIdx ? p.color : i === phaseIdx ? p.color + "80" : theme.inputBg,
          }} title={p.label} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 15. LAB — AskMyDocs (chat sur corpus uploadé)
 * ════════════════════════════════════════════════════════════════════════════
 * Props : docs = [{ name, content }]
 */
export function AskMyDocs({ docs = [], callClaude, theme }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!input.trim() || loading) return;
    if (!docs.length) return;
    const userMsg = { role: "user", text: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const corpus = docs.map((d, i) => `=== DOC ${i + 1} : ${d.name} ===\n${(d.content || "").slice(0, 8000)}`).join("\n\n");
      const reply = await callClaude(
        "Tu es un assistant qui répond UNIQUEMENT à partir des documents fournis. Cite la source ('DOC 1', 'DOC 2'...) à chaque affirmation. Si l'info n'est pas dans les docs, dis-le clairement.",
        `DOCS:\n${corpus}\n\nQUESTION: ${userMsg.text}`
      );
      setMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "❌ Erreur lors de la réponse." }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 20, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.text, fontSize: 16 }}>💬 Ask my docs</h3>
        <span style={{ fontSize: 11, color: theme.textMuted }}>{docs.length} doc{docs.length > 1 ? "s" : ""} chargé{docs.length > 1 ? "s" : ""}</span>
      </div>
      {!docs.length && (
        <div style={{ padding: 20, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
          Charge d'abord un document dans le Lab pour pouvoir l'interroger.
        </div>
      )}
      {!!docs.length && (
        <>
          <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
                background: m.role === "user" ? theme.highlight : theme.inputBg,
                color: m.role === "user" ? "white" : theme.text,
                fontSize: 13, whiteSpace: "pre-wrap",
              }}>{m.text}</div>
            ))}
            {loading && <div style={{ alignSelf: "flex-start", color: theme.textMuted, fontSize: 12 }}>🧠 Réflexion…</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ask()}
              placeholder="Pose ta question…"
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}
            />
            <button
              onClick={ask} disabled={!input.trim() || loading} className="hov"
              style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: theme.highlight, color: "white", fontWeight: 700, cursor: "pointer", opacity: !input.trim() || loading ? 0.5 : 1 }}
            >
              ↗
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 16. COMMAND PALETTE (⌘K) — global pour Accueil
 * ════════════════════════════════════════════════════════════════════════════ */
export function CommandPalette({ open, onClose, commands = [], theme }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = commands.filter(c =>
    !query.trim() || c.label.toLowerCase().includes(query.toLowerCase()) || (c.keywords || "").toLowerCase().includes(query.toLowerCase())
  );

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh",
        backdropFilter: "blur(4px)",
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(560px, 90vw)", background: theme.cardBg, borderRadius: 16,
        border: `1px solid ${theme.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        overflow: "hidden", animation: "fadeUp 0.2s ease",
      }}>
        <input
          ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cherche une action…"
          style={{
            width: "100%", padding: "16px 20px", border: "none", borderBottom: `1px solid ${theme.border}`,
            background: "transparent", color: theme.text, fontSize: 16, outline: "none",
          }}
        />
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>Aucune action.</div>}
          {filtered.map((c, i) => (
            <button
              key={i} onClick={() => { c.action(); onClose?.(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", border: "none", background: "transparent",
                color: theme.text, cursor: "pointer", textAlign: "left", fontSize: 14,
              }}
              onMouseEnter={e => e.currentTarget.style.background = theme.inputBg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{c.label}</span>
              {c.shortcut && <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "monospace" }}>{c.shortcut}</span>}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 20px", borderTop: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted, display: "flex", justifyContent: "space-between" }}>
          <span>↑↓ naviguer · ↵ choisir</span>
          <span>esc fermer</span>
        </div>
      </div>
    </div>
  );
}

// Hook pour brancher ⌘K / Ctrl+K
export function useCommandPaletteShortcut(setOpen) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
/* ════════════════════════════════════════════════════════════════════════════
 * 18. GOD MODE — Outils Pédagogiques (Socratic & Deep Dive)
 * ════════════════════════════════════════════════════════════════════════════ */

// Composant SocraticChat : Prend le relais quand l'utilisateur fait une erreur lourde.
export function SocraticChat({ card, initialUserError, callClaude, onResolve, theme }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: `Hmm, ta réponse "${initialUserError}" montre que tu as une idée, mais ce n'est pas tout à fait ça. Plutôt que de te donner la réponse, essayons de la trouver ensemble.\n\nSachant que la question est : "${card.front}", qu'est-ce qui te bloque exactement ?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", text: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const historyText = messages.map(m => `${m.role === "assistant" ? "Toi" : "L'étudiant"} : ${m.text}`).join("\n");
      const prompt = `Tu es un tuteur socratique très doué. 
L'étudiant essaie de mémoriser cette carte flash :
Front : ${card.front}
Back attendu : ${card.back}

L'étudiant a d'abord répondu : ${initialUserError}.
Historique de la conversation :
${historyText}
L'étudiant vient de dire : ${userMsg.text}

Ton but est de l'amener à trouver le Back attendu LUI-MÊME, sans jamais lui donner la réponse directement. 
Pose-lui UNE seule question à la fois. Si tu sens qu'il a compris ou qu'il donne la bonne réponse finale, termine ton message par le mot-clé EXACT "[RESOLU]".`;

      const reply = await callClaude("Tu es un tuteur socratique bienveillant.", prompt);
      
      setMessages(m => [...m, { role: "assistant", text: reply.replace("[RESOLU]", "").trim() }]);
      
      if (reply.includes("[RESOLU]")) {
        setTimeout(() => onResolve(), 2000);
      }
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "❌ Oups, j'ai eu un bug de réflexion." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 20, border: `2px solid ${theme.highlight}50` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.highlight, fontSize: 16 }}>🧠 Mode Socratique Activé</h3>
        <span style={{ fontSize: 12, color: theme.textMuted }}>Trouvons la réponse ensemble</span>
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
            background: m.role === "user" ? theme.highlight : theme.inputBg,
            color: m.role === "user" ? "white" : theme.text,
            fontSize: 14, whiteSpace: "pre-wrap", borderBottomLeftRadius: m.role === "assistant" ? 4 : 14, borderBottomRightRadius: m.role === "user" ? 4 : 14,
          }}>{m.text}</div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", color: theme.textMuted, fontSize: 12 }}>Le tuteur réfléchit…</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ask()}
          placeholder="Ta déduction ou question…"
          style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}
        />
        <button
          onClick={ask} disabled={!input.trim() || loading} className="hov"
          style={{ padding: "0 20px", borderRadius: 12, border: "none", background: theme.highlight, color: "white", fontWeight: 700, cursor: "pointer", opacity: !input.trim() || loading ? 0.5 : 1 }}
        >
          ↗
        </button>
      </div>
    </div>
  );
}

// RabbitHoleViewer : Explorateur fractal
export function RabbitHoleViewer({ concept, callClaude, theme, onClose }) {
  const [nodes, setNodes] = useState([{ title: concept, content: "Chargement de l'explication profonde..." }]);
  const [loadingIdx, setLoadingIdx] = useState(0);

  useEffect(() => {
    if (nodes.length === 1 && nodes[0].content.includes("Chargement")) {
      callClaude("Tu es un expert qui explique les concepts en profondeur.", `Explique le concept "${concept}" comme si j'étais un développeur senior mais que je découvrais ce terme précis. Format: 2-3 paragraphes concis.`)
        .then(res => setNodes([{ title: concept, content: res }]))
        .catch(() => setNodes([{ title: concept, content: "Erreur de chargement." }]));
    }
  }, [concept, callClaude, nodes]);

  const diveDeeper = async (subConcept) => {
    const newIdx = nodes.length;
    setNodes(n => [...n, { title: subConcept, content: "Exploration en cours..." }]);
    setLoadingIdx(newIdx);
    try {
      const res = await callClaude("Tu es un expert.", `Je creuse le concept "${subConcept}" (qui découle de "${concept}"). Donne-moi l'explication moléculaire/technique de ce sous-concept en 2-3 paragraphes.`);
      setNodes(n => n.map((node, i) => i === newIdx ? { ...node, content: res } : node));
    } catch {
      setNodes(n => n.map((node, i) => i === newIdx ? { ...node, content: "Erreur lors du Deep Dive." } : node));
    } finally {
      setLoadingIdx(-1);
    }
  };

  return (
    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}`, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontWeight: 800, color: theme.text, fontSize: 16 }}>🕳️ Rabbit Hole : {concept}</h3>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer" }}>Fermer</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ paddingLeft: i * 16, borderLeft: i > 0 ? `2px solid ${theme.border}` : "none" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: theme.highlight, marginBottom: 8 }}>{n.title}</div>
            <div style={{ fontSize: 13, color: theme.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.content}</div>
            {i === nodes.length - 1 && loadingIdx !== i && (
              <div style={{ marginTop: 12 }}>
                <input 
                  placeholder="Un terme t'intrigue ? Tape-le pour creuser..."
                  onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { diveDeeper(e.target.value); e.target.value = ""; } }}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px dashed ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 12 }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Fonction utilitaire pour le Grading Sémantique
export async function gradeSemanticVoice(userAnswer, expectedBack, expectedFront, callClaude) {
  const prompt = `Un étudiant vient de répondre à une flashcard.
Question: "${expectedFront}"
Réponse idéale: "${expectedBack}"

Réponse de l'étudiant: "${userAnswer}"

Est-ce que la réponse de l'étudiant est sémantiquement correcte (même s'il utilise d'autres mots) ?
Réponds STRICTEMENT avec ce format JSON :
{
  "score": 0, 1 ou 5,
  "feedback": "Explication très courte (1 phrase) pour dire pourquoi et ce qui manque."
}
Règles : 
- score 5: correct dans l'idée, même si la formulation est différente.
- score 1: partiellement correct, ou vrai mais hors-sujet par rapport au concept visé.
- score 0: faux ou complètement à côté de la plaque.`;

  try {
    const res = await callClaude("Tu es un correcteur intransigeant mais compréhensif sur le sens.", prompt);
    return safeParseJSON(res) || { score: 0, feedback: "Impossible de valider sémantiquement." };
  } catch {
    return { score: 0, feedback: "Erreur de connexion à l'IA." };
  }
}

// Fonction utilitaire pour l'Auto-Injection de Pré-requis
export async function generatePrerequisiteCard(failedCard, callClaude) {
  const prompt = `L'étudiant vient d'échouer complètement sur cette carte :
Front: "${failedCard.front}"
Back: "${failedCard.back}"

Identifie LE concept de base (le pré-requis absolu) qu'il lui manque probablement pour comprendre cette carte.
Génère une carte très simple sur ce concept de base.
Réponds STRICTEMENT en JSON :
{
  "front": "Question de base",
  "back": "Réponse simple et fondamentale"
}`;
  try {
    const res = await callClaude("Tu es un architecte cognitif.", prompt);
    const parsed = safeParseJSON(res);
    if (parsed && parsed.front && parsed.back) {
      return {
        id: "prereq_" + Date.now(),
        front: "🔄 PRÉ-REQUIS: " + parsed.front,
        back: parsed.back,
        example: "Généré automatiquement pour t'aider à comprendre la carte suivante.",
        level: 0,
        createdAt: new Date().toISOString(),
        category: failedCard.category
      };
    }
  } catch {}
  return null;
}

