import { ImageResponse } from "next/og";

export const alt = "txBet — event-triggered prediction-market arbitrage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0B1110",
          color: "#F8F4E8",
          padding: "62px 68px",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.16 }}>
          <div style={{ width: 1, background: "#66DDE7", marginLeft: 590 }} />
          <div style={{ height: 1, background: "#B8F15A", width: 1200, marginTop: 314, position: "absolute" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 72, height: 72, border: "2px solid #26302D", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ width: 20, height: 20, background: "#F8F4E8", transform: "rotate(45deg)" }} />
          </div>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 800, letterSpacing: -3 }}><span style={{ color: "#66DDE7" }}>tx</span>Bet</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 930 }}>
          <div style={{ color: "#FF8A45", fontSize: 20, letterSpacing: 5, textTransform: "uppercase", marginBottom: 18 }}>No edge, no trade</div>
          <div style={{ fontSize: 76, lineHeight: 0.95, fontWeight: 800, letterSpacing: -3, textTransform: "uppercase" }}>The match event wakes the agent.</div>
          <div style={{ fontSize: 76, lineHeight: 0.95, fontWeight: 800, letterSpacing: -3, textTransform: "uppercase", color: "#66DDE7" }}>Settlement math decides.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#93A29E", letterSpacing: 2, textTransform: "uppercase" }}>
          <span>TxLINE input</span><span>Exact complements</span><span>Simulated execution</span>
        </div>
      </div>
    ),
    size,
  );
}
