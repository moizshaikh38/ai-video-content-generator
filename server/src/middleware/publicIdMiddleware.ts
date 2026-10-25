import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { resolveToUuid } from '../utils/publicIds.js';
import { getMongoDb, isMongoConfigured } from '../db/mongoClient.js';
import { logger } from '../utils/logger.js';

/**
 * Public ID resolver middleware: transparently maps short public IDs in route
 * parameters to internal UUIDs before the controller sees them. Existing UUID
 * clients continue to work unchanged (backward compatible).
 *
 * Usage: `router.get('/projects/:id', resolvePublicId('id', 'projects'), ...)`
 */

export function resolvePublicId(
  paramName: string,
  entityType: 'projects' | 'clips'
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.params[paramName];
    if (!identifier) { next(); return; }

    // Fast path: UUID needs no resolution
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
      next(); return;
    }

    // Slow path: public ID → lookup
    if (!isMongoConfigured) { next(); return; }

    try {
      const internalId = await resolveToUuid(identifier, entityType, getMongoDb);
      if (internalId) {
        // Replace the route param with the internal ID; controllers are unchanged
        (req.params as any)[paramName] = internalId;
        logger.info(`[PublicId] Resolved ${identifier} → ${internalId} (${entityType})`);
      } else {
        // Not found — let the controller's 404 handle it
        logger.info(`[PublicId] ${identifier} not found in ${entityType} index`);
      }
      next();
    } catch (err: any) {
      // Never block a request on ID resolution failure — fall through to UUID path
      logger.warn(`[PublicId] Resolution failed for ${identifier}: ${err?.message || err}`);
      next();
    }
  };
}

/**
 * Registers a public ID ↔ internal ID mapping at entity creation time.
 * Called after the entity is created with its internal UUID.
 */
export async function registerPublicId(
  internalId: string,
  entityType: 'projects' | 'clips',
  userId: string
): Promise<string> {
  const { generatePublicId } = await import('../utils/publicIds.js');
  const publicId = generatePublicId();

  if (!isMongoConfigured) return publicId;

  const db = await getMongoDb();
  await db.collection('public_id_index').insertOne({
    public_id: publicId,
    internal_id: internalId,
    entity_type: entityType,
    user_id: userId,
    created_at: new Date(),
  });
  return publicId;
}

/**
 * Looks up the public ID for an internal ID (for API responses).
 */
export async function getPublicId(internalId: string): Promise<string | null> {
  if (!isMongoConfigured) return null;
  const db = await getMongoDb();
  const doc = await db.collection('public_id_index').findOne(
    { internal_id: internalId },
    { projection: { public_id: 1 } }
  );
  return doc?.public_id ?? null;
}
