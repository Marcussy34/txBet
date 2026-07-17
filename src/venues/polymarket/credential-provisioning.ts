import { sha256Canonical } from "@/core/canonical-json";
import type { EncryptedEnvelopeV1 } from "@/server/crypto/envelope";
import type { EnvelopeKeyring } from "@/server/crypto/keyring";

import {
  encryptPolymarketCredentials,
  type PolymarketCredentialBinding,
} from "./credentials";
import { derivePinnedBeaconDepositWalletAddress } from "./onboarding";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export interface PolymarketAccountBinding {
  readonly profileId: string;
  readonly venueAccountId: string;
  readonly accountRevision: string;
  readonly ownerSignerAddress: string;
  readonly depositWalletAddress: string;
  readonly orderSignerAddress: string;
  readonly makerAddress: string;
  readonly funderAddress: string;
  readonly signatureType: number;
}

export interface PolymarketDeploymentPreflight {
  readonly deployed: boolean;
  readonly ownerVerified: boolean;
  readonly observedAtMs: number;
  readonly expiresAtMs: number;
  readonly evidenceHash: string;
}

export interface PolymarketCredentialClient {
  readonly account: Readonly<{
    signer: string;
    wallet: string;
    walletType: number;
  }>;
  readonly credentials: Readonly<{
    key: string;
    secret: string;
    passphrase: string;
  }>;
}

export interface PersistedPolymarketCredentialEnvelope {
  readonly profileId: string;
  readonly venueAccountId: string;
  readonly accountRevision: string;
  readonly credentialVersion: number;
  readonly envelope: EncryptedEnvelopeV1;
  readonly deploymentEvidenceHash: string;
}

export interface ProvisionPolymarketCredentialsInput {
  readonly nowMs: number;
  readonly maximumPreflightAgeMs: number;
  readonly credentialVersion: number;
  readonly account: PolymarketAccountBinding;
  readonly deploymentPreflight: PolymarketDeploymentPreflight;
  readonly keyring: EnvelopeKeyring;
  readonly createSecureClient: (
    input: Readonly<{
      ownerSignerAddress: string;
      depositWalletAddress: string;
    }>,
  ) => Promise<PolymarketCredentialClient>;
  readonly persistEncryptedCredentials: (
    record: PersistedPolymarketCredentialEnvelope,
  ) => Promise<void>;
}

export interface PolymarketCredentialReadiness {
  readonly kind: "ready";
  readonly venueAccountId: string;
  readonly accountRevision: string;
  readonly credentialVersion: number;
  readonly envelopeKeyId: string;
  readonly readinessEvidenceHash: string;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertAccountBinding(account: PolymarketAccountBinding): void {
  const addresses = [
    account.ownerSignerAddress,
    account.depositWalletAddress,
    account.orderSignerAddress,
    account.makerAddress,
    account.funderAddress,
  ];
  if (addresses.some((address) => !EVM_ADDRESS.test(address))) {
    throw new Error("Invalid Polymarket account binding");
  }
  const derived = derivePinnedBeaconDepositWalletAddress(account.ownerSignerAddress);
  if (!sameAddress(derived, account.depositWalletAddress)) {
    throw new Error("Polymarket account is not the deterministic deposit wallet");
  }
  if (
    account.signatureType !== 3 ||
    !sameAddress(account.orderSignerAddress, account.depositWalletAddress) ||
    !sameAddress(account.makerAddress, account.depositWalletAddress) ||
    !sameAddress(account.funderAddress, account.depositWalletAddress)
  ) {
    throw new Error("Invalid Polymarket account binding");
  }
  if (account.accountRevision.length === 0) {
    throw new Error("Invalid Polymarket account binding");
  }
}

function assertDeploymentPreflight(
  input: ProvisionPolymarketCredentialsInput,
): void {
  const evidence = input.deploymentPreflight;
  if (
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs < 0 ||
    !Number.isSafeInteger(input.maximumPreflightAgeMs) ||
    input.maximumPreflightAgeMs < 0 ||
    !evidence.deployed ||
    !evidence.ownerVerified ||
    !Number.isSafeInteger(evidence.observedAtMs) ||
    evidence.observedAtMs < 0 ||
    evidence.observedAtMs > input.nowMs ||
    input.nowMs - evidence.observedAtMs > input.maximumPreflightAgeMs ||
    !Number.isSafeInteger(evidence.expiresAtMs) ||
    evidence.expiresAtMs <= input.nowMs ||
    !SHA256_HEX.test(evidence.evidenceHash)
  ) {
    throw new Error("Polymarket deployment preflight is not current and verified");
  }
}

function assertSecureClientAccount(
  client: PolymarketCredentialClient,
  account: PolymarketAccountBinding,
): void {
  if (
    client.account.walletType !== 3 ||
    !sameAddress(client.account.signer, account.ownerSignerAddress) ||
    !sameAddress(client.account.wallet, account.depositWalletAddress)
  ) {
    throw new Error("Polymarket secure-client account binding drifted");
  }
}

/** Derives once from a verified account and persists only an authenticated envelope. */
export async function provisionPolymarketCredentials(
  input: ProvisionPolymarketCredentialsInput,
): Promise<PolymarketCredentialReadiness> {
  assertAccountBinding(input.account);
  assertDeploymentPreflight(input);
  if (!Number.isSafeInteger(input.credentialVersion) || input.credentialVersion <= 0) {
    throw new Error("Invalid Polymarket credential version");
  }

  let client: PolymarketCredentialClient;
  try {
    client = await input.createSecureClient(
      Object.freeze({
        ownerSignerAddress: input.account.ownerSignerAddress,
        depositWalletAddress: input.account.depositWalletAddress,
      }),
    );
  } catch {
    // Do not leak an SDK/upstream error that may contain authorization material.
    throw new Error("Polymarket credential derivation is unavailable");
  }
  assertSecureClientAccount(client, input.account);

  const credentialBinding: PolymarketCredentialBinding = {
    profileId: input.account.profileId,
    venueAccountId: input.account.venueAccountId,
    credentialVersion: input.credentialVersion,
  };
  const envelope = encryptPolymarketCredentials(
    {
      apiKey: client.credentials.key,
      secret: client.credentials.secret,
      passphrase: client.credentials.passphrase,
    },
    credentialBinding,
    input.keyring,
  );
  await input.persistEncryptedCredentials(
    Object.freeze({
      profileId: input.account.profileId,
      venueAccountId: input.account.venueAccountId,
      accountRevision: input.account.accountRevision,
      credentialVersion: input.credentialVersion,
      envelope,
      deploymentEvidenceHash: input.deploymentPreflight.evidenceHash,
    }),
  );

  const readinessEvidenceHash = sha256Canonical({
    schemaVersion: "polymarket-credential-readiness-v1",
    profileId: input.account.profileId,
    venueAccountId: input.account.venueAccountId,
    accountRevision: input.account.accountRevision,
    credentialVersion: input.credentialVersion,
    envelopeKeyId: envelope.keyId,
    deploymentEvidenceHash: input.deploymentPreflight.evidenceHash,
  });
  return Object.freeze({
    kind: "ready",
    venueAccountId: input.account.venueAccountId,
    accountRevision: input.account.accountRevision,
    credentialVersion: input.credentialVersion,
    envelopeKeyId: envelope.keyId,
    readinessEvidenceHash,
  });
}
