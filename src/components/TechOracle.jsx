import React, { useState, useEffect } from 'react';
import { Eye, TrendingUp, AlertTriangle, Zap, Target, Activity, RefreshCw } from 'lucide-react';
const ORACLE_CACHE_KEY = 'astrale_oracle_prediction_v2';

export default function TechOracle({
  callClaude,
  theme,
  isDarkMode,
  onBack,
  setView
}) {
  const [stack, setStack] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    const mentorProfile = localStorage.getItem('astrale_mentor_profile');
    const phantomConfig = localStorage.getItem('astrale_phantom_config');
    let detectedStack = "JavaScript, React, Node.js";
    if (phantomConfig) {
      detectedStack = JSON.parse(phantomConfig).stack;
    } else if (mentorProfile) {
      detectedStack = mentorProfile;
    }
    setStack(detectedStack);
    // Charge le dernier résultat depuis le cache persistant
    try {
      const cached = localStorage.getItem(ORACLE_CACHE_KEY);
      if (cached) setPrediction(JSON.parse(cached));
    } catch { }
  }, []);

  const runPrediction = async () => {
    setLoading(true);
    const prompt = `Tu es le "Tech Oracle", une IA d'analyse prédictive qui anticipe l'obsolescence des compétences informatiques.
La stack actuelle de cet utilisateur est : ${stack}.

Ta mission :
Analyse les signaux faibles actuels et REELS (dépôts GitHub en forte croissance réelle, vrais investissements VC, conférences tech annoncées, vraies offres d'emploi émergentes) pour prédire la valeur de cette stack dans 3 ans (en 2028).
UTILISE IMPÉRATIVEMENT LA RECHERCHE WEB. NOUS SOMMES EN MAI 2026. IL EST STRICTEMENT INTERDIT D'INVENTER DES FAITS.

Renvoie UNIQUEMENT un JSON structuré exactement comme ceci :
{
  "obsolescence_year": 2026,
  "status_message": "Ex: Forte demande jusqu'en 2026, puis déclin progressif face aux agents IA.",
  "weak_signals": [
    "Signal réel 1 (ex: Levée de fonds de 50M de la startup XYZ en 2026)",
    "Signal réel 2 (ex: Baisse constatée de 15% des offres requérant ce framework précis)"
  ],
  "future_skills": [
    {
      "name": "Nom précis de la techno/compétence émergente",
      "reason": "Pourquoi c'est le futur",
      "impact": "High"
    },
    {
      "name": "Techno 2",
      "reason": "...",
      "impact": "Medium"
    },
    {
      "name": "Techno 3",
      "reason": "...",
      "impact": "High"
    }
  ]
}
Aucun texte avant ou après le JSON.`;

    try {
      const res = await callClaude(
        "Tu es l'Oracle Tech. Tu renvoies uniquement du JSON.",
        prompt,
        { grounding: true, maxTokens: 2500, temperature: 0.3 }
      );
      
      const text = typeof res === 'string' ? res : res?.text || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]);
        setPrediction(data);
        // Persistance sans TTL
        localStorage.setItem(ORACLE_CACHE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      console.error("Oracle Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdoptSkill = (skillName) => {
    localStorage.setItem('astrale_oracle_intent', JSON.stringify({
      skill: skillName,
      timestamp: Date.now()
    }));
    setView("academie");
  };

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: '0 auto', color: isDarkMode ? 'var(--mm-bg-elev)' : '#0F172A' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', marginBottom: 20, fontWeight: 700 }}>← Retour au Dashboard</button>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eye size={32} color="#4D6BFE" /> Tech Oracle
          </h1>
          <p style={{ color: '#64748B', fontSize: 16, margin: 0 }}>Anticipe ta valeur sur le marché. Prépare 2028.</p>
        </div>
        
        {!prediction && !loading && (
          <button onClick={runPrediction} style={{ background: 'linear-gradient(135deg, #4D6BFE, #1E3A8A)', color: 'white', padding: '12px 24px', borderRadius: 16, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 25px rgba(77, 107, 254, 0.3)' }}>
            <Activity size={18} /> Lancer la Prédiction
          </button>
        )}
        {prediction && !loading && (
          <button onClick={runPrediction} disabled={loading} style={{ background: isDarkMode ? 'rgba(77,107,254,0.12)' : 'rgba(77,107,254,0.1)', color: '#4D6BFE', padding: '10px 20px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} /> Relancer
          </button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 80, textAlign: 'center', background: isDarkMode ? 'rgba(77, 107, 254, 0.05)' : '#F5F3FF', borderRadius: 24, border: isDarkMode ? '1px solid rgba(77, 107, 254, 0.2)' : '1px solid #EDE9FE' }}>
          <div style={{ width: 80, height: 80, margin: '0 auto 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, border: '2px dashed #4D6BFE', borderRadius: '50%', animation: 'spin 4s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 10, border: '2px solid rgba(77, 107, 254, 0.3)', borderRadius: '50%', animation: 'spin 2s linear infinite reverse' }} />
            <Eye size={32} color="#4D6BFE" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', animation: 'pulseDot 1.5s infinite' }} />
          </div>
          <h2 style={{ fontSize: 20, margin: '0 0 8px 0' }}>Analyse des Signaux Faibles en cours...</h2>
          <p style={{ color: '#4D6BFE' }}>Scan des dépôts GitHub, offres d'emploi et investissements VC.</p>
        </div>
      )}

      {!loading && !prediction && (
        <div style={{ padding: 40, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'white', borderRadius: 24, border: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--mm-border)' }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>Stack Actuelle Détectée :</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stack.split(',').map((s, i) => (
              <span key={i} style={{ background: isDarkMode ? '#1E293B' : 'var(--mm-bg-elev)', padding: '8px 16px', borderRadius: 12, fontWeight: 700 }}>{s.trim()}</span>
            ))}
          </div>
          <p style={{ marginTop: 24, color: '#64748B' }}>Clique sur "Lancer la Prédiction" pour savoir combien de temps cette stack te gardera compétitif.</p>
        </div>
      )}

      {prediction && (
        <div className="fade-in">
          {/* Diagnostic Principal */}
          <div style={{ background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'white', borderRadius: 24, padding: 32, marginBottom: 32, border: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--mm-border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, padding: '16px 24px', background: prediction.obsolescence_year <= 2026 ? '#EF4444' : '#F59E0B', color: 'white', fontWeight: 900, borderBottomLeftRadius: 24 }}>
              Horizon : {prediction.obsolescence_year}
            </div>
            <h2 style={{ fontSize: 24, marginTop: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <TrendingUp size={24} color={prediction.obsolescence_year <= 2026 ? '#EF4444' : '#F59E0B'} />
              Diagnostic de Valeur
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: isDarkMode ? 'var(--mm-border-strong)' : 'var(--mm-fg)', fontWeight: 500 }}>
              « {prediction.status_message} »
            </p>
            
            <div style={{ marginTop: 24, background: isDarkMode ? 'rgba(77,107,254,0.2)' : 'var(--mm-bg-elev)', padding: 20, borderRadius: 16 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} /> Signaux Faibles Détectés
              </h4>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {prediction.weak_signals.map((sig, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                    <span style={{ color: '#4D6BFE' }}>•</span> {sig}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommandations */}
          <h2 style={{ fontSize: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Target size={24} color="#10B981" />
            Les 3 Compétences pour dominer en 2028
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {prediction.future_skills.map((skill, idx) => (
              <div key={idx} style={{ background: isDarkMode ? '#1E293B' : 'white', borderRadius: 20, padding: 24, border: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--mm-border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 10px 30px rgba(77,107,254,0.05)' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: isDarkMode ? 'white' : '#0F172A' }}>{skill.name}</h3>
                    <span style={{ background: skill.impact === 'High' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: skill.impact === 'High' ? '#10B981' : '#3B82F6', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
                      Impact {skill.impact}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: isDarkMode ? 'var(--mm-fg-muted)' : 'var(--mm-fg)', lineHeight: 1.5, marginBottom: 24 }}>
                    {skill.reason}
                  </p>
                </div>
                
                <button 
                  onClick={() => handleAdoptSkill(skill.name)}
                  style={{ width: '100%', background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'var(--mm-bg-elev)', border: 'none', padding: '12px', borderRadius: 12, color: isDarkMode ? 'white' : '#0F172A', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4D6BFE'; e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.05)' : 'var(--mm-bg-elev)'; e.currentTarget.style.color = isDarkMode ? 'white' : '#0F172A'; }}
                >
                  <Zap size={16} /> L'apprendre maintenant
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
