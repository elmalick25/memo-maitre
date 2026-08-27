import { useState, useEffect } from "react";

export function usePomodoro(initialMinutes = 50) {
  const [pomoTime, setPomoTime] = useState(initialMinutes * 60);
  const [isPomoActive, setIsPomoActive] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isPomoActive && pomoTime > 0) {
      interval = setInterval(() => setPomoTime((t) => t - 1), 1000);
    } else if (pomoTime === 0) {
      setIsPomoActive(false);
      setPomoTime(initialMinutes * 60);
      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {}
    }
    return () => clearInterval(interval);
  }, [isPomoActive, pomoTime, initialMinutes]);

  const togglePomodoro = () => setIsPomoActive((prev) => !prev);
  const resetPomodoro = () => {
    setIsPomoActive(false);
    setPomoTime(initialMinutes * 60);
  };

  return {
    pomoTime,
    setPomoTime,
    isPomoActive,
    setIsPomoActive,
    togglePomodoro,
    resetPomodoro,
  };
}

export default usePomodoro;
