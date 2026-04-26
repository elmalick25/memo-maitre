// src/hooks/useMermaid.js
import { useCallback } from "react";

export const useMermaid = () => {
  return useCallback(async (text) => text, []);
};