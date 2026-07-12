import { NextResponse } from "next/server";

/**
 * Reports the exact commit and build info of the running deployment, so it's
 * possible to verify what is actually live in production (rather than guessing
 * whether the latest push deployed). On Vercel, VERCEL_GIT_COMMIT_SHA and
 * friends are injected automatically at build/runtime.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown (not on Vercel)",
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    env: process.env.VERCEL_ENV ?? "local",
    // Marker so you can confirm THIS build without needing Vercel vars.
    buildMarker: "version-endpoint-added",
  });
}
