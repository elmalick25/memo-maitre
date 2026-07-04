// src/hooks/useMermaid.js
import { useCallback } from "react";

export default function useMermaid() {
  const renderMermaid = useCallback(async (text) => {
    return text;
  }, []);
  return renderMermaid;
}