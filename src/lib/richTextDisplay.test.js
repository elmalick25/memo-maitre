import { describe, it, expect } from "vitest";
import { normalizeCardMarkdown as fix, shouldRenderBlockAsText as blockText, shouldRenderInlineAsText as inlineText, fixCardFormatting } from "./cardFormatFixer";

describe("blocs : texte ou éditeur", () => {
  it("phrase anglaise étiquetée text → texte", () => expect(blockText("text", "I would like to book a table for two people tonight.")).toBe(true));
  it("phrase anglaise étiquetée english → texte", () => expect(blockText("english", "How are you doing today, my friend?")).toBe(true));
  it("phrase française sans étiquette → texte", () => expect(blockText("", "Je voudrais réserver une table pour ce soir.")).toBe(true));
  it("dialogue A/B → texte", () => expect(blockText("", "A: Where is the station?\nB: It is next to the bank.")).toBe(true));
  it("js déclaré → éditeur", () => expect(blockText("js", "const a = 1;")).toBe(false));
  it("python déclaré même court → éditeur", () => expect(blockText("python", "print('hi')")).toBe(false));
  it("vrai code étiqueté text → éditeur", () => expect(blockText("text", "function add(a, b) {\n  return a + b;\n}")).toBe(false));
  it("commande shell sans étiquette → éditeur", () => expect(blockText("", "npm install react")).toBe(false));
  it("SQL sans étiquette → éditeur", () => expect(blockText("", "SELECT name FROM users WHERE id = 1")).toBe(false));
  it("HTML sans étiquette → éditeur", () => expect(blockText("", "<div class=\"box\">Hi</div>")).toBe(false));
  it("Lisp sans étiquette → éditeur", () => expect(blockText("", "(defun square (x) (* x x))")).toBe(false));
  it("entrées invalides ne plantent pas", () => { expect(() => blockText(null, undefined)).not.toThrow(); expect(() => blockText(42, {})).not.toThrow(); });
});

describe("code en ligne : bleu ou texte", () => {
  it("phrase → texte", () => expect(inlineText("I am going to the store now")).toBe(true));
  it("identifiant → bleu", () => expect(inlineText("useState")).toBe(false));
  it("appel de fonction → bleu", () => expect(inlineText("map(x => x * 2)")).toBe(false));
  it("commande git → bleu", () => expect(inlineText("git commit -m message")).toBe(false));
  it("option CLI → bleu", () => expect(inlineText("--save-dev flag here")).toBe(false));
  it("chemin/méthode → bleu", () => expect(inlineText("array.length is used")).toBe(false));
  it("deux mots → bleu (terme technique)", () => expect(inlineText("pull request")).toBe(false));
  it("vide/null ne plante pas", () => { expect(() => inlineText(null)).not.toThrow(); });
});

describe("réparateur : solidité", () => {
  const samples = [
    "```text\nI would like a coffee, please.\n```",
    "Dis `I am going to the store now` souvent.",
    "```js\nconst a = 1;\n```",
    "Voici :\nfunction f() {\n  return 1;\n}\nFin.",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    "- point un\n- point deux",
    "# Titre\nTexte",
  ];
  for (const s of samples) {
    it(`stable en 2 passes : ${s.slice(0, 25)}`, () => expect(fix(fix(s))).toBe(fix(s)));
  }
  it("tableaux/listes/titres intacts", () => {
    expect(fix(samples[4])).toContain("|---|");
    expect(fix(samples[5])).toContain("- point deux");
    expect(fix(samples[6])).toContain("# Titre");
  });
  it("vrai code conservé", () => expect(fix(samples[2])).toContain("```js"));
  it("code étalé remis dans l'éditeur", () => expect(fix(samples[3])).toContain("```"));
  it("entrées vides/invalides", () => { for (const v of ["", null, undefined, 0]) expect(() => fix(v)).not.toThrow(); });
  it("texte très long sans planter ni lenteur", () => {
    const big = "This is a normal sentence about learning. ".repeat(5000);
    const t = Date.now(); fix(big); expect(Date.now() - t).toBeLessThan(2000);
  });
  it("fence non fermée ne plante pas", () => expect(() => fix("```js\nconst a = 1;")).not.toThrow());
  it("fiche sans champs texte ne plante pas", () => expect(() => fixCardFormatting({ id: 1 })).not.toThrow());
});
