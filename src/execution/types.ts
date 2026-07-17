import type { JsonValue } from "@/core/canonical-json";
import type {
  AtomicAmount,
  ExactShares,
  VenueQuantity,
} from "@/core/live-money";
import type { LiveVenueId } from "@/contracts/venues";

export interface VenueLocator {
  readonly schemaVersion: "venue-locator-v1";
  readonly venue: LiveVenueId;
  readonly primaryId: string;
  readonly clientId: string | null;
  readonly transactionSignature: string | null;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly evidenceHash: string;
}

export interface PreparedArtifact {
  readonly schemaVersion: "prepared-artifact-v1";
  readonly venue: LiveVenueId;
  readonly artifactHash: string;
  readonly payload: JsonValue;
  readonly nativeSpendAtomic: AtomicAmount;
  readonly expiresAt: number | null;
  readonly locatorSeed: JsonValue;
}

export interface SignedArtifact extends PreparedArtifact {
  readonly signedPayload: JsonValue;
  readonly signerAddress: string;
  readonly signedArtifactHash: string;
  readonly locator: VenueLocator;
}

export type SubmitObservation =
  | {
      readonly kind: "acked";
      readonly locator: VenueLocator;
      readonly evidence: JsonValue;
    }
  | {
      readonly kind: "rejected";
      readonly code: string;
      readonly retryable: false;
      readonly evidence: JsonValue;
    }
  | {
      readonly kind: "unknown";
      readonly locator: VenueLocator | null;
      readonly reason: string;
      readonly evidence: JsonValue;
    };

export type LiveAcquisitionPath =
  | {
      readonly kind: "direct-buy";
      readonly orderSide: "BUY";
      readonly orderOutcome: "YES" | "NO";
    }
  | {
      readonly kind: "complete-set-sell-complement";
      readonly orderSide: "SELL";
      readonly orderOutcome: "YES" | "NO";
      readonly inventoryLotId: string;
      readonly inventoryLotVersion: number;
      readonly inventoryReservationFence: number;
      readonly inventoryEvidenceHash: string;
    };

export interface LiveOrderIntent {
  readonly contractVersionId: string;
  readonly settlementSpecVersionId: string;
  readonly desiredOutcome: "YES" | "NO";
  readonly acquisitionPath: LiveAcquisitionPath;
  readonly exactNetShares: ExactShares;
  readonly grossVenueQuantity: VenueQuantity;
  readonly minimumNetVenueQuantity: VenueQuantity;
  readonly maximumNetVenueQuantity: VenueQuantity;
  readonly netOutcomeBoundsHash: string;
  readonly feeScheduleVersion: string;
  readonly limitPriceMicros: number;
  readonly maxSpendMicros: number;
  readonly expiresAt: number;
}

export type ExecutionCostObservation =
  | {
      readonly kind: "final";
      readonly networkCostMicros: number;
      readonly setupCostMicros: number;
      readonly totalCostMicros: number;
      readonly chargedAssetId: string | null;
      readonly chargedAtomic: AtomicAmount | null;
      readonly valuationPolicyVersion: string | null;
      readonly receiptId: string | null;
      readonly finalityRevision: string;
      readonly evidenceHash: string;
    }
  | {
      readonly kind: "unknown";
      readonly heldReservedCostMicros: number;
      readonly evidenceHash: string | null;
    };

export interface WalletBinding {
  readonly walletId: string;
  readonly chain: "evm" | "solana";
  readonly address: string;
  readonly network: string;
  readonly funderAddress: string | null;
}

export interface VenueReadContext {
  readonly profileId: string;
  readonly wallet: WalletBinding;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
}

export interface EntryExecutionContext extends VenueReadContext {
  readonly operationKind: "entry";
  readonly operationAttemptId: string;
  readonly attemptKey: string;
  readonly subject: Readonly<{
    bundleHash: string;
    bundleId: string;
    legId: string;
  }>;
}

export interface CompensationExecutionContext extends VenueReadContext {
  readonly operationKind: "compensation";
  readonly operationAttemptId: string;
  readonly attemptKey: string;
  readonly subject: Readonly<{
    originalBundleHash: string;
    residualRevision: string;
    compensationSemanticHash: string;
  }>;
}

export type OrderExecutionContext =
  | EntryExecutionContext
  | CompensationExecutionContext;

export type ArtifactExecutionContext<
  Context extends OrderExecutionContext = OrderExecutionContext,
> = Context & {
  readonly artifactHash: string;
  readonly submissionKey: string;
};

export interface BalanceObservation {
  readonly assetId: string;
  readonly amountAtomic: AtomicAmount;
  readonly decimals: number;
  readonly observedAt: number;
  readonly evidenceHash: string;
}

export interface PositionObservation extends BalanceObservation {
  readonly contractVersionId: string;
  readonly outcome: "YES" | "NO";
  readonly exactShares: ExactShares;
}

