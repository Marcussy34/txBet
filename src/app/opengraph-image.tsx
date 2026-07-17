import { ImageResponse } from "next/og";

export const alt = "txBet odds, dominance, and momentum trading agent";
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
          background: "#080808",
          color: "#FAFAFA",
          padding: "58px 66px 50px",
          fontFamily: "Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.18 }}>
          {[200, 400, 600, 800, 1000].map((left) => (
            <div key={left} style={{ position: "absolute", left, top: 0, width: 1, height: 630, background: "#4A4A4A" }} />
          ))}
          {[160, 320, 480].map((top) => (
            <div key={top} style={{ position: "absolute", left: 0, top, width: 1200, height: 1, background: "#4A4A4A" }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 70, height: 70, border: "1px solid #4A4A4A", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "#111111" }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M5 11H15L21 21M5 37H15L21 27M27 21L33 11H43M27 27L33 37H43" stroke="#FAFAFA" strokeWidth="3.2" strokeLinecap="square" strokeLinejoin="miter" />
                <path d="M21 16V32M27 16V32" stroke="#FAFAFA" strokeWidth="3.2" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -3 }}>txBet</div>
          </div>
          <div style={{ display: "flex", border: "1px solid #4A4A4A", borderRadius: 5, padding: "10px 14px", fontSize: 14, letterSpacing: 2.6, textTransform: "uppercase", color: "#B8B8B8" }}>
            Match-trading agent
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 690 }}>
            <div style={{ fontSize: 82, lineHeight: 0.92, letterSpacing: -4.5, fontFamily: "Georgia, serif" }}>
              It reads the match before the market does.
            </div>
            <div style={{ marginTop: 22, color: "#A8A8A8", fontSize: 19, lineHeight: 1.45 }}>
              Positions before kickoff. Buys and sells every outcome in play.
            </div>
          </div>

          <div style={{ width: 340, height: 180, display: "flex", position: "relative", border: "1px solid #3A3A3A", borderRadius: 8, background: "#101010" }}>
            <svg width="340" height="180" viewBox="0 0 340 180" fill="none">
              <path d="M24 42H316M24 84H316M24 126H316" stroke="#3F3F3F" />
              <path d="M84 24V150" stroke="#FAFAFA" strokeWidth="2" />
              <path d="M84 42H160V84H224V126H300" stroke="#FAFAFA" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
              <rect x="76" y="34" width="16" height="16" fill="#FAFAFA" />
              <circle cx="160" cy="84" r="5" fill="#FAFAFA" />
              <circle cx="224" cy="126" r="5" fill="#FAFAFA" />
            </svg>
            <div style={{ position: "absolute", left: 24, top: 12, color: "#9B9B9B", fontFamily: "monospace", fontSize: 12, letterSpacing: 1.4 }}>MATCH POSITIONING</div>
            <div style={{ position: "absolute", left: 72, bottom: 8, color: "#9B9B9B", fontFamily: "monospace", fontSize: 12 }}>T+0</div>
            <div style={{ position: "absolute", left: 142, top: 58, color: "#9B9B9B", fontFamily: "monospace", fontSize: 12 }}>V01</div>
            <div style={{ position: "absolute", left: 206, top: 100, color: "#9B9B9B", fontFamily: "monospace", fontSize: 12 }}>V02</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #3A3A3A", paddingTop: 18, fontSize: 14, color: "#A8A8A8", letterSpacing: 1.8, textTransform: "uppercase", position: "relative" }}>
          <span>TxLINE smoke boundary</span>
          <span>Model venue books</span>
          <span>Operator-gated execution</span>
          <span style={{ color: "#FAFAFA" }}>No edge. No trade.</span>
        </div>
      </div>
    ),
    size,
  );
}
