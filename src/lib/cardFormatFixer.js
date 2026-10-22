// src/lib/cardFormatFixer.js
//
// Réparation PURE du format Markdown des fiches (aucune dépendance React).
//
// Corrige les 3 défauts qui apparaissent quand une fiche est créée (Ajouter,
// Lab, Anglais, Actu…) ou réécrite par l'IA :
//   1. Éditeur de code affiché sur du TEXTE (phrase anglaise/française mise
//      dans un bloc ``` ou ```text) → le bloc est remplacé par du texte normal.
//   2. Texte "en bleu" sans raison : une phrase entourée de `backticks`
//      (code en ligne) alors que ce n'est pas du code → backticks retirés.
//   3. Code "étalé comme du texte" (pas de bloc ```) → le code est détecté et
//      placé dans un vrai bloc ```langage```.
//
// Utilisé à l'affichage (RichText) ET à l'enregistrement (création, bouton
// Optimiser) pour que les fiches stockées soient elles aussi réparées.

const LANGS = {
  python: "python", py: "python",
  javascript: "javascript", js: "javascript", node: "javascript",
  typescript: "typescript", ts: "typescript", tsx: "tsx", jsx: "jsx",
  java: "java", kotlin: "kotlin", kt: "kotlin", swift: "swift",
  "common-lisp": "lisp", commonlisp: "lisp", lisp: "lisp", cl: "lisp",
  clojure: "clojure", clj: "clojure", scheme: "scheme", racket: "scheme",
  c: "c", "c++": "cpp", cpp: "cpp", "c#": "csharp", csharp: "csharp", cs: "csharp",
  rust: "rust", rs: "rust", go: "go", golang: "go", ruby: "ruby", rb: "ruby",
  php: "php", html: "html", css: "css", scss: "scss", sass: "scss",
  json: "json", yaml: "yaml", yml: "yaml", xml: "xml", toml: "toml",
  sql: "sql", bash: "bash", shell: "bash", sh: "bash", zsh: "bash", console: "bash", terminal: "bash",
  haskell: "haskell", hs: "haskell", elixir: "elixir", ex: "elixir",
  erlang: "erlang", scala: "scala", dart: "dart", r: "r", matlab: "matlab",
  perl: "perl", lua: "lua", powershell: "powershell", ps1: "powershell",
  dockerfile: "docker", docker: "docker", makefile: "makefile", graphql: "graphql",
  mermaid: "mermaid", diff: "diff", ini: "ini", nginx: "nginx",
};

// Étiquettes de fence qui ne désignent PAS un langage de programmation.
const PROSE_FENCE_LABELS = new Set([
  "", "text", "txt", "plain", "plaintext", "none", "md", "markdown", "prose",
  "english", "en", "en-us", "en-gb", "anglais", "french", "fr", "francais", "français",
  "dialogue", "dialog", "example", "exemple", "phrase", "sentence", "quote", "output",
]);

const SHELL_CMDS = /^(git|npm|npx|yarn|pnpm|bun|pip3?|python3?|node|cd|ls|mkdir|rm|cp|mv|cat|echo|sudo|apt(-get)?|brew|docker|kubectl|curl|wget|chmod|chown|ssh|export|source|go|cargo|rustc|javac|gcc|g\+\+|make|terraform|aws|gcloud|az|systemctl|grep|find|tar|ping|vim|nano|touch)\b/;

