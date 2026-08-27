// src/lib/notifications.js
// ═══════════════════════════════════════════════════════════════════════════
// CENTRE DE NOTIFICATIONS — le cerveau.
//
// Le dashboard était saturé (routine, quêtes, fiches qui bloquent…). Tout ce
// bruit devient ici un FLUX priorisé, consultable à la demande via la cloche
// de la topbar. Ce module est 100 % pur : il transforme l'état de l'app en une
// liste de notifications triées, groupées, actionnables.
//
// Chaque notification :
//   { id, group, priority, icon, title, body, cta, tone, meta, sticky }
//   - id       : stable (sert au "lu" / "reporté")
//   - group    : "urgent" | "today" | "progress" | "info"
//   - priority : 0-100, tri décroissant
//   - cta      : { label, action } — action = clé résolue par MemoMaster
// ═══════════════════════════════════════════════════════════════════════════

export const NOTIF_GROUPS = [
  { id: "urgent", label: "Urgent", icon: "🚨", color: "#EF4444" },
  { id: "today", label: "Aujourd'hui", icon: "🎯", color: "#8B5CF6" },
  { id: "progress", label: "Progression", icon: "📈", color: "#10B981" },
  { id: "info", label: "Infos", icon: "💡", color: "#94A3B8" },
];

const STORE_KEY = "mm_notif_state_v1";

/** État local : { read: {id: ts}, snoozed: {id: dateISO}, lastOpen: ts } */
export function loadNotifState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      read: parsed.read && typeof parsed.read === "object" ? parsed.read : {},
      snoozed: parsed.snoozed && typeof parsed.snoozed === "object" ? parsed.snoozed : {},
      lastOpen: Number(parsed.lastOpen) || 0,
    };
  } catch {
    return { read: {}, snoozed: {}, lastOpen: 0 };
  }
}

export function saveNotifState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* quota / mode privé : on dégrade silencieusement */
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Une notif reportée l'est jusqu'à la fin de la journée indiquée. */
export function isSnoozed(notif, state) {
  const until = state?.snoozed?.[notif.id];
  return !!until && until >= todayISO();
}

/**
 * Construit le flux complet.
 * @param {object} ctx — données brutes de MemoMaster
 */
