import { useState, useEffect, useSyncExternalStore } from "react";

// ⚡ PERF : le temps restant du Pomodoro vit dans un mini-store hors React.
// Avant, chaque seconde de Pomodoro actif mettait à jour un état de MemoMaster
// → TOUTE l'application se re-rendait chaque seconde (scroll et menus lents).
// Désormais, seuls les petits affichages <PomodoroClock /> se mettent à jour.
const store = {
  time: null,
  listeners: new Set(),
};

function emit() {
  store.listeners.forEach((l) => l());
}

function setStoreTime(next) {
  const value = typeof next === "function" ? next(store.time) : next;
  if (value === store.time) return;
  store.time = value;
  emit();
}

function subscribe(listener) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

const getSnapshot = () => store.time;

/** Temps restant (secondes), mis à jour en direct. */
export function usePomoTime(fallback = 50 * 60) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return t ?? fallback;
}

function playAlarm() {
  try {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}

export function usePomodoro(initialMinutes = 50) {
  const initialSeconds = initialMinutes * 60;
  if (store.time === null) store.time = initialSeconds;
  const [isPomoActive, setIsPomoActive] = useState(false);

  useEffect(() => {
    if (!isPomoActive) return undefined;
    const interval = setInterval(() => {
      const next = (store.time ?? initialSeconds) - 1;
      if (next <= 0) {
        clearInterval(interval);
        setStoreTime(initialSeconds);
        setIsPomoActive(false);
        playAlarm();
        return;
      }
      setStoreTime(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPomoActive, initialSeconds]);

  const togglePomodoro = () => setIsPomoActive((prev) => !prev);
  const resetPomodoro = () => {
    setIsPomoActive(false);
    setStoreTime(initialSeconds);
  };

  return {
    // Valeur au moment du rendu du parent (suffisante pour les conditions
    // d'affichage). Pour un affichage seconde par seconde : <PomodoroClock />.
    pomoTime: store.time ?? initialSeconds,
    setPomoTime: setStoreTime,
    isPomoActive,
    setIsPomoActive,
    togglePomodoro,
    resetPomodoro,
  };
}

export default usePomodoro;
