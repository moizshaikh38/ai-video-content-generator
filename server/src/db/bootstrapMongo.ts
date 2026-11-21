import {isDeepStrictEqual} from 'node:util';
import { Db } from 'mongodb';
import { getMongoDb, assertDatabaseTransactionalTopology } from './mongoClient.js';
import { logger } from '../utils/logger.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

const collections = [
  'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
  'usage_events', 'subscription_limits', 'clip_candidates', 'clips',
  'render_jobs', 'render_quota_fences', 'project_quota_fences', 'render_submissions', 'candidate_creations', 'reframe_tracks', 'social_account_connections', 'oauth_states',
  'published_posts', 'publish_jobs',
  'billing_customers', 'subscriptions', 'billing_events', 'billing_invoices',
  'billing_checkouts',
  'content_analytics', 'content_memories',
  'video_analyses', 'video_analysis_jobs',
  'producer_plans',
  'editor_projects',
  'hook_lab_sessions',
  'hook_candidates',
  'autopilot_runs',
  'credit_wallets',
  'credit_transactions',
  'credit_reservations',
  'outbox_events',
  'user_concurrency_slots',
  'idempotency_keys',
  'video_intelligence',
  'project_upload_attempts',
] as const;

// Phase 4B.3: Bounded Wallet Schema Definition (Strict JSON Schema, Zero Unbounded Arrays)
export const WALLET_COLLECTION_JSON_SCHEMA = {
  bsonType: 'object',
  required: [
    'id', 'user_id', 'available_credits', 'reserved_credits',
    'lifetime_granted', 'lifetime_consumed', 'period_granted', 'period_consumed',
    'billing_period', 'reset_date', 'status', 'version', 'created_at', 'updated_at'
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: ['objectId', 'string'], maxLength: 36 },
    id: { bsonType: 'string', maxLength: 36 },
    user_id: { bsonType: 'string', maxLength: 36 },
    workspace_id: { bsonType: ['string', 'null'], maxLength: 36 },
    available_credits: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    reserved_credits: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    lifetime_granted: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    lifetime_consumed: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    period_granted: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    period_consumed: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
    billing_period: { bsonType: 'string', maxLength: 7 },
    reset_date: { bsonType: 'string', maxLength: 30 },
    status: { enum: ['active', 'suspended', 'frozen'] },
    version: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 9007199254740991, multipleOf: 1 },
    created_at: { bsonType: 'date' },
    updated_at: { bsonType: 'date' },
  },
} as const;

/**
 * Reports whether the existing database collection validator for credit_wallets is current,
 * outdated, or missing. Attempts non-destructive collMod if permitted by database user privileges.
 */
