import { readCachedPolymarketWorldCupShadowStatus } from "@/server/polymarket/world-cup-shadow";
import { runVercelExecutionCycle } from "@/server/execution/vercel-cycle";
import {
  createVercelBlobJournalStore,
  listVercelExecutionProfileIds,
} from "@/server/execution/vercel-blob-store";

/** Production composition for the one-app Vercel Cron wakeup. */
export async function runVercelCronCycle(nowMs = Date.now()) {
  const store = createVercelBlobJournalStore();
  const profileIds = await listVercelExecutionProfileIds();
  return runVercelExecutionCycle({
    store,
    profileIds,
    nowMs,
    readShadowStatus: readCachedPolymarketWorldCupShadowStatus,
  });
}
