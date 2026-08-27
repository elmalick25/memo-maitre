import React, { useEffect } from "react";

export function CoachAnalyzeListener({ coachPhrase, coachTranscript, analyzeWithClaude }) {
  useEffect(() => {
    const handler = () => {
      if (coachPhrase && coachTranscript) {
        analyzeWithClaude(coachPhrase.text, coachTranscript);
      }
    };
    window.addEventListener("coach-analyze", handler);
    return () => window.removeEventListener("coach-analyze", handler);
  }, [coachPhrase, coachTranscript, analyzeWithClaude]);

  return null;
}

export default CoachAnalyzeListener;
