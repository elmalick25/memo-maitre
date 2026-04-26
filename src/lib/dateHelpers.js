// src/lib/dateHelpers.js

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

export const today = () => new Date().toISOString().split("T")[0];

export const formatDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });