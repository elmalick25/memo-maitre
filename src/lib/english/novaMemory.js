// ============================================================================
// novaMemory.js — Mémoire épisodique & profil apprenant de Coach NOVA
// ============================================================================
// Permet à Coach Nova de véritablement connaître l'élève à travers le temps :
//   • Ses centres d'intérêt, études, projets et ambitions
//   • L'historique des derniers sujets abordés en conversation réelle
//   • Ses défis linguistiques récents (expressions apprises, points d'hésitation)
//   • L'injection automatique de l'accroche de continuité (Continuity Hook)
// ============================================================================

export const DEFAULT_NOVA_PROFILE = {
  studentName: "Malick",
  background: "Étudiant ambitieux en informatique et tech, développeur passionné par l'IA et les applications à fort impact.",
  interests: ["Informatique & Génie logiciel", "Intelligence Artificielle & LLMs", "Opportunités de Master & Bourses internationales", "Entrepreneuriat & Productivité"],
  recentTopics: [],
  linguisticGaps: [],
  lastUpdated: null,
};

const STORAGE_KEY = "memo_nova_learner_profile_v1";

/**
 * Récupère le profil apprenant mémorisé par Nova.
 */
export function getNovaLearnerProfile(storage = null) {
  try {
    let raw = null;
    if (storage && typeof storage.get === "function") {
      raw = storage.get("nova_learner_profile") || storage.get(STORAGE_KEY);
    }
    if (!raw && typeof localStorage !== "undefined") {
      raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("nova_learner_profile");
    }
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return {
        ...DEFAULT_NOVA_PROFILE,
        ...parsed,
        interests: Array.isArray(parsed.interests) && parsed.interests.length > 0 ? parsed.interests : DEFAULT_NOVA_PROFILE.interests,
        recentTopics: Array.isArray(parsed.recentTopics) ? parsed.recentTopics : [],
        linguisticGaps: Array.isArray(parsed.linguisticGaps) ? parsed.linguisticGaps : [],
      };
    }
  } catch (err) {
    console.warn("[novaMemory] Erreur lecture profil apprenant :", err);
  }
  return { ...DEFAULT_NOVA_PROFILE };
}

/**
 * Sauvegarde le profil apprenant mis à jour.
 */
export function saveNovaLearnerProfile(profile, storage = null) {
  if (!profile) return;
  try {
    const payload = {
      ...profile,
      lastUpdated: new Date().toISOString(),
    };
    if (storage && typeof storage.set === "function") {
      storage.set(STORAGE_KEY, payload);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (err) {
    console.warn("[novaMemory] Erreur sauvegarde profil apprenant :", err);
  }
}

/**
 * Construit la chaîne de continuité transmise à LiveKit (continuityMemory).
 * Cette chaîne permet à Nova de faire référence naturellement aux sessions passées.
 */
export function buildContinuityPrompt(profile) {
  if (!profile) return "";
  const parts = [];

  const name = profile.studentName || "Malick";
  parts.push(`Student name: ${name}.`);

  if (profile.background) {
    parts.push(`Background: ${profile.background}.`);
  }

  if (Array.isArray(profile.interests) && profile.interests.length > 0) {
    parts.push(`Passions & focus areas: ${profile.interests.slice(0, 4).join(", ")}.`);
  }

  if (Array.isArray(profile.recentTopics) && profile.recentTopics.length > 0) {
    const lastSession = profile.recentTopics[profile.recentTopics.length - 1];
    if (lastSession?.topic) {
      parts.push(
        `Previous conversation (${lastSession.date || "recently"}): discussed "${lastSession.topic}"${
          lastSession.keyFacts ? ` (${lastSession.keyFacts})` : ""
        }.`
      );
    }
  }

  if (Array.isArray(profile.linguisticGaps) && profile.linguisticGaps.length > 0) {
    parts.push(`Target expressions recently explored or to reinforce: ${profile.linguisticGaps.slice(-4).join(", ")}.`);
  }

  return parts.join(" ");
}

/**
 * Analyse une session terminée pour mettre à jour la mémoire de Nova de façon asynchrone.
 */
export async function updateLearnerProfileFromSession({
  transcript = [],
  currentProfile = null,
  callClaude = null,
  storage = null,
} = {}) {
  const profile = currentProfile || getNovaLearnerProfile(storage);
  if (!transcript || transcript.length < 2 || !callClaude) {
    return profile;
  }

  try {
    const conversationText = transcript
      .filter((m) => m && m.text && m.text.trim())
      .map((m) => `${m.role === "agent" ? "NOVA" : "STUDENT"}: ${m.text.trim()}`)
      .join("\n");

    const prompt = `Tu es le sous-système de mémoire à long terme de Coach NOVA.
Voici la transcription d'une conversation orale en anglais avec l'élève :

---
${conversationText.slice(0, 3500)}
---

Extrais ce que NOVA doit retenir pour mieux connaître cet élève et assurer une continuité humaine parfaite lors de la prochaine session.
Réponds STRICTEMENT sous forme de JSON valide avec ce schéma :
{
  "sessionTopic": "<sujet principal abordé en 5-10 mots>",
  "keyFacts": "<1 fait concret ou anecdote partagée par l'élève, ex: travail sur un projet de code, routine du matin>",
  "newInterests": ["<nouveau centre d'intérêt ou passion détectée si applicable>"],
  "linguisticGaps": ["<1 à 3 expressions ou structures que l'élève a découvertes, demandées ou sur lesquelles il a hésité>"]
}`;

    const rawResponse = await callClaude(
      "Tu es un extracteur de mémoire conversationnelle d'élite. Réponds UNIQUEMENT en JSON valide.",
      prompt
    );

    const cleanJson = String(rawResponse || "").replace(/```json|```/gi, "").trim();
    const data = JSON.parse(cleanJson);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const updated = {
      ...profile,
      recentTopics: [
        ...(profile.recentTopics || []),
        {
          date: dateStr,
          topic: data.sessionTopic || "General real-life conversation",
          keyFacts: data.keyFacts || "",
        },
      ].slice(-6), // Conserve les 6 dernières sessions
      interests: Array.from(new Set([...(profile.interests || []), ...(data.newInterests || [])])).slice(0, 8),
      linguisticGaps: Array.from(new Set([...(profile.linguisticGaps || []), ...(data.linguisticGaps || [])])).slice(-10),
      lastUpdated: now.toISOString(),
    };

    saveNovaLearnerProfile(updated, storage);
    return updated;
  } catch (err) {
    console.warn("[novaMemory] Échec extraction mémoire session :", err);
    return profile;
  }
}
