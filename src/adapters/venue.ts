import type { Micros } from "../core/money";
import type { CanonicalContract, Outcome, VenueQuote } from "../core/types";

export interface ProposedOrder {
  clientOrderId: string;
  contract: CanonicalContract;
  outcome: Outcome;
  quantity: number;
  limitPriceMicros: Micros;
}

export type VenueOrderResult =
  | { state: "filled"; filledQuantity: number; averagePriceMicros: Micros; orderId: string }
  | { state: "partial"; filledQuantity: number; averagePriceMicros: Micros; orderId: string }
  | { state: "unfilled"; orderId?: string }
  | { state: "rejected"; code: string; message: string; retryable: boolean }
  | { state: "unknown"; message: string; orderId?: string };

export interface VenuePreflight {
  ready: boolean;
  reason: string;
  checkedAt: number;
}

/**
 * Real venue integrations implement this contract. The repository ships no live-money adapter;
 * the bundled dashboard uses deterministic demo quotes and a bundle simulator.
 */
export interface VenueAdapter {
  readonly id: string;
  readonly displayName: string;
  discoverContracts(fixtureId: string): Promise<readonly CanonicalContract[]>;
  getQuote(contractId: string): Promise<VenueQuote>;
  preflight(order: ProposedOrder): Promise<VenuePreflight>;
  placeIoc(order: ProposedOrder, isSubmissionReady: () => boolean): Promise<VenueOrderResult>;
  reconcile(orderId: string): Promise<VenueOrderResult>;
  close?(): void | Promise<void>;
}
