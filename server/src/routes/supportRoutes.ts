import { Router } from 'express';
import { supportLimiter } from '../middleware/rateLimiter.js';
import { supportChat } from '../controllers/supportController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Public: support is reachable pre-signup; IP rate-limited, provider-capped.
router.post('/chat', supportLimiter, asyncHandler(supportChat));

export default router;
