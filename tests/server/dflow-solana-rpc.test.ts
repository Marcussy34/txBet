import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import { CLASSIC_TOKEN_PROGRAM_ID } from "@/execution/venues/dflow/program-allowlist";
import {
  DflowSubmissionUnknownError,
  getDflowSolanaBlockHeight,
  simulateDflowSignedTransaction,
  submitDflowSignedTransactionOnce,
} from "@/server/execution/dflow-solana-rpc";

const RPC_URL = "https://solana-rpc.example.test/mainnet";
const SIGNATURE = "3".repeat(88);
const TRANSACTION = Buffer.from("signed transaction").toString("base64");

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rpcAccount(lamports: number, data = Buffer.alloc(0), owner = "11111111111111111111111111111111") {
  return {
    data: [data.toString("base64"), "base64"],
    executable: false,
    lamports,
    owner,
  };
}

function tokenAccount(mint: string, wallet: string, amount: bigint) {
  const data = Buffer.alloc(165);
  new PublicKey(mint).toBuffer().copy(data, 0);
  new PublicKey(wallet).toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  return rpcAccount(2_039_280, data, CLASSIC_TOKEN_PROGRAM_ID);
}

describe("DFlow Solana RPC boundary", () => {
  it("simulates signed bytes with signature checks and the original blockhash", async () => {
    const fetcher = vi.fn(async () => response({
      jsonrpc: "2.0",
      id: "simulate:dflow-op",
      result: {
        context: { slot: 123 },
        value: { err: null, unitsConsumed: 190_000, logs: [] },
      },
    }));

    await expect(simulateDflowSignedTransaction({
      rpcUrl: RPC_URL,
      transactionBase64: TRANSACTION,
      minimumContextSlot: 120,
      operationId: "dflow-op",
      fetcher,
    })).resolves.toEqual({ contextSlot: 123, unitsConsumed: 190_000 });

    const [, init] = fetcher.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(JSON.parse(String(init?.body))).toEqual({
      jsonrpc: "2.0",
      id: "simulate:dflow-op",
      method: "simulateTransaction",
      params: [TRANSACTION, {
        encoding: "base64",
        sigVerify: true,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
        minContextSlot: 120,
      }],
    });
  });

  it("fails before claim on simulation errors, stale slots, and malformed block heights", async () => {
    const failed = vi.fn(async () => response({
      jsonrpc: "2.0",
      id: "simulate:x",
      result: { context: { slot: 9 }, value: { err: { InstructionError: [0, 1] } } },
    }));
    await expect(simulateDflowSignedTransaction({
      rpcUrl: RPC_URL,
      transactionBase64: TRANSACTION,
      minimumContextSlot: 10,
      operationId: "x",
      fetcher: failed,
    })).rejects.toThrow(/simulation|slot/i);

    const blockFetcher = vi.fn(async () => response({
      jsonrpc: "2.0",
      id: "block-height:x",
      result: -1,
    }));
    await expect(getDflowSolanaBlockHeight({
      rpcUrl: RPC_URL,
      operationId: "x",
      fetcher: blockFetcher,
    })).rejects.toThrow(/block height/i);
  });

  it("proves exact USDC debit, minimum outcome credit, and bounded SOL debit", async () => {
    const wallet = new PublicKey(Uint8Array.from({ length: 32 }, () => 3)).toBase58();
    const inputMint = new PublicKey(Uint8Array.from({ length: 32 }, () => 4)).toBase58();
    const outputMint = new PublicKey(Uint8Array.from({ length: 32 }, () => 5)).toBase58();
    const inputTokenAccount = new PublicKey(Uint8Array.from({ length: 32 }, () => 6)).toBase58();
    const outputTokenAccount = new PublicKey(Uint8Array.from({ length: 32 }, () => 7)).toBase58();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; id: string };
      if (request.method === "getMultipleAccounts") {
        return response({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            context: { slot: 120 },
            value: [
              rpcAccount(1_000_000),
              tokenAccount(inputMint, wallet, 2_000_000n),
              null,
            ],
          },
        });
      }
      return response({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          context: { slot: 121 },
          value: {
            err: null,
            unitsConsumed: 190_000,
            accounts: [
              rpcAccount(994_800),
              tokenAccount(inputMint, wallet, 1_000_000n),
              tokenAccount(outputMint, wallet, 600_000n),
            ],
          },
        },
      });
    });

    await expect(simulateDflowSignedTransaction({
      rpcUrl: RPC_URL,
      transactionBase64: TRANSACTION,
      minimumContextSlot: 100,
      operationId: "guarded",
      fetcher,
      balanceGuard: {
        walletAddress: wallet,
        inputTokenAccount,
        outputTokenAccount,
        inputMint,
        outputMint,
        expectedInputDebitAtomic: "1000000",
        minimumOutputCreditAtomic: "500000",
        maximumLamportDebit: "5200",
      },
    })).resolves.toMatchObject({
      balanceDeltas: {
        inputDebitAtomic: "1000000",
        outputCreditAtomic: "600000",
        lamportDebit: "5200",
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("submits exactly once with no RPC retry and verifies the returned signature", async () => {
    const fetcher = vi.fn(async () => response({
      jsonrpc: "2.0",
      id: "send:dflow-op",
      result: SIGNATURE,
    }));

    await expect(submitDflowSignedTransactionOnce({
      rpcUrl: RPC_URL,
      transactionBase64: TRANSACTION,
      expectedSignature: SIGNATURE,
      minimumContextSlot: 120,
      operationId: "dflow-op",
      fetcher,
    })).resolves.toEqual({ signature: SIGNATURE, state: "submitted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(JSON.parse(String(init?.body)).params[1]).toEqual({
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 0,
      minContextSlot: 120,
    });
  });

  it("classifies timeouts, RPC failures, and signature mismatches as unknown without retrying", async () => {
    for (const fetcher of [
      vi.fn(async () => { throw new Error("socket and secret details"); }),
      vi.fn(async () => response({ jsonrpc: "2.0", id: "send:x", error: { code: -1 } })),
      vi.fn(async () => response({ jsonrpc: "2.0", id: "send:x", result: "4".repeat(88) })),
    ]) {
      const error = await submitDflowSignedTransactionOnce({
        rpcUrl: RPC_URL,
        transactionBase64: TRANSACTION,
        expectedSignature: SIGNATURE,
        minimumContextSlot: 1,
        operationId: "x",
        fetcher,
      }).catch((caught) => caught as unknown);
      expect(error).toBeInstanceOf(DflowSubmissionUnknownError);
      expect((error as DflowSubmissionUnknownError).signature).toBe(SIGNATURE);
      expect(String(error)).not.toContain("secret details");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
