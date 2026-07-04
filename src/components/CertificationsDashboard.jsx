import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ShieldCheck, Flame, Zap, Clock, TrendingUp, Target, Briefcase, GraduationCap, ChevronRight, Loader2, Building, Star, Rocket, CheckCircle2, RefreshCw, ExternalLink, Trophy, Map, Search, Sparkles, AlertTriangle, BookOpen, DollarSign, Layers, Filter } from 'lucide-react';
import { storage } from '../lib/firebase';
import { searchCatalog, topCerts, mergeWithCatalog, relevantSearch } from '../lib/certCatalog';

// 🎯 GOD MODE : minimum garanti de certifs renvoyées (jamais nul, jamais < ce seuil)
const MIN_RESULTS = 20;

const MENTOR_PROFILE_KEY = 'astrale_mentor_profile';
const CACHE_V = 'v4';

// CACHES EN MÉMOIRE POUR ZÉRO-LATENCE (ANTI-FLICKER)
let memoryCache_certs = null;
let memoryCache_trending = null;

const URL_RULES = `RÈGLES URL STRICTES ANTI-404:
- L'IA a tendance à inventer des URLs qui finissent en erreur 404. C'EST INTERDIT.
- Si tu connais l'URL exacte officielle à 100%, mets-la.
- EN CAS DE MOINDRE DOUTE, génère un lien de recherche DuckDuckGo ! Exemple : "https://duckduckgo.com/?q=Nom+de+la+certification+officielle".
- Cela garantit que l'utilisateur trouvera toujours la certification sans tomber sur une erreur 404.`;

// ═══════════════════════════════════════════════════════════════════════
//   Animated counter
// ═══════════════════════════════════════════════════════════════════════
const AnimatedCounter = ({ from = 0, to = 0, suffix = '' }) => {
  const [n, setN] = useState(from);
  useEffect(() => {
    let raf, start;
    const dur = 1200;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <span>{n}{suffix}</span>;
};

// ═══════════════════════════════════════════════════════════════════════
//   1) Banner — used on Accueil
// ═══════════════════════════════════════════════════════════════════════
export const CertificationsBanner = ({ callClaude }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const key = `cert_banner_${CACHE_V}_${new Date().toLocaleDateString('en-CA')}`;
      const cached = localStorage.getItem(key);
      if (cached) { try { return setData(JSON.parse(cached)); } catch { } }
      // Stagger: 2s pour éviter la tempête de requêtes au montage
      await new Promise(r => setTimeout(r, 2000));
      if (cancelled) return;
      const prompt = `Tu es un radar de veille tech mondiale. Cherche sur le web une annonce RÉELLE et RÉCENTE (cette semaine/mois) d'un grand acteur tech (Google, Meta, AWS, Microsoft…) sur une nouvelle certification, formation ou bourse gratuite en IA, Cloud, Data ou Cybersec.
INTERDICTION TOTALE D'INVENTER. ${URL_RULES}
Renvoie UNIQUEMENT un JSON: { "text": "phrase d'accroche hype", "url": "lien réel" }`;
      try {
        const res = await callClaude(prompt, 'Veille certifs', { grounding: true, temperature: 0.1, maxTokens: 200 });
        const text = typeof res === 'string' ? res : res?.text || '';
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          if (parsed?.text && !cancelled) {
            setData(parsed);
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        }
      } catch { }
    };
    run();
    return () => { cancelled = true; };
  }, [callClaude]);

  if (!data) return null;
  return (
    <motion.a
      href={data.url || '#'} target={data.url ? '_blank' : '_self'} rel="noreferrer"
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      style={{ textDecoration: 'none' }}
    >
      <div className="cert-banner">
        <div className="cert-banner-icon"><Sparkles size={16} /></div>
        <span className="cert-banner-text">{data.text}</span>
        {data.url && <ChevronRight size={16} />}
      </div>
      <style>{bannerStyles}</style>
    </motion.a>
  );
};

const bannerStyles = `
.cert-banner {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 18px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(77,107,254,0.12), rgba(167,139,250,0.12));
  border: 1px solid var(--mm-border-strong);
  color: var(--mm-fg); font-weight: 700; font-size: 13.5px;
  box-shadow: 0 6px 20px -10px var(--mm-primary);
  transition: transform .15s ease;
}
.cert-banner:hover { transform: translateY(-1px); }
.cert-banner-icon {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--mm-primary); color: #fff;
}
.cert-banner-text { flex: 1; }
`;

// ═══════════════════════════════════════════════════════════════════════
//   2) Alert — used on Accueil
// ═══════════════════════════════════════════════════════════════════════
export const CertificationsAlert = ({ callClaude }) => {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const raw = localStorage.getItem(MENTOR_PROFILE_KEY);
      if (!raw) return;
      let stack = '';
      try { stack = JSON.parse(raw).stack || 'Développeur'; } catch { stack = raw; }
      const key = `cert_alert_${CACHE_V}_${btoa(unescape(encodeURIComponent(stack))).slice(0, 16)}`;
      const cached = localStorage.getItem(key);
      if (cached) { try { return setAlert(JSON.parse(cached)); } catch { } }
      // Stagger: 4s pour éviter la tempête de requêtes au montage
      await new Promise(r => setTimeout(r, 4000));
      if (cancelled) return;
      const prompt = `Profil tech: "${stack}".
Génère UNE SEULE phrase d'alerte de dashboard recommandant une certification RÉELLE qui manque à son profil. Utilise la recherche web.
Renvoie UNIQUEMENT: { "text": "...", "url": "lien réel" }`;
      try {
        const res = await callClaude(prompt, 'Alerte certif', { grounding: true, temperature: 0.1, maxTokens: 200 });
        const text = typeof res === 'string' ? res : res?.text || '';
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          if (parsed?.text && !cancelled) {
            setAlert(parsed);
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        }
      } catch { }
    };
    run();
    return () => { cancelled = true; };
  }, [callClaude]);

  if (!alert) return null;
  return (
    <motion.a
      href={alert.url || '#'} target={alert.url ? '_blank' : '_self'} rel="noreferrer"
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      style={{ textDecoration: 'none', display: 'inline-block', marginTop: 12 }}
    >
      <div className="cert-alert">
        <span className="cert-alert-dot" />
        <AlertTriangle size={14} />
        <span>{alert.text}</span>
        {alert.url && <ChevronRight size={14} />}
      </div>
      <style>{alertStyles}</style>
    </motion.a>
  );
};

const alertStyles = `
.cert-alert {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-radius: 12px;
  background: rgba(244,63,94,0.10); border: 1px solid rgba(244,63,94,0.32);
  color: #f43f5e; font-size: 13px; font-weight: 700;
}
.cert-alert-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #f43f5e;
  animation: cert-pulse 2s infinite;
}
@keyframes cert-pulse {
  0% { box-shadow: 0 0 0 0 rgba(244,63,94,.65); }
  70% { box-shadow: 0 0 0 8px rgba(244,63,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); }
}
`;

// ═══════════════════════════════════════════════════════════════════════
//   3) Hero — gradient header (light/dark adaptive)
// ═══════════════════════════════════════════════════════════════════════
const HeroHeader = ({ stats, onRefresh, refreshing }) => (
  <div className="cd-hero">
    <div className="cd-hero-glow cd-hero-glow-a" />
    <div className="cd-hero-glow cd-hero-glow-b" />
    <div className="cd-hero-grid" />

    <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
        <Trophy size={14} /> Mission Certifications
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, color: '#fff', letterSpacing: -1, lineHeight: 1.05 }}>
        Radar Certifications<br />
        <span style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 700, fontSize: 'clamp(15px, 1.6vw, 18px)' }}>
          Cible les certifications à fort ROI pour ton profil.
        </span>
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        <div className="cd-stat-pill"><Award size={14} /> {stats.total} certifs ciblées</div>
        <div className="cd-stat-pill"><Flame size={14} /> {stats.hot} en hot demand</div>
        <div className="cd-stat-pill"><CheckCircle2 size={14} /> {stats.completed} validées</div>
        <button onClick={onRefresh} disabled={refreshing} className="cd-refresh-btn">
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Regénérer
        </button>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
