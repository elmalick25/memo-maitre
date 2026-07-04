// ═══════════════════════════════════════════════════════════════════════════
// HoloCard — Bento 3D Glassmorphism card avec parallax souris
// Extrait de MemoMaster.jsx
// ═══════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react";

const HoloCard = ({ children, className, style, theme, glowColor, urgent, onClick }) => {
  const cardRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [coord, setCoord] = useState({ x: 0, y: 0, rx: 0, ry: 0 });

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((cy - y) / cy) * 5;
    const ry = ((x - cx) / cx) * 5;
    setCoord({ x, y, rx, ry });
  };

  const innerStyle = {
    position: "relative", zIndex: 1, width: "100%", height: "100%",
    transform: hover ? "translateZ(15px)" : "translateZ(0)",
    transition: hover ? "none" : "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
  };

  const outerStyle = { ...style };
  const borderRadius = outerStyle.borderRadius || 24;

  return (
    <div ref={cardRef} className={className} onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setCoord({ x: 0, y: 0, rx: 0, ry: 0 }); }}
      onMouseMove={handleMouseMove}
      style={{
        ...outerStyle,
        position: outerStyle.position === "absolute" ? "absolute" : "relative",
        perspective: "1200px", transformStyle: "preserve-3d",
        transition: hover ? "none" : "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
        transform: hover ? `rotateX(${coord.rx}deg) rotateY(${coord.ry}deg) scale3d(1.02, 1.02, 1.02)` : "rotateX(0) rotateY(0) scale3d(1, 1, 1)",
        zIndex: hover ? 10 : 1,
        boxShadow: urgent ? `0 0 20px ${glowColor || '#EF4444'}80` : (outerStyle.boxShadow || "none"),
        animation: urgent ? "pulseUrgent 2s infinite" : "none",
        borderRadius,
        overflow: "hidden",
        background: outerStyle.background || (theme ? theme.cardBg : "transparent"),
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle 300px at ${coord.x}px ${coord.y}px, color-mix(in srgb, ${glowColor || (theme ? theme.highlight : '#4D6BFE')} 15%, transparent), transparent 100%)`,
        opacity: hover ? 1 : 0, transition: "opacity 0.4s ease", pointerEvents: "none", zIndex: 0
      }} />
      <div style={innerStyle}>{children}</div>
    </div>
  );
};

export default HoloCard;
