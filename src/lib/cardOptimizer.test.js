import { describe, it, expect } from "vitest";
import { stripJsonWrapper, parseOptimizationResponse } from "./cardOptimizer";
const slice = [{ id: "c1" }];
const wrap = (o) => "```json\n" + JSON.stringify(o) + "\n```";
const card = (back) => ({ results: [{ id: "c1", cards: [{ front: "Q ?", back, example: "" }] }] });

describe("bouton Optimiser", () => {
  it("garde le bloc de code python d'une fiche", () => {
    const u = parseOptimizationResponse(wrap(card("```python\ndef f(x):\n    return x * 2\n```")), slice);
    expect(u[0].newCards[0].back).toContain("```python");
    expect(u[0].newCards[0].back).toContain("    return x * 2");
  });
  it("réponse sans emballage", () => {
    expect(parseOptimizationResponse(JSON.stringify(card("```js\nconst a = 1;\n```")), slice)[0].newCards[0].back).toContain("```js");
  });
  it("réponse avec phrase avant le JSON", () => {
    const u = parseOptimizationResponse("Voici le résultat :\n" + JSON.stringify(card("Réponse")), slice);
    expect(u[0].newCards[0].back).toBe("Réponse");
  });
  it("répare une phrase anglaise mise dans l'éditeur par l'IA", () => {
    const u = parseOptimizationResponse(wrap(card("```text\nI would like a coffee, please.\n```")), slice);
    expect(u[0].newCards[0].back).not.toContain("```");
  });
  it("répare une phrase en bleu", () => {
    const u = parseOptimizationResponse(wrap(card("Dis `I am going to the store now` souvent.")), slice);
    expect(u[0].newCards[0].back).not.toContain("`");
  });
  it("réponse illisible → aucune modification", () => {
    expect(parseOptimizationResponse("désolé, erreur", slice)).toEqual([]);
  });
  it("emballage simple retiré", () => expect(stripJsonWrapper('```json\n{"a":1}\n```')).toBe('{"a":1}'));
  it("JSON contenant du code intact", () => {
    const j = JSON.stringify({ x: "```js\nconst a=1;\n```" });
    expect(stripJsonWrapper(j)).toBe(j);
  });
});

import { safeParseJSON } from "./textUtils";
describe("lecture des réponses IA (toutes créations de fiches)", () => {
  const code = "```js\nconst a = 1;\n```";
  it("code dans fiche intact, sans emballage", () => expect(safeParseJSON(JSON.stringify({ back: code })).back).toBe(code));
  it("code dans fiche intact, avec emballage", () => expect(safeParseJSON("```json\n" + JSON.stringify({ back: code }) + "\n```").back).toBe(code));
  it("texte avant et après le JSON", () => expect(safeParseJSON("Voici :\n```json\n" + JSON.stringify({ back: code }) + "\n```\nBonne étude").back).toBe(code));
  it("virgule finale réparée", () => expect(safeParseJSON('{"a":1,}').a).toBe(1));
  it("tableau", () => expect(safeParseJSON('[{"a":1}]')[0].a).toBe(1));
});