export interface LiveFeeAssessment {
  readonly feeScheduleVersion: string;
  readonly chargeAsset: "collateral" | "outcome" | "proceeds";
  readonly chargeAssetId: string;
  readonly chargeAtomic: AtomicAmount;
  readonly chargeAssetDecimals: number;
  readonly roundingRule: "ceil-atomic" | "floor-atomic" | "exact";
  readonly grossOutcomeQuantity: VenueQuantity;
  readonly netOutcomeQuantity: VenueQuantity;
  readonly feeMicros: number;
  readonly evidenceHash: string;
}

export interface ReconciledOrderBinding {
  readonly contractVersionId: string;
  readonly settlementSpecVersionId: string;
  readonly desiredOutcome: "YES" | "NO";
  readonly acquisitionPath: "direct-buy" | "complete-set-sell-complement";
  readonly orderSide: "BUY" | "SELL";
  readonly orderOutcome: "YES" | "NO";
  readonly inventoryReservationRevision: string | null;
  readonly signerAddress: string;
  readonly venueAccountRevision: string;
  readonly orderIntentHash: string;
  readonly artifactHash: string;
  readonly signedArtifactHash: string;
  readonly submissionKey: string;
  readonly bindingEvidenceHash: string;
}

export type ReconcileObservation =
  | {
      readonly kind: "working";
      readonly locator: VenueLocator;
      readonly orderBinding: ReconciledOrderBinding;
      readonly orderState: "working";
      readonly actualGrossFilled: null;
      readonly actualNetOutcome: null;
      readonly remainingGrossQuantity: VenueQuantity;
      readonly averagePriceMicros: null;
      readonly actualFeeAssessment: null;
      readonly balanceDeltaEvidenceHash: string;
      readonly executionCost: ExecutionCostObservation;
      readonly evidence: JsonValue;
    }
  | {
      readonly kind: "unfilled" | "reverted";
      readonly locator: VenueLocator;
      readonly orderBinding: ReconciledOrderBinding;
      readonly orderState: "terminal";
      readonly actualGrossFilled: null;
      readonly actualNetOutcome: null;
      readonly remainingGrossQuantity: null;
      readonly averagePriceMicros: null;
      readonly actualFeeAssessment: null;
      readonly balanceDeltaEvidenceHash: string;
      readonly executionCost: ExecutionCostObservation;
      readonly evidence: JsonValue;
    }
  | {
      readonly kind: "unknown";
      readonly locator: VenueLocator;
      readonly orderBinding: ReconciledOrderBinding;
      readonly orderState: "unknown";
      readonly actualGrossFilled: null;
      readonly actualNetOutcome: null;
      readonly remainingGrossQuantity: VenueQuantity | null;
      readonly averagePriceMicros: null;
      readonly actualFeeAssessment: null;
      readonly balanceDeltaEvidenceHash: string | null;
      readonly executionCost: ExecutionCostObservation;
      readonly evidence: JsonValue;
    }
  | {
      readonly kind: "partial" | "filled";
      readonly locator: VenueLocator;
      readonly orderBinding: ReconciledOrderBinding;
      readonly orderState: "working" | "terminal" | "unknown";
      readonly actualGrossFilled: VenueQuantity;
      readonly actualNetOutcome: VenueQuantity;
      readonly remainingGrossQuantity: VenueQuantity | null;
      readonly averagePriceMicros: number | null;
      readonly actualFeeAssessment: LiveFeeAssessment;
      readonly balanceDeltaEvidenceHash: string;
      readonly executionCost: ExecutionCostObservation;
      readonly evidence: JsonValue;
    };

export interface OrderReconcileClaim {
  readonly intent: LiveOrderIntent;
  readonly orderIntentHash: string;
  readonly operationRecordHash: string;
  readonly artifactHash: string;
  readonly signedArtifactHash: string;
  readonly submissionKey: string;
  readonly signerAddress: string;
  readonly venueAccountRevision: string;
  readonly locator: VenueLocator;
  readonly submitStartedAt: number;
  readonly expectedOperationAttemptVersion: number;
  readonly expectedSubjectVersion: number;
}

/** Live mutation boundary. Registration is separate from venue certification. */
export interface LiveVenueAdapter {
  readonly id: LiveVenueId;
  prepare(
    context: OrderExecutionContext,
    intent: LiveOrderIntent,
  ): Promise<PreparedArtifact>;
  validate(
    context: OrderExecutionContext,
    intent: LiveOrderIntent,
    artifact: PreparedArtifact,
  ): Promise<void>;
  sign(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    intent: LiveOrderIntent,
    artifact: PreparedArtifact,
  ): Promise<SignedArtifact>;
  simulate(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<void>;
  submitOnce(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<SubmitObservation>;
  reconcile(
    context: OrderExecutionContext,
    claim: OrderReconcileClaim,
  ): Promise<ReconcileObservation>;
  balances(context: VenueReadContext): Promise<readonly BalanceObservation[]>;
  positions(context: VenueReadContext): Promise<readonly PositionObservation[]>;
}
