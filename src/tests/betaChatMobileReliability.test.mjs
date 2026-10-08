import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const chat = fs.readFileSync(path.resolve("src/components/BetaChat.jsx"), "utf8");
const css = fs.readFileSync(path.resolve("src/styles/responsive.css"), "utf8");

test("BetaChat suit la session et les fils en temps réel", () => {
  assert.ok(chat.includes("onAuthStateChanged(auth, setUser)"));
  assert.ok(chat.includes("return onSnapshot("));
  assert.ok(chat.includes("unreadForOwner: !isOwner"));
  assert.ok(chat.includes("unreadForTester: isOwner"));
  assert.ok(chat.includes("const batch = writeBatch(db)"));
  assert.ok(chat.includes("await batch.commit()"));
});

test("BetaChat reste utilisable avec le clavier mobile", () => {
  assert.ok(chat.includes('className="beta-chat-panel"'));
  assert.ok(chat.includes('className="beta-chat-composer"'));
  assert.ok(chat.includes('className="beta-chat-input"'));
  assert.ok(css.includes("height: 100dvh !important"));
  assert.ok(css.includes("min-height: 42px !important"));
  assert.ok(css.includes("flex-wrap: nowrap !important"));
});

test("BetaChat ferme proprement et expose une fenêtre modale accessible", () => {
  assert.ok(chat.includes('aria-modal="true"'));
  assert.ok(chat.includes('role="log"'));
  assert.ok(chat.includes('aria-label="Fermer la discussion"'));
  assert.ok(chat.includes('event.key === "Escape"'));
  assert.ok(chat.includes('document.body.style.overflow = "hidden"'));
});
