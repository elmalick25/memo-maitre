import { useState, useCallback } from "react";

export function useNavigation(initialView = "dashboard") {
  const [navState, setNavState] = useState({
    view: initialView,
    subView: null,
    params: {},
  });

  const navigate = useCallback((path, params = {}) => {
    const [view, subView = null] = path.split("/");
    setNavState({ view, subView, params });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  return { navState, navigate };
}

export default useNavigation;
