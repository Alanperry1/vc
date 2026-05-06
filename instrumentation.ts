// Next.js auto-runs this once when the server boots (dev + prod).
// We dynamically import the actual bootstrap logic so its dependencies
// (pg, ingest libs) are NEVER pulled into edge or middleware bundles.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Don't migrate/ingest during `next build` — only when serving requests.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  setTimeout(async () => {
    try {
      const { bootstrap } = await import('./instrumentation-node');
      await bootstrap();
    } catch (err) {
      console.warn('[bootstrap] aborted:', err instanceof Error ? err.message : String(err));
    }
  }, 100);
}