//   4) Cert card
// ═══════════════════════════════════════════════════════════════════════
const PRIORITY_COLOR = {
  'Critique': { bg: 'rgba(244,63,94,0.14)', fg: '#f43f5e' },
  'Élevée': { bg: 'rgba(250,204,21,0.14)', fg: '#facc15' },
  'Moyenne': { bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6' },
};

// ── URL helpers : évite les liens 404 / inventés ────────────────────────
const isLikelyValidUrl = (u) => {
  if (!u || typeof u !== 'string') return false;
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/example\.com|votre-?lien|tbd|placeholder|n\/a|todo/i.test(s)) return false;
  try { new URL(s); return true; } catch { return false; }
};
const googleSearchUrl = (cert) => {
  const q = [cert?.provider, cert?.name, 'certification', 'official']
    .filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
};
// 🆕 Map de pages OFFICIELLES par fournisseur — garantie d'atterrir sur le bon site
const PROVIDER_OFFICIAL = {
  microsoft: 'https://learn.microsoft.com/credentials/',
  azure: 'https://learn.microsoft.com/credentials/browse/?products=azure',
  aws: 'https://aws.amazon.com/certification/',
  'amazon web services': 'https://aws.amazon.com/certification/',
  google: 'https://cloud.google.com/learn/certification',
  'google cloud': 'https://cloud.google.com/learn/certification',
  gcp: 'https://cloud.google.com/learn/certification',
  ibm: 'https://www.ibm.com/training/credentials',
  oracle: 'https://education.oracle.com/oracle-certification-path',
  cisco: 'https://www.cisco.com/site/us/en/learn/training-certifications/certifications/index.html',
  comptia: 'https://www.comptia.org/certifications',
  meta: 'https://www.coursera.org/professional-certificates/meta-front-end-developer',
  facebook: 'https://www.coursera.org/professional-certificates/meta-front-end-developer',
  anthropic: 'https://www.anthropic.com/learn',
  openai: 'https://openai.com/index/openai-academy/',
  databricks: 'https://www.databricks.com/learn/certification',
  snowflake: 'https://www.snowflake.com/en/learn/certifications/',
  hashicorp: 'https://www.hashicorp.com/certification',
  kubernetes: 'https://training.linuxfoundation.org/certification-catalog/',
  cncf: 'https://training.linuxfoundation.org/certification-catalog/',
  'linux foundation': 'https://training.linuxfoundation.org/certification-catalog/',
  redhat: 'https://www.redhat.com/en/services/certifications',
  'red hat': 'https://www.redhat.com/en/services/certifications',
  pmi: 'https://www.pmi.org/certifications',
  scrum: 'https://www.scrum.org/professional-scrum-certifications',
  isaca: 'https://www.isaca.org/credentialing',
  '(isc)2': 'https://www.isc2.org/Certifications',
  isc2: 'https://www.isc2.org/Certifications',
  offensive: 'https://www.offsec.com/courses-and-certifications/',
  ec_council: 'https://www.eccouncil.org/programs/',
  'ec-council': 'https://www.eccouncil.org/programs/',
  nvidia: 'https://www.nvidia.com/en-us/training/certification/',
  deeplearning: 'https://www.deeplearning.ai/courses/',
  coursera: 'https://www.coursera.org/professional-certificates',
  edx: 'https://www.edx.org/professional-certificate',
  udacity: 'https://www.udacity.com/courses/nanodegree',
  freecodecamp: 'https://www.freecodecamp.org/learn',
  huggingface: 'https://huggingface.co/learn',
  'hugging face': 'https://huggingface.co/learn',
};
const providerOfficialUrl = (cert) => {
  const p = String(cert?.provider || '').toLowerCase().trim();
  if (!p) return null;
  if (PROVIDER_OFFICIAL[p]) return PROVIDER_OFFICIAL[p];
  for (const key of Object.keys(PROVIDER_OFFICIAL)) {
    if (p.includes(key)) return PROVIDER_OFFICIAL[key];
  }
  return null;
};
// Domaines crédibles (whitelist) — augmente la confiance du lien
const TRUSTED_DOMAINS = /\.(microsoft|amazon|aws|google|cloud\.google|ibm|oracle|cisco|comptia|coursera|edx|udacity|udemy|linkedin|credly|youracclaim|pluralsight|datacamp|kaggle|huggingface|anthropic|openai|databricks|snowflake|hashicorp|linuxfoundation|cncf|redhat|pmi|scrum|isaca|isc2|offsec|eccouncil|nvidia|deeplearning|freecodecamp|github|gitlab|atlassian|salesforce|servicenow|tableau|alteryx|sas|cloudera|mongodb|elastic|docker|terraform|stripe|shopify|adobe|figma|notion|airtable|zapier|hubspot|miro|asana|monday|trello)\.(com|io|org|net|co|edu|ai)$/i;
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// 🛡️ DuckDuckGo "!ducky" bang : redirige direct vers le 1er résultat Google — garantit
// que l'utilisateur atterrit toujours sur QUELQUE CHOSE, jamais sur du 404.
const duckyLuckyUrl = (cert) => {
  const q = [cert?.provider, cert?.name, 'certification', 'official']
    .filter(Boolean).join(' ');
  return `https://duckduckgo.com/?q=%21ducky+${encodeURIComponent(q)}`;
};

const resolveCertUrl = (cert) => {
  const raw = cert?.url || cert?.link || '';
  if (isLikelyValidUrl(raw)) {
    const d = domainOf(raw);
    const trusted = TRUSTED_DOMAINS.test(d);
    return { url: raw, verified: true, trusted, domain: d };
  }
  const official = providerOfficialUrl(cert);
  if (official) return { url: official, verified: true, trusted: true, domain: domainOf(official), fallbackProvider: true };
  // Pas d'URL fiable : on utilise le bang !ducky de DuckDuckGo (auto-redirect vers le 1er résultat)
  return { url: duckyLuckyUrl(cert), verified: false, trusted: false, domain: 'duckduckgo.com' };
};

// 🚀 Ouvre une certif avec une stratégie anti-404 ultra robuste :
// 1. Si l'URL est de confiance → on l'ouvre directement
// 2. Sinon → on passe par le bang !ducky de DuckDuckGo qui redirige vers le 1er résultat Google,
//    garantissant qu'on tombe TOUJOURS sur la bonne page officielle (jamais sur du 404).
const openCertSmart = (cert, e) => {
  if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
  const { url, trusted } = resolveCertUrl(cert);
  const target = trusted ? url : duckyLuckyUrl(cert);
  try { window.open(target, '_blank', 'noopener,noreferrer'); }
  catch { window.location.href = target; }
};

