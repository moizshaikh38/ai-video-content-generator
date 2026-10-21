import { Router, Request, Response } from 'express';
import { GiphyService, ELEMENT_CATEGORIES } from '../services/giphyService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/elements/status
 * Returns GIPHY configuration status and attribution requirements
 */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      configured: GiphyService.isConfigured(),
      provider: 'giphy',
      attributionRequired: true,
      attributionLogo: 'https://giphy.com/static/img/powered_by_giphy_white.png',
      rateLimitInfo: {
        perHour: 1000,
        commercialApprovalRequired: true,
      },
    });
  })
);

/**
 * GET /api/elements/categories
 * Returns curated element & sticker categories
 */
router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      categories: ELEMENT_CATEGORIES,
    });
  })
);

/**
 * GET /api/elements/search
 * Search GIFs or Stickers via GIPHY
 */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const type = req.query.type === 'sticker' ? 'sticker' : 'gif';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 24;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const rating = typeof req.query.rating === 'string' ? req.query.rating : 'g';

    try {
      const result = await GiphyService.searchElements({
        query,
        category,
        type,
        limit,
        offset,
        rating,
      });

      res.status(200).json({
        status: 'ok',
        ...result,
      });
    } catch (err: any) {
      if (err.message === 'GIPHY_RATE_LIMIT') {
        res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'GIPHY search rate limit exceeded. Please wait a moment and try again.',
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * GET /api/elements/trending
 * Fetch trending GIFs or Stickers via GIPHY
 */
router.get(
  '/trending',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type === 'sticker' ? 'sticker' : 'gif';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 24;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const rating = typeof req.query.rating === 'string' ? req.query.rating : 'g';

    try {
      const result = await GiphyService.getTrendingElements({
        type,
        limit,
        offset,
        rating,
      });

      res.status(200).json({
        status: 'ok',
        ...result,
      });
    } catch (err: any) {
      if (err.message === 'GIPHY_RATE_LIMIT') {
        res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'GIPHY rate limit exceeded. Please try again in a few minutes.',
        });
        return;
      }
      throw err;
    }
  })
);

export default router;
