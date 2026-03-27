export default function Section({ title, children, delay, loaded, style }) {
  return (
    <div style={{ marginBottom: 24, opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)", transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`, ...style }}>
      <h2 style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "#475569", fontWeight: 600, margin: "0 0 12px 0" }}>{title}</h2>
      {children}
    </div>
  );
}
