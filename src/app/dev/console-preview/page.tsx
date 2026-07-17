import { notFound } from "next/navigation";

import { TxBetConsole } from "@/components/dashboard/txbet-console";

// Headless design-QA surface: the console without the Privy gate.
// Development-only; production requests 404. All data here is synthetic.
export default function ConsolePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TxBetConsole />;
}
