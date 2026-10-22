import { describe, it, expect } from "vitest";
import { normalizeCardMarkdown as fix, fixCardFormatting, isProse, looksLikeCode } from "./cardFormatFixer.js";

const fences = (s) => (s.match(/```/g) || []).length / 2;

describe("1. Éditeur affiché sur du texte", () => {
  it("bloc ``` sans langage contenant une phrase anglaise → texte", () => {
    const out = fix("Exemple :\n```\nI have been working here for three years.\n```");
    expect(fences(out)).toBe(0);
    expect(out).toContain("I have been working here for three years.");
  });
  it("bloc ```text / ```english contenant un dialogue → texte", () => {
    expect(fences(fix("```text\nA: How are you doing today?\nB: I'm fine, thanks for asking.\n```"))).toBe(0);
    expect(fences(fix("```english\nShe didn't go to the party.\n```"))).toBe(0);
  });
  it("phrase étiquetée à tort ```python → texte", () => {
    expect(fences(fix("```python\nYou should have told me earlier.\n```"))).toBe(0);
  });
  it("phrase française dans un bloc → texte", () => {
    expect(fences(fix("```\nLa fonction renvoie toujours une nouvelle liste.\n```"))).toBe(0);
  });
  it("bloc mono-ligne ```He is tall.``` → texte", () => {
    expect(fences(fix("Voici : ```He is taller than his brother.```"))).toBe(0);
  });
});

describe("2. Texte en bleu sans raison (code en ligne)", () => {
  it("phrase entre backticks → texte normal", () => {
    const out = fix("On dit `I look forward to meeting you` dans un mail.");
    expect(out).toBe("On dit I look forward to meeting you dans un mail.");
  });
  it("garde le vrai code en ligne", () => {
    expect(fix("Utilise `useState()` ici.")).toContain("`useState()`");
    expect(fix("La méthode `map` transforme.")).toContain("`map`");
    expect(fix("Lance `npm install --save react`.")).toContain("`npm install --save react`");
    expect(fix("Écris `x = x + 1`.")).toContain("`x = x + 1`");
  });
});

describe("3. Code étalé comme du texte", () => {
  it("code Python multi-lignes sans fence → bloc python", () => {
    const out = fix("Voici la fonction :\ndef add(a, b):\n    return a + b\nprint(add(1, 2))\nFin de l'exemple.");
    expect(out).toContain("```python");
    expect(out).toContain("def add(a, b):\n    return a + b");
    expect(out).toMatch(/```\n+Fin de l'exemple\./);
  });
  it("code JS collé sur une ligne → bloc javascript", () => {
    const out = fix("const total = items.reduce((a, b) => a + b, 0); console.log(total);");
    expect(out).toContain("```javascript");
  });
  it("préfixe texte + code sur la même ligne", () => {
    const out = fix("Exemple : const user = { name: 'Ada' };");
    expect(out).toContain("Exemple :");
    expect(out).toContain("```javascript\nconst user = { name: 'Ada' };\n```");
  });
  it("SQL non encadré", () => {
    expect(fix("SELECT name FROM users WHERE age > 18;")).toContain("```sql");
  });
  it("bloc ``` sans langage contenant du code → langage détecté", () => {
    expect(fix("```\nfunction hi() {\n  return 1;\n}\n```")).toContain("```javascript");
  });
  it("Java dans une ligne entière en backticks", () => {
    expect(fix("`public static void main(String[] args) { System.out.println(1); }`")).toContain("```java");
  });
});

describe("Ce qui ne doit PAS changer", () => {
  it("un vrai bloc de code reste intact", () => {
    const src = "```js\nconst a = 1;\n```";
    expect(fix(src)).toBe(src);
  });
  it("texte, listes, titres, tableaux intacts", () => {
    const src = "### 🔍 2. Concept\n- If it rains, I will stay home.\n- Return to the office.\n\n| A | B |\n|---|---|\n| x | y |";
    expect(fix(src)).toBe(src);
  });
  it("phrases avec 'for', 'return', 'import' restent du texte", () => {
    const src = "For example, we import goods from China.\nReturn the book tomorrow.";
    expect(fix(src)).toBe(src);
  });
  it("dialogue A/B intact", () => {
    const src = "**A :** Where are you going?\n**B :** I'm going to the market (Je vais au marché).";
    expect(fix(src)).toBe(src);
  });
  it("idempotent", () => {
    const inputs = [
      "Voici :\ndef f(x):\n    return x\n",
      "```\nHello there my friend.\n```",
      "On dit `see you soon` ici. Exemple : let n = 3;",
    ];
    for (const s of inputs) expect(fix(fix(s))).toBe(fix(s));
  });
});

describe("fixCardFormatting (bouton Optimiser / création)", () => {
  it("répare front/back/example et garde les autres champs", () => {
    const card = { id: "1", category: "Anglais", front: "`How do you say hello?`", back: "```\nYou say hello.\n```", example: "ok", level: 3 };
    const out = fixCardFormatting(card);
    expect(out.front).toBe("How do you say hello?");
    expect(out.back).toBe("You say hello.");
    expect(out.level).toBe(3);
    expect(out.id).toBe("1");
  });
  it("renvoie la même fiche si rien à corriger", () => {
    const card = { front: "Qu'est-ce qu'une closure ?", back: "```js\nconst f = () => x;\n```" };
    expect(fixCardFormatting(card)).toBe(card);
  });
});

describe("helpers", () => {
  it("isProse / looksLikeCode", () => {
    expect(isProse("I would rather stay at home tonight.")).toBe(true);
    expect(looksLikeCode("for (let i = 0; i < n; i++) { sum += i; }")).toBe(true);
    expect(looksLikeCode("I would rather stay at home tonight.")).toBe(false);
  });
});
