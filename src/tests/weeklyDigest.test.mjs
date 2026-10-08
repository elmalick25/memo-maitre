import test from "node:test";
import assert from "node:assert/strict";
import {
  isWeeklyDigestTime,
  getWeekKey,
  computeWeeklyDigest,
} from "../lib/weeklyDigest.js";
import { buildNotifications } from "../lib/notifications.js";

test("weeklyDigest : isWeeklyDigestTime active le dimanche soir et lundi matin", () => {
  // Dimanche 19h
  const sundayEvening = new Date("2026-10-04T19:00:00");
  assert.equal(isWeeklyDigestTime(sundayEvening), true, "Doit être actif le dimanche à 19h");

  // Dimanche 14h (trop tôt)
  const sundayAfternoon = new Date("2026-10-04T14:00:00");
  assert.equal(isWeeklyDigestTime(sundayAfternoon), false, "Ne doit pas être actif le dimanche avant 18h");

  // Lundi 10h
  const mondayMorning = new Date("2026-10-05T10:00:00");
  assert.equal(isWeeklyDigestTime(mondayMorning), true, "Doit être actif le lundi matin");

  // Mercredi 15h
  const wednesday = new Date("2026-10-07T15:00:00");
  assert.equal(isWeeklyDigestTime(wednesday), false, "Ne doit pas être actif en milieu de semaine");
});

test("weeklyDigest : computeWeeklyDigest agrège l'activité, les victoires et le module star", () => {
  const refDate = new Date("2026-10-04T20:00:00"); // Dimanche 4 octobre 2026

  const expressions = [
    {
      id: "card-1",
      front: "Contract of adhesion",
      category: "Droit",
      level: 3,
      interval: 6,
      lapses: 2, // ex-leeches
      reviewHistory: [
        { date: "2026-10-01T10:00:00Z", score: 3 },
      ],
    },
    {
      id: "card-2",
      front: "Consideration",
      category: "Droit",
      level: 4,
      interval: 10,
      lapses: 0,
      reviewHistory: [
        { date: "2026-10-02T11:00:00Z", score: 5 },
      ],
    },
    {
      id: "card-3",
      front: "To hit the nail on the head",
      category: "Anglais",
      level: 1,
      interval: 1,
      lapses: 0,
      reviewHistory: [
        { date: "2026-10-03T09:00:00Z", score: 3 },
      ],
    },
  ];

  const sessions = [
    { date: "2026-10-01T10:00:00Z", count: 1 },
    { date: "2026-10-02T11:00:00Z", count: 1 },
    { date: "2026-10-03T09:00:00Z", count: 1 },
  ];

  const digest = computeWeeklyDigest(expressions, sessions, refDate);

  assert.ok(digest, "Le bilan doit être généré");
  assert.equal(digest.activeDays, 3, "Doit compter 3 jours actifs");
  assert.equal(digest.totalReviews, 3, "Doit compter 3 révisions");
  assert.equal(digest.starCategory, "Droit", "Le module star doit être Droit");
  assert.equal(digest.conqueredLeechesCount, 1, "Doit détecter 1 ex-leeches domptée");
  assert.ok(digest.focusRecommendation.length > 10, "Doit formuler un conseil stratégique");
});

test("weeklyDigest : buildNotifications émet l'insight spécial avec action weekly_digest", () => {
  const mockDigest = {
    weekKey: "2026-W40",
    totalReviews: 45,
    activeDays: 4,
    retentionRate: 88,
  };

  const notifs = buildNotifications({
    weeklyDigest: mockDigest,
  });

  const weeklyNotif = notifs.find((n) => n.id.startsWith("insight-weekly-digest"));
  assert.ok(weeklyNotif, "La notification de bilan hebdo doit être émise");
  assert.equal(weeklyNotif.group, "insights");
  assert.equal(weeklyNotif.cta.action, "weekly_digest");
  assert.equal(weeklyNotif.payload, mockDigest);
});
