import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTIF_GROUPS,
  buildNotifications,
  countUnread,
  isExpiredInsight,
} from "../lib/notifications.js";

test("Notifications : Les groupes sont axés sur les insights et non la gamification", () => {
  const groupIds = NOTIF_GROUPS.map((g) => g.id);
  assert.ok(groupIds.includes("insights"), "Le groupe insights doit exister");
  assert.ok(!groupIds.includes("progress"), "L'ancien groupe de gamification progress doit être absent");
});

test("Notifications : Détection d'insight de rétention faible", () => {
  const notifs = buildNotifications({
    retentionRate: 58,
    totalCards: 25,
  });
  const retentionNotif = notifs.find((n) => n.id.startsWith("insight-retention-low"));
  assert.ok(retentionNotif, "Doit émettre un insight de rétention faible");
  assert.equal(retentionNotif.group, "insights");
  assert.equal(retentionNotif.cta.action, "stats");
});

test("Notifications : Détection d'insight sur les cartes dormantes", () => {
  const notifs = buildNotifications({
    dormantCount: 7,
  });
  const dormantNotif = notifs.find((n) => n.id.startsWith("insight-dormant"));
  assert.ok(dormantNotif, "Doit émettre un insight de fiches dormantes");
  assert.equal(dormantNotif.group, "insights");
  assert.equal(dormantNotif.cta.action, "dormant");
});

test("Notifications : Détection d'insight sur l'incubation en anglais", () => {
  const notifs = buildNotifications({
    incubating: [{ id: "1", remaining: 1 }, { id: "2", remaining: 4 }],
  });
  const engNotif = notifs.find((n) => n.id.startsWith("insight-english-incubation"));
  assert.ok(engNotif, "Doit émettre un insight d'incubation");
  assert.equal(engNotif.group, "insights");
  assert.equal(engNotif.cta.action, "english");
});

test("Notifications : Détection d'un module déséquilibré", () => {
  const notifs = buildNotifications({
    weakCategory: { name: "Droit Fiscal", count: 8, errorRate: 45 },
  });
  const weakCatNotif = notifs.find((n) => n.id.startsWith("insight-weak-cat-Droit Fiscal"));
  assert.ok(weakCatNotif, "Doit émettre un insight sur le module faible");
  assert.equal(weakCatNotif.cta.action, "review_category");
});

test("Notifications : Exclusion totale de la gamification (quests, streaks, energy)", () => {
  const notifs = buildNotifications({
    questBoard: { total: 3, doneCount: 1, daily: [{ done: false, label: "Test" }] },
    streak: 10,
    reviewedToday: 0,
    energy: { value: 10, low: 25 },
  });
  const gamified = notifs.filter((n) =>
    n.id.includes("quest") || n.id.includes("streak") || n.id.includes("energy")
  );
  assert.equal(gamified.length, 0, "Aucune notification de gamification ne doit être émise");
});

test("Notifications : Expiration et TTL 48h des insights", () => {
  const oldTs = Date.now() - 50 * 3600 * 1000; // 50 heures
  const freshTs = Date.now() - 10 * 3600 * 1000; // 10 heures

  const oldInsight = { id: "old", group: "insights", timestamp: oldTs };
  const freshInsight = { id: "fresh", group: "insights", timestamp: freshTs };

  assert.equal(isExpiredInsight(oldInsight, {}), true, "Un insight de plus de 48h doit être expiré");
  assert.equal(isExpiredInsight(freshInsight, {}), false, "Un insight récent ne doit pas être expiré");

  // Insight dismissé
  assert.equal(isExpiredInsight(freshInsight, { dismissedInsights: { fresh: Date.now() } }), true, "Un insight dismissé est expiré");
});
