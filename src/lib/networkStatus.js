// 📶 networkStatus.js — En ligne/hors-ligne, Save-Data, type de connexion
export function getNetworkStatus() {
  if (typeof navigator === "undefined") return { online: true };
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine !== false,
    saveData: !!c?.saveData,
    type: c?.effectiveType || "unknown",
    downlink: c?.downlink,
    rtt: c?.rtt,
  };
}

export function onNetworkChange(cb) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb(getNetworkStatus());
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  const c = navigator.connection;
  c?.addEventListener?.("change", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
    c?.removeEventListener?.("change", handler);
  };
}

export function shouldReduceData() {
  const s = getNetworkStatus();
  return s.saveData || s.type === "slow-2g" || s.type === "2g";
}
