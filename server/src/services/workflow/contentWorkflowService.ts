import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import {
  AppError,
  ContentWorkflowFilterOptions,
  ContentWorkflowListResponse,
  ContentWorkflowRecord,
  WorkflowArtifactSummary,
  WorkflowAuditEntry,
  WorkflowReadinessCheck,
  WorkflowState,
} from '../../types/index.js';

const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  PLANNED: ['IN_PREPARATION'],
  IN_PREPARATION: ['PLANNED', 'READY_FOR_REVIEW'],
  READY_FOR_REVIEW: ['IN_PREPARATION', 'AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['IN_PREPARATION', 'APPROVED'],
  APPROVED: ['IN_PREPARATION', 'AWAITING_APPROVAL', 'PUBLISHED'],
  PUBLISHED: [],
};

export class ContentWorkflowService {
  /**
   * Evaluates readiness checks and prerequisite blockers across existing data sources
   * without mutating any upstream records.
   */
  static async evaluateReadiness(
    userId: string,
    workflow: { clip_id?: string | null; project_id: string; current_state: WorkflowState },
    artifacts: WorkflowArtifactSummary
  ): Promise<{
    checklist: WorkflowReadinessCheck[];
    missing_prerequisites: string[];
    can_transition_to: WorkflowState[];
  }> {
    const checklist: WorkflowReadinessCheck[] = [];
    const missing: string[] = [];

    // 1. Clip Readiness Check
    const isClipReady = artifacts.clip?.status === 'ready';
    checklist.push({
      task_key: 'clip_ready',
      label: 'Source Clip Video Ready',
      description: 'The source video clip has been rendered, trimmed, and is ready for playback.',
      completed: isClipReady,
      required_for: ['READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED'],
      details: artifacts.clip ? `Clip status: ${artifacts.clip.status}` : 'No clip linked',
    });

    // 2. Creative Artifacts Check (Hook Lab, Thumbnail Lab, Content Pack)
    const hasHook = Boolean(artifacts.hook_lab?.selected_hook || (artifacts.hook_lab?.candidates_count ?? 0) > 0);
    const hasThumbnail = Boolean(artifacts.thumbnail_lab?.selected_concept_id || (artifacts.thumbnail_lab?.concepts_count ?? 0) > 0);
    const hasPack = Boolean((artifacts.content_pack?.items_count ?? 0) > 0);
    const hasCreativeArtifact = hasHook || hasThumbnail || hasPack || (artifacts.autopilot?.status === 'COMPLETED');

    checklist.push({
      task_key: 'creative_artifacts_prepared',
      label: 'Creative Artifacts Prepared',
      description: 'At least one creative asset (Hook, Thumbnail concept, or Content Pack) is generated.',
      completed: hasCreativeArtifact,
      required_for: ['READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'APPROVED'],
      details: `Pack: ${artifacts.content_pack ? artifacts.content_pack.items_count + ' items' : 'none'}, Hooks: ${artifacts.hook_lab ? artifacts.hook_lab.candidates_count : 0}, Thumbnails: ${artifacts.thumbnail_lab ? artifacts.thumbnail_lab.concepts_count : 0}`,
    });

    // 3. Human Review Checklist
    const isReviewComplete = ['READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED'].includes(workflow.current_state) && isClipReady && hasCreativeArtifact;
    checklist.push({
      task_key: 'editorial_review',
      label: 'Editorial & Brand Review',
      description: 'Headlines, captions, and visual styles verified against brand tone.',
      completed: isReviewComplete,
      required_for: ['AWAITING_APPROVAL', 'APPROVED'],
      details: isReviewComplete ? 'Editorial requirements satisfied' : 'Awaiting reviewer check',
    });

    // 4. Human Approval Confirmation
    const isApproved = ['APPROVED', 'PUBLISHED'].includes(workflow.current_state);
    checklist.push({
      task_key: 'human_approval_gate',
      label: 'Human Review & Approval',
      description: 'Explicit human sign-off confirming content is approved for publication.',
      completed: isApproved,
      required_for: ['APPROVED', 'PUBLISHED'],
      details: isApproved ? 'Approved by creator/reviewer' : 'Pending explicit human sign-off',
    });

    // 5. Publishing Record Verification
    const isPublishingVerified = artifacts.publishing?.status === 'published';
    checklist.push({
      task_key: 'verified_publishing_record',
      label: 'Verified Publishing Record',
      description: 'Confirmation that post was published to a platform (recorded in published_posts).',
      completed: isPublishingVerified,
      required_for: ['PUBLISHED'],
      details: isPublishingVerified
        ? `Published to ${artifacts.publishing?.provider || 'platform'}`
        : 'No confirmed publishing record in published_posts',
    });

    // Determine current state blockers
    if (workflow.current_state === 'IN_PREPARATION') {
      if (!isClipReady && !hasCreativeArtifact) {
        missing.push('Clip video must be ready or at least one creative artifact (hook, thumbnail, or content pack) must be prepared before review.');
      }
    } else if (workflow.current_state === 'READY_FOR_REVIEW') {
      if (!isClipReady) {
        missing.push('Clip video must be fully rendered and ready before requesting approval.');
      }
      if (!hasCreativeArtifact) {
        missing.push('Content must have at least one creative artifact (hook, thumbnail, or content pack) prepared.');
      }
    } else if (workflow.current_state === 'AWAITING_APPROVAL') {
      if (!isClipReady || !hasCreativeArtifact) {
        missing.push('Prerequisites incomplete for approval.');
      }
    } else if (workflow.current_state === 'APPROVED') {
      if (!isPublishingVerified) {
        missing.push('Content cannot be marked as PUBLISHED without a verified publishing record in published_posts.');
      }
    }

    // Determine allowed transitions
    const possibleTransitions = ALLOWED_TRANSITIONS[workflow.current_state] || [];
    const can_transition_to = possibleTransitions.filter((targetState) => {
      if (targetState === 'READY_FOR_REVIEW') {
        return isClipReady || hasCreativeArtifact;
      }
      if (targetState === 'AWAITING_APPROVAL' || targetState === 'APPROVED') {
        return isClipReady && hasCreativeArtifact;
      }
      if (targetState === 'PUBLISHED') {
        return isPublishingVerified;
      }
      return true;
    });

    return {
      checklist,
      missing_prerequisites: missing,
      can_transition_to,
    };
  }

  /**
   * Fetches upstream artifacts across existing collections for a given clip and project.
   * Strictly non-destructive: read-only inspection with parallelized queries.
   */
  static async resolveArtifacts(
    userId: string,
    projectId: string,
    clipId?: string | null,
    preloadedBrandProfile?: any
  ): Promise<WorkflowArtifactSummary> {
    const db = await getMongoDb();
    const summary: WorkflowArtifactSummary = {
      clip: null,
      content_pack: null,
      hook_lab: null,
      thumbnail_lab: null,
      brand_brain: null,
      autopilot: null,
      publishing: null,
      ab_experiment: null,
    };

    // Parallel brand profile promise
    const brandPromise = preloadedBrandProfile !== undefined
      ? Promise.resolve(preloadedBrandProfile)
      : db.collection('brand_brain_profiles').findOne(
          { user_id: userId, status: 'active' },
          { sort: { version: -1 } }
        );

    if (!clipId) {
      const brandProfile = await brandPromise;
      if (brandProfile) {
        summary.brand_brain = {
          profile_id: brandProfile.id,
          status: brandProfile.status,
          version: brandProfile.version,
        };
      }
      return summary;
    }

    // Top-level clip queries all run concurrently via Promise.all
    const [
      clip,
      pack,
      hookSession,
      thumbSession,
      autoRun,
      publishedPost,
      abExp,
      brandProfile,
    ] = await Promise.all([
      db.collection('clips').findOne({ id: clipId, user_id: userId }),
      db.collection('content_packs').findOne({ clip_id: clipId, user_id: userId }),
      db.collection('hook_lab_sessions').findOne(
        { clip_id: clipId, user_id: userId },
        { sort: { created_at: -1 } }
      ),
      db.collection('thumbnail_lab_sessions').findOne(
        { clip_id: clipId, user_id: userId },
        { sort: { created_at: -1 } }
      ),
      db.collection('autopilot_runs').findOne(
        { clip_id: clipId, user_id: userId },
        { sort: { created_at: -1 } }
      ),
      db.collection('published_posts').findOne(
        { clip_id: clipId, user_id: userId, status: 'published' },
        { sort: { published_at: -1, created_at: -1 } }
      ),
      db.collection('ab_experiments').findOne(
        { clip_id: clipId, user_id: userId },
        { sort: { created_at: -1 } }
      ),
      brandPromise,
    ]);

    // 1. Clip
    if (clip) {
      summary.clip = {
        id: clip.id,
        title: clip.title || 'Untitled Clip',
        status: clip.status || clip.render_status || 'draft',
        duration_seconds: clip.duration_seconds,
        aspect_ratio: clip.aspect_ratio,
      };
    }

    // 2. Brand Brain
    if (brandProfile) {
      summary.brand_brain = {
        profile_id: brandProfile.id,
        status: brandProfile.status,
        version: brandProfile.version,
      };
    }

    // 3. Autopilot Run
    if (autoRun) {
      summary.autopilot = {
        id: autoRun.id,
        status: autoRun.status,
        current_step: autoRun.current_step,
      };
    }

    // 4. Publishing Post
    if (publishedPost) {
      summary.publishing = {
        id: publishedPost.id,
        provider: publishedPost.provider,
        status: publishedPost.status,
        published_at: publishedPost.published_at || publishedPost.created_at,
        post_url: publishedPost.post_url,
      };
    }

    // 5. A/B Experiment
    if (abExp) {
      summary.ab_experiment = {
        id: abExp.id,
        status: abExp.status,
        test_type: abExp.test_type,
      };
    }

    // Parallel sub-queries for Pack items, Hook candidates, Thumbnail concepts
    const subQueries: Promise<void>[] = [];

    // Content Pack resolution (support embedded items array and content_pack_items collection)
    if (pack) {
      subQueries.push((async () => {
        let inlineItemsCount = 0;
        let inlineApprovedCount = 0;
        if (Array.isArray(pack.items)) {
          inlineItemsCount = pack.items.length;
          inlineApprovedCount = pack.items.filter(
            (item: any) => item?.status === 'APPROVED' || item?.approved === true
          ).length;
        }

        const [dbItemsCount, dbApprovedCount] = await Promise.all([
          db.collection('content_pack_items').countDocuments({ content_pack_id: pack.id }),
          db.collection('content_pack_items').countDocuments({
            content_pack_id: pack.id,
            $or: [{ status: 'APPROVED' }, { approved: true }],
          }),
        ]);

        summary.content_pack = {
          id: pack.id,
          status: pack.status || 'DRAFT',
          items_count: Math.max(inlineItemsCount, dbItemsCount),
          approved_count: Math.max(inlineApprovedCount, dbApprovedCount),
        };
      })());
    }

    // Hook Lab resolution (support hook_candidates session IDs and embedded candidates)
    if (hookSession) {
      subQueries.push((async () => {
        const sessionFilter = {
          $or: [{ hook_lab_session_id: hookSession.id }, { session_id: hookSession.id }],
        };

        const [dbCandidatesCount, selectedHook] = await Promise.all([
          db.collection('hook_candidates').countDocuments(sessionFilter),
          db.collection('hook_candidates').findOne({
            ...sessionFilter,
            status: { $in: ['APPLIED', 'APPROVED'] },
          }),
        ]);

        let inlineCandidatesCount = 0;
        let inlineSelectedHook: any = null;
        if (Array.isArray(hookSession.candidates)) {
          inlineCandidatesCount = hookSession.candidates.length;
          inlineSelectedHook = hookSession.candidates.find(
            (c: any) => ['APPLIED', 'APPROVED'].includes(c?.status) || c?.selected === true
          );
        }

        const resolvedHookText =
          selectedHook?.text ||
          selectedHook?.headline_text ||
          selectedHook?.spoken_rewrite ||
          inlineSelectedHook?.text ||
          inlineSelectedHook?.headline_text ||
          inlineSelectedHook?.spoken_rewrite ||
          null;

        summary.hook_lab = {
          id: hookSession.id,
          status: hookSession.status || 'DRAFT',
          candidates_count: Math.max(inlineCandidatesCount, dbCandidatesCount),
          selected_hook: resolvedHookText,
        };
      })());
    }

    // Thumbnail Lab resolution (support thumbnail_concepts session IDs and embedded concepts)
    if (thumbSession) {
      subQueries.push((async () => {
        const sessionFilter = {
          $or: [{ thumbnail_session_id: thumbSession.id }, { session_id: thumbSession.id }],
        };
        const approvedFilter = {
          $and: [
            sessionFilter,
            { $or: [{ status: { $in: ['APPROVED', 'FAVORITED'] } }, { approved: true }, { locked: true }] },
          ],
        };

        const [dbConceptsCount, approvedConcept] = await Promise.all([
          db.collection('thumbnail_concepts').countDocuments(sessionFilter),
          db.collection('thumbnail_concepts').findOne(approvedFilter),
        ]);

        let inlineConceptsCount = 0;
        let inlineApprovedConcept: any = null;
        if (Array.isArray(thumbSession.concepts)) {
          inlineConceptsCount = thumbSession.concepts.length;
          inlineApprovedConcept = thumbSession.concepts.find(
            (c: any) => ['APPROVED', 'FAVORITED'].includes(c?.status) || c?.approved === true || c?.locked === true
          );
        }

        summary.thumbnail_lab = {
          id: thumbSession.id,
          status: thumbSession.status || 'DRAFT',
          concepts_count: Math.max(inlineConceptsCount, dbConceptsCount),
          selected_concept_id: approvedConcept?.id || inlineApprovedConcept?.id || null,
        };
      })());
    }

    if (subQueries.length > 0) {
      await Promise.all(subQueries);
    }

    return summary;
  }

  /**
   * Auto-initializes or synchronizes workflow tracking for clips that don't have
   * an explicit workflow record yet, ensuring existing creator clips appear in the dashboard.
   * Also auto-advances existing workflows forward to PUBLISHED if verified published_posts exist.
   */
  static async syncWorkflowsForUserClips(userId: string): Promise<void> {
    const db = await getMongoDb();
    const [existingWorkflows, userClips, publishedPosts] = await Promise.all([
      db.collection('content_workflows').find({ user_id: userId }).toArray(),
      db.collection('clips').find({ user_id: userId }).limit(50).toArray(),
      db.collection('published_posts').find({ user_id: userId, status: 'published' }).toArray(),
    ]);

    const publishedClipMap = new Map<string, any>();
    for (const post of publishedPosts) {
      if (post.clip_id) {
        publishedClipMap.set(post.clip_id, post);
      }
    }

    // 1. Advance existing workflows if a verified published post now exists
    for (const w of existingWorkflows) {
      if (w.current_state !== 'PUBLISHED' && w.clip_id && publishedClipMap.has(w.clip_id)) {
        const post = publishedClipMap.get(w.clip_id);
        const now = new Date();
        const auditEntry: WorkflowAuditEntry = {
          id: crypto.randomUUID(),
          from_state: w.current_state,
          to_state: 'PUBLISHED',
          actor_id: userId,
          action: 'PUBLISH_VERIFIED',
          notes: `Auto-advanced to PUBLISHED: verified published post on ${post.provider || 'platform'}`,
          timestamp: now,
        };

        await db.collection('content_workflows').updateOne(
          { id: w.id, user_id: userId, version: w.version },
          {
            $set: {
              current_state: 'PUBLISHED',
              version: (w.version || 1) + 1,
              updated_at: now,
            },
            $push: { audit_trail: auditEntry as any },
          }
        );
      }
    }

    // 2. Initialize workflows for clips without tracking
    const linkedClipIds = new Set(existingWorkflows.map((w) => w.clip_id).filter(Boolean));

    for (const clip of userClips) {
      if (!linkedClipIds.has(clip.id)) {
        let initialState: WorkflowState = 'IN_PREPARATION';
        const isPublished = publishedClipMap.has(clip.id);

        if (isPublished) {
          initialState = 'PUBLISHED';
        } else if (clip.status === 'ready') {
          initialState = 'IN_PREPARATION';
        }

        const now = new Date();
        const initialAudit: WorkflowAuditEntry = {
          id: crypto.randomUUID(),
          from_state: 'PLANNED',
          to_state: initialState,
          actor_id: userId,
          action: isPublished ? 'PUBLISH_VERIFIED' : 'INITIALIZE',
          notes: isPublished ? 'Auto-synchronized with verified published post' : 'Auto-synchronized from existing clip',
          timestamp: now,
        };

        const newWorkflow: Omit<ContentWorkflowRecord, 'artifacts' | 'checklist' | 'can_transition_to' | 'missing_prerequisites'> = {
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: clip.project_id || crypto.randomUUID(),
          clip_id: clip.id,
          title: clip.title || 'Untitled Clip',
          current_state: initialState,
          version: 1,
          audit_trail: [initialAudit],
          created_at: clip.created_at || now,
          updated_at: now,
        };

        await db.collection('content_workflows').insertOne(newWorkflow);
      }
    }
  }

  /**
   * Lists workflow items for the authenticated user with filters, readiness checks,
   * pagination, and state counts.
   */
  static async listWorkflows(
    userId: string,
    options: ContentWorkflowFilterOptions = {}
  ): Promise<ContentWorkflowListResponse> {
    // 1. Ensure user clips are tracked
    await this.syncWorkflowsForUserClips(userId);

    const db = await getMongoDb();
    const query: Record<string, any> = { user_id: userId };

    if (options.state) {
      query.current_state = options.state;
    }
    if (options.clipId) {
      query.clip_id = options.clipId;
    }
    if (options.projectId) {
      query.project_id = options.projectId;
    }
    if (options.search) {
      query.title = { $regex: options.search, $options: 'i' };
    }
    if (options.startDate || options.endDate) {
      query.created_at = {};
      if (options.startDate) {
        query.created_at.$gte = new Date(options.startDate);
      }
      if (options.endDate) {
        query.created_at.$lte = new Date(options.endDate);
      }
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const [rawWorkflows, totalCount, allUserWorkflows, brandProfile] = await Promise.all([
      db.collection('content_workflows').find(query).sort({ updated_at: -1, created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('content_workflows').countDocuments(query),
      db.collection('content_workflows').find({ user_id: userId }).project({ current_state: 1 }).toArray(),
      db.collection('brand_brain_profiles').findOne({ user_id: userId, status: 'active' }, { sort: { version: -1 } }),
    ]);

    // Compute state counts
    const stateCounts: Record<WorkflowState, number> = {
      PLANNED: 0,
      IN_PREPARATION: 0,
      READY_FOR_REVIEW: 0,
      AWAITING_APPROVAL: 0,
      APPROVED: 0,
      PUBLISHED: 0,
    };
    for (const w of allUserWorkflows) {
      const s = w.current_state as WorkflowState;
      if (stateCounts[s] !== undefined) {
        stateCounts[s]++;
      }
    }

    // Hydrate each workflow with real-time artifacts and readiness evaluations
    const hydratedWorkflows: ContentWorkflowRecord[] = await Promise.all(
      rawWorkflows.map(async (doc) => {
        const artifacts = await this.resolveArtifacts(userId, doc.project_id, doc.clip_id, brandProfile);
        const readiness = await this.evaluateReadiness(userId, {
          clip_id: doc.clip_id,
          project_id: doc.project_id,
          current_state: doc.current_state,
        }, artifacts);

        return {
          id: doc.id,
          user_id: doc.user_id,
          project_id: doc.project_id,
          clip_id: doc.clip_id || null,
          title: doc.title,
          current_state: doc.current_state,
          notes: doc.notes,
          tags: doc.tags || [],
          artifacts,
          checklist: readiness.checklist,
          can_transition_to: readiness.can_transition_to,
          missing_prerequisites: readiness.missing_prerequisites,
          approved_by: doc.approved_by || null,
          approved_at: doc.approved_at || null,
          approval_notes: doc.approval_notes || null,
          version: doc.version || 1,
          audit_trail: doc.audit_trail || [],
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        };
      })
    );

    return {
      workflows: hydratedWorkflows,
      total: totalCount,
      page,
      limit,
      state_counts: stateCounts,
    };
  }

  /**
   * Retrieves a single workflow item by ID with authenticated tenant verification.
   */
  static async getWorkflow(userId: string, workflowId: string): Promise<ContentWorkflowRecord> {
    const db = await getMongoDb();
    const doc = await db.collection('content_workflows').findOne({ id: workflowId, user_id: userId });

    if (!doc) {
      throw new AppError(`Workflow ${workflowId} not found or unauthorized`, 404, 'WORKFLOW_NOT_FOUND');
    }

    const artifacts = await this.resolveArtifacts(userId, doc.project_id, doc.clip_id);
    const readiness = await this.evaluateReadiness(userId, {
      clip_id: doc.clip_id,
      project_id: doc.project_id,
      current_state: doc.current_state,
    }, artifacts);

    return {
      id: doc.id,
      user_id: doc.user_id,
      project_id: doc.project_id,
      clip_id: doc.clip_id || null,
      title: doc.title,
      current_state: doc.current_state,
      notes: doc.notes,
      tags: doc.tags || [],
      artifacts,
      checklist: readiness.checklist,
      can_transition_to: readiness.can_transition_to,
      missing_prerequisites: readiness.missing_prerequisites,
      approved_by: doc.approved_by || null,
      approved_at: doc.approved_at || null,
      approval_notes: doc.approval_notes || null,
      version: doc.version || 1,
      audit_trail: doc.audit_trail || [],
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  /**
   * Creates a new manual workflow item (e.g. planned idea).
   */
  static async createWorkflow(
    userId: string,
    payload: {
      title: string;
      project_id: string;
      clip_id?: string | null;
      notes?: string;
      tags?: string[];
      initial_state?: WorkflowState;
    }
  ): Promise<ContentWorkflowRecord> {
    if (!payload.title || !payload.title.trim()) {
      throw new AppError('Workflow title is required', 400, 'TITLE_REQUIRED');
    }
    if (!payload.project_id) {
      throw new AppError('Valid project_id is required', 400, 'PROJECT_ID_REQUIRED');
    }

    const initialState: WorkflowState = payload.initial_state || 'PLANNED';
    const db = await getMongoDb();
    const now = new Date();
    const workflowId = crypto.randomUUID();

    const auditEntry: WorkflowAuditEntry = {
      id: crypto.randomUUID(),
      from_state: 'PLANNED',
      to_state: initialState,
      actor_id: userId,
      action: 'INITIALIZE',
      notes: payload.notes || 'Workflow created',
      timestamp: now,
    };

    const record: Omit<ContentWorkflowRecord, 'artifacts' | 'checklist' | 'can_transition_to' | 'missing_prerequisites'> = {
      id: workflowId,
      user_id: userId,
      project_id: payload.project_id,
      clip_id: payload.clip_id || null,
      title: payload.title.trim(),
      current_state: initialState,
      notes: payload.notes || '',
      tags: payload.tags || [],
      version: 1,
      audit_trail: [auditEntry],
      created_at: now,
      updated_at: now,
    };

    await ownerContext.run(userId, async () => {
      await dataRepository.from('content_workflows').insert(record);
    });

    return this.getWorkflow(userId, workflowId);
  }

  /**
   * Enforces valid state transitions, optimistic locking, and prerequisite readiness.
   */
  static async transitionWorkflow(
    userId: string,
    workflowId: string,
    targetState: WorkflowState,
    options: {
      expectedVersion?: number;
      notes?: string;
      approvalNotes?: string;
    } = {}
  ): Promise<ContentWorkflowRecord> {
    const db = await getMongoDb();
    const existing = await db.collection('content_workflows').findOne({ id: workflowId, user_id: userId });

    if (!existing) {
      throw new AppError(`Workflow ${workflowId} not found or unauthorized`, 404, 'WORKFLOW_NOT_FOUND');
    }

    // 1. Idempotency: if already in the target state, return without redundant mutation
    if (existing.current_state === targetState) {
      return this.getWorkflow(userId, workflowId);
    }

    // 2. Optimistic Concurrency Check
    if (options.expectedVersion !== undefined && existing.version !== options.expectedVersion) {
      throw new AppError(
        `Workflow was modified concurrently. Current version is ${existing.version}, expected ${options.expectedVersion}. Please refresh and retry.`,
        409,
        'CONCURRENT_MODIFICATION_CONFLICT'
      );
    }

    // 3. State Transition Graph Validation
    const allowed = ALLOWED_TRANSITIONS[existing.current_state as WorkflowState] || [];
    if (!allowed.includes(targetState)) {
      throw new AppError(
        `Cannot transition from ${existing.current_state} to ${targetState}. Allowed next states: [${allowed.join(', ') || 'none'}].`,
        400,
        'INVALID_WORKFLOW_TRANSITION'
      );
    }

    // 4. Resolve artifacts and evaluate prerequisites
    const artifacts = await this.resolveArtifacts(userId, existing.project_id, existing.clip_id);
    const readiness = await this.evaluateReadiness(userId, {
      clip_id: existing.clip_id,
      project_id: existing.project_id,
      current_state: existing.current_state,
    }, artifacts);

    // 5. Specific State Safeguards
    if (targetState === 'READY_FOR_REVIEW') {
      const hasArtifact = artifacts.clip?.status === 'ready' ||
        Boolean(artifacts.hook_lab?.selected_hook || (artifacts.hook_lab?.candidates_count ?? 0) > 0) ||
        Boolean(artifacts.thumbnail_lab?.selected_concept_id || (artifacts.thumbnail_lab?.concepts_count ?? 0) > 0) ||
        Boolean((artifacts.content_pack?.items_count ?? 0) > 0) ||
        artifacts.autopilot?.status === 'COMPLETED';

      if (!hasArtifact) {
        throw new AppError(
          'Cannot mark ready for review: No creative artifacts have been generated yet. Please create a clip, hook, thumbnail, or content pack first.',
          400,
          'INSUFFICIENT_ARTIFACTS_FOR_REVIEW'
        );
      }
    }

    if (targetState === 'AWAITING_APPROVAL' || targetState === 'APPROVED') {
      // Human review gate: cannot be set without explicit user actor
      if (!userId) {
        throw new AppError('Content approval requires an authenticated user.', 400, 'APPROVAL_REQUIRES_ACTOR');
      }

      const isClipReady = artifacts.clip?.status === 'ready';
      const hasHook = Boolean(artifacts.hook_lab?.selected_hook || (artifacts.hook_lab?.candidates_count ?? 0) > 0);
      const hasThumbnail = Boolean(artifacts.thumbnail_lab?.selected_concept_id || (artifacts.thumbnail_lab?.concepts_count ?? 0) > 0);
      const hasPack = Boolean((artifacts.content_pack?.items_count ?? 0) > 0);
      const hasCreativeArtifact = hasHook || hasThumbnail || hasPack || (artifacts.autopilot?.status === 'COMPLETED');

      if (!isClipReady || !hasCreativeArtifact) {
        throw new AppError(
          `Cannot transition to ${targetState}: Both a ready source clip and at least one creative artifact (hook, thumbnail, or content pack) are required.`,
          400,
          'INSUFFICIENT_ARTIFACTS_FOR_REVIEW'
        );
      }
    }

    if (targetState === 'PUBLISHED') {
      // Strictly verify that an actual record in published_posts exists with status 'published'
      if (!artifacts.publishing || artifacts.publishing.status !== 'published') {
        throw new AppError(
          'Content cannot be marked as PUBLISHED without a verified publishing record in published_posts. Content must be successfully published before marking as published.',
          400,
          'PUBLISHING_RECORD_REQUIRED'
        );
      }
    }

    // 6. Build audit trail entry and updates
    const now = new Date();
    const auditAction =
      targetState === 'APPROVED'
        ? 'APPROVAL'
        : (targetState === 'IN_PREPARATION' && ['AWAITING_APPROVAL', 'READY_FOR_REVIEW', 'APPROVED'].includes(existing.current_state))
        ? 'REVISION_REQUEST'
        : targetState === 'PUBLISHED'
        ? 'PUBLISH_VERIFIED'
        : 'TRANSITION';

    const auditEntry: WorkflowAuditEntry = {
      id: crypto.randomUUID(),
      from_state: existing.current_state,
      to_state: targetState,
      actor_id: userId,
      action: auditAction,
      notes: options.notes || options.approvalNotes || undefined,
      timestamp: now,
    };

    const updateFields: Record<string, any> = {
      current_state: targetState,
      version: (existing.version || 1) + 1,
      updated_at: now,
    };

    if (targetState === 'APPROVED') {
      updateFields.approved_by = userId;
      updateFields.approved_at = now;
      if (options.approvalNotes) {
        updateFields.approval_notes = options.approvalNotes;
      }
    } else if (targetState === 'IN_PREPARATION') {
      // If moving back for revisions, reset approval timestamp and notes
      updateFields.approved_by = null;
      updateFields.approved_at = null;
      updateFields.approval_notes = null;
    }

    // Atomic update with version check to prevent race conditions
    const updateQuery: Record<string, any> = {
      id: workflowId,
      user_id: userId,
      version: options.expectedVersion ?? existing.version,
    };

    const updateResult = await db.collection('content_workflows').updateOne(updateQuery, {
      $set: updateFields,
      $push: { audit_trail: auditEntry as any },
    });

    if (updateResult.matchedCount === 0) {
      throw new AppError(
        'Workflow was modified by another request during processing. Please refresh and retry.',
        409,
        'CONCURRENT_MODIFICATION_CONFLICT'
      );
    }

    return this.getWorkflow(userId, workflowId);
  }

  /**
   * Explicit human approval gate.
   * Supports smooth multi-hop approval:
   * - from IN_PREPARATION: verifies prerequisites then transitions IN_PREPARATION -> READY_FOR_REVIEW -> AWAITING_APPROVAL -> APPROVED
   * - from READY_FOR_REVIEW: transitions READY_FOR_REVIEW -> AWAITING_APPROVAL -> APPROVED
   * - from AWAITING_APPROVAL: transitions directly to APPROVED
   */
  static async approveWorkflow(
    userId: string,
    workflowId: string,
    notes?: string
  ): Promise<ContentWorkflowRecord> {
    const db = await getMongoDb();
    const existing = await db.collection('content_workflows').findOne({ id: workflowId, user_id: userId });

    if (!existing) {
      throw new AppError(`Workflow ${workflowId} not found or unauthorized`, 404, 'WORKFLOW_NOT_FOUND');
    }

    if (existing.current_state === 'APPROVED') {
      return this.getWorkflow(userId, workflowId);
    }

    if (existing.current_state === 'IN_PREPARATION') {
      const artifacts = await this.resolveArtifacts(userId, existing.project_id, existing.clip_id);
      const isClipReady = artifacts.clip?.status === 'ready';
      const hasHook = Boolean(artifacts.hook_lab?.selected_hook || (artifacts.hook_lab?.candidates_count ?? 0) > 0);
      const hasThumbnail = Boolean(artifacts.thumbnail_lab?.selected_concept_id || (artifacts.thumbnail_lab?.concepts_count ?? 0) > 0);
      const hasPack = Boolean((artifacts.content_pack?.items_count ?? 0) > 0);
      const hasCreativeArtifact = hasHook || hasThumbnail || hasPack || (artifacts.autopilot?.status === 'COMPLETED');

      if (!isClipReady || !hasCreativeArtifact) {
        throw new AppError(
          'Cannot approve workflow from IN_PREPARATION: Both a ready source clip and at least one creative artifact (hook, thumbnail, or content pack) are required.',
          400,
          'INSUFFICIENT_ARTIFACTS_FOR_REVIEW'
        );
      }

      await this.transitionWorkflow(userId, workflowId, 'READY_FOR_REVIEW', { notes: 'Auto-progressed from preparation to review' });
      await this.transitionWorkflow(userId, workflowId, 'AWAITING_APPROVAL', { notes: 'Progressed to approval gate' });
    } else if (existing.current_state === 'READY_FOR_REVIEW') {
      await this.transitionWorkflow(userId, workflowId, 'AWAITING_APPROVAL', { notes: 'Progressed to approval gate' });
    }

    return this.transitionWorkflow(userId, workflowId, 'APPROVED', {
      approvalNotes: notes || 'Approved by user',
    });
  }

  /**
   * Rejects approval or requests editorial revisions, moving workflow back to IN_PREPARATION.
   */
  static async requestRevisions(
    userId: string,
    workflowId: string,
    reason: string
  ): Promise<ContentWorkflowRecord> {
    if (!reason || !reason.trim()) {
      throw new AppError('A reason for requesting revisions is required.', 400, 'REASON_REQUIRED');
    }

    return this.transitionWorkflow(userId, workflowId, 'IN_PREPARATION', {
      notes: `Revisions requested: ${reason.trim()}`,
    });
  }
}
