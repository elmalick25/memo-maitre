import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Activity, Eye, Terminal, ArrowRight, Loader2, GitPullRequest,
  Code, RefreshCw, Filter, Rocket, Search, ExternalLink, Zap, Flame,
  TrendingUp, Sparkles
} from 'lucide-react';
import { storage } from '../lib/firebase';
const Github = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={props.size || 24} height={props.size || 24} {...props}>
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const MENTOR_PROFILE_KEY = 'astrale_mentor_profile';
const CACHE_VERSION = 'v3';
const RADAR_LAST_GEN_KEY = 'os_radar_last_generated';

// CACHE EN MÉMOIRE POUR ZÉRO-LATENCE (ANTI-FLICKER)
let memoryCache_osRadar = null;

const DIFFICULTY_COLORS = {
  'Débutant': { bg: 'rgba(16,185,129,0.14)', fg: '#10b981', label: 'Débutant' },
  'Intermédiaire': { bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6', label: 'Intermédiaire' },
  'Avancé': { bg: 'rgba(244,63,94,0.14)', fg: '#f43f5e', label: 'Avancé' },
};

const IMPACT_COLORS = {
  'Top Tier': '#facc15',
  'Élevé': '#22d3ee',
  'Moyen': '#a78bfa',
};

// ── Hero gradient — adapts to light/dark via design tokens ─────────────
const HeroHeader = ({ count, onRefresh, refreshing }) => (
  <div className="osr-hero">
    <div className="osr-hero-glow osr-hero-glow-a" />
    <div className="osr-hero-glow osr-hero-glow-b" />
    <div className="osr-hero-grid" />

    <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
        <Sparkles size={14} /> Mission Open Source
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, color: '#fff', letterSpacing: -1, lineHeight: 1.05 }}>
        Radar Open Source<br />
        <span style={{ color: 'rgba(255,255,255,0.78)', fontWeight: 700, fontSize: 'clamp(15px, 1.6vw, 18px)' }}>
          Cible les projets à fort momentum. Ta première PR = ton meilleur CV.
        </span>
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        <div className="osr-stat-pill">
          <Rocket size={14} /> {count} projet{count > 1 ? 's' : ''} ciblé{count > 1 ? 's' : ''}
        </div>
        <div className="osr-stat-pill">
          <Activity size={14} /> Mise à jour live
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="osr-refresh-btn">
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Regénérer
        </button>
      </div>
    </div>
  </div>
);

