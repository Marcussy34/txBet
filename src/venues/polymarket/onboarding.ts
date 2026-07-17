import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  getCreate2Address,
  keccak256,
  numberToHex,
  pad,
  type Address,
  type Hex,
} from "viem";

const DEPOSIT_WALLET_FACTORY = getAddress(
  "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
);
const DEPOSIT_WALLET_BEACON = getAddress(
  "0x7A18EDfe055488A3128f01F563e5B479D92ffc3a",
);
const ERC1967_BEACON_CONST1 =
  "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";
const ERC1967_BEACON_CONST2 =
  "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const ERC1967_BEACON_CONST3 = "0x60195155f3363d3d373d3d363d602036600436635c60da";
const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;

function expectAddress(value: string, label: string): Address {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("invalid");
    return getAddress(value);
  } catch {
    throw new Error(`${label} must be a valid EVM address`);
  }
}

/** Mirrors the pinned official SDK's beacon CREATE2 derivation. */
export function derivePinnedBeaconDepositWalletAddress(
  ownerSignerAddress: string,
): Address {
  const owner = expectAddress(ownerSignerAddress, "Polymarket owner signer address");
  const walletId = pad(owner, { size: 32 });
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [DEPOSIT_WALLET_FACTORY, walletId],
  );
  const argsByteLength = BigInt((args.length - 2) / 2);
  const prefix = ERC1967_BEACON_PREFIX + (argsByteLength << 56n);
  const initCode = concatHex([
    numberToHex(prefix, { size: 10 }),
    DEPOSIT_WALLET_BEACON,
    ERC1967_BEACON_CONST3,
    ERC1967_BEACON_CONST2,
    ERC1967_BEACON_CONST1,
    args,
  ] as readonly Hex[]);

  return getCreate2Address({
    from: DEPOSIT_WALLET_FACTORY,
    salt: keccak256(args),
    bytecodeHash: keccak256(initCode),
  });
}

export interface PolymarketDeploymentHandle {
  readonly transactionHash: string | null;
  readonly transactionId: string | null;
  wait(): Promise<Readonly<{
    transactionHash: string;
    transactionId: string | null;
  }>>;
}

export interface DepositWalletDeploymentInput<Client> {
  readonly ownerSignerAddress: string;
  readonly eoaSecureClient: Client & Readonly<{
    account: Readonly<{ wallet: string }>;
  }>;
  readonly persistSubmitStarted: (intent: Readonly<{
    ownerSignerAddress: string;
    depositWalletAddress: string;
  }>) => Promise<void>;
  readonly deploy: (client: Client) => Promise<PolymarketDeploymentHandle>;
  readonly persistLocator: (locator: Readonly<{
    transactionHash: string | null;
    transactionId: string | null;
  }>) => Promise<void>;
  readonly verifyDeployed: (depositWalletAddress: string) => Promise<boolean>;
  readonly persistConfirmed: (evidence: Readonly<{
    depositWalletAddress: string;
    transactionHash: string;
    transactionId: string | null;
  }>) => Promise<void>;
}

export type DepositWalletDeploymentResult =
  | Readonly<{
      kind: "confirmed";
      depositWalletAddress: string;
      transactionHash: string;
      transactionId: string | null;
    }>
  | Readonly<{
      kind: "unknown";
      depositWalletAddress: string;
      reason: "POLYMARKET_DEPOSIT_WALLET_DEPLOYMENT_AMBIGUOUS";
    }>;

function unknownDeployment(depositWalletAddress: string): DepositWalletDeploymentResult {
  return Object.freeze({
    kind: "unknown",
    depositWalletAddress,
    reason: "POLYMARKET_DEPOSIT_WALLET_DEPLOYMENT_AMBIGUOUS",
  });
}

/**
 * Starts from an explicitly EOA-bound client. The durable marker precedes the
 * only deploy call, and every later uncertainty is reconciled instead of retried.
 */
export async function deployDepositWalletCrashSafely<Client>(
  input: DepositWalletDeploymentInput<Client>,
): Promise<DepositWalletDeploymentResult> {
  const owner = expectAddress(
    input.ownerSignerAddress,
    "Polymarket owner signer address",
  );
  const clientWallet = expectAddress(
    input.eoaSecureClient.account.wallet,
    "Polymarket secure-client wallet",
  );
  if (owner.toLowerCase() !== clientWallet.toLowerCase()) {
    throw new Error("Polymarket deployment client must use the explicit owner EOA");
  }
  const depositWalletAddress = derivePinnedBeaconDepositWalletAddress(owner);

  // Failure here is safe: deployment has not been attempted.
  await input.persistSubmitStarted({
    ownerSignerAddress: owner,
    depositWalletAddress,
  });

  try {
    const handle = await input.deploy(input.eoaSecureClient);
    if (handle.transactionHash === null && handle.transactionId === null) {
      return unknownDeployment(depositWalletAddress);
    }
    const locator = Object.freeze({
      transactionHash: handle.transactionHash,
      transactionId: handle.transactionId,
    });
    await input.persistLocator(locator);

    const outcome = await handle.wait();
    if (!/^0x[a-fA-F0-9]{64}$/.test(outcome.transactionHash)) {
      return unknownDeployment(depositWalletAddress);
    }
    if (!(await input.verifyDeployed(depositWalletAddress))) {
      return unknownDeployment(depositWalletAddress);
    }

    const confirmed = Object.freeze({
      kind: "confirmed" as const,
      depositWalletAddress,
      transactionHash: outcome.transactionHash,
      transactionId: outcome.transactionId ?? handle.transactionId,
    });
    await input.persistConfirmed({
      depositWalletAddress: confirmed.depositWalletAddress,
      transactionHash: confirmed.transactionHash,
      transactionId: confirmed.transactionId,
    });
    return confirmed;
  } catch {
    return unknownDeployment(depositWalletAddress);
  }
}
