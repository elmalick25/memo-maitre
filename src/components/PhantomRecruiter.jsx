import React, { useState, useEffect } from 'react';
import { Briefcase, Settings, MapPin, DollarSign, Code, Search, CheckCircle, ChevronDown, ChevronUp, Copy, ShieldAlert } from 'lucide-react';

export default function PhantomRecruiter({
  callClaude,
  theme,
  isDarkMode,
  onBack
}) {
  const [config, setConfig] = useState(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  
  const [form, setForm] = useState({
    title: "",
    salary: "",
    location: "Remote",
    stack: "React, Node.js"
  });

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [offers, setOffers] = useState([]);
  const [expandedOffer, setExpandedOffer] = useState(null);

  useEffect(() => {
    const savedConfig = localStorage.getItem('astrale_phantom_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig(parsed);
      setForm(parsed);
    } else {
      setIsConfiguring(true);
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('astrale_phantom_config', JSON.stringify(form));
    setConfig(form);
    setIsConfiguring(false);
  };

  const runScan = async () => {
    if (!config) return;
    setLoading(true);
    setLoadingStep("1/3 Scan du marché de l'emploi en temps réel...");
    
    const prompt = `Tu es un chasseur de têtes IA (Recruteur Fantôme) d'élite.
Mon profil cible :
- Poste recherché : ${config.title}
- Compétences / Stack : ${config.stack}
- Localisation / Modèle : ${config.location}
- Prétentions salariales : ${config.salary}

Ta mission :
1. UTILISE IMPÉRATIVEMENT LA RECHERCHE WEB (Google Search) pour trouver 3 VRAIES offres d'emploi RÉCENTES (mai 2026) qui correspondent à ces critères exacts.
IL EST STRICTEMENT INTERDIT D'INVENTER DES OFFRES OU DES ENTREPRISES.
2. Pour chaque offre RÉELLE, génère un dossier de candidature contenant :
   - Une lettre de motivation percutante (pas de blabla classique, directe et orientée résultats).
   - 3 "Hacks CV" : Les 3 modifications exactes à faire sur mon CV pour passer l'ATS de cette offre précise.
   - Les points de dissonance : 2 questions difficiles qu'ils poseront en entretien par rapport à mon profil et la réponse stratégique à donner.

Renvoie UNIQUEMENT un JSON structuré exactement comme ceci :
{
  "offers": [
    {
      "id": 1,
      "company": "Nom RÉEL de l'entreprise",
      "job_title": "Titre RÉEL du poste",
      "location": "Localisation",
      "salary_estimate": "Estimation du salaire (si absent, donne une fourchette marché)",
      "url": "Lien RÉEL vers l'offre d'emploi",
      "cover_letter": "La lettre de motivation complète et percutante...",
      "cv_hacks": ["Hack 1", "Hack 2", "Hack 3"],
      "interview_points": [
        { "question": "Question piège...", "answer": "Réponse stratégique..." }
      ]
    }
  ]
}
Aucun texte avant ou après le JSON. Sois précis et redoutable.`;

    try {
      const res = await callClaude(
        "Tu es une IA Recruteur Fantôme qui renvoie strictement du JSON.",
        prompt,
        { grounding: true, maxTokens: 4000, temperature: 0.3 }
      );
      setLoadingStep("2/3 Formatage des dossiers de candidature...");
      const text = typeof res === 'string' ? res : res?.text || "";
      const match = text.match(/\{[\s\S]*\}/);
      
      if (match) {
        const data = JSON.parse(match[0]);
        setOffers(data.offers || []);
        localStorage.setItem('astrale_phantom_last_scan', Date.now().toString());
      }
    } catch (err) {
      console.error("Erreur Scan Recruteur:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (isConfiguring) {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: '0 auto', color: isDarkMode ? 'var(--mm-bg-elev)' : '#0F172A' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', marginBottom: 20, fontWeight: 700 }}>← Retour au Dashboard</button>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Briefcase size={32} color="#3B82F6" /> Configurer ton Recruteur Fantôme
        </h1>
        <p style={{ color: '#64748B', fontSize: 16, marginBottom: 32 }}>Défini ta cible. L'IA scannera le marché pour toi et te préparera des candidatures prêtes à envoyer.</p>
        
        <div style={{ background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'white', border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--mm-border)', padding: 32, borderRadius: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#64748B' }}>Poste Cible</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="ex: Développeur Senior React" style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--mm-border-strong)', background: isDarkMode ? '#0F172A' : 'var(--mm-bg-elev)', color: isDarkMode ? 'white' : 'black' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#64748B' }}>Prétentions Salariales</label>
              <input value={form.salary} onChange={e => setForm({...form, salary: e.target.value})} placeholder="ex: 50k - 65k €" style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--mm-border-strong)', background: isDarkMode ? '#0F172A' : 'var(--mm-bg-elev)', color: isDarkMode ? 'white' : 'black' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#64748B' }}>Localisation / Remote</label>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="ex: Remote, Paris, Dakar..." style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--mm-border-strong)', background: isDarkMode ? '#0F172A' : 'var(--mm-bg-elev)', color: isDarkMode ? 'white' : 'black' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#64748B' }}>Stack Technique Principal</label>
              <input value={form.stack} onChange={e => setForm({...form, stack: e.target.value})} placeholder="ex: Node.js, React, AWS" style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--mm-border-strong)', background: isDarkMode ? '#0F172A' : 'var(--mm-bg-elev)', color: isDarkMode ? 'white' : 'black' }} />
            </div>
          </div>
          
          <button onClick={saveConfig} style={{ width: '100%', padding: 16, background: '#3B82F6', color: 'white', border: 'none', borderRadius: 16, fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
            Activer mon Chasseur de Têtes IA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: '0 auto', color: isDarkMode ? 'var(--mm-bg-elev)' : '#0F172A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', marginBottom: 16, fontWeight: 700 }}>← Retour au Dashboard</button>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Briefcase size={32} color="#3B82F6" /> Le Dossier du Jour
          </h1>
          <p style={{ color: '#64748B', fontSize: 15, margin: 0 }}>Cible : <strong>{config.title}</strong> • {config.location} • {config.salary}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setIsConfiguring(true)} style={{ padding: '10px 16px', background: isDarkMode ? '#1E293B' : 'var(--mm-border)', border: 'none', borderRadius: 12, color: isDarkMode ? 'white' : 'black', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} /> Configurer
          </button>
          <button onClick={runScan} disabled={loading} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? <div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
            {loading ? 'Recherche...' : 'Lancer le Scan'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'var(--mm-bg-elev)', borderRadius: 24, border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--mm-border)' }}>
          <div style={{ width: 48, height: 48, background: '#3B82F6', borderRadius: 24, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulseDot 1.5s infinite' }}>
            <Briefcase size={24} color="white" />
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20 }}>Le Recruteur Fantôme travaille...</h2>
          <p style={{ color: '#64748B' }}>{loadingStep}</p>
        </div>
      )}

      {!loading && offers.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'var(--mm-bg-elev)', borderRadius: 24, border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--mm-border)' }}>
          <Search size={48} color="#64748B" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 18, color: '#64748B', margin: 0 }}>Aucun scan réalisé aujourd'hui</h3>
          <p style={{ color: 'var(--mm-fg-muted)', marginTop: 8 }}>Lance un scan pour trouver des offres et préparer tes dossiers de candidature.</p>
        </div>
      )}

      {!loading && offers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {offers.map((offer, idx) => {
            const isExpanded = expandedOffer === offer.id;
            return (
              <div key={idx} style={{ background: isDarkMode ? '#1E293B' : 'white', borderRadius: 20, overflow: 'hidden', border: isDarkMode ? '1px solid var(--mm-fg)' : '1px solid var(--mm-border)', boxShadow: '0 4px 20px rgba(77,107,254,0.05)' }}>
                {/* En-tête de l'offre (cliquable) */}
                <div onClick={() => setExpandedOffer(isExpanded ? null : offer.id)} style={{ padding: 24, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isExpanded ? (isDarkMode ? '#0F172A' : 'var(--mm-bg-elev)') : 'transparent' }}>
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800 }}>
                      {offer.job_title}
                      {offer.url && (
                        <a href={offer.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 12, fontSize: 12, background: '#3B82F620', color: '#3B82F6', padding: '4px 8px', borderRadius: 8, textDecoration: 'none', verticalAlign: 'middle' }}>Voir l'offre</a>
                      )}
                    </h3>
                    <div style={{ display: 'flex', gap: 16, color: '#64748B', fontSize: 14, fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Briefcase size={16} /> {offer.company}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={16} /> {offer.location}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}><DollarSign size={16} /> {offer.salary_estimate}</span>
                    </div>
                  </div>
                  <div style={{ background: '#3B82F620', color: '#3B82F6', padding: '8px 16px', borderRadius: 12, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Dossier Prêt {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Détails du Dossier */}
                {isExpanded && (
                  <div style={{ padding: 24, borderTop: isDarkMode ? '1px solid var(--mm-fg)' : '1px solid var(--mm-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32 }}>
                      
                      {/* Lettre de Motivation */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 1 }}>📝 Lettre de Motivation</h4>
                          <button onClick={() => handleCopy(offer.cover_letter)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                            <Copy size={14} /> Copier
                          </button>
                        </div>
                        <div style={{ background: isDarkMode ? 'rgba(77,107,254,0.2)' : 'var(--mm-bg-elev)', padding: 20, borderRadius: 16, fontSize: 14, lineHeight: 1.7, color: isDarkMode ? 'var(--mm-border-strong)' : 'var(--mm-fg)', whiteSpace: 'pre-wrap', border: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(77,107,254,0.05)' }}>
                          {offer.cover_letter}
                        </div>
                      </div>

                      {/* Hacks & Entretien */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div>
                          <h4 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Code size={18} /> Hacks CV pour l'ATS
                          </h4>
                          <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {offer.cv_hacks?.map((hack, i) => (
                              <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14, lineHeight: 1.5, background: isDarkMode ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5', padding: 12, borderRadius: 12, color: isDarkMode ? '#A7F3D0' : '#065F46' }}>
                                <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} /> {hack}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert size={18} /> Points d'Entretien
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {offer.interview_points?.map((pt, i) => (
                              <div key={i} style={{ background: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7', padding: 16, borderRadius: 12, border: isDarkMode ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid #FDE68A' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? '#FCD34D' : '#92400E', marginBottom: 6 }}>🚨 {pt.question}</div>
                                <div style={{ fontSize: 14, color: isDarkMode ? 'var(--mm-border)' : '#78350F', lineHeight: 1.5 }}>🛡️ {pt.answer}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
