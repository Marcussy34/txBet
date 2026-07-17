import { createPrivateKey } from "node:crypto";

import { PrivyClient } from "@privy-io/node";
import { PublicKey } from "@solana/web3.js";

export const PRIVY_DFLOW_API_HOST = "https://api.privy.io" as const;

const PRIVY_REQUEST_EXPIRY_MS = 60_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface DflowPrivySignerConfig {
  readonly appId: string;
  readonly appSecret: string;
  /** Base64 PKCS8 P-256 key without PEM headers. */
  readonly authorizationPrivateKey: string;
  readonly keyQuorumId: string;
  readonly dflowPolicyId: string;
}

interface PrivySdkClientConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly apiUrl: typeof PRIVY_DFLOW_API_HOST;
  readonly maxRetries: 1;
  readonly timeout: 5_000;
}

interface PrivyWalletListInput {
  readonly user_id: string;
  readonly chain_type: "solana";
  readonly include_archived: false;
  readonly limit: 2;
}

interface PrivySignTransactionInput {
  readonly transaction: string;
  readonly idempotency_key: string;
  readonly request_expiry: number;
  readonly authorization_context: {
    readonly authorization_private_keys: [string];
  };
}

export interface PrivyDflowSignerSdkClient {
  listWallets(input: PrivyWalletListInput): Promise<unknown>;
  getRequestExpiry(expiryMsFromNow: number): number | undefined;
  signTransaction(walletId: string, input: PrivySignTransactionInput): Promise<unknown>;
}

export interface PrivyDflowSignerSdkBoundary {
  createClient(config: PrivySdkClientConfig): PrivyDflowSignerSdkClient;
}

export interface DflowPrivySolanaWallet {
  readonly id: string;
  readonly address: string;
  readonly userId: string;
}

export interface DflowPrivySignedTransaction {
  readonly wallet: DflowPrivySolanaWallet;
  readonly signedTransactionBase64: string;
}

export interface DflowPrivySigner {
  resolveWallet(verifiedUserId: string): Promise<DflowPrivySolanaWallet>;
  signTransaction(input: {
    readonly wallet: DflowPrivySolanaWallet;
    readonly unsignedTransactionBase64: string;
    readonly idempotencyKey: string;
  }): Promise<DflowPrivySignedTransaction>;
}

export type PrivyDflowSignerErrorCode =
  | "CONFIG_INVALID"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_SIGNING_RESPONSE"
  | "SIGNING_FAILED"
  | "WALLET_CHANGED"
  | "WALLET_LOOKUP_FAILED"
  | "WALLET_NOT_ELIGIBLE";

/** Stable boundary error. It intentionally carries no upstream SDK cause. */
export class PrivyDflowSignerError extends Error {
  readonly code: PrivyDflowSignerErrorCode;

  constructor(code: PrivyDflowSignerErrorCode, message: string) {
    super(message);
    this.name = "PrivyDflowSignerError";
    this.code = code;
  }
}

const officialSdkBoundary: PrivyDflowSignerSdkBoundary = {
  createClient(config) {
    const client = new PrivyClient(config);
    return {
      async listWallets(input) {
        const page = await client.wallets().list(input);
        return Object.freeze({
          data: page.data,
          nextCursor: page.next_cursor,
        });
      },
      getRequestExpiry: (expiryMsFromNow) => client.getRequestExpiry(expiryMsFromNow),
      signTransaction: (walletId, input) =>
        client.wallets().solana().signTransaction(walletId, input),
    };
  },
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  );
}

function isP256Pkcs8Base64(value: string): boolean {
  if (!isBoundedString(value, 4_096)) return false;

  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== value) return false;
    const key = createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
    return (
      key.type === "private" &&
      key.asymmetricKeyType === "ec" &&
      key.asymmetricKeyDetails?.namedCurve === "prime256v1"
    );
  } catch {
    return false;
  }
}

function validateConfig(config: DflowPrivySignerConfig): void {
  if (
    !isBoundedString(config.appId, 256) ||
    !isBoundedString(config.appSecret, 4_096) ||
    !isP256Pkcs8Base64(config.authorizationPrivateKey) ||
    !isBoundedString(config.keyQuorumId, 256) ||
    !isBoundedString(config.dflowPolicyId, 256)
  ) {
    throw new PrivyDflowSignerError(
      "CONFIG_INVALID",
      "Invalid Privy DFlow signer configuration",
    );
  }
}

function isCanonicalSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function parseEligibleWallet(
  page: unknown,
  verifiedUserId: string,
  config: DflowPrivySignerConfig,
): DflowPrivySolanaWallet {
  if (
    !isPlainRecord(page) ||
    !Array.isArray(page.data) ||
    typeof page.nextCursor !== "string"
  ) {
    throw new PrivyDflowSignerError(
      "WALLET_NOT_ELIGIBLE",
      "Invalid Privy wallet page response",
    );
  }

  // A cursor means the bounded first page cannot prove uniqueness.
  if (page.data.length !== 1 || page.nextCursor.length > 0) {
    throw new PrivyDflowSignerError(
      "WALLET_NOT_ELIGIBLE",
      "Expected exactly one eligible Privy Solana wallet",
    );
  }

  const wallet = page.data[0];
  if (!isPlainRecord(wallet)) {
    throw new PrivyDflowSignerError("WALLET_NOT_ELIGIBLE", "Invalid Privy wallet response");
  }

  const signer = Array.isArray(wallet.additional_signers) && wallet.additional_signers.length === 1
    ? wallet.additional_signers[0]
    : undefined;
  const overridePolicyIds = isPlainRecord(signer) ? signer.override_policy_ids : undefined;
  const active = wallet.archived_at === null || wallet.archived_at === undefined;
  const walletId = wallet.id;

  if (
    !isBoundedString(walletId, 256) ||
    wallet.chain_type !== "solana" ||
    !isCanonicalSolanaAddress(wallet.address) ||
    !active ||
    wallet.exported_at !== null ||
    wallet.imported_at !== null ||
    !isPlainRecord(signer) ||
    signer.signer_id !== config.keyQuorumId ||
    !Array.isArray(overridePolicyIds) ||
    overridePolicyIds.length !== 1 ||
    overridePolicyIds[0] !== config.dflowPolicyId
  ) {
    throw new PrivyDflowSignerError(
      "WALLET_NOT_ELIGIBLE",
      "Privy Solana wallet is not eligible for delegated DFlow signing",
    );
  }

  return Object.freeze({ id: walletId, address: wallet.address, userId: verifiedUserId });
}

function parseSignedTransaction(value: unknown): string {
  if (
    !isPlainRecord(value) ||
    value.encoding !== "base64" ||
    typeof value.signed_transaction !== "string" ||
    value.signed_transaction.length === 0
  ) {
    throw new PrivyDflowSignerError(
      "INVALID_SIGNING_RESPONSE",
      "Invalid Privy signing response",
    );
  }
  return value.signed_transaction;
}

/** Creates the server-only delegated signer used by the manual DFlow canary. */
export function createDflowPrivySigner(
  config: DflowPrivySignerConfig,
  sdk: PrivyDflowSignerSdkBoundary = officialSdkBoundary,
): DflowPrivySigner {
  validateConfig(config);
  let client: PrivyDflowSignerSdkClient;
  try {
    client = sdk.createClient({
      appId: config.appId,
      appSecret: config.appSecret,
      apiUrl: PRIVY_DFLOW_API_HOST,
      maxRetries: 1,
      timeout: 5_000,
    });
  } catch {
    throw new PrivyDflowSignerError(
      "CONFIG_INVALID",
      "Invalid Privy DFlow signer configuration",
    );
  }

  async function resolveWallet(verifiedUserId: string): Promise<DflowPrivySolanaWallet> {
    if (!isBoundedString(verifiedUserId, 256)) {
      throw new PrivyDflowSignerError("WALLET_NOT_ELIGIBLE", "Invalid verified Privy user");
    }

    let page: unknown;
    try {
      page = await client.listWallets({
        user_id: verifiedUserId,
        chain_type: "solana",
        include_archived: false,
        limit: 2,
      });
    } catch {
      throw new PrivyDflowSignerError("WALLET_LOOKUP_FAILED", "Privy wallet lookup failed");
    }
    return parseEligibleWallet(page, verifiedUserId, config);
  }

  return Object.freeze({
    resolveWallet,
    async signTransaction(input: Parameters<DflowPrivySigner["signTransaction"]>[0]) {
      if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
        throw new PrivyDflowSignerError(
          "INVALID_IDEMPOTENCY_KEY",
          "Invalid Privy signing idempotency key",
        );
      }

      // Re-resolve immediately before signing so delegation changes fail closed.
      const currentWallet = await resolveWallet(input.wallet.userId);
      if (
        currentWallet.id !== input.wallet.id ||
        currentWallet.address !== input.wallet.address
      ) {
        throw new PrivyDflowSignerError(
          "WALLET_CHANGED",
          "Privy delegated wallet changed before signing",
        );
      }

      let requestExpiry: number | undefined;
      try {
        requestExpiry = client.getRequestExpiry(PRIVY_REQUEST_EXPIRY_MS);
      } catch {
        throw new PrivyDflowSignerError("SIGNING_FAILED", "Privy transaction signing failed");
      }
      if (!Number.isSafeInteger(requestExpiry) || requestExpiry === undefined || requestExpiry <= 0) {
        throw new PrivyDflowSignerError("SIGNING_FAILED", "Privy transaction signing failed");
      }

      let response: unknown;
      try {
        response = await client.signTransaction(currentWallet.id, {
          transaction: input.unsignedTransactionBase64,
          idempotency_key: input.idempotencyKey,
          request_expiry: requestExpiry,
          authorization_context: {
            authorization_private_keys: [config.authorizationPrivateKey],
          },
        });
      } catch {
        throw new PrivyDflowSignerError("SIGNING_FAILED", "Privy transaction signing failed");
      }

      return Object.freeze({
        wallet: currentWallet,
        signedTransactionBase64: parseSignedTransaction(response),
      });
    },
  });
}
