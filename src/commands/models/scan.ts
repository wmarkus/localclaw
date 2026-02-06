import type { RuntimeEnv } from "../../runtime.js";

export async function modelsScanCommand(
  _opts: {
    minParams?: string;
    maxAgeDays?: string;
    provider?: string;
    maxCandidates?: string;
    timeout?: string;
    concurrency?: string;
    yes?: boolean;
    input?: boolean;
    setDefault?: boolean;
    setImage?: boolean;
    json?: boolean;
    probe?: boolean;
  },
  runtime: RuntimeEnv,
) {
  runtime.error("Model scanning is disabled in the local-only build.");
  runtime.exit(1);
}
