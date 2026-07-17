import { parseDflowShadowOrderResponse } from "./schemas";
import { DFLOW_SHADOW_BLOCKING_REASONS } from "./shadow-adapter";
import {
  DFLOW_PRODUCTION_ENDPOINTS,
  getDflowShadowReadiness,
} from "./shadow-readiness";

const SANITIZED_FIXTURE_EXPECTATION = Object.freeze({
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "11111111111111111111111111111111",
  amountAtomic: "1000000" as const,
});

function assertFixedEndpointContract(): void {
  const rest = new URL(DFLOW_PRODUCTION_ENDPOINTS.rest);
  const websocket = new URL(DFLOW_PRODUCTION_ENDPOINTS.websocket);
  if (
    rest.protocol !== "https:" ||
    rest.host !== "quote-api.dflow.net" ||
    rest.pathname !== "/" ||
    rest.search !== "" ||
    rest.hash !== "" ||
    websocket.protocol !== "wss:" ||
    websocket.host !== "quote-api.dflow.net" ||
    websocket.pathname !== "/" ||
    websocket.search !== "" ||
    websocket.hash !== ""
  ) {
    throw new Error("DFlow smoke endpoint contract drifted from the reviewed baseline");
  }
}

/** Offline-only smoke: no credentials, user identity, wallet, or network request. */
export function runDflowShadowSmoke(fixture: unknown) {
  assertFixedEndpointContract();
  const quote = parseDflowShadowOrderResponse(
    fixture,
    SANITIZED_FIXTURE_EXPECTATION,
  );
  const readiness = getDflowShadowReadiness({
    fixedEndpointHealthy: true,
    sanitizedFixtureValid: true,
  });
  if (!readiness.shadowEvidenceReady) {
    throw new Error("DFlow sanitized shadow evidence is not ready");
  }

  return Object.freeze({
    ok: true as const,
    venue: "kalshi-dflow" as const,
    shadowOnly: true as const,
    liveReady: false as const,
    endpoints: DFLOW_PRODUCTION_ENDPOINTS,
    quote: Object.freeze({
      inputAtomic: quote.inputAtomic,
      expectedOutputAtomic: quote.expectedOutputAtomic,
      minimumOutputAtomic: quote.minimumOutputAtomic,
      maximumOutputAtomic: quote.maximumOutputAtomic,
      exactOutputGuaranteed: quote.exactOutputGuaranteed,
    }),
    blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
  });
}
