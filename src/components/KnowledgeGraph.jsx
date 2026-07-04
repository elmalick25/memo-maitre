// ═══════════════════════════════════════════════════════════════════════════
// KnowledgeGraph — Constellation de Connaissances (Compact + God Mode)
// Visualisation SVG des catégories en orbites animées avec progression
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { lightenColor, darkenColor } from "../lib/colorUtils";
import { today } from "../utils/dateUtils";

const KnowledgeGraph = ({ categories, expressions, theme, isDarkMode, onNodeClick }) => {
  const [hovered, setHovered] = useState(null);

  const nodes = useMemo(() => {
    return categories.map((cat) => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const todayStr = today();
      const due = catExps.filter(e => e.nextReview && String(e.nextReview) <= String(todayStr) && (e.level || 0) < 7).length;
      const mastered = catExps.filter(e => (e.level || 0) >= 7).length;

      // ── Progression DOUCE et ROBUSTE ───────────────────────────────────
      // 1) Composante "niveau" : moyenne des levels normalisés sur 7.
      // 2) Composante "activité" : nombre moyen de révisions par fiche
      //    (plafonné à 4) — récompense une catégorie sur laquelle on
      //    travaille même si les niveaux sont encore bas.
      // 3) On prend le MAX des deux pour ne plus jamais voir un module
      //    affiché à 0 % alors qu'on a déjà bossé dessus.
      // 4) Plancher visuel à 4 % dès qu'il existe au moins une fiche, pour
      //    montrer que l'orbite vit. Aucune fiche → "—" (rendu plus bas).
      let pct = 0;
      if (catExps.length > 0) {
        const avgLevel = catExps.reduce((s, e) => s + Math.min(7, e.level || 0), 0) / catExps.length;
        const avgReviews = catExps.reduce((s, e) => s + Math.min(4, (e.reviewHistory || []).length), 0) / catExps.length;
        const levelPct = (avgLevel / 7) * 100;
        const activityPct = (avgReviews / 4) * 100 * 0.35; // pondérée pour ne pas masquer le vrai niveau
        pct = Math.round(Math.max(levelPct, activityPct));
        if (pct < 4) pct = 4;
      }

      const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
      const isUrgent = daysToExam !== null && daysToExam <= 7;
      const isMastered = mastered === catExps.length && catExps.length > 0;
      const needsReview = due > 0;
      // Rayons encore plus compacts (28-44) pour une constellation aérienne et "jolie"
      const radius = Math.min(44, Math.max(28, 28 + Math.sqrt(catExps.length) * 2.2));
      return {
        id: cat.name, label: cat.name,
        color: isUrgent ? "#EF4444" : (cat.color || "#4D6BFE"),
        radius, isMastered, needsReview, isUrgent, pct, due,
        total: catExps.length, mastered,
      };
    });
  }, [categories, expressions]);

  // ── Canvas étendu pour orbites elliptiques (500x340) ────────────────
  const W = 500, H = 340;
  const cx = W / 2, cy = H / 2;

  const getPos = (i, total) => {
    if (total === 1) return { x: cx, y: cy };
    if (total === 2) return i === 0 ? { x: cx - 120, y: cy } : { x: cx + 120, y: cy };
    // Orbite unique pour <= 6, double orbite au-delà
    const ring = total > 6 ? (i % 2) : 0;
    const rx = 130 + ring * 75; // Plus grand sur l'axe X pour utiliser l'espace
    const ry = 80 + ring * 50;  // Plus petit sur l'axe Y
    const perRing = total > 6 ? Math.ceil(total / 2) : total;
    const idxInRing = total > 6 ? Math.floor(i / 2) : i;
    
    // Décalage de l'angle pour le deuxième orbite afin qu'il ne masque pas le premier
    const angleOffset = ring === 1 ? (Math.PI / perRing) : 0;
    
    const angle = (2 * Math.PI * idxInRing) / perRing - Math.PI / 2 + angleOffset;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  };

  const positions = nodes.map((_, i) => getPos(i, nodes.length));

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 520, margin: "0 auto" }}>
      <style>{`
        @keyframes kg-data-flow { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
        @keyframes kg-float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }
        @keyframes kg-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        .kg-link { animation: kg-data-flow 1.2s linear infinite; }
        .kg-pulse { animation: kg-pulse 2s ease-in-out infinite; }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="kg-shine" cx="32%" cy="28%" r="68%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="kg-glow-sm" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {nodes.map(node => {
            const baseColor = node.color;
            return (
              <radialGradient key={`g-${node.id}`} id={`kg-grad-${node.id}`} cx="35%" cy="28%" r="75%">
                <stop offset="0%" stopColor={isDarkMode ? lightenColor(baseColor, 35) : lightenColor(baseColor, 55)} />
                <stop offset="55%" stopColor={baseColor} />
                <stop offset="100%" stopColor={isDarkMode ? darkenColor(baseColor, 25) : darkenColor(baseColor, 12)} />
              </radialGradient>
            );
          })}
        </defs>

        {/* ── Orbites d'arrière-plan elliptiques ── */}
        {[0, 1].map((ring, i) => {
          const rx = 130 + ring * 75;
          const ry = 80 + ring * 50;
          return (
            <ellipse key={`orbit-${i}`} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={theme.border} strokeWidth="0.7" strokeDasharray="3 6" opacity={0.22} />
          );
        })}


        {/* ── Liens vers le hub ── */}
        {nodes.length > 1 && positions.map((pos, i) => {
          const node = nodes[i];
          return (
            <line
              key={`l-${i}`}
              className="kg-link"
              x1={cx} y1={cy} x2={pos.x} y2={pos.y}
              stroke={node.color} strokeWidth="1.2" strokeDasharray="4 6"
              opacity={hovered && hovered !== node.id ? 0.1 : 0.45}
              style={{ transition: 'opacity 0.3s' }}
            />
          );
        })}

        {/* ── Hub central ── */}
        {nodes.length > 1 && (
          <g className="kg-pulse" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <circle cx={cx} cy={cy} r={11} fill={isDarkMode ? "#1e2a4a" : "#EEF2FF"} stroke={theme.highlight} strokeWidth="2" filter="url(#kg-glow-sm)" opacity="0.85" />
            <circle cx={cx} cy={cy} r={5} fill={theme.highlight} />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize="9" fill="white" fontWeight="900">✦</text>
          </g>
        )}

        {/* ── Astres ── */}
        {nodes.map((node, i) => {
          const { x, y } = positions[i];
          const isHov = hovered === node.id;
          const scale = isHov ? 1.12 : 1;
          const rawLabel = (node.label || "").replace(/^[\p{Emoji}\s]+/u, '').trim();
          const shortLabel = rawLabel.length > 11 ? rawLabel.substring(0, 9) + '…' : rawLabel;
          const floatDelay = -(i * 0.6) + "s";
          // Petite police adaptative
          const labelFs = node.radius < 38 ? 8.5 : 10;
          const pctFs = node.radius < 38 ? 12 : 15;

          return (
            <g
              key={node.id}
              transform={`translate(${x}, ${y}) scale(${scale})`}
              style={{ cursor: 'pointer', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s', opacity: hovered && !isHov ? 0.35 : 1, transformOrigin: '0 0' }}
              onClick={() => onNodeClick && onNodeClick(node.id)}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <g style={{ animation: `kg-float 3s ease-in-out infinite`, animationDelay: floatDelay }}>
                {(node.isUrgent || node.needsReview) && (
                  <circle r={node.radius + 5} fill="none"
                    stroke={node.isUrgent ? "#EF4444" : "#00D2FF"}
                    strokeWidth="1.8" strokeDasharray="4 3" opacity="0.75" className="kg-pulse" />
                )}
                {node.isMastered && (
                  <circle r={node.radius + 4} fill="none" stroke="#22C55E" strokeWidth="2.2" opacity="0.7" filter="url(#kg-glow-sm)" />
                )}

                {/* corps */}
                <circle cx={0} cy={0} r={node.radius} fill={`url(#kg-grad-${node.id})`} filter={isHov ? "url(#kg-glow-sm)" : "none"} stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
                <circle cx={0} cy={0} r={node.radius} fill="url(#kg-shine)" style={{ pointerEvents: 'none' }} />

                {/* Arc de progression */}
                {node.total > 0 && (() => {
                  const ringR = node.radius - 3;
                  const circ = 2 * Math.PI * ringR;
                  const stroke = node.isMastered ? "#4ade80" : "rgba(255,255,255,0.85)";
                  return (
                    <g transform="rotate(-90)">
                      <circle cx="0" cy="0" r={ringR} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
                      <circle cx="0" cy="0" r={ringR} fill="none" stroke={stroke} strokeWidth="3"
                        strokeDasharray={`${(node.pct / 100) * circ} ${circ}`} strokeLinecap="round"
                        style={{ pointerEvents: 'none', transition: 'stroke-dasharray 0.8s ease' }} />
                    </g>
                  );
                })()}

                <text x={0} y={-6} textAnchor="middle" fill="#ffffff" fontSize={labelFs} fontWeight="800" style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>
                  {shortLabel}
                </text>
                <text x={0} y={pctFs - 4} textAnchor="middle" fill="rgba(255,255,255,0.97)" fontSize={pctFs} fontWeight="900" style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>
                  {node.total > 0 ? `${node.pct}%` : "—"}
                </text>


                {/* Badge "due" */}
                {node.due > 0 && (
                  <g transform={`translate(0, ${node.radius + 1})`}>
                    <rect x="-20" y="-7" width="40" height="14" rx="7"
                      fill={node.isUrgent ? "#EF4444" : "rgba(0, 210, 255, 0.18)"}
                      stroke={node.isUrgent ? "rgba(255,255,255,0.25)" : "#00D2FF"} strokeWidth="1.2" />
                    <text x="0" y="3" textAnchor="middle"
                      fill={node.isUrgent ? "#FFFFFF" : "#00D2FF"} fontSize="9" fontWeight="900"
                      style={{ pointerEvents: 'none' }}>
                      {node.due} dus
                    </text>
                  </g>
                )}
              </g>
            </g>
          );
        })}
      </svg>

      {/* Tooltip holographique */}
      {hovered && (() => {
        const hNode = nodes.find(n => n.id === hovered);
        if (!hNode) return null;
        return (
          <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', background: isDarkMode ? 'rgba(10,15,35,0.9)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${hNode.color}`, borderRadius: 10, padding: '7px 12px', boxShadow: `0 6px 22px ${hNode.color}45`, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', zIndex: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: theme.text, marginBottom: 2 }}>{hNode.label}</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: theme.textMuted }}>
              <span><strong style={{ color: theme.text }}>{hNode.total}</strong> fiches</span>
              <span><strong style={{ color: '#22C55E' }}>{hNode.pct}%</strong> progression</span>
              {hNode.due > 0 && <span><strong style={{ color: hNode.isUrgent ? '#EF4444' : '#00D2FF' }}>{hNode.due}</strong> dues</span>}
            </div>
          </div>
        );
      })()}

      {/* Légende compacte */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} /> Maîtrisé
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px dashed #00D2FF' }} /> À réviser
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px dashed #EF4444' }} /> Urgent
        </span>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