const CODE_START = /^\s*(def\s+\w+\s*\(|class\s+\w+[\s:({<]|function\b\s*\w*\s*\(|async\s+function\b|const\s+[\w{[]|let\s+[\w{[]|var\s+\w|import\s+[\w{*"'][^\n]*?(from\b|;|$)|from\s+[\w.]+\s+import\b|export\s+(default|const|function|class)\b|#include\s*[<"]|#!\/|public\s+(static\s+)?\w|private\s+\w|protected\s+\w|package\s+[\w.]+;?\s*$|using\s+[\w.]+;|namespace\s+\w|fn\s+\w+\s*[(<]|func\s+\w*\s*\(|impl\s+\w|struct\s+\w+\s*\{|enum\s+\w+\s*\{|interface\s+\w+\s*\{|return\b[^.!?]*;?\s*$|if\s*\(.*\)\s*\{?|else\s*\{|elif\s+.+:|for\s*\(.*\)|for\s+\w+\s+in\s+.+:|while\s*\(.*\)|while\s+.+:\s*$|try\s*[:{]|catch\s*\(|except\b.*:|SELECT\s+.+\s+FROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)\b|ALTER\s+TABLE\b|\(\s*(defun|defvar|defparameter|defmacro|define|let\*?|lambda|setq|setf|format|ns|defn)\b|console\.\w+\(|print\s*\(|System\.out\.|printf\s*\(|@\w+(\(.*\))?\s*$|<\/?[a-zA-Z][\w-]*(\s[^>]*)?>)/i;

// Mots outils FR/EN : indices forts de prose.
const STOPWORDS = new Set(("the a an is are was were be been to of and or in on at for with that this it you i we they he she " +
  "do does did have has had not can could would should will my your his her our their what how why when where who " +
  "le la les un une des de du et ou est sont en au aux pour avec que qui ce cette il elle on nous vous ils je tu pas " +
  "ne se sa son ses mais donc car dans par sur plus très comme quand où").split(" "));

const CODE_SYMBOLS = /[{}();=<>[\]\\|&$#@^~*/+]/g;

function words(s) {
  return (s.match(/[A-Za-zÀ-ÖØ-öø-ÿ'’]+/g) || []);
}

/** Vrai si la ligne ressemble fortement à une ligne de code. */
export function isCodeLine(line) {
  if (typeof line !== "string") return false;
  const raw = line.replace(/\s+$/, "");
  const l = raw.trim();
  if (!l) return false;
  // Éléments Markdown structurels : jamais du code.
  if (/^(#{1,6}\s|>|\|.*\||[-*+]\s+\S.*[^;{}]$|\d+[.)]\s+[^\d])/.test(l)) return false;
  if (/^[-*_]{3,}$/.test(l)) return false;
  if (CODE_START.test(l)) {
    // "return to the office." / "for example, ..." → prose
    if (/^(return|for|while|if|else|try|import|export|class|function|package|print)\b/i.test(l)
      && !/[(){}\[\];=:]/.test(l)) return false;
    return true;
  }
  if (/^\$\s+\S/.test(l) || SHELL_CMDS.test(l) && /\s-{1,2}\w|\s[\w./-]+\/|\sinstall\b|\sinit\b|\srun\b|\scommit\b|\spush\b|\s&&\s/.test(l)) return true;
  if (/^[}\])]+[;,)]*$/.test(l)) return true;               // } ou ); seuls
  if (/[;{]\s*$/.test(l) && /[(=]/.test(l)) return true;     // fin d'instruction
  if (/^[\w.$[\]"']+\s*(=|\+=|-=|\*=|:=|<-)\s*\S/.test(l) && !/[.!?]$/.test(l) && words(l).length <= 8) return true; // x = 1
  if (/^[\w.$]+\([^)]*\)\s*;?$/.test(l)) return true;          // foo(bar)
  if (/=>/.test(l) && /[(){}]/.test(l)) return true;
  if (/^\s{4,}\S/.test(raw) && (l.match(CODE_SYMBOLS) || []).length >= 2) return true;
  return false;
}

/** Vrai si le texte est de la langue naturelle (pas du code). */
export function isProse(text) {
  if (typeof text !== "string") return false;
  const s = text.trim();
  if (!s) return false;
  const lines = s.split("\n").filter((l) => l.trim());
  const codeLines = lines.filter(isCodeLine).length;
  if (codeLines > 0 && codeLines / lines.length >= 0.3) return false;
  const w = words(s);
  if (w.length < 2) return false;
  const symbols = (s.match(CODE_SYMBOLS) || []).length;
  if (symbols / s.length > 0.06) return false;
  if (/[a-z][A-Z]\w*\(|\w_\w|\w\.\w+\(|::|->|=>|!=|==|&&|\|\|/.test(s)) return false;
  return true;
}

/** Vrai si le contenu doit être affiché dans l'éditeur de code. */
export function looksLikeCode(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  if (isProse(text)) return false;
  const lines = text.split("\n").filter((l) => l.trim());
  const codeLines = lines.filter(isCodeLine).length;
  if (codeLines === 0) {
    // Code collé sur une ligne : densité de symboles élevée
    const s = text.trim();
    const sym = (s.match(CODE_SYMBOLS) || []).length;
    return sym >= 4 && sym / s.length > 0.08;
  }
  return codeLines / lines.length >= 0.4;
}

/** Devine le langage d'un extrait de code. */
export function sniffLanguage(code) {
  if (!code || typeof code !== "string") return null;
  const s = code;
  if (/^\s*\(\s*(defun|defvar|defparameter|defmacro|setq|setf|format)\b/m.test(s)) return "lisp";
  if (/^\s*\(\s*(ns|defn)\b/m.test(s)) return "clojure";
  if (/^\s*\(\s*define\b/m.test(s)) return "scheme";
  if (/^\s*(def |class \w+.*:\s*$|from \S+ import |import \w+\s*$|elif |print\()/m.test(s) || /:\s*\n\s{2,}\S/.test(s)) return "python";
  if (/\b(public|private|protected)\s+(static\s+)?(class|void|int|String|boolean)\b/.test(s) || /System\.out\.print/.test(s) || /^\s*import\s+java\./m.test(s)) return "java";
  if (/#include\s*[<"]/.test(s) || /\bstd::/.test(s)) return /\bstd::|cout|class\s/.test(s) ? "cpp" : "c";
  if (/\bfn\s+\w+\s*\(/.test(s) || /\blet\s+mut\b/.test(s)) return "rust";
  if (/^\s*package\s+\w+\s*$/m.test(s) || /\bfunc\s+\w+\s*\(/.test(s) || /:=/.test(s) && /\bfmt\./.test(s)) return "go";
  if (/\b(interface|type)\s+\w+\s*[=<{]/.test(s) || /\)\s*:\s*(string|number|boolean|void)\b/.test(s) || /\w+\s*:\s*(string|number|boolean)\s*[;,=)]/.test(s)) return "typescript";
  if (/\b(const|let|var)\s+[\w{[]+\s*=/.test(s) || /=>/.test(s) || /console\.\w+\(/.test(s) || /\bfunction\b/.test(s) || /^\s*(import|export)\s/m.test(s)) return "javascript";
  if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(s) && /\b(FROM|INTO|SET|TABLE|WHERE)\b/i.test(s)) return "sql";
  if (/^\s*<\/?[a-zA-Z][^>]*>/m.test(s)) return "html";
  if (/^\s*[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(s)) return "css";
  if (/^\s*[{[]/.test(s.trim()) && /"\s*:\s*/.test(s)) return "json";
  if (/^\s*(\$\s|#!\/bin\/|sudo |apt(-get)? |npm |npx |yarn |pnpm |pip3? |git |docker |kubectl |cd |ls |mkdir |curl )/m.test(s)) return "bash";
  return null;
}

/** Normalise une étiquette de fence (```JS → javascript). */
export function normalizeLang(label) {
  const k = String(label || "").trim().toLowerCase().replace(/[{}]/g, "").split(/\s+/)[0] || "";
  return LANGS[k] || k;
}

function isProseLabel(label) {
  return PROSE_FENCE_LABELS.has(String(label || "").trim().toLowerCase());
}

// ── 1. Blocs ``` ─────────────────────────────────────────────────────────
function fixFence(label, body) {
  const content = body.replace(/^\n+|\s+$/g, "");
  if (!content.trim()) return "";
  const knownLang = LANGS[String(label || "").trim().toLowerCase()];
  // Prose dans un bloc de code → texte normal
  if ((isProseLabel(label) || !knownLang) && isProse(content)) return `\n${content}\n`;
  if (knownLang && isProse(content) && !isCodeLine(content.split("\n")[0])) return `\n${content}\n`;
  // Code → bloc avec langage explicite
  let lang = knownLang ? String(label).trim() : (isProseLabel(label) ? "" : String(label || "").trim());
  if (!lang || isProseLabel(lang)) lang = sniffLanguage(content) || "text";
  return `\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
}

// ── 2. Code en ligne `...` ───────────────────────────────────────────────
function isInlineProse(inner) {
  const s = inner.trim();
  if (!s) return true;
  if (SHELL_CMDS.test(s) && /\s/.test(s) && !/[.!?]$/.test(s)) return false; // `git commit -m`
  const w = words(s);
  if (w.length < 2) return false;        // `map`, `useState` : identifiant → on garde
  if (!isProse(s)) return false;
  if (/[_$]|\w\(|\(\)|\.\w/.test(s)) return false;
  return true;
}

function fixInlineCode(segment) {
  return segment.replace(/(`+)([^`\n]+?)\1/g, (m, ticks, inner) => {
    if (isInlineProse(inner)) return inner.trim();
    // Code en ligne très long (plusieurs instructions) → on le garde mais il
    // sera remis en bloc par l'étape 3 s'il est seul sur sa ligne.
    return m;
  });
}

// ── 3. Code non encadré ──────────────────────────────────────────────────
function fenceLooseCode(segment) {
  const lines = segment.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    // Ligne entière en `code` contenant plusieurs instructions → bloc
    const wholeInline = line.trim().match(/^`([^`]+)`$/);
    if (wholeInline && looksLikeCode(wholeInline[1]) && /[;{}]|\s(=|=>)\s/.test(wholeInline[1])) {
      line = wholeInline[1];
      lines[i] = line;
    }
    // "Exemple : const x = 1;" → sépare le préfixe texte du code
    const prefixed = line.match(/^(\s*[^`:\n]{2,60}?:)\s+(.+)$/);
    if (prefixed && !isCodeLine(prefixed[1]) && isCodeLine(prefixed[2]) && looksLikeCode(prefixed[2]) && !/https?$/.test(prefixed[1])) {
      out.push(prefixed[1]);
      lines[i] = prefixed[2];
      line = prefixed[2];
    }
    if (!isCodeLine(line)) { out.push(line); i++; continue; }

    // Bloc de code : lignes de code consécutives (lignes vides internes et
    // lignes indentées tolérées)
    let j = i;
    const block = [];
    while (j < lines.length) {
      const l = lines[j];
      if (isCodeLine(l) || (/^\s{2,}\S/.test(l) && !isProse(l)) || /^\s*[}\])]/.test(l) || /^\s*(#|\/\/|--|;)\s?\S*/.test(l) && block.length && !/^\s*#{1,6}\s/.test(l)) {
        block.push(l); j++; continue;
      }
      if (!l.trim() && j + 1 < lines.length && isCodeLine(lines[j + 1]) && block.length) {
        block.push(l); j++; continue;
      }
      break;
    }
    const code = block.join("\n").replace(/\s+$/, "");
    const lang = sniffLanguage(code);
    // Une seule ligne isolée : on n'encadre que si c'est sûr
    const single = block.filter((l) => l.trim()).length === 1;
    if (single && !(lang && looksLikeCode(code))) { out.push(...block); i = j; continue; }
    if (out.length && out[out.length - 1].trim()) out.push("");
    out.push("```" + (lang || "text"), code, "```");
    if (j < lines.length && lines[j].trim()) out.push("");
    i = j;
  }
  return out.join("\n");
}

/**
 * Répare le Markdown d'un champ de fiche. Idempotent : l'appliquer deux fois
 * donne le même résultat.
 */
export function normalizeCardMarkdown(input) {
  if (typeof input !== "string" || !input) return input;
  let text = input.replace(/\r\n?/g, "\n");

  // Fences ``` mono-ligne : ```js const a = 1;```  → multi-ligne
  text = text.replace(/```([\w+#-]*)[ \t]+([^\n`]+?)```/g, (m, lang, body) => {
    if (!lang && !looksLikeCode(body)) return `\n\`\`\`\n${body}\n\`\`\`\n`;
    if (lang && !LANGS[lang.toLowerCase()] && !isProseLabel(lang)) return `\n\`\`\`\n${lang} ${body}\n\`\`\`\n`;
    return `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
  });

  // Découpe en segments : blocs ``` / texte
  const parts = [];
  const re = /```([^\n`]*)\n([\s\S]*?)(?:```|$(?![\s\S]))/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "fence", label: m[1], body: m[2] });
    last = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  const rebuilt = parts.map((p) => {
    if (p.type === "fence") return fixFence(p.label, p.body);
    return fenceLooseCode(fixInlineCode(p.value));
  }).join("");

  return rebuilt
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");
}

const CARD_TEXT_FIELDS = ["front", "back", "example", "explanation", "notes", "context"];

/** Répare tous les champs texte d'une fiche (retourne une NOUVELLE fiche). */
export function fixCardFormatting(card) {
  if (!card || typeof card !== "object") return card;
  let changed = false;
  const next = { ...card };
  for (const f of CARD_TEXT_FIELDS) {
    if (typeof card[f] === "string" && card[f]) {
      const fixed = normalizeCardMarkdown(card[f]);
      if (fixed !== card[f]) { next[f] = fixed; changed = true; }
    }
  }
  return changed ? next : card;
}

export function fixCardsFormatting(cards) {
  return Array.isArray(cards) ? cards.map(fixCardFormatting) : cards;
}

/** Vrai si la fiche présente un défaut de format réparable. */
export function cardNeedsFormatFix(card) {
  return fixCardFormatting(card) !== card;
}

export default normalizeCardMarkdown;

// ── Décisions d'affichage (utilisées par RichText) ─────────────────────────
export const DISPLAY_PROSE_LABELS = new Set(["text", "txt", "plain", "plaintext", "english", "en", "fr", "french", "francais", "français", "dialogue", "prose", "markdown", "md", "anglais"]);
const HARD_CODE_SIGNS = /[{};=]|\w\(|\(\)|=>|->|::|\$\w|<\/?\w+[^>]*>|^\s*[#@]\w/m;

/** Bloc ``` : faut-il l'afficher en texte normal plutôt que dans l'éditeur ? */
export function shouldRenderBlockAsText(label, code) {
  try {
    const s = String(code ?? "");
    if (!s.trim()) return true;
    const l = String(label || "").trim().toLowerCase();
    if (l && !DISPLAY_PROSE_LABELS.has(l)) return false; // langage réel déclaré → éditeur
    if (HARD_CODE_SIGNS.test(s)) return false;
    if (s.split("\n").some((x) => x.trim() && isCodeLine(x))) return false;
    return isProse(s);
  } catch { return false; }
}

/** `code` en ligne : est-ce en fait une phrase (à afficher sans bleu) ? */
export function shouldRenderInlineAsText(code) {
  try {
    const s = String(code ?? "").trim();
    if (!s) return true;
    if (s.split(/\s+/).length < 3) return false;
    if (/[_$]|\w\(|\(\)|[{};=<>]|\.\w|^-{1,2}\w/.test(s)) return false;
    if (SHELL_CMDS.test(s) && !/[.!?]$/.test(s)) return false;
    return isProse(s);
  } catch { return false; }
}
