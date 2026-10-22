import React from "react";
import { usePomoTime } from "../hooks/usePomodoro";

// Affichage isolé du temps Pomodoro : seul ce texte se met à jour chaque seconde.
export default function PomodoroClock({ fallback = 50 * 60, padMinutes = true }) {
  const secs = usePomoTime(fallback);
  const m = Math.floor(secs / 60);
  return (
    <>
      {padMinutes ? String(m).padStart(2, "0") : m}:{String(secs % 60).padStart(2, "0")}
    </>
  );
}
