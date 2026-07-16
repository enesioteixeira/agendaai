// Estilos compartilhados do módulo agenda — mesmo visual do resto do painel.
import type { CSSProperties } from "react";

export const lb: CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#333" };
export const ip: CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 };
export const bt: CSSProperties = { padding: "0.55rem 0.9rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer" };
export const btSec: CSSProperties = { ...bt, background: "none", color: "#333", border: "1px solid #ccc" };
export const tb: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 14 };
export const th: CSSProperties = { textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.4rem 0.6rem", color: "#555" };
export const td: CSSProperties = { borderBottom: "1px solid #eee", padding: "0.45rem 0.6rem" };
export const erroTxt: CSSProperties = { color: "#c0362c", margin: 0, fontSize: 14 };

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
