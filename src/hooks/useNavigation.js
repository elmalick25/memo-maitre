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
  }, []);

  return { navState, navigate };
}

export default useNavigation;