export async function auditWalletCollectionValidator(database: Db): Promise<{
  status: 'CURRENT' | 'OUTDATED' | 'MISSING';
  validationLevel?: string;
  hasCollModPermission: boolean;
  message: string;
}> {
  const collInfos = await database.listCollections({ name: 'credit_wallets' }).toArray();
  if (collInfos.length === 0) {
    return {
      status: 'MISSING',
      hasCollModPermission: true,
      message: 'Collection credit_wallets does not exist yet; will be created with final schema.',
    };
  }

  const collInfo = collInfos[0] as any;
  const existingValidator = collInfo?.options?.validator;
  const validationLevel = collInfo?.options?.validationLevel;

  // Whole-schema equality is order independent. Enforcement can be disabled
  // even when the schema itself is current, so inspect both settings as well.
  const isCurrent =
    isDeepStrictEqual(existingValidator, { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA }) &&
    (validationLevel === undefined || validationLevel === 'strict') &&
    (collInfo?.options?.validationAction === undefined || collInfo.options.validationAction === 'error');

  if (isCurrent) {
    logger.info('[BootstrapMongo] credit_wallets collection validator is CURRENT and enforced in strict mode.');
    return {
      status: 'CURRENT',
      validationLevel,
      hasCollModPermission: true,
      message: 'Validator is current and enforced in strict mode.',
    };
  }

  // Validator is outdated. Check if current database user has collMod privilege to upgrade it
  let hasCollModPermission = false;
  try {
    await database.command({
      collMod: 'credit_wallets',
      validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    hasCollModPermission = true;
    logger.info('[BootstrapMongo] Successfully upgraded credit_wallets validator to final schema via collMod.');
    return {
      status: 'CURRENT',
      validationLevel: 'strict',
      hasCollModPermission: true,
      message: 'Successfully upgraded credit_wallets validator via collMod.',
    };
  } catch (err: any) {
    hasCollModPermission = false;
    const warnMsg =
      `[BootstrapMongo] ATTENTION: credit_wallets collection has an OUTDATED validator on MongoDB Atlas ` +
      `(${err.message}). Application-level validation is ACTIVE and strictly enforcing bounded schema. ` +
      `To update database-level enforcement, an operator with dbAdmin permissions must run the migration collMod command.`;
    logger.warn(warnMsg);
    return {
      status: 'OUTDATED',
      validationLevel,
      hasCollModPermission: false,
      message: warnMsg,
    };
  }
}

/** Idempotent index/bootstrap setup. Run with an app DB user allowed to create indexes. */
export async function bootstrapMongo(db?: Db): Promise<void> {
  const database = db ?? await getMongoDb();
  // Gate before schema writes: this app requires transactional topology.
  await assertDatabaseTransactionalTopology(database);
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const name of collections) {
    if (!existing.has(name)) {
      if (name === 'credit_wallets') {
        // Phase 4B.3: Bounded Wallet Schema Validation (Strict JSON Schema, Zero Unbounded Arrays)
        await database.createCollection('credit_wallets', {
          validator: {
            $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA,
          },
          validationLevel: 'strict',
        });
      } else {
        const requiredFields = name === 'subscription_limits'
          ? ['user_id', 'billing_period']
          : name === 'billing_events'
          ? ['id', 'provider', 'provider_event_id']
          : name === 'outbox_events' || name === 'user_concurrency_slots' || name === 'idempotency_keys'
          ? ['_id', 'user_id']
          : ['id', 'user_id'];

        await database.createCollection(name, {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: requiredFields,
              properties: {
                id: { bsonType: 'string' },
                user_id: { bsonType: 'string' },
                project_id: { bsonType: 'string' },
                clip_id: { bsonType: 'string' },
                created_at: { bsonType: 'date' },
                updated_at: { bsonType: 'date' },
              },
            },
          },
          validationLevel: 'moderate',
        });
      }
    }
  }

  // If credit_wallets already exists, audit whether its validator is current or outdated
  if (existing.has('credit_wallets')) {
    await auditWalletCollectionValidator(database);
  }

  // Safe, non-destructive migration: backfill canonical idempotency field aliases
  await database
    .collection('idempotency_keys')
    .updateMany(
      { $or: [{ operation_id: { $exists: false } }, { attempt_id: { $exists: false } }] },
      [{ $set: { operation_id: '$operation_type', attempt_id: '$client_key' } }]
    )
    .catch(() => undefined);

  await Promise.all([
    // Waitlist uniqueness must be ready before public capture admission.
    database.collection('waitlist').createIndex({ email: 1 }, { unique: true }),
    database.collection('waitlist_mail_intents').createIndex({ email: 1, kind: 1 }, { unique: true }),
    database.collection('waitlist_mail_intents').createIndex({ status: 1, created_at: 1 }),
    database.collection('profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('transcripts').createIndex({ id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ project_id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ user_id: 1, project_id: 1 }),
    database.collection('creator_profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ project_id: 1, user_id: 1, created_at: -1 }),
    database.collection('usage_events').createIndex({ id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ processing_attempt_id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ user_id: 1, billing_period: 1 }),
    database.collection('subscription_limits').createIndex({ user_id: 1, billing_period: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ id: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ project_id: 1, engagement_score: -1 }),
    database.collection('clip_candidates').createIndex({ project_id: 1, start_segment_index: 1, end_segment_index: 1 }, { unique: true }),
    database.collection('clips').createIndex({ id: 1 }, { unique: true }),
    database.collection('clips').createIndex({ project_id: 1, user_id: 1, render_status: 1 }),
    database.collection('render_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('render_jobs').createIndex({user_id:1,created_at:1}),
    database.collection('render_jobs').createIndex({status:1,created_at:1}),
    database.collection('render_jobs').createIndex({user_id:1,started_at:-1}),
    database.collection('render_jobs').createIndex({ clip_id: 1, user_id: 1, status: 1, created_at: -1 }),
    database.collection('reframe_tracks').createIndex({ id: 1 }, { unique: true }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, user_id: 1, status: 1 }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, analysis_version: 1 }, { unique: true }),
    // Phase 9: Social connections & OAuth state indexes
    database.collection('social_account_connections').createIndex({ id: 1 }, { unique: true }),
    database.collection('social_account_connections').createIndex({ user_id: 1, provider: 1 }),
    database.collection('social_account_connections').createIndex({ provider: 1, provider_account_id: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ id: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ state_hash: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    // Phase 10: Publishing & Scheduling indexes
    database.collection('published_posts').createIndex({ id: 1 }, { unique: true }),
    database.collection('published_posts').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('published_posts').createIndex({ user_id: 1, status: 1 }),
    database.collection('published_posts').createIndex({ request_fingerprint: 1 }, { unique: true }),
    database.collection('published_posts').createIndex({ scheduled_for: 1 }),
    database.collection('publish_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('publish_jobs').createIndex({ published_post_id: 1 }, { unique: true }),
    database.collection('publish_jobs').createIndex({ status: 1, scheduled_for: 1 }),
    database.collection('publish_jobs').createIndex({ user_id: 1, scheduled_for: 1 }),
    // Phase 11: Billing, Customers, Subscriptions & Invoices indexes
    database.collection('billing_customers').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_customers').createIndex({ user_id: 1, provider: 1 }, { unique: true }),
    database.collection('billing_customers').createIndex({ provider: 1, provider_customer_id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ user_id: 1 }),
    database.collection('subscriptions').createIndex({ user_id: 1, provider: 1 }),
    database.collection('subscriptions').createIndex({ provider: 1, provider_subscription_id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ provider: 1, provider_customer_id: 1 }),
    database.collection('subscriptions').createIndex({ last_provider_event_id: 1 }),
    database.collection('subscriptions').createIndex({ status: 1, current_period_end: 1 }),
    database.collection('billing_events').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_events').createIndex({ provider: 1, provider_event_id: 1 }, { unique: true }),
    database.collection('billing_events').createIndex({ processed_at: 1 }),
    database.collection('billing_invoices').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_invoices').createIndex({ provider: 1, provider_invoice_id: 1 }, { unique: true }),
    database.collection('billing_invoices').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('billing_countries').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('billing_checkouts').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_checkouts').createIndex({ provider: 1, provider_ref: 1 }, { unique: true }),
    database.collection('billing_checkouts').createIndex({ user_id: 1, status: 1, created_at: -1 }),
    // Phase 12 & 13: Admin Console & Distributed Render Job processing indexes
    database.collection('profiles').createIndex({ created_at: -1 }),
    database.collection('profiles').createIndex({ email: 1 }),
    database.collection('projects').createIndex({ status: 1, created_at: -1 }),
    database.collection('subscriptions').createIndex({ plan_id: 1, status: 1 }),
    database.collection('render_jobs').createIndex({ status: 1, created_at: -1 }),
    database.collection('render_jobs').createIndex({ status: 1, locked_at: 1 }),
    database.collection('render_jobs').createIndex({ status: 1, next_retry_at: 1 }),
    database.collection('usage_events').createIndex({ created_at: -1 }),
    // Phase 15: Analytics & Content Memory indexes
    database.collection('content_analytics').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_analytics').createIndex({ user_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ published_post_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ clip_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ project_id: 1 }),
    database.collection('content_analytics').createIndex({ provider: 1, provider_post_id: 1 }),
    database.collection('content_memories').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_memories').createIndex({ user_id: 1, category: 1 }),
    database.collection('content_memories').createIndex({ user_id: 1, confidence: 1 }),
    // Phase 16: Video Multimodal Intelligence indexes
    database.collection('video_analyses').createIndex({ id: 1 }, { unique: true }),
    database.collection('video_analyses').createIndex({ project_id: 1 }, { unique: true }),
    database.collection('video_analyses').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('video_analysis_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('video_analysis_jobs').createIndex({ project_id: 1 }),
    database.collection('video_analysis_jobs').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('video_analysis_jobs').createIndex({ status: 1, created_at: 1 }),
    database.collection('video_analysis_jobs').createIndex({ status: 1, locked_at: 1 }),
    // Phase 17: Vireo Producer Plan indexes
    database.collection('producer_plans').createIndex({ id: 1 }, { unique: true }),
    database.collection('producer_plans').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('producer_plans').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('producer_plans').createIndex({ clip_id: 1, status: 1 }),
    // Phase 18: Vireo Pro Video Editor indexes
    database.collection('editor_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('editor_projects').createIndex({ clip_id: 1, user_id: 1 }),
    database.collection('editor_projects').createIndex({ project_id: 1 }),
    database.collection('editor_projects').createIndex({ user_id: 1, updated_at: -1 }),
    // Phase 19: Vireo AI B-Roll & Media Intelligence indexes
    database.collection('media_assets').createIndex({ id: 1 }, { unique: true }),
    database.collection('media_assets').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('media_assets').createIndex({ project_id: 1 }),
    database.collection('media_assets').createIndex({ provider: 1, provider_asset_id: 1 }),
    database.collection('media_assets').createIndex({ source_type: 1 }),
    database.collection('broll_plans').createIndex({ id: 1 }, { unique: true }),
    database.collection('broll_plans').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('broll_plans').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('broll_plans').createIndex({ status: 1 }),
    // Phase 20: Vireo Audio + Voice Studio indexes
    database.collection('audio_assets').createIndex({ id: 1 }, { unique: true }),
    database.collection('audio_assets').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('audio_assets').createIndex({ project_id: 1 }),
    database.collection('audio_assets').createIndex({ clip_id: 1 }),
    database.collection('audio_assets').createIndex({ source_type: 1 }),
    database.collection('voiceovers').createIndex({ id: 1 }, { unique: true }),
    database.collection('voiceovers').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('voiceovers').createIndex({ project_id: 1 }),
    database.collection('voiceovers').createIndex({ status: 1 }),
    database.collection('voice_profiles').createIndex({ id: 1 }, { unique: true }),
    database.collection('voice_profiles').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('voice_profiles').createIndex({ provider: 1, provider_voice_id: 1 }),
    // Phase 21: Vireo Translate + Multilingual Dubbing indexes
    database.collection('translation_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('translation_projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('translation_projects').createIndex({ project_id: 1, target_language: 1 }),
    database.collection('translation_projects').createIndex({ clip_id: 1, target_language: 1 }),
    database.collection('translation_projects').createIndex({ status: 1 }),
    database.collection('dub_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('dub_projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('dub_projects').createIndex({ translation_project_id: 1 }),
    database.collection('dub_projects').createIndex({ clip_id: 1 }),
    database.collection('translation_memory').createIndex({ id: 1 }, { unique: true }),
    database.collection('translation_memory').createIndex({ user_id: 1, source_hash: 1, source_language: 1, target_language: 1 }),
    database.collection('glossaries').createIndex({ id: 1 }, { unique: true }),
    database.collection('glossaries').createIndex({ user_id: 1, project_id: 1 }),
    // Phase 22: Vireo Brand Brain indexes
    database.collection('brand_brain_profiles').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_brain_profiles').createIndex({ user_id: 1, version: -1 }),
    database.collection('brand_brain_profiles').createIndex({ user_id: 1, status: 1 }),
    database.collection('brand_evidence').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_evidence').createIndex({ user_id: 1, brand_brain_id: 1, dimension: 1 }),
    database.collection('brand_evidence').createIndex({ idempotency_key: 1 }, { unique: true }),
    database.collection('brand_evidence').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('brand_brain_versions').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_brain_versions').createIndex({ user_id: 1, brand_brain_id: 1, version: -1 }),
    // Phase 23: Vireo Content Pack indexes
    database.collection('content_packs').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_packs').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('content_packs').createIndex({ project_id: 1, clip_id: 1 }),
    database.collection('content_packs').createIndex({ clip_id: 1, status: 1 }),
    database.collection('content_pack_items').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_pack_items').createIndex({ content_pack_id: 1, type: 1 }),
    database.collection('content_pack_items').createIndex({ content_pack_id: 1, platform: 1 }),
    database.collection('content_pack_items').createIndex({ user_id: 1 }),
    database.collection('content_pack_versions').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_pack_versions').createIndex({ user_id: 1, content_pack_id: 1, version: -1 }),
    // Phase 24: Vireo Hook Lab indexes
    database.collection('hook_lab_sessions').createIndex({ id: 1 }, { unique: true }),
    database.collection('hook_lab_sessions').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('hook_lab_sessions').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('hook_lab_sessions').createIndex({ project_id: 1 }),
    database.collection('hook_lab_sessions').createIndex({ status: 1 }),
    database.collection('hook_candidates').createIndex({ id: 1 }, { unique: true }),
    database.collection('hook_candidates').createIndex({ hook_lab_session_id: 1, variant_index: 1 }),
    database.collection('hook_candidates').createIndex({ user_id: 1 }),
    database.collection('hook_candidates').createIndex({ hook_type: 1 }),
    database.collection('hook_candidates').createIndex({ locked: 1 }),
    database.collection('hook_candidates').createIndex({ status: 1 }),
    // Phase 25: Vireo Thumbnail Lab indexes
    database.collection('thumbnail_lab_sessions').createIndex({ id: 1 }, { unique: true }),
    database.collection('thumbnail_lab_sessions').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('thumbnail_lab_sessions').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('thumbnail_lab_sessions').createIndex({ project_id: 1 }),
    database.collection('thumbnail_lab_sessions').createIndex({ status: 1 }),
    database.collection('thumbnail_concepts').createIndex({ id: 1 }, { unique: true }),
    database.collection('thumbnail_concepts').createIndex({ thumbnail_session_id: 1, variant_index: 1 }),
    database.collection('thumbnail_concepts').createIndex({ user_id: 1 }),
    database.collection('thumbnail_concepts').createIndex({ style_direction: 1 }),
    database.collection('thumbnail_concepts').createIndex({ locked: 1 }),
    database.collection('thumbnail_concepts').createIndex({ status: 1 }),
    database.collection('thumbnail_versions').createIndex({ id: 1 }, { unique: true }),
    database.collection('thumbnail_versions').createIndex({ user_id: 1, thumbnail_session_id: 1, version: -1 }),
    // Phase 26: Full Pipeline Autopilot indexes
    database.collection('autopilot_runs').createIndex({ id: 1 }, { unique: true }),
    database.collection('autopilot_runs').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('autopilot_runs').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('autopilot_runs').createIndex({ project_id: 1 }),
    database.collection('autopilot_runs').createIndex({ status: 1 }),
    // Phase 27: A/B Testing Studio indexes
    database.collection('ab_experiments').createIndex({ id: 1 }, { unique: true }),
    database.collection('ab_experiments').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('ab_experiments').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('ab_experiments').createIndex({ project_id: 1 }),
    database.collection('ab_experiments').createIndex({ status: 1 }),
    database.collection('ab_observation_logs').createIndex({ id: 1 }, { unique: true }),
    database.collection('ab_observation_logs').createIndex({ idempotency_key: 1 }, { unique: true }),
    database.collection('ab_observation_logs').createIndex({ experiment_id: 1, variant_id: 1 }),
    database.collection('ab_observation_logs').createIndex({ user_id: 1, created_at: -1 }),
    // Phase 34: Brand Brain Intelligence indexes
    database.collection('brand_recommendations').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_recommendations').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('brand_recommendations').createIndex({ user_id: 1, status: 1 }),
    database.collection('brand_recommendations').createIndex({ user_id: 1, brand_brain_id: 1 }),
    // Phase 36: Content Workflow Automation indexes
    database.collection('content_workflows').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_workflows').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('content_workflows').createIndex({ user_id: 1, current_state: 1 }),
    database.collection('content_workflows').createIndex({ clip_id: 1 }),
    database.collection('content_workflows').createIndex({ project_id: 1 }),
    // Phase 38: Workspace & Team Permissions indexes
    database.collection('workspaces').createIndex({ id: 1 }, { unique: true }),
    database.collection('workspaces').createIndex({ owner_id: 1 }),
    database.collection('workspaces').createIndex(
      { owner_id: 1, is_personal: 1 },
      { unique: true, partialFilterExpression: { is_personal: true } }
    ),
    database.collection('workspace_members').createIndex({ id: 1 }, { unique: true }),
    database.collection('workspace_members').createIndex({ workspace_id: 1, user_id: 1 }, { unique: true }),
    database.collection('workspace_members').createIndex({ user_id: 1 }),
    database.collection('workspace_invitations').createIndex({ id: 1 }, { unique: true }),
    database.collection('workspace_invitations').createIndex({ token_hash: 1 }, { unique: true }),
    database.collection('workspace_invitations').createIndex({ workspace_id: 1, status: 1 }),
    database.collection('workspace_invitations').createIndex({ expires_at: 1 }),

    // ── Phase 4B.3 Unified Financial Credit System Indexes ───────────────
    database.collection('credit_wallets').createIndex({ id: 1 }, { unique: true }),
    database.collection('credit_wallets').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('credit_wallets').createIndex({ workspace_id: 1 }),

    database.collection('credit_transactions').createIndex({ id: 1 }, { unique: true }),
    database.collection('credit_transactions').createIndex({ wallet_id: 1, created_at: -1 }),
    database.collection('credit_transactions').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('credit_transactions').createIndex({ idempotency_key: 1 }, { unique: true }),
    database.collection('credit_transactions').createIndex({ attempt_id: 1 }),

    database.collection('credit_reservations').createIndex({ id: 1 }, { unique: true }),
    database.collection('credit_reservations').createIndex({ attempt_id: 1 }, { unique: true }),
    database.collection('credit_reservations').createIndex({ wallet_id: 1, status: 1 }),
    database.collection('credit_reservations').createIndex({ expires_at: 1 }),
    database.collection('credit_reservations').createIndex({ user_id: 1, status: 1 }),
    database.collection('credit_reservations').createIndex({ status: 1, worker_leased_until: 1 }),

    // Phase 4B.3 Transactional Outbox indexes
    database.collection('outbox_events').createIndex({ status: 1, next_attempt_at: 1 }),
    database.collection('outbox_events').createIndex({ status: 1, dispatcher_leased_until: 1 }),
    database.collection('outbox_events').createIndex({ user_id: 1, created_at: -1 }),

    // Phase 4B.3 Distributed Concurrency Slot indexes
    database.collection('user_concurrency_slots').createIndex({ user_id: 1, slot_number: 1 }, { unique: true }),
    database.collection('user_concurrency_slots').createIndex({ user_id: 1, status: 1, leased_until: 1 }),

    // Phase 4B.3 Tenant-Scoped Idempotency indexes
    database.collection('idempotency_keys').createIndex(
      { user_id: 1, operation_type: 1, client_key: 1 },
      { unique: true, name: 'user_id_1_operation_type_1_client_key_1' }
    ),
    database.collection('idempotency_keys').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('idempotency_keys').createIndex({ status: 1, reconciliation_leased_until: 1 }),

    // Shared Video Intelligence Engine indexes (Phase 2)
    database.collection('video_intelligence').createIndex({ id: 1 }, { unique: true }),
    database.collection('video_intelligence').createIndex({ user_id: 1, source_hash: 1 }, { unique: true }),
    database.collection('video_intelligence').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('video_intelligence').createIndex({ source_hash: 1 }),
    database.collection('video_intelligence').createIndex({ status: 1, locked_at: 1 }),

    // Phase 4B.4 Upload Lifecycle & Orphan Prevention indexes
    database.collection('project_upload_attempts').createIndex({ id: 1 }, { unique: true }),
    database.collection('project_upload_attempts').createIndex({ project_id: 1, user_id: 1 }),
    database.collection('project_upload_attempts').createIndex({ object_key: 1 }, { unique: true }),
    database.collection('project_upload_attempts').createIndex({ user_id: 1, status: 1, expires_at: 1 }),
  ]);
}
