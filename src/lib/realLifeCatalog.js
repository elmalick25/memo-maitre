// realLifeCatalog.js — Catalogue, requêtes variées et rotation continue pour RealLife

export const CATEGORIES = [
  {
    id: "ielts",
    icon: "🎓",
    label: "IELTS Speaking",
    query: "IELTS speaking test band 8 full interview",
    queries: [
      "IELTS speaking test band 8 full interview",
      "IELTS speaking mock test band 9 native level",
      "IELTS speaking actual test band 8.5 Cambridge",
      "IELTS speaking test band 8 model answer part 1 2 3",
      "IELTS speaking band 9 interview real examiner",
      "IELTS speaking practice test band 8 vocabulary",
      "IELTS speaking full test band 8.5 with subtitles",
      "IELTS speaking sample test band 9 fluency pronunciation",
    ],
    fallback: [
      "MOfDdaVeCFo", "Q-oOOGkVs_Y", "9V-hltafDrY", "3TQjWo1TA8I", "l0iGnP0Vw4Q", "5J3Q0YQEDkE",
      "sRFEVPrl8sE", "w9i2VqfQZ_4", "gW2L8bYn4L4", "K3oPjUu133U", "vS7_pe3f5p4", "GgZq8z-K-z4",
      "bKqL85yG3cM", "aPq7QzQxJ1A", "tV84q1x-Z1M", "dW90p8d2Jk4", "fE1L5uO6p2Q", "j9L_Pz8eX4U",
    ],
  },
  {
    id: "tvseries",
    icon: "📺",
    label: "Learn English With TV Series",
    query: "Learn English With TV Series",
    channelHandle: "LearnEnglishWithTVSeries",
    channelName: "Learn English With TV Series",
    fallback: [
      "fvVY1XDKhZk", "D635dqEmcfY", "SPvOyNW-ka4", "Dp1I_iFRRVA", "1Q8fG0TtVAY", "tPnK39ax_AM",
      "5qap5aO4i9A", "YQHsXMglC9A", "K8x2A_6f7c8", "zL4q4lR8d3E", "wPz2q8K_Y88", "a8x_9PzQ7vE",
      "xY1_8Kp9Q1A", "rE9_2Lx0P11", "gK3kGz_q8wY", "mB9xK-u3q2A", "aQ7_jK98m1E", "pL3_qW89r4T",
    ],
  },
];

export const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.drgns.space",
];

export const INVIDIOUS_HOSTS = [
  "https://invidious.privacydev.net",
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.f5.si",
];

/**
 * Renvoie un sous-ensemble cyclique du catalogue curaté afin que chaque clic
 * produise des capsules différentes, même en mode hors-ligne / fallback.
 */
export function getRotatingFallback(cat, n = 6, batchIndex = 1) {
  const fb = Array.isArray(cat?.fallback) && cat.fallback.length ? cat.fallback : [];
  if (!fb.length) return [];
  const count = Math.max(1, Math.min(25, Number(n) || 6));
  const batch = Math.max(1, Number(batchIndex) || 1);
  const start = ((batch - 1) * count) % fb.length;
  const list = [];
  for (let i = 0; i < count; i++) {
    const id = fb[(start + i) % fb.length];
    list.push({
      id,
      title: `${cat.label || cat.channelName || "Vidéos"} — capsule ${id}`,
      channel: cat.channelName || "Sélection curatée",
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });
  }
  return list;
}