const CertCard = ({ cert, onToggleDone, done, onPrepare }) => {
  const prio = PRIORITY_COLOR[cert.priority] || PRIORITY_COLOR['Moyenne'];
  const { url, verified } = resolveCertUrl(cert);
  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="cd-card">
      <div className="cd-card-halo" />
      <div className="cd-card-head">
        <div className="cd-card-badges">
          <span className="cd-badge" style={{ background: prio.bg, color: prio.fg }}>{cert.priority || 'Moyenne'}</span>
          {cert.provider && <span className="cd-badge cd-badge-soft"><Building size={11} /> {cert.provider}</span>}
          {cert.duration && <span className="cd-badge cd-badge-soft"><Clock size={11} /> {cert.duration}</span>}
          {cert.free && <span className="cd-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Gratuit</span>}
          {verified && url && (
            <span
              className="cd-badge"
              style={{
                background: 'rgba(16,185,129,0.14)',
                color: '#10b981',
                cursor: 'help'
              }}
              title={`Source : ${domainOf(url)}`}
            >
              <ShieldCheck size={11} /> {domainOf(url)}
            </span>
          )}
          {!verified && <span className="cd-badge" style={{ background: 'rgba(250,204,21,0.14)', color: '#facc15' }} title="Lien officiel non confirmé — recherche Google de secours">Lien à vérifier</span>}
        </div>
        <h3 className="cd-card-title">
          <a href={url} onClick={(e) => openCertSmart(cert, e)} target="_blank" rel="noreferrer">
            {cert.name} <ExternalLink size={14} />
          </a>
        </h3>
        <p className="cd-card-desc">{cert.why || cert.description || `Certification ${cert.provider || ''} — ${cert.category || 'Tech'}.`}</p>
      </div>

      <div className="cd-stats">
        <div className="cd-stat">
          <div className="cd-stat-val"><DollarSign size={14} color="#10b981" /><b>{cert.salaryImpact || '—'}</b></div>
          <span>Impact Salaire</span>
        </div>
        <div className="cd-stat">
          <div className="cd-stat-val"><TrendingUp size={14} color="#3b82f6" /><b>{cert.demand || '—'}</b></div>
          <span>Demande</span>
        </div>
        <div className="cd-stat">
          <div className="cd-stat-val"><Target size={14} color="#a78bfa" /><b>{cert.level || '—'}</b></div>
          <span>Niveau</span>
        </div>
        <div className="cd-stat">
          <div className="cd-stat-val"><GraduationCap size={14} color="#f43f5e" /><b>{cert.cost || '—'}</b></div>
          <span>Coût</span>
        </div>
      </div>

      <div className="cd-card-actions">
        <button onClick={() => onToggleDone?.(cert.name)} className={`cd-secondary ${done ? 'is-done' : ''}`} style={{ width: '100%' }}>
          <CheckCircle2 size={16} /> <span>{done ? 'Validée' : 'Marquer comme faite'}</span>
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
          {onPrepare && (
            <button onClick={() => onPrepare(cert.name)} className="cd-cta" style={{ flex: 1, minWidth: 100, padding: '10px 8px' }} title="Préparer cette certification dans l'Académie">
              <Rocket size={16} /> <span>Préparer</span>
            </button>
          )}
          <a
            href={url}
            onClick={(e) => openCertSmart(cert, e)}
            target="_blank" rel="noreferrer"
            className="cd-cta"
            style={{ flex: 1, minWidth: 100, textDecoration: 'none', padding: '10px 8px' }}
            title="Ouvre la page officielle (anti-404)"
          >
            <ExternalLink size={16} /> <span>Ouvrir</span>
          </a>
          <a href={googleSearchUrl(cert)} target="_blank" rel="noreferrer" className="cd-secondary" style={{ flex: '0 0 auto', padding: '10px 14px' }} title="Chercher sur Google">
            <Search size={16} />
          </a>
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   5) Main Dashboard
// ═══════════════════════════════════════════════════════════════════════
const CertificationsDashboard = ({ callClaude, onPrepareCertif, isMobile }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [certs, setCerts] = useState([]);
  const [tab, setTab] = useState('radar');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [visibleCertsCount, setVisibleCertsCount] = useState(15);
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cert_completed') || '[]'); }
    catch { return []; }
  });

  // Recherche live (web) déclenchée par la barre de recherche
  const [liveResults, setLiveResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveQuery, setLiveQuery] = useState('');
  const liveSearch = useCallback(async (q) => {
    const term = (q || '').trim();
    if (term.length < 2) { setLiveResults([]); setLiveQuery(''); return; }
    setLiveLoading(true);
    setLiveQuery(term);
    // 🛡️ Filet local instantané, 100% PERTINENT : relevantSearch garantit des
    // résultats jamais vides ET uniquement liés à la recherche, même hors-ligne.
    try {
      const key = `cert_live_${CACHE_V}_${btoa(unescape(encodeURIComponent(term.toLowerCase()))).slice(0, 24)}`;
      const cached = await storage.get(key);
      if (cached) {
        try {
          if (Array.isArray(cached?.certs) && cached.certs.length > 0 && Date.now() - cached.ts < 1000 * 60 * 60 * 12) {
            // Re-filtre le cache pour garantir la pertinence même sur d'anciens caches.
            const clean = relevantSearch(cached.certs, term, 60);
            setLiveResults(clean); setLiveLoading(false); return;
          }
        } catch { }
      }
      // Affiche immédiatement le catalogue local pertinent (zéro latence) puis enrichit avec l'IA
      setLiveResults(relevantSearch([], term, 60));
      const prompt = `Recherche RÉELLE sur le web (Google, Reddit, LinkedIn, X/Twitter, YouTube, GitHub, sites officiels) les certifications informatiques liées au mot-clé: "${term}".
La requête peut être en FRANÇAIS ou en ANGLAIS : interprète l'intention dans les deux langues (ex: "sécurité"="security"="cyber", "réseau"="network", "données"="data", "développement"="development").
🎯 RÈGLE DE PERTINENCE ABSOLUE : renvoie UNIQUEMENT des certifications DIRECTEMENT liées au mot-clé "${term}". N'inclus AUCUNE certification hors-sujet (ex: si on cherche "IA générative", ne propose PAS de certif Cloud, Réseau ou Cybersécurité génériques). En cas de doute sur la pertinence d'une certif, EXCLUS-la.
🎯 OBJECTIF VOLUME : vise 20 à 40 certifs RÉELLES et PERTINENTES. Reste 100% dans le sujet : mieux vaut 15 résultats parfaitement pertinents que 40 dont la moitié hors-sujet.
🆓 PRIORITÉ ABSOLUE AUX CERTIFICATIONS GRATUITES — place TOUTES les gratuites en TÊTE de liste (Google Skillshop, Meta Blueprint, AWS Educate / Skill Builder gratuit, IBM SkillsBuild, Microsoft Learn, freeCodeCamp, Cisco Networking Academy gratuit, HuggingFace, DeepLearning.AI free tracks, Coursera audit, Kaggle Learn, TryHackMe gratuit, HackTheBox starter, Google Cloud Skills Boost free quests, GitHub Learning Lab, MongoDB University, DataCamp free, Salesforce Trailhead, Atlassian University free, etc.). Ensuite seulement les payantes.
INTERDICTION TOTALE D'INVENTER. ${URL_RULES} Retourne des résultats RÉELS, vérifiables et PERTINENTS, chacun avec un "why" UNIQUE et SPÉCIFIQUE (pas de formule copiée-collée).
Renvoie UNIQUEMENT JSON: { "certs": [ {
  "name": "...", "provider": "...", "url": "lien officiel direct",
  "priority": "Critique"|"Élevée"|"Moyenne",
  "level": "Foundational"|"Associate"|"Professional"|"Specialty",
  "duration": "ex: 20h", "cost": "Gratuit ou prix",
  "free": true|false,
  "salaryImpact": "+Xk€ ou —", "demand": "Très forte/Forte/Modérée",
  "why": "1-2 phrases UNIQUES sur ce que cette certif débloque concrètement",
  "category": "Cloud"|"AI"|"Data"|"Cybersécurité"|"DevOps"|"Frontend"|"Backend"|"Mobile"|"Général"
} ] }`;
      let aiList = [];
      try {
        const res = await callClaude(prompt, `Search certifs: ${term}`, { grounding: true, temperature: 0.15, maxTokens: 8000 });
        const text = typeof res === 'string' ? res : res?.text || '';
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          const data = JSON.parse(m[0]);
          aiList = Array.isArray(data?.certs) ? data.certs : [];
        }
      } catch (aiErr) {
        console.warn('Live search IA indisponible, fallback catalogue local', aiErr?.message || aiErr);
      }
      // 🔀 Fusion IA + catalogue local : 100% PERTINENT (on filtre tout ce qui est
      // hors-sujet) et JAMAIS VIDE (relevantSearch garantit un repli topique).
      const list = relevantSearch(aiList, term, 60);
      setLiveResults(list);
      try { await storage.set(key, { certs: list, ts: Date.now() }); } catch {}
    } catch (e) {
      console.error('Live cert search', e);
      // Dernier filet : catalogue local pertinent — JAMAIS vide, JAMAIS hors-sujet
      setLiveResults(relevantSearch([], term, 60));
    } finally { setLiveLoading(false); }
  }, [callClaude]);


  // ── "J'ai vu une certif" : identification floue depuis un lien / nom approximatif / description
  const [hintInput, setHintInput] = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [hintCert, setHintCert] = useState(null);
  const [hintError, setHintError] = useState(null);
  const identifyFromHint = useCallback(async () => {
    const text = hintInput.trim();
    if (text.length < 3) return;
    setHintLoading(true); setHintCert(null); setHintError(null);
    try {
      const prompt = `Un utilisateur a vu une certification quelque part (TikTok, LinkedIn, YouTube, Reddit, ad…) et te donne un indice flou (nom approximatif, lien, ou description). Identifie la certification RÉELLE qui correspond le mieux, en cherchant sur le web. NE PAS INVENTER : si rien ne matche, renvoie { "found": false, "reason": "..." }.
Indice utilisateur :
"""${text}"""
Renvoie UNIQUEMENT JSON :
{ "found": true|false,
  "reason": "explique brièvement si found=false",
  "cert": {
    "name": "Nom officiel exact",
    "provider": "...", "url": "lien officiel direct",
    "priority": "Critique"|"Élevée"|"Moyenne",
    "level": "Foundational"|"Associate"|"Professional"|"Specialty",
    "duration": "...", "cost": "Gratuit ou prix", "free": true|false,
    "salaryImpact": "+Xk€ ou —", "demand": "Très forte/Forte/Modérée",
    "why": "Ce que cette certif débloque concrètement",
    "category": "Cloud"|"AI"|"Data"|"Cybersécurité"|"DevOps"|"Frontend"|"Backend"|"Mobile"|"Général",
    "alternatives": ["..."]
  } }`;
      const res = await callClaude(prompt, `Identify cert from hint`, { grounding: true, temperature: 0.1 });
      const txt = typeof res === 'string' ? res : res?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('parse');
      const data = JSON.parse(m[0]);
      if (!data.found) { setHintError(data.reason || "Impossible d'identifier cette certification."); }
      else { setHintCert(data.cert); }
    } catch (e) {
      console.error('Identify cert', e);
      setHintError("Erreur d'identification. Précise davantage ton indice.");
    } finally { setHintLoading(false); }
  }, [hintInput, callClaude]);

  // ── Veille active : tendances de la semaine (cache persistant, pas de TTL)
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(null);
  const loadTrending = useCallback(async (force = false) => {
    setTrendingError(null);
    try {
      const key = 'certs_trending_v4';
      if (!force) {
        if (memoryCache_trending) {
          setTrending(memoryCache_trending);
          return;
        }
        const cached = await storage.get(key);
        if (cached && Array.isArray(cached?.trending) && cached.trending.length > 0) {
          memoryCache_trending = cached.trending;
          setTrending(cached.trending);
          return;
        }
      }
      setTrendingLoading(true);
      const prompt = `Recherche RÉELLE sur le web (Reddit, X/Twitter, LinkedIn, TikTok, YouTube, blogs tech, annonces officielles) les certifications informatiques qui font le BUZZ cette semaine ou ce mois-ci. Inclus :
- Nouvelles certifications lancées récemment (Google, AWS, Microsoft, Meta, Cisco, OpenAI, Anthropic, NVIDIA, Hugging Face, etc.)
- Certifications IA / LLM / RAG / Agents émergentes
- Certifications gratuites tendance sur TikTok / YouTube / LinkedIn
- Programmes qui recrutent fort en ce moment
INTERDICTION TOTALE D'INVENTER. ${URL_RULES} Renvoie 6 à 10 résultats RÉELS et vérifiables.
Renvoie UNIQUEMENT JSON : { "trending": [ {
  "name":"...", "provider":"...", "url":"lien officiel",
  "trendReason":"pourquoi ça buzze maintenant (1 phrase, mention de la source si possible : TikTok, LinkedIn, Reddit…)",
  "free": true|false, "cost":"...", "duration":"...",
  "category":"AI"|"Cloud"|"Cybersécurité"|"Data"|"DevOps"|"Frontend"|"Backend"|"Mobile"|"Général",
  "priority":"Critique"|"Élevée"|"Moyenne",
  "level":"Foundational"|"Associate"|"Professional"|"Specialty",
  "demand":"Très forte/Forte/Modérée",
  "salaryImpact":"+Xk€ ou —",
  "why":"ce que cette certif débloque concrètement"
} ] }`;
      const res = await callClaude(prompt, 'Cert trending watch', { grounding: true, temperature: 0.25 });
      const txt = typeof res === 'string' ? res : res?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('parse');
      const data = JSON.parse(m[0]);
      const items = Array.isArray(data?.trending) ? data.trending : (Array.isArray(data?.items) ? data.items : []);
      memoryCache_trending = items;
      setTrending(items);
      // Sauvegarde sans TTL
      await storage.set(key, { trending: items, ts: Date.now() });
    } catch (e) {
      console.error('Trending certs', e);
      setTrendingError("Veille indisponible pour l'instant.");
    } finally { setTrendingLoading(false); }
  }, [callClaude]);
  useEffect(() => { loadTrending(false); }, [loadTrending]);

  // Tabs: study plan
  const [planCert, setPlanCert] = useState('');
  const [planHours, setPlanHours] = useState(10);
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  // ATS
  const [atsJob, setAtsJob] = useState('');
  const [ats, setAts] = useState(null);
  const [atsLoading, setAtsLoading] = useState(false);

  const loadCerts = useCallback(async (force = false) => {
    setError(null);
    try {
      const raw = (storage?.get ? await storage.get(MENTOR_PROFILE_KEY) : null) || localStorage.getItem(MENTOR_PROFILE_KEY);
      let p = null;
      if (typeof raw === 'string') { try { p = JSON.parse(raw); } catch { p = { stack: raw }; } }
      else p = raw;
      setProfile(p);
      const stack = p?.stack || p?.bio || 'Développeur Web';

      const key = `certs_${CACHE_V}_${btoa(unescape(encodeURIComponent(stack))).slice(0, 18)}`;
      // Affiche le cache immédiatement s'il existe, sans TTL, sans appel IA
      if (!force) {
        if (memoryCache_certs) {
          setCerts(memoryCache_certs);
          setLoading(false);
          return;
        }
        const cached = await storage.get(key);
        if (cached) {
          if (Array.isArray(cached?.certs) && cached.certs.length > 0) {
            memoryCache_certs = cached.certs;
            setCerts(cached.certs);
            setLoading(false);
            return; // Cache présent → on s'arrête, pas d'appel IA
          }
        }
        // Pas de cache → on génère pour la première fois
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const prompt = `Tu es un coach d'orientation tech d'élite. Stack utilisateur: "${stack}".
Recommande au MINIMUM 24 certifications RÉELLES et actuelles (utilise la recherche web), JAMAIS moins de ${MIN_RESULTS}, couvrant un MIX riche de catégories (Cloud, AI, Data, Cybersécurité, DevOps, Dev Web, Mobile, Réseau, Gestion de projet, Général IT), classées par priorité décroissante.
PRIORITÉ aux certifications GRATUITES ou avec parcours d'apprentissage gratuit (Google, Meta, AWS Educate, IBM SkillsBuild, freeCodeCamp, etc.). Cependant, ce n'est PAS EXCLUSIF : inclus aussi des certifications payantes de très haute valeur (AWS, Azure, CISSP, CKA...) incontournables pour ce profil. Vise un excellent équilibre (≈50% gratuites, 50% payantes de très haute valeur).
INTERDICTION TOTALE D'INVENTER. ${URL_RULES} Si un champ inconnu, mets "—".
CHAQUE "why" doit être UNIQUE, SPÉCIFIQUE à la certif (ce qu'elle apporte concrètement, quels skills, quels métiers ciblés). NE JAMAIS répéter une formule générique. Donne un angle distinct par carte.
Renvoie UNIQUEMENT un JSON: { "certs": [ {
  "name": "Nom officiel exact",
  "provider": "AWS / Google / Meta / ...",
  "url": "lien officiel direct vers la page de la certif",
  "priority": "Critique" | "Élevée" | "Moyenne",
  "level": "Foundational" | "Associate" | "Professional" | "Specialty",
  "duration": "ex: 80h",
  "cost": "ex: $150 ou Gratuit",
  "free": true | false,
  "salaryImpact": "+12k€ ou —",
  "demand": "Très forte / Forte / Modérée",
  "why": "1-2 phrases UNIQUES et concrètes sur ce que cette certif débloque",
  "category": "Cloud" | "AI" | "Data" | "Cybersécurité" | "DevOps" | "Frontend" | "Backend" | "Mobile" | "Général"
} ] }`;

      let aiList = [];
      try {
        const res = await callClaude(prompt, 'Radar certifs', { grounding: true, temperature: 0.2, maxTokens: 8000 });
        const text = typeof res === 'string' ? res : res?.text || '';
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          const data = JSON.parse(m[0]);
          aiList = Array.isArray(data?.certs) ? data.certs : [];
        }
      } catch (aiErr) {
        console.warn('Radar IA indisponible, fallback catalogue local', aiErr?.message || aiErr);
      }
      // 🔀 Fusion IA + catalogue local : on a TOUJOURS au moins ${MIN_RESULTS} certifs (jamais d'erreur vide)
      const list = mergeWithCatalog([...aiList, ...searchCatalog(stack, 40)], stack, Math.max(MIN_RESULTS, 24));
      memoryCache_certs = list;
      setCerts(list);
      // Sauvegarde sans TTL dans Firebase
      try { await storage.set(key, { certs: list, ts: Date.now() }); } catch {}
    } catch (e) {
      console.error('Certs load', e);
      // Dernier filet : catalogue local pur — JAMAIS d'écran vide
      const fallback = topCerts(24);
      memoryCache_certs = fallback;
      setCerts(fallback);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [callClaude]);


  useEffect(() => { loadCerts(false); }, [loadCerts]);

  const toggleDone = (name) => {
    setCompleted(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      localStorage.setItem('cert_completed', JSON.stringify(next));
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return certs.filter(c => {
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.provider?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.why?.toLowerCase().includes(q)
      );
    });
  }, [certs, query, priorityFilter]);

  const heroStats = {
    total: certs.length,
    hot: certs.filter(c => c.priority === 'Critique' || c.demand?.toLowerCase().includes('forte')).length,
    completed: completed.length,
  };

  // ── Study plan generator
  const generatePlan = async () => {
    if (!planCert.trim()) return;
    setPlanLoading(true);
    setPlan(null);
    try {
      const prompt = `Génère un plan d'étude réaliste pour la certification "${planCert}" à raison de ${planHours}h/semaine.
Renvoie UNIQUEMENT JSON: { "totalWeeks": 8, "weeks": [ { "n": 1, "focus": "...", "tasks": ["t1","t2"], "resources": ["url ou nom"] } ], "examTips": ["..."] }`;
      const res = await callClaude(prompt, 'Plan étude', { temperature: 0.3 });
      const text = typeof res === 'string' ? res : res?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) setPlan(JSON.parse(m[0]));
    } catch (e) { console.error(e); }
    finally { setPlanLoading(false); }
  };

  // ── ATS analysis
  const runAts = async () => {
    if (!atsJob.trim()) return;
    setAtsLoading(true);
    setAts(null);
    try {
      const stack = profile?.stack || 'Développeur';
      const prompt = `Profil candidat: "${stack}". Certifications validées: ${completed.join(', ') || 'aucune'}.
Offre d'emploi:
"""${atsJob}"""
Analyse l'adéquation ATS. Renvoie UNIQUEMENT JSON:
{ "score": 0-100, "matched": ["mot-clé"], "missing": ["mot-clé"], "recommendedCerts": ["..."], "actions": ["3 actions concrètes"] }`;
      const res = await callClaude(prompt, 'ATS', { temperature: 0.2 });
      const text = typeof res === 'string' ? res : res?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) setAts(JSON.parse(m[0]));
    } catch (e) { console.error(e); }
    finally { setAtsLoading(false); }
  };

  const TABS = [
    { id: 'radar', label: 'Radar', icon: Map },
    { id: 'plan', label: "Plan d'étude", icon: BookOpen },
    { id: 'ats', label: 'Score ATS', icon: Layers },
  ];

  return (
    <>
      <style>{dashStyles}</style>
      <div className="cd-root" style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 16 : 28, paddingBottom: 120 }}>
        <HeroHeader stats={heroStats} onRefresh={() => loadCerts(true)} refreshing={refreshing} />

        {/* Tabs */}
        <div className="cd-tabs">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`cd-tab ${tab === t.id ? 'is-active' : ''}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* RADAR TAB */}
        {tab === 'radar' && (
          <>
            <div className="cd-toolbar">
              <div className="cd-search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') liveSearch(query); }}
                  placeholder="Tape un mot-clé (AI, cyber, cloud, react…) puis Entrée pour chercher sur le web"
                />
                <button
                  type="button"
                  onClick={() => liveSearch(query)}
                  disabled={liveLoading || query.trim().length < 2}
                  className="cd-search-btn"
                  title="Lancer une recherche web"
                >
                  {liveLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Chercher
                </button>
                {(liveResults.length > 0 || liveQuery) && (
                  <button
                    type="button"
                    onClick={() => { setLiveResults([]); setLiveQuery(''); }}
                    className="cd-search-btn cd-search-btn-ghost"
                    title="Revenir au radar"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
              <div className="cd-chips">
                {['all', 'Critique', 'Élevée', 'Moyenne'].map(p => (
                  <button key={p} className={`cd-chip ${priorityFilter === p ? 'is-active' : ''}`} onClick={() => setPriorityFilter(p)}>
                    <Filter size={12} /> {p === 'all' ? 'Toutes' : p}
                  </button>
                ))}
              </div>
            </div>

            {liveQuery && (
              <div className="cd-live-banner">
                <Sparkles size={14} />
                <span>Résultats web pour <b>"{liveQuery}"</b> {liveLoading ? '(recherche…)' : `· ${liveResults.length} certifs trouvées`}</span>
              </div>
            )}

            {/* ── "J'ai vu une certif" : identification depuis indice flou ── */}
            <div className="cd-hint-panel">
              <div className="cd-hint-head">
                <Sparkles size={16} />
                <div>
                  <div className="cd-hint-title">J'ai vu une certif, dis-m'en plus</div>
                  <div className="cd-hint-sub">Colle un lien (TikTok, LinkedIn, YouTube…), un nom approximatif ou une description — l'IA identifie la certif officielle.</div>
                </div>
              </div>
              <div className="cd-hint-row">
                <input
                  className="cd-input"
                  value={hintInput}
                  onChange={e => setHintInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') identifyFromHint(); }}
                  placeholder='ex: "certif Google IA vue sur TikTok" ou un lien…'
                />
                <button
                  className="cd-cta"
                  onClick={identifyFromHint}
                  disabled={hintLoading || hintInput.trim().length < 3}
                >
                  {hintLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Identifier
                </button>
              </div>
              {hintError && <div className="cd-error" style={{ marginTop: 12 }}><Zap size={14} /> {hintError}</div>}
              {hintCert && (
                <div style={{ marginTop: 14 }}>
                  <CertCard
                    cert={hintCert}
                    onToggleDone={toggleDone}
                    done={completed.includes(hintCert.name)}
                    onPrepare={onPrepareCertif}
                  />
                  {Array.isArray(hintCert.alternatives) && hintCert.alternatives.length > 0 && (
                    <div className="cd-hint-alts">
                      Autres pistes : {hintCert.alternatives.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Veille active : tendances de la semaine ── */}
            <div className="cd-trending">
              <div className="cd-trending-head">
                <div>
                  <div className="cd-trending-title">🔥 Tendances de la semaine</div>
                  <div className="cd-trending-sub">Certifs qui buzzent en ce moment (TikTok, LinkedIn, Reddit, annonces officielles).</div>
                </div>
                <button onClick={() => loadTrending(true)} disabled={trendingLoading} className="cd-refresh-btn cd-refresh-btn-small">
                  {trendingLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Regénérer
                </button>
              </div>
              {trendingError && <div className="cd-error" style={{ marginTop: 8 }}><Zap size={14} /> {trendingError}</div>}
              {trendingLoading && !trending.length && (
                <div className="cd-loading" style={{ padding: '24px 0' }}>
                  <Loader2 className="animate-spin" size={28} />
                  <p>Scan des sources en cours…</p>
                </div>
              )}
              {trending.length > 0 && (
                <div className="cd-trending-strip">
                  {trending.map((t, i) => (
                    <div key={(t.name || '') + i} className="cd-trending-card">
                      <div className="cd-trending-cat">{t.category || 'Général'}</div>
                      <div className="cd-trending-name">{t.name}</div>
                      <div className="cd-trending-provider">{t.provider}</div>
                      <div className="cd-trending-reason">⚡ {t.trendReason || t.why}</div>
                      <div className="cd-trending-foot">
                        <span className={`cd-pill ${t.free ? 'is-free' : ''}`}>{t.free ? 'Gratuit' : (t.cost || 'Payant')}</span>
                        {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="cd-trending-link">Voir →</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(loading || liveLoading) && (
              <div className="cd-loading">
                <Loader2 className="animate-spin" size={42} />
                <h3>{liveLoading ? `Recherche web : "${liveQuery}"…` : 'Analyse du marché des certifications…'}</h3>
                <p>{liveLoading ? 'On scanne Google, Reddit, LinkedIn, X, YouTube, sites officiels.' : 'Croisement profil & demande recruteurs.'}</p>
              </div>
            )}

            {!loading && !liveLoading && error && (
              <div className="cd-error">
                <Zap size={18} /> {error}
                <button onClick={() => loadCerts(true)} className="cd-error-btn">Réessayer</button>
              </div>
            )}

            {!loading && !liveLoading && !error && (liveQuery ? liveResults.length === 0 : filtered.length === 0) && (
              <div className="cd-empty">
                <Award size={32} />
                <h3>Aucune certification trouvée</h3>
                <p>{liveQuery ? 'Essaie un autre mot-clé.' : 'Modifie le filtre ou rafraîchis le radar.'}</p>
              </div>
            )}

            <div className="cd-grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(330px, 1fr))' }}>
              <AnimatePresence>
                {(liveQuery ? liveResults : filtered).slice(0, visibleCertsCount).map((c, i) => (
                  <CertCard
                    key={c.name + i}
                    cert={c}
                    onToggleDone={toggleDone}
                    done={completed.includes(c.name)}
                    onPrepare={onPrepareCertif}
                  />
                ))}
              </AnimatePresence>
            </div>
            {(liveQuery ? liveResults : filtered).length > visibleCertsCount && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <button onClick={() => setVisibleCertsCount(v => v + 15)} style={{ background: "transparent", color: "var(--mm-text)", border: "2px solid var(--mm-border)", padding: "12px 24px", borderRadius: 999, fontWeight: 800, cursor: "pointer" }}>
                  Afficher plus de certifications
                </button>
              </div>
            )}
          </>
        )}

        {/* PLAN TAB */}
        {tab === 'plan' && (
          <div className="cd-panel">
            <h2 className="cd-panel-title"><BookOpen size={20} /> Génère ton plan d'étude personnalisé</h2>
            <div className="cd-form">
              <input
                value={planCert}
                onChange={e => setPlanCert(e.target.value)}
                placeholder="ex: AWS Solutions Architect Associate"
                className="cd-input"
              />
              <div className="cd-hours">
                <label>Heures / semaine</label>
                <input type="number" min={2} max={40} value={planHours} onChange={e => setPlanHours(Number(e.target.value))} className="cd-input cd-input-num" />
              </div>
              <button onClick={generatePlan} disabled={planLoading || !planCert.trim()} className="cd-cta cd-cta-block">
                {planLoading ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Générer mon plan
              </button>
            </div>

            {plan && (
              <div className="cd-plan">
                <div className="cd-plan-summary">
                  <Trophy size={18} /> <b><AnimatedCounter to={plan.totalWeeks || plan.weeks?.length || 0} /> semaines</b> jusqu'à l'examen
                </div>
                <div className="cd-weeks">
                  {(plan.weeks || []).map((w, i) => (
                    <div key={i} className="cd-week">
                      <div className="cd-week-head">Semaine {w.n || i + 1}</div>
                      <div className="cd-week-focus">{w.focus}</div>
                      <ul>
                        {(w.tasks || []).map((t, j) => <li key={j}><CheckCircle2 size={12} /> {t}</li>)}
                      </ul>
                      {w.resources?.length > 0 && (
                        <div className="cd-week-res">📚 {w.resources.join(' · ')}</div>
                      )}
                    </div>
                  ))}
                </div>
                {plan.examTips?.length > 0 && (
                  <div className="cd-tips">
                    <h3><Sparkles size={16} /> Conseils examen</h3>
                    <ul>{plan.examTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ATS TAB */}
        {tab === 'ats' && (
          <div className="cd-panel">
            <h2 className="cd-panel-title"><Layers size={20} /> Analyse ATS — colle une offre d'emploi</h2>
            <textarea
              value={atsJob}
              onChange={e => setAtsJob(e.target.value)}
              placeholder="Colle ici la description complète du poste…"
              className="cd-textarea"
            />
            <button onClick={runAts} disabled={atsLoading || !atsJob.trim()} className="cd-cta cd-cta-block">
              {atsLoading ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
              Lancer l'analyse ATS
            </button>

            {ats && (
              <div className="cd-ats">
                <div className="cd-ats-score">
                  <div className="cd-ats-ring" style={{ '--p': ats.score }}>
                    <div><AnimatedCounter to={ats.score || 0} suffix="%" /></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--mm-fg-muted)', fontWeight: 700 }}>Score ATS</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--mm-fg)' }}>
                      {ats.score >= 75 ? 'Très solide' : ats.score >= 50 ? 'À renforcer' : 'À retravailler'}
                    </div>
                  </div>
                </div>

                <div className="cd-ats-cols">
                  <div className="cd-ats-col">
                    <h4><CheckCircle2 size={14} color="#10b981" /> Compétences alignées</h4>
                    <div className="cd-tags">
                      {(ats.matched || []).map((k, i) => <span key={i} className="cd-tag cd-tag-ok">{k}</span>)}
                    </div>
                  </div>
                  <div className="cd-ats-col">
                    <h4><AlertTriangle size={14} color="#f43f5e" /> Compétences manquantes</h4>
                    <div className="cd-tags">
                      {(ats.missing || []).map((k, i) => <span key={i} className="cd-tag cd-tag-warn">{k}</span>)}
                    </div>
                  </div>
                </div>

                {ats.recommendedCerts?.length > 0 && (
                  <div className="cd-ats-block">
                    <h4><Star size={14} color="#facc15" /> Certifications conseillées</h4>
                    <ul>{ats.recommendedCerts.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </div>
                )}
                {ats.actions?.length > 0 && (
                  <div className="cd-ats-block">
                    <h4><Rocket size={14} color="#a78bfa" /> Actions concrètes</h4>
                    <ul>{ats.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

const dashStyles = `
.cd-hero {
  position: relative; overflow: hidden; isolation: isolate;
  border-radius: 28px; padding: clamp(24px, 4vw, 40px);
  background: linear-gradient(135deg, #3b5cff 0%, #4d6bfe 50%, #6a87ff 100%);
  color: #fff; margin-bottom: 24px;
  box-shadow: 0 20px 60px -16px rgba(77,107,254,0.55);
}
:root:not([data-theme="light"]) .cd-hero {
  background: linear-gradient(135deg, #4338ca 0%, #6d28d9 50%, #8b5cf6 100%);
  box-shadow: 0 20px 60px -16px rgba(124,58,237,0.55);
}
.cd-hero-glow { position: absolute; border-radius: 50%; filter: blur(80px); z-index: 0; }
.cd-hero-glow-a { width: 280px; height: 280px; background: rgba(255,255,255,0.35); top: -120px; right: -80px; }
.cd-hero-glow-b { width: 320px; height: 320px; background: rgba(167,139,250,0.5); bottom: -160px; left: -100px; }
.cd-hero-grid {
  position: absolute; inset: 0; z-index: 1; opacity: .18;
  background-image: linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%);
}
.cd-stat-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.32);
  color: #fff; font-weight: 700; font-size: 13px; backdrop-filter: blur(6px);
}
.cd-refresh-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  background: #fff; color: #4d6bfe;
  border: none; cursor: pointer; font-weight: 800; font-size: 13px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.15); transition: transform .15s ease;
}
.cd-refresh-btn:hover:not(:disabled) { transform: translateY(-1px); }
.cd-refresh-btn:disabled { opacity: .7; cursor: not-allowed; }

