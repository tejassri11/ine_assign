import express from 'express';
import { config } from '../config/index.js';
import { supabaseService } from '../services/supabaseService.js';
import { runFullScrape } from '../services/scraperService.js';

const router = express.Router();

/**
 * Bearer token middleware for cron endpoint protection.
 * Rejects any request missing the correct Authorization: Bearer <CRON_SECRET>.
 * CRON_SECRET is never exposed to the frontend.
 */
function requireCronSecret(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token || token !== config.cronSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing Authorization: Bearer <CRON_SECRET>'
    });
  }

  next();
}

/**
 * POST /api/cron/scrape
 *
 * Protected endpoint for external cron services (cron-job.org, Render cron, GitHub Actions).
 * Runs a full scrape of all active tracked products sequentially.
 *
 * Idempotency: Rejects if another run is already active (unless it is stale/crashed).
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 */
router.post('/scrape', requireCronSecret, async (req, res) => {
  try {
    // Idempotency check: prevent concurrent scrape runs
    const activeRun = await supabaseService.getActiveRunIfRecent(30 /* stale after 30 minutes */);

    if (activeRun) {
      const startedAt = new Date(activeRun.started_at);
      const ageMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);

      console.warn(`[CronRoute] Rejected: Scrape run "${activeRun.id}" already RUNNING (${ageMinutes}m old).`);

      return res.status(409).json({
        success: false,
        error: 'A scrape run is already in progress. Try again later.',
        activeRunId: activeRun.id,
        startedAt: activeRun.started_at,
        ageMinutes
      });
    }

    // Start scrape asynchronously and return 202 immediately
    // This prevents the cron HTTP caller from timing out on large product lists
    const runId = await startBackgroundScrape('cron');

    return res.status(202).json({
      success: true,
      message: 'Scrape run started successfully.',
      runId
    });
  } catch (err) {
    console.error('[CronRoute] Error starting scrape run:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal error starting scrape',
      details: err.message
    });
  }
});

/**
 * Starts a scrape run as a non-blocking background task.
 * Returns the runId immediately.
 */
async function startBackgroundScrape(triggeredBy) {
  const { randomUUID } = await import('crypto');
  const runId = randomUUID();

  // Fire-and-forget: runs in background
  setImmediate(async () => {
    try {
      await runFullScrape({ triggeredBy });
    } catch (err) {
      console.error(`[CronRoute] Background scrape run crashed:`, err.message);
    }
  });

  return runId;
}

export default router;