export function buildNotifications(ctx = {}) {
  const {
    dueCount = 0,
    overdueCount = 0,
    routineSummary = null,
    routineFraming = null,
    questBoard = null,
    leeches = [],
    incubating = [],
    streak = 0,
    reviewedToday = 0,
    energy = null,
    syncError = null,
    lastSyncAt = null,
    newCardsToday = 0,
  } = ctx;

  const out = [];
  const push = (n) => out.push(n);

  // ── 1. Sync KO — bloquant, toujours en tête ────────────────────────────
  if (syncError) {
    push({
      id: "sync-error",
      group: "urgent",
      priority: 100,
      icon: "⚠️",
      tone: "danger",
      title: "Synchronisation échouée",
      body: String(syncError).slice(0, 140),
      cta: { label: "Réessayer", action: "sync" },
      sticky: true,
    });
  }

  // ── 2. Fiches qui bloquent (leeches) ───────────────────────────────────
  if (leeches.length > 0) {
    push({
      id: `leeches-${leeches.length}`,
      group: "urgent",
      priority: 92,
      icon: "🧱",
      tone: "danger",
      title: `${leeches.length} fiche${leeches.length > 1 ? "s" : ""} bloque${leeches.length > 1 ? "nt" : ""}`,
      body:
        leeches
          .slice(0, 3)
          .map((l) => `• ${String(l.front || l.title || "").slice(0, 46)}`)
          .join("\n") || "Elles reviennent en boucle sans être retenues.",
      cta: { label: "Les traiter", action: "leeches" },
      meta: { count: leeches.length },
    });
  }

  // ── 3. Révisions en retard / dues ──────────────────────────────────────
  if (overdueCount > 0) {
    push({
      id: "overdue",
      group: "urgent",
      priority: 88,
      icon: "⏰",
      tone: "danger",
      title: `${overdueCount} fiche${overdueCount > 1 ? "s" : ""} en retard`,
      body: "Plus elles attendent, plus la rétention chute. 10 minutes suffisent souvent.",
      cta: { label: "Rattraper", action: "review" },
      meta: { count: overdueCount },
    });
  } else if (dueCount > 0) {
    push({
      id: "due",
      group: "today",
      priority: 70,
      icon: "🃏",
      tone: "info",
      title: `${dueCount} fiche${dueCount > 1 ? "s" : ""} à réviser`,
      body: "Ta session du jour est prête.",
      cta: { label: "Réviser", action: "review" },
      meta: { count: dueCount },
    });
  }

  // ── 4. Incubation anglais (7 jours quotidiens) ─────────────────────────
  if (incubating.length > 0) {
    const soonest = incubating.reduce(
      (min, c) => Math.min(min, Number(c.remaining) || 0),
      99
    );
    push({
      id: `incubation-${incubating.length}`,
      group: "today",
      priority: 74,
      icon: "🇬🇧",
      tone: "accent",
      title: `${incubating.length} fiche${incubating.length > 1 ? "s" : ""} anglais en incubation`,
      body: `Contact quotidien obligatoire pendant 7 jours. La plus avancée sort dans ${soonest} jour${soonest > 1 ? "s" : ""}.`,
      cta: { label: "Réviser l'anglais", action: "english" },
      meta: { count: incubating.length },
    });
  }

  // ── 5. Routine du jour ─────────────────────────────────────────────────
  if (routineSummary && routineSummary.total > 0) {
    const remaining = routineSummary.total - (routineSummary.doneCount || 0);
    if (remaining > 0) {
      push({
        id: `routine-${todayISO()}-${remaining}`,
        group: "today",
        priority: 66,
        icon: routineFraming?.icon || "🧭",
        tone: routineFraming?.tone === "nearmiss" ? "warn" : "info",
        title: routineFraming?.title || `Ma routine · ${routineSummary.doneCount}/${routineSummary.total}`,
        body:
          routineFraming?.message ||
          `${remaining} étape${remaining > 1 ? "s" : ""} pour boucler ta journée.`,
        cta: { label: "Ouvrir la routine", action: "routine" },
        meta: { done: routineSummary.doneCount, total: routineSummary.total },
      });
    } else {
      push({
        id: `routine-done-${todayISO()}`,
        group: "progress",
        priority: 30,
        icon: "✅",
        tone: "success",
        title: "Routine bouclée",
        body: "Les 100 % du jour sont dans la poche.",
      });
    }
  }

  // ── 6. Quêtes du jour + hebdo ──────────────────────────────────────────
  if (questBoard && questBoard.total > 0) {
    const pending = (questBoard.daily || []).filter((q) => !q.done);
    if (pending.length > 0) {
      push({
        id: `quests-${todayISO()}-${questBoard.doneCount}`,
        group: "today",
        priority: 60,
        icon: "🎯",
        tone: "accent",
        title: `Quêtes du jour · ${questBoard.doneCount}/${questBoard.total}`,
        body: pending
          .slice(0, 3)
          .map((q) => `• ${q.label || q.title} (${q.progress ?? 0}/${q.target ?? 1})`)
          .join("\n"),
        cta: { label: "Voir les quêtes", action: "quests" },
        meta: { done: questBoard.doneCount, total: questBoard.total },
      });
    } else if (questBoard.allDone) {
      push({
        id: `quests-done-${todayISO()}`,
        group: "progress",
        priority: 34,
        icon: "🏆",
        tone: "success",
        title: "Toutes les quêtes du jour sont tombées",
        body: "Bonus combo empoché. Rendez-vous demain.",
      });
    }
  }
  if (questBoard?.weekly && !questBoard.weekly.done) {
    const w = questBoard.weekly;
    push({
      id: `weekly-${w.id}`,
      group: "progress",
      priority: 40,
      icon: "🏔️",
      tone: "info",
      title: `Quête de la semaine · ${w.progress ?? 0}/${w.target ?? 1}`,
      body: w.label || w.title || "Objectif hebdomadaire en cours.",
      cta: { label: "Voir", action: "quests" },
    });
  }

  // ── 7. Série en danger ─────────────────────────────────────────────────
  if (streak > 0 && reviewedToday === 0) {
    push({
      id: `streak-risk-${todayISO()}`,
      group: "urgent",
      priority: 84,
      icon: "🔥",
      tone: "warn",
      title: `Série de ${streak} jour${streak > 1 ? "s" : ""} en danger`,
      body: "Une seule fiche révisée suffit à la sauver aujourd'hui.",
      cta: { label: "Sauver la série", action: "review" },
    });
  }

  // ── 8. Énergie / charge ────────────────────────────────────────────────
  if (energy && Number(energy.value) <= Number(energy.low ?? 25)) {
    push({
      id: `energy-${todayISO()}`,
      group: "info",
      priority: 20,
      icon: "🔋",
      tone: "warn",
      title: "Énergie basse",
      body: "Vise une micro-session de 5 fiches plutôt qu'un marathon.",
    });
  }

  // ── 9. Nouvelles fiches créées aujourd'hui ─────────────────────────────
  if (newCardsToday > 0) {
    push({
      id: `new-cards-${todayISO()}-${newCardsToday}`,
      group: "progress",
      priority: 26,
      icon: "✨",
      tone: "success",
      title: `${newCardsToday} nouvelle${newCardsToday > 1 ? "s" : ""} fiche${newCardsToday > 1 ? "s" : ""} aujourd'hui`,
      body: "Elles entrent dès demain dans le cycle de révision.",
    });
  }

  // ── 10. Dernière synchro ───────────────────────────────────────────────
  if (!syncError && lastSyncAt) {
    const hours = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 3600000);
    if (hours >= 24) {
      push({
        id: `sync-stale-${todayISO()}`,
        group: "info",
        priority: 18,
        icon: "☁️",
        tone: "info",
        title: "Sauvegarde ancienne",
        body: `Dernière synchro il y a ${hours} h.`,
        cta: { label: "Synchroniser", action: "sync" },
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Découpe le flux par groupe, en conservant l'ordre de NOTIF_GROUPS. */
export function groupNotifications(list) {
  return NOTIF_GROUPS.map((g) => ({
    ...g,
    items: list.filter((n) => n.group === g.id),
  })).filter((g) => g.items.length > 0);
}

/** Compte ce qui mérite la pastille rouge (non lu, non reporté). */
export function countUnread(list, state) {
  return list.filter((n) => !state?.read?.[n.id] && !isSnoozed(n, state)).length;
}