.cd-tabs {
  display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  padding: 6px; border-radius: 14px;
}
.cd-tab {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 10px; cursor: pointer;
  background: transparent; border: none; color: var(--mm-fg-muted);
  font-weight: 700; font-size: 13.5px; transition: all .15s ease;
}
.cd-tab:hover { color: var(--mm-fg); }
.cd-tab.is-active {
  background: var(--mm-primary); color: #fff;
  box-shadow: 0 6px 16px -6px var(--mm-primary);
}

.cd-toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
.cd-search {
  flex: 1 1 280px; display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 14px;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  color: var(--mm-fg);
}
.cd-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--mm-fg); font-size: 14px; font-family: inherit;
}
.cd-search input::placeholder { color: var(--mm-fg-muted); opacity: .7; }
.cd-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.cd-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; cursor: pointer;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  color: var(--mm-fg); font-weight: 700; font-size: 12px; transition: all .15s ease;
}
.cd-chip:hover { border-color: var(--mm-primary); }
.cd-chip.is-active { background: var(--mm-primary); color: #fff; border-color: var(--mm-primary); }

.cd-loading, .cd-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 80px 20px; text-align: center; color: var(--mm-fg-muted);
}
.cd-loading h3, .cd-empty h3 { margin: 8px 0 0; color: var(--mm-fg); font-size: 18px; }
.cd-loading svg { color: var(--mm-primary); }
.cd-error {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 14px 18px; border-radius: 14px;
  background: rgba(244,63,94,0.08); border: 1px solid rgba(244,63,94,0.3);
  color: #fda4af; font-weight: 600; margin-bottom: 20px;
}
.cd-error-btn { margin-left: auto; padding: 6px 12px; border-radius: 8px; background: #f43f5e; color: #fff; border: none; cursor: pointer; font-weight: 700; }

.cd-grid { display: grid; gap: 20px; }
.cd-card {
  position: relative; overflow: hidden;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  border-radius: 22px; padding: 22px;
  display: flex; flex-direction: column; gap: 16px;
  transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.cd-card:hover { transform: translateY(-3px); border-color: var(--mm-primary); box-shadow: 0 18px 40px -18px var(--mm-primary); }
.cd-card-halo {
  position: absolute; top: -60px; right: -60px;
  width: 180px; height: 180px; border-radius: 50%;
  background: radial-gradient(circle, var(--mm-primary) 0%, transparent 70%);
  opacity: .12; pointer-events: none;
}
.cd-card-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.cd-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 800; letter-spacing: .3px; line-height: 1.2;
}
.cd-badge-soft { background: var(--mm-bg-elev); color: var(--mm-fg-muted); border: 1px solid var(--mm-border); }
.cd-card-title { margin: 0 0 6px; font-size: 18px; font-weight: 900; color: var(--mm-fg); line-height: 1.35; }
.cd-card-title a { color: var(--mm-fg); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.cd-card-title a:hover { color: var(--mm-primary); }
.cd-card-desc {
  margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--mm-fg-muted);
  min-height: 40px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.cd-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.cd-stat {
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px;
  padding: 12px 14px; border-radius: 12px;
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  font-size: 14px; color: var(--mm-fg);
}
.cd-stat-val { display: flex; align-items: center; gap: 6px; width: 100%; }
.cd-stat b { font-weight: 800; font-size: 14px; }
.cd-stat span { color: var(--mm-fg-muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; }

.cd-card-actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
@media (max-width: 640px) {
  .cd-card-actions .cd-cta { flex: 1 1 100%; }
  .cd-card-actions .cd-secondary { flex: 1 1 calc(50% - 4px); }
}
.cd-cta {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; border-radius: 12px; border: none; cursor: pointer;
  background: var(--mm-primary); color: #fff; font-weight: 800; font-size: 13.5px;
  box-shadow: 0 8px 22px -10px var(--mm-primary);
  transition: transform .15s ease, filter .15s ease;
}
.cd-cta:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
.cd-cta:disabled { opacity: .6; cursor: not-allowed; }
.cd-cta-block { width: 100%; padding: 14px; margin-top: 8px; }

.cd-secondary {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px; border-radius: 12px;
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  color: var(--mm-fg-muted); font-weight: 700; font-size: 12.5px; cursor: pointer;
  transition: all .15s ease;
}
.cd-secondary:hover { border-color: var(--mm-primary); color: var(--mm-fg); }
.cd-secondary.is-done {
  background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.4); color: #10b981;
}

.cd-panel {
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  border-radius: 22px; padding: clamp(20px, 3vw, 28px);
}
.cd-panel-title {
  display: flex; align-items: center; gap: 10px;
  margin: 0 0 18px; font-size: 20px; font-weight: 900; color: var(--mm-fg);
}
.cd-form { display: flex; flex-direction: column; gap: 10px; }
.cd-input {
  width: 100%; padding: 13px 16px; border-radius: 12px;
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  color: var(--mm-fg); font-size: 14px; font-family: inherit; outline: none;
  transition: border-color .15s ease;
}
.cd-input:focus { border-color: var(--mm-primary); }
.cd-hours { display: flex; align-items: center; gap: 10px; }
.cd-hours label { font-size: 13px; color: var(--mm-fg-muted); font-weight: 700; }
.cd-input-num { width: 90px; }
.cd-textarea {
  width: 100%; min-height: 160px; padding: 14px;
  border-radius: 12px; background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  color: var(--mm-fg); font-size: 13.5px; font-family: inherit; outline: none;
  resize: vertical; box-sizing: border-box;
}
.cd-textarea:focus { border-color: var(--mm-primary); }

.cd-plan { margin-top: 22px; display: flex; flex-direction: column; gap: 16px; }
.cd-plan-summary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 12px; align-self: flex-start;
  background: linear-gradient(135deg, rgba(77,107,254,0.12), rgba(167,139,250,0.12));
  color: var(--mm-fg); font-weight: 700; border: 1px solid var(--mm-border-strong);
}
.cd-weeks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.cd-week {
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  border-radius: 14px; padding: 14px;
}
.cd-week-head { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--mm-primary); font-weight: 800; }
.cd-week-focus { font-weight: 800; color: var(--mm-fg); margin: 4px 0 8px; }
.cd-week ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.cd-week li { display: flex; align-items: flex-start; gap: 6px; font-size: 12.5px; color: var(--mm-fg-muted); }
.cd-week li svg { margin-top: 3px; color: var(--mm-primary); flex-shrink: 0; }
.cd-week-res { font-size: 11.5px; color: var(--mm-fg-muted); margin-top: 8px; opacity: .85; }

