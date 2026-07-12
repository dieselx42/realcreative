import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev configuration.
 *
 * Replace `project` with your project ref from the Trigger.dev dashboard
 * (Project settings), or set TRIGGER_PROJECT_REF. Then deploy the tasks with:
 *   npx trigger.dev@latest deploy
 *
 * Tasks live in src/trigger. Their runtime env (Supabase, PageSpeed,
 * DataForSEO, Anthropic keys) is configured in the Trigger.dev dashboard.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_your_project_ref",
  dirs: ["./src/trigger"],
  maxDuration: 180,
});
