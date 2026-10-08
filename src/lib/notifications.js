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
  { id: "insights", label: "Insights & Analyse", icon: "💡", color: "#8B5CF6" },
  { id: "today", label: "À réviser", icon: "🎯", color: "#2563eb" },
  { id: "info", label: "Système", icon: "⚙️", color: "#94A3B8" },
];

const STORE_KEY = "mm_notif_state_v1";

/** État local : { read: {id: ts}, snoozed: {id: dateISO}, dismissedInsights: {id: ts}, lastOpen: ts } */
export function loadNotifState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      read: parsed.read && typeof parsed.read === "object" ? parsed.read : {},
      snoozed: parsed.snoozed && typeof parsed.snoozed === "object" ? parsed.snoozed : {},
      dismissedInsights: parsed.dismissedInsights && typeof parsed.dismissedInsights === "object" ? parsed.dismissedInsights : {},
      lastOpen: Number(parsed.lastOpen) || 0,
    };
  } catch {
    return { read: {}, snoozed: {}, dismissedInsights: {}, lastOpen: 0 };
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

/** Vérifie si un insight a expiré (TTL 48h par défaut pour les insights) */
export function isExpiredInsight(notif, state) {
  if (notif.group !== "insights") return false;
  // Si déjà ignoré/dismissed par l'utilisateur
  if (state?.dismissedInsights?.[notif.id]) return true;
  // TTL temporel : 48h à partir de l'horodatage ou de la date de création
  const createdTs = notif.timestamp || (notif.dateISO ? new Date(notif.dateISO).getTime() : Date.now());
  const ageHours = (Date.now() - createdTs) / (1000 * 60 * 60);
  return ageHours > 48;
}

/**
 * Construit le flux complet axé sur la valeur pédagogique et les insights.
 * Zéro gamification (ni quêtes, ni streaks, ni combos, ni niveau d'énergie).
 * @param {object} ctx — données brutes de MemoMaster
 */
export function buildNotifications(ctx = {}) {
  const {
    dueCount = 0,
    overdueCount = 0,
    leeches = [],
    incubating = [],
    syncError = null,
    lastSyncAt = null,
    // Données d'analyse & métacognition
    retentionRate = null,
    dormantCount = 0,
    weakCategory = null,
    englishOralOpportunity = 0,
    totalCards = 0,
    weeklyDigest = null,
  } = ctx;

  const out = [];
  const push = (n) => out.push(n);

  // ── 0. INSIGHT SPÉCIAL : Bulletin Hebdomadaire d'Analyse (Dimanche soir / Lundi) ──
  if (weeklyDigest) {
    push({
      id: `insight-weekly-digest-${weeklyDigest.weekKey || todayISO()}`,
      group: "insights",
      priority: 86,
      icon: "📋",
      tone: "accent",
      title: "Bilan Hebdomadaire d'Analyse",
      body: `${weeklyDigest.totalReviews || 0} fiches révisées · ${weeklyDigest.activeDays || 0} jours actifs · Rétention : ${weeklyDigest.retentionRate || 85}%.`,
      cta: { label: "Découvrir mon bilan", action: "weekly_digest" },
      timestamp: Date.now(),
      dateISO: todayISO(),
      payload: weeklyDigest,
    });
  }

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

  // ── 2. Rétention critique : Fiches qui bloquent (leeches) ───────────────
  if (leeches.length > 0) {
    push({
      id: `leeches-${leeches.length}`,
      group: "urgent",
      priority: 92,
      icon: "🧱",
      tone: "danger",
      title: `${leeches.length} fiche${leeches.length > 1 ? "s" : ""} bloquante${leeches.length > 1 ? "s" : ""}`,
      body:
        leeches
          .slice(0, 3)
          .map((l) => `• ${String(l.front || l.title || "").slice(0, 46)}`)
          .join("\n") || "Elles reviennent en boucle sans être retenues.",
      cta: { label: "Les débloquer", action: "leeches" },
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
      body: "Plus elles attendent, plus la rétention chute. Une micro-session suffit souvent.",
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

  // ── 4. INSIGHTS : Diagnostic Stats & Métacognition ─────────────────────
  const nowTs = Date.now();
  const todayStr = todayISO();

  if (retentionRate !== null && typeof retentionRate === "number") {
    if (retentionRate < 70 && totalCards >= 10) {
      push({
        id: `insight-retention-low-${todayStr}`,
        group: "insights",
        priority: 78,
        icon: "📊",
        tone: "warn",
        title: `Rétention globale fragile (${retentionRate}%)`,
        body: "L'analyse de tes sessions récentes montre une baisse de consolidation. Consulte tes statistiques pour cibler les modules à réajuster.",
        cta: { label: "Consulter les stats", action: "stats" },
        timestamp: nowTs,
        dateISO: todayStr,
      });
    } else if (retentionRate >= 85 && totalCards >= 15) {
      push({
        id: `insight-retention-high-${todayStr}`,
        group: "insights",
        priority: 55,
        icon: "📈",
        tone: "success",
        title: `Haute stabilité mnésique (${retentionRate}%)`,
        body: "Tes cartes clés sont solidement ancrées. Vérifie tes courbes d'évolution pour planifier tes futurs modules.",
        cta: { label: "Voir ma progression", action: "stats" },
        timestamp: nowTs,
        dateISO: todayStr,
      });
    }
  }

  // Focus module déséquilibré détecté
  if (weakCategory && weakCategory.name && weakCategory.count > 0) {
    push({
      id: `insight-weak-cat-${weakCategory.name}-${todayStr}`,
      group: "insights",
      priority: 74,
      icon: "🎯",
      tone: "warn",
      title: `Point d'attention : « ${weakCategory.name} »`,
      body: `Ce module concentre un taux d'erreur notable (${weakCategory.errorRate || 0}%). Une révision focalisée permettra de stabiliser ces notions.`,
      cta: { label: `Réviser ${weakCategory.name}`, action: "review_category", payload: weakCategory.name },
      timestamp: nowTs,
      dateISO: todayStr,
    });
  }

  // ── 5. INSIGHTS : Immersion & Pratique Anglais ─────────────────────────
  if (incubating.length > 0) {
    const nearGraduation = incubating.filter((c) => Number(c.remaining) <= 2);
    const soonest = incubating.reduce(
      (min, c) => Math.min(min, Number(c.remaining) || 0),
      99
    );
    push({
      id: `insight-english-incubation-${incubating.length}`,
      group: "insights",
      priority: 76,
      icon: "🇬🇧",
      tone: "accent",
      title: nearGraduation.length > 0
        ? `${nearGraduation.length} expression${nearGraduation.length > 1 ? "s" : ""} anglaise${nearGraduation.length > 1 ? "s" : ""} proche${nearGraduation.length > 1 ? "s" : ""} de l'ancrage`
        : `${incubating.length} expression${incubating.length > 1 ? "s" : ""} anglaise${incubating.length > 1 ? "s" : ""} en incubation active`,
      body: `Cycle d'incubation quotidien (7 jours). La plus avancée termine dans ${soonest} jour${soonest > 1 ? "s" : ""}.`,
      cta: { label: "Pratiquer l'anglais", action: "english" },
      meta: { count: incubating.length },
      timestamp: nowTs,
      dateISO: todayStr,
    });
  }

  if (englishOralOpportunity > 0) {
    push({
      id: `insight-english-oral-${todayStr}`,
      group: "insights",
      priority: 72,
      icon: "🎙️",
      tone: "accent",
      title: "Opportunité de pratique orale en anglais",
      body: `${englishOralOpportunity} expression${englishOralOpportunity > 1 ? "s" : ""} méritent d'être prononcées à voix haute pour ancrer la mémoire musculaire.`,
      cta: { label: "Pratiquer la voix", action: "english" },
      timestamp: nowTs,
      dateISO: todayStr,
    });
  }

  // ── 6. INSIGHTS : Hygiène & Cartes dormantes ───────────────────────────
  if (dormantCount >= 3) {
    push({
      id: `insight-dormant-${dormantCount}`,
      group: "insights",
      priority: 66,
      icon: "📦",
      tone: "info",
      title: `${dormantCount} fiche${dormantCount > 1 ? "s" : ""} dormante${dormantCount > 1 ? "s" : ""} jamais abordée${dormantCount > 1 ? "s" : ""}`,
      body: "Ces cartes ont été ajoutées mais n'ont pas encore amorcé leur premier cycle de répétition espacée.",
      cta: { label: "Activer ces fiches", action: "dormant" },
      meta: { count: dormantCount },
      timestamp: nowTs,
      dateISO: todayStr,
    });
  }

  // ── 7. Système & Synchro ───────────────────────────────────────────────
  if (!syncError && lastSyncAt) {
    const hours = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 3600000);
    if (hours >= 48) {
      push({
        id: `sync-stale-${todayStr}`,
        group: "info",
        priority: 18,
        icon: "☁️",
        tone: "info",
        title: "Dernière sauvegarde distante ancienne",
        body: `Dernière synchronisation effectuée il y a ${hours} h.`,
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

/** Compte ce qui mérite la pastille (non lu, non reporté, non expiré). */
export function countUnread(list, state) {
  return list.filter((n) => !state?.read?.[n.id] && !isSnoozed(n, state) && !isExpiredInsight(n, state)).length;
}