.cd-tips {
  background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.25);
  padding: 16px; border-radius: 14px;
}
.cd-tips h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--mm-fg); font-size: 15px; }
.cd-tips ul { margin: 0; padding-left: 18px; color: var(--mm-fg-muted); font-size: 13px; line-height: 1.6; }

.cd-ats { margin-top: 22px; display: flex; flex-direction: column; gap: 18px; }
.cd-ats-score {
  display: flex; align-items: center; gap: 18px;
  padding: 18px; border-radius: 16px;
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
}
.cd-ats-ring {
  --p: 0;
  width: 96px; height: 96px; border-radius: 50%;
  background: conic-gradient(var(--mm-primary) calc(var(--p) * 1%), var(--mm-border) 0);
  display: flex; align-items: center; justify-content: center;
  position: relative; flex-shrink: 0;
}
.cd-ats-ring::after {
  content: ''; position: absolute; inset: 8px; border-radius: 50%;
  background: var(--mm-bg-card);
}
.cd-ats-ring > div {
  position: relative; z-index: 1; font-size: 22px; font-weight: 900; color: var(--mm-fg);
}
.cd-ats-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.cd-ats-col {
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  border-radius: 14px; padding: 14px;
}
.cd-ats-col h4 { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 13px; color: var(--mm-fg); }
.cd-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cd-tag { padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.cd-tag-ok { background: rgba(16,185,129,0.14); color: #10b981; }
.cd-tag-warn { background: rgba(244,63,94,0.14); color: #f43f5e; }
.cd-ats-block {
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  border-radius: 14px; padding: 14px;
}
.cd-ats-block h4 { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: var(--mm-fg); }
.cd-ats-block ul { margin: 0; padding-left: 18px; color: var(--mm-fg-muted); font-size: 13px; line-height: 1.6; }

.cd-search-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 10px; cursor: pointer;
  background: var(--mm-primary); color: #fff; border: none;
  font-weight: 800; font-size: 12.5px; white-space: nowrap;
  transition: filter .15s ease, transform .15s ease;
}
.cd-search-btn:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.cd-search-btn:disabled { opacity: .55; cursor: not-allowed; }
.cd-search-btn-ghost {
  background: var(--mm-bg-elev); color: var(--mm-fg-muted);
  border: 1px solid var(--mm-border);
}
.cd-live-banner {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 12px; margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(77,107,254,0.12), rgba(167,139,250,0.12));
  border: 1px solid var(--mm-border-strong);
  color: var(--mm-fg); font-size: 13px; font-weight: 600;
}
.cd-live-banner svg { color: var(--mm-primary); }

/* ── J'ai vu une certif ─────────────────────────────────────────────── */
.cd-hint-panel {
  background: linear-gradient(135deg, rgba(124,58,237,0.10), rgba(77,107,254,0.06));
  border: 1px solid var(--mm-border-strong);
  border-radius: 18px;
  padding: 16px 18px;
  margin-bottom: 20px;
}
.cd-hint-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.cd-hint-head svg { color: var(--mm-primary-glow); margin-top: 2px; flex-shrink: 0; }
.cd-hint-title { font-weight: 900; color: var(--mm-fg); font-size: 15px; }
.cd-hint-sub { font-size: 12px; color: var(--mm-fg-muted); margin-top: 2px; line-height: 1.45; }
.cd-hint-row { display: flex; gap: 10px; flex-wrap: wrap; }
.cd-hint-row .cd-input { flex: 1; min-width: 240px; }
.cd-hint-alts {
  margin-top: 10px; font-size: 12px; color: var(--mm-fg-muted);
  padding: 8px 12px; background: var(--mm-bg-elev); border-radius: 10px;
  border: 1px dashed var(--mm-border);
}

/* ── Veille active : tendances ────────────────────────────────────── */
.cd-trending {
  background: var(--mm-bg-card);
  border: 1px solid var(--mm-border);
  border-radius: 18px;
  padding: 16px 18px;
  margin-bottom: 24px;
}
.cd-trending-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
}
.cd-trending-title { font-weight: 900; color: var(--mm-fg); font-size: 15px; }
.cd-trending-sub { font-size: 12px; color: var(--mm-fg-muted); margin-top: 2px; line-height: 1.45; }
.cd-trending-strip {
  display: flex; gap: 12px; overflow-x: auto;
  padding-bottom: 8px; -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.cd-trending-strip::-webkit-scrollbar { display: none; }
.cd-trending-card {
  flex: 0 0 260px; scroll-snap-align: start;
  background: var(--mm-bg-elev);
  border: 1px solid var(--mm-border);
  border-radius: 14px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.cd-trending-cat {
  display: inline-block; align-self: flex-start;
  font-size: 10px; font-weight: 900; letter-spacing: 0.5px;
  color: var(--mm-primary-glow);
  background: rgba(139,92,246,0.12);
  padding: 3px 8px; border-radius: 8px; text-transform: uppercase;
}
.cd-trending-name { font-weight: 800; color: var(--mm-fg); font-size: 14px; line-height: 1.3; }
.cd-trending-provider { font-size: 11px; color: var(--mm-fg-muted); font-weight: 700; }
.cd-trending-reason {
  font-size: 12px; color: var(--mm-fg); line-height: 1.45;
  padding: 8px 10px; background: rgba(167,139,250,0.08);
  border-radius: 10px; margin-top: 4px;
}
.cd-trending-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: auto; padding-top: 8px;
}
.cd-pill {
  font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 8px;
  background: var(--mm-bg-card); color: var(--mm-fg-muted);
  border: 1px solid var(--mm-border);
}
.cd-pill.is-free { background: rgba(16,185,129,0.15); color: #10b981; border-color: rgba(16,185,129,0.3); }
.cd-trending-link {
  font-size: 11px; font-weight: 800; color: var(--mm-primary-glow);
  text-decoration: none;
}
.cd-trending-link:hover { text-decoration: underline; }
.cd-cta-ghost {
  background: var(--mm-bg-elev) !important;
  color: var(--mm-fg-muted) !important;
  border: 1px solid var(--mm-border) !important;
}
`;

export default CertificationsDashboard;
