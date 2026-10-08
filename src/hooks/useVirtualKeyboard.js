import { useState, useEffect } from "react";

/**
 * Hook de détection et synchronisation fine du clavier virtuel via window.visualViewport
 * Résout les problèmes d'occlusion et de décalage d'éléments fixes sur iOS Safari et Android Chrome.
 */
export function useVirtualKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return undefined;
    }

    const vv = window.visualViewport;

    const update = () => {
      // Sur iOS Safari, la hauteur du visualViewport se réduit lorsque le clavier virtuel apparaît.
      const heightDiff = window.innerHeight - vv.height;
      const isOpen = heightDiff > 70;
      const offsetTop = vv.offsetTop || 0;
      const actualHeight = isOpen ? Math.max(0, Math.round(heightDiff - offsetTop)) : 0;

      setKeyboardHeight(actualHeight);
      setIsKeyboardOpen(isOpen);

      // Injection dynamique d'une variable CSS sur :root pour les feuilles de styles
      if (document.documentElement) {
        document.documentElement.style.setProperty("--keyboard-offset", `${actualHeight}px`);
      }
    };

    vv.addEventListener("resize", update, { passive: true });
    vv.addEventListener("scroll", update, { passive: true });
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}

export default useVirtualKeyboard;
