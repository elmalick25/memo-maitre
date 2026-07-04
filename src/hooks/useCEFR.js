import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cefr_tracker_v1';
const DEFAULT_STATE = {
  productions: [], 
  analyses: [], 
  sessionsSinceLastAnalysis: 0
};

export function useCEFR(storage) {
  const [cefrState, setCefrState] = useState(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEY).then(data => {
      setCefrState(data || DEFAULT_STATE);
      setIsLoaded(true);
    }).catch(e => {
      console.error("Failed to load CEFR state", e);
      setIsLoaded(true);
    });
  }, []);

  const saveState = useCallback((newState) => {
    setCefrState(newState);
    storage.set(STORAGE_KEY, newState);
  }, [storage]);

  const addProduction = useCallback((text, context, score = null) => {
    if (!isLoaded || !text || text.length < 5) return;
    
    setCefrState(prev => {
      const newProduction = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        text,
        context,
        score
      };
      
      const newState = { ...prev };
      // Keep only last 50 productions to avoid bloating storage
      newState.productions = [...prev.productions, newProduction].slice(-50);
      saveState(newState);
      return newState;
    });
  }, [isLoaded, saveState]);

  const incrementSession = useCallback(() => {
    setCefrState(prev => {
      const newState = { ...prev, sessionsSinceLastAnalysis: prev.sessionsSinceLastAnalysis + 1 };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const triggerAnalysis = async (callClaude, force = false) => {
    if (isAnalyzing) return null;
    
    // Check constraints
    if (!force) {
      if (cefrState.productions.length < 10) return { error: "Pas assez de données (minimum 10 productions requises)." };
      if (cefrState.sessionsSinceLastAnalysis < 5) return { error: "Analyse trop récente. Revenez dans quelques sessions." };
    }

    setIsAnalyzing(true);
    try {
      const recentProductions = cefrState.productions.slice(-30);
      const productionsText = recentProductions.map(p => `[${p.context}] ${p.score ? `(Score: ${p.score}) ` : ''}Utilisateur: "${p.text}"`).join("\n");

      const systemPrompt = `Tu es un examinateur CEFR certifié Cambridge. Analyse ces 30 dernières productions de l'apprenant et retourne UNIQUEMENT ce JSON valide :
{
  "overall": "A1/A2/B1/B2/C1/C2",
  "speaking": "A1/A2/B1/B2/C1/C2",
  "vocabulary": "A1/A2/B1/B2/C1/C2", 
  "grammar": "A1/A2/B1/B2/C1/C2",
  "listening": "A1/A2/B1/B2/C1/C2",
  "justification": "Explication globale (ex: 'Ton vocabulaire est riche (B2) mais tu évites le past perfect (B1 grammar)')",
  "gaps": [
    { "area": "Grammar/Vocabulary/Pronunciation", "issue": "Description de l'erreur", "example": "You said X, native would say Y", "exercise": "Suggestion de drill" }
  ],
  "strengths": ["Force 1", "Force 2"],
  "nextMilestone": "Conseil pour passer au niveau supérieur"
}

RÉPONDS UNIQUEMENT LE JSON. Aucune autre phrase.
Évalue le 'listening' en fonction de la pertinence des réponses de l'utilisateur au contexte.
Productions à analyser :
${productionsText}`;

      const rawResponse = await callClaude(systemPrompt, "Analyse mon niveau CEFR en te basant sur mes productions.");
      const jsonStr = rawResponse.replace(/```json|```/gi, "").trim();
      const result = JSON.parse(jsonStr);

      if (!result.overall || !result.gaps) throw new Error("Format JSON invalide");

      const newAnalysis = {
        date: new Date().toISOString(),
        ...result
      };

      let finalState = null;
      setCefrState(prev => {
        finalState = {
          ...prev,
          analyses: [...prev.analyses, newAnalysis],
          sessionsSinceLastAnalysis: 0
        };
        saveState(finalState);
        return finalState;
      });

      return { success: true, analysis: newAnalysis };
    } catch (e) {
      console.error("CEFR Analysis Error:", e);
      return { error: "Erreur lors de l'analyse IA. Claude a peut-être renvoyé un format invalide." };
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    cefrState,
    isLoaded,
    isAnalyzing,
    addProduction,
    incrementSession,
    triggerAnalysis
  };
}