const OpenSourceRadar = ({ callClaude, onPreparePR, isMobile }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState(() => memoryCache_osRadar || []);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [visibleProjectsCount, setVisibleProjectsCount] = useState(15);
  const [error, setError] = useState(null);

  // Charge depuis le cache local/Firebase (pas de TTL — on garde le dernier résultat jusqu'à régénération manuelle)
  const loadFromCache = async (stack) => {
    if (memoryCache_osRadar) {
      setProjects(memoryCache_osRadar);
      return true;
    }
    const cacheKey = `os_radar_${CACHE_VERSION}_${btoa(unescape(encodeURIComponent(stack))).slice(0, 20)}`;
    const cached = await storage.get(cacheKey);
    if (cached) {
      if (Array.isArray(cached?.projects) && cached.projects.length > 0) {
        setProjects(cached.projects);
        return true;
      }
    }
    return false;
  };

  const loadData = async (force = false) => {
    setError(null);

    // Lecture du profil
    const rawProfile = (storage?.get ? await storage.get(MENTOR_PROFILE_KEY) : null) || localStorage.getItem(MENTOR_PROFILE_KEY);
    let parsedProfile = null;
    if (typeof rawProfile === 'string') {
      try { parsedProfile = JSON.parse(rawProfile); } catch { parsedProfile = { stack: rawProfile }; }
    } else {
      parsedProfile = rawProfile;
    }
    setProfile(parsedProfile);
    const stack = parsedProfile?.stack || parsedProfile?.bio || 'Développeur Web Full-Stack';
    const cacheKey = `os_radar_${CACHE_VERSION}_${btoa(unescape(encodeURIComponent(stack))).slice(0, 20)}`;

    // Si pas forcé : on affiche le cache immédiatement s'il existe, sans appel IA
    if (!force) {
      const hadCache = await loadFromCache(stack);
      setLoading(false);
      if (hadCache) return; // Cache présent → on s'arrête là, pas d'appel IA
      // Pas de cache → on génère pour la première fois
    }

    force ? setRefreshing(true) : setLoading(true);

    try {
      const prompt = `Tu es un radar Open Source d'élite pour le recrutement tech. Stack utilisateur: "${stack}".
Trouve 6 projets GitHub EXISTANTS ET RÉELS (utilise la recherche web) qui ont au moins une "good first issue" ouverte, un fort momentum (stars qui montent) et une excellente visibilité recruteur.
IL EST STRICTEMENT INTERDIT D'INVENTER DES PROJETS OU DES LIENS. En cas de doute sur l'URL exacte, génère un lien de recherche DuckDuckGo vers le projet (ex: https://duckduckgo.com/?q=owner+name+github). Si un champ est inconnu, mets une estimation prudente.
Renvoie UNIQUEMENT un JSON valide, sans markdown.
Format:
{ "projects": [ {
  "repo": "owner/name",
  "description": "phrase courte",
  "url": "https://github.com/owner/name",
  "stars": "12.3k",
  "momentum": "+820 ce mois",
  "recruiterVisibility": "Élevée",
  "difficulty": "Débutant" | "Intermédiaire" | "Avancé",
  "goodFirstIssueTitle": "Titre exact de l'issue",
  "goodFirstIssueUrl": "https://github.com/owner/name/issues/123",
  "impact": "Top Tier" | "Élevé" | "Moyen",
  "language": "TypeScript",
  "tags": ["react","tooling"]
} ] }`;

      const res = await callClaude(prompt, 'Recherche GitHub OS', { grounding: true, temperature: 0.2 });
      const text = typeof res === 'string' ? res : res?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Réponse IA invalide');
      const data = JSON.parse(jsonMatch[0]);
      const list = (Array.isArray(data?.projects) ? data.projects : []).map(p => ({
        ...p,
        repo: p.repo || p.name || 'Projet open source',
        url: /^https?:\/\//i.test(p.url || '') ? p.url : `https://duckduckgo.com/?q=${encodeURIComponent(`${p.repo || p.name || ''} github`)}`,
        goodFirstIssueUrl: /^https?:\/\//i.test(p.goodFirstIssueUrl || '') ? p.goodFirstIssueUrl : (p.url || ''),
        tags: Array.isArray(p.tags) ? p.tags : [],
      }));
      memoryCache_osRadar = list;
      setProjects(list);
      // Sauvegarde dans Firebase/localStorage (persistant, sans TTL)
      try { await storage.set(cacheKey, { projects: list, ts: Date.now() }); } catch {}
      try { await storage.set(RADAR_LAST_GEN_KEY, new Date().toLocaleString('fr-FR')); } catch {}
    } catch (e) {
      console.error('Radar OS', e);
      // En cas d'erreur lors d'un refresh, on garde l'ancien cache affiché
      if (force) await loadFromCache(stack);
      setError("Impossible de charger le radar. Réessaie dans un instant.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(false); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(p => {
      if (filter !== 'all' && p.difficulty !== filter) return false;
      if (!q) return true;
      return (
        p.repo?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.language?.toLowerCase().includes(q) ||
        (p.tags || []).some(t => String(t).toLowerCase().includes(q))
      );
    });
  }, [projects, filter, query]);

  return (
    <>
      <style>{styles}</style>
      <div className="osr-root" style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 16 : 28, paddingBottom: 120 }}>
        <HeroHeader count={projects.length} onRefresh={() => loadData(true)} refreshing={refreshing} />

        {/* Toolbar */}
        <div className="osr-toolbar">
          <div className="osr-search">
            <Search size={16} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filtrer par repo, langage, tag…"
            />
          </div>
          <div className="osr-filters">
            {['all', 'Débutant', 'Intermédiaire', 'Avancé'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`osr-chip ${filter === f ? 'is-active' : ''}`}
              >
                <Filter size={12} /> {f === 'all' ? 'Tous' : f}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="osr-loading">
            <Loader2 className="animate-spin" size={42} />
            <h3>Balayage des dépôts GitHub…</h3>
            <p>Détection des mainteneurs qui cherchent des contributeurs.</p>
          </div>
        )}

        {!loading && error && (
          <div className="osr-error">
            <Zap size={18} /> {error}
            <button onClick={() => loadData(true)} className="osr-error-btn">Réessayer</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="osr-empty">
            <Github size={36} />
            <h3>Aucun projet ne correspond à ce filtre</h3>
            <p>Change la difficulté ou la recherche pour voir d'autres opportunités.</p>
          </div>
        )}

        <div className="osr-grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <AnimatePresence>
            {filtered.slice(0, visibleProjectsCount).map((proj, idx) => {
              const diff = DIFFICULTY_COLORS[proj.difficulty] || DIFFICULTY_COLORS['Intermédiaire'];
              const impactColor = IMPACT_COLORS[proj.impact] || '#a78bfa';
              return (
                <motion.div
                  key={proj.repo || idx}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  className="osr-card"
                >
                  <div className="osr-card-halo" />

                  <div className="osr-card-head">
                    <div className="osr-card-badges">
                      <span className="osr-badge" style={{ background: diff.bg, color: diff.fg }}>{diff.label}</span>
                      <span className="osr-badge" style={{ background: 'rgba(250,204,21,0.12)', color: impactColor }}>
                        <Flame size={11} /> {proj.impact || 'Élevé'}
                      </span>
                      {proj.language && (
                        <span className="osr-badge osr-badge-soft"><Code size={11} /> {proj.language}</span>
                      )}
                    </div>

                    <h3 className="osr-card-title">
                      {proj.url ? (
                        <a href={proj.url} target="_blank" rel="noreferrer">
                          {proj.repo} <ExternalLink size={14} />
                        </a>
                      ) : proj.repo}
                    </h3>
                    <p className="osr-card-desc">{proj.description}</p>
                  </div>

                  <div className="osr-stats">
                    <div className="osr-stat"><Star size={14} color="#eab308" /><b>{proj.stars || '—'}</b><span>stars</span></div>
                    <div className="osr-stat"><TrendingUp size={14} color="#10b981" /><b>{proj.momentum || '—'}</b><span>momentum</span></div>
                    <div className="osr-stat"><Eye size={14} color="#3b82f6" /><b>{proj.recruiterVisibility || '—'}</b><span>visibilité</span></div>
                    <div className="osr-stat"><Terminal size={14} color="#f43f5e" /><b>{proj.difficulty || '—'}</b><span>difficulté</span></div>
                  </div>

                  {proj.goodFirstIssueTitle && (
                    <a
                      href={proj.goodFirstIssueUrl || proj.url}
                      target="_blank" rel="noreferrer"
                      className="osr-issue"
                    >
                      <div className="osr-issue-label">Good first issue</div>
                      <div className="osr-issue-title">{proj.goodFirstIssueTitle}</div>
                    </a>
                  )}

                  <button onClick={() => onPreparePR?.(proj.repo)} className="osr-cta">
                    <GitPullRequest size={16} /> Préparer ma PR <ArrowRight size={16} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        {filtered.length > visibleProjectsCount && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button onClick={() => setVisibleProjectsCount(v => v + 15)} style={{ background: "transparent", color: "var(--mm-text)", border: "2px solid var(--mm-border)", padding: "12px 24px", borderRadius: 999, fontWeight: 800, cursor: "pointer" }}>
              Afficher plus de projets open source
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const styles = `
.osr-hero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: clamp(24px, 4vw, 40px);
  background: linear-gradient(135deg, #3b5cff 0%, #4d6bfe 50%, #6a87ff 100%);
  color: #fff;
  box-shadow: 0 20px 60px -16px rgba(77,107,254,0.55);
  margin-bottom: 24px;
  isolation: isolate;
}
:root:not([data-theme="light"]) .osr-hero {
  background: linear-gradient(135deg, #4338ca 0%, #6d28d9 50%, #8b5cf6 100%);
  box-shadow: 0 20px 60px -16px rgba(124,58,237,0.55);
}
.osr-hero-glow { position: absolute; border-radius: 50%; filter: blur(80px); z-index: 0; }
.osr-hero-glow-a { width: 280px; height: 280px; background: rgba(255,255,255,0.35); top: -120px; right: -80px; }
.osr-hero-glow-b { width: 320px; height: 320px; background: rgba(167,139,250,0.5); bottom: -160px; left: -100px; }
.osr-hero-grid {
  position: absolute; inset: 0; z-index: 1; opacity: 0.18;
  background-image: linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%);
}
.osr-stat-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.32);
  color: #fff; font-weight: 700; font-size: 13px; backdrop-filter: blur(6px);
}
.osr-refresh-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  background: rgba(255,255,255,0.95); color: #4d6bfe;
  border: none; cursor: pointer; font-weight: 800; font-size: 13px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.15); transition: transform .15s ease;
}
.osr-refresh-btn:hover:not(:disabled) { transform: translateY(-1px); }
.osr-refresh-btn:disabled { opacity: .7; cursor: not-allowed; }

.osr-toolbar {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
  margin-bottom: 24px;
}
.osr-search {
  flex: 1 1 280px; display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 14px;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  color: var(--mm-fg);
}
.osr-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--mm-fg); font-size: 14px; font-family: inherit;
}
.osr-search input::placeholder { color: var(--mm-fg-muted); opacity: .7; }
.osr-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.osr-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; cursor: pointer;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  color: var(--mm-fg); font-weight: 700; font-size: 12px;
  transition: all .15s ease;
}
.osr-chip:hover { border-color: var(--mm-primary); }
.osr-chip.is-active {
  background: var(--mm-primary); color: #fff; border-color: var(--mm-primary);
  box-shadow: 0 6px 16px -4px var(--mm-primary);
}

.osr-loading, .osr-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 80px 20px; text-align: center; color: var(--mm-fg-muted);
}
.osr-loading h3, .osr-empty h3 { margin: 8px 0 0; color: var(--mm-fg); font-size: 18px; }
.osr-loading p, .osr-empty p { margin: 0; font-size: 14px; }
.osr-loading svg { color: var(--mm-primary); }

.osr-error {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 14px 18px; border-radius: 14px;
  background: rgba(244,63,94,0.08); border: 1px solid rgba(244,63,94,0.3);
  color: #fda4af; font-weight: 600; margin-bottom: 20px;
}
.osr-error-btn {
  margin-left: auto; padding: 6px 12px; border-radius: 8px;
  background: #f43f5e; color: #fff; border: none; cursor: pointer; font-weight: 700;
}

.osr-grid { display: grid; gap: 20px; }

.osr-card {
  position: relative; overflow: hidden;
  background: var(--mm-bg-card); border: 1px solid var(--mm-border);
  border-radius: 22px; padding: 22px;
  display: flex; flex-direction: column; gap: 16px;
  transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.osr-card:hover {
  transform: translateY(-3px);
  border-color: var(--mm-primary);
  box-shadow: 0 18px 40px -18px var(--mm-primary);
}
.osr-card-halo {
  position: absolute; top: -60px; right: -60px;
  width: 180px; height: 180px; border-radius: 50%;
  background: radial-gradient(circle, var(--mm-primary) 0%, transparent 70%);
  opacity: .12; pointer-events: none;
}
.osr-card-head { position: relative; z-index: 1; }
.osr-card-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.osr-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 800; letter-spacing: .3px;
}
.osr-badge-soft {
  background: var(--mm-bg-elev); color: var(--mm-fg-muted);
  border: 1px solid var(--mm-border);
}
.osr-card-title { margin: 0 0 6px; font-size: 18px; font-weight: 900; color: var(--mm-fg); }
.osr-card-title a {
  color: var(--mm-fg); text-decoration: none;
  display: inline-flex; align-items: center; gap: 6px;
}
.osr-card-title a:hover { color: var(--mm-primary); }
.osr-card-desc {
  margin: 0; font-size: 13.5px; line-height: 1.5;
  color: var(--mm-fg-muted); min-height: 40px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.osr-stats {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.osr-stat {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 10px;
  background: var(--mm-bg-elev); border: 1px solid var(--mm-border);
  font-size: 12px; color: var(--mm-fg);
}
.osr-stat b { color: var(--mm-fg); font-weight: 800; }
.osr-stat span { color: var(--mm-fg-muted); margin-left: auto; font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; }

.osr-issue {
  display: block; text-decoration: none;
  padding: 12px 14px; border-radius: 12px;
  background: linear-gradient(135deg, rgba(77,107,254,0.1), rgba(167,139,250,0.08));
  border: 1px solid var(--mm-border-strong);
  transition: transform .15s ease;
}
.osr-issue:hover { transform: translateX(2px); }
.osr-issue-label {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.2px;
  color: var(--mm-primary); font-weight: 800; margin-bottom: 4px;
}
.osr-issue-title { font-size: 13px; color: var(--mm-fg); font-weight: 600; line-height: 1.4; }

.osr-cta {
  margin-top: auto;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 13px;
  background: var(--mm-primary); color: #fff;
  border: none; border-radius: 12px; cursor: pointer;
  font-weight: 800; font-size: 14px;
  box-shadow: 0 8px 22px -10px var(--mm-primary);
  transition: transform .15s ease, filter .15s ease;
}
.osr-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
`;

export default OpenSourceRadar;
