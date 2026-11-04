import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { ContentWorkflowService } from '../services/workflow/contentWorkflowService.js';
import { WorkflowState } from '../types/index.js';

describe('ContentWorkflowService Upgrade — Schema Mismatches, Guards, and Multi-Hop Approval', { concurrency: 1 }, () => {
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  before(async () => {
    // Warm up mongo connection with ping
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Seed shared project
    await ownerContext.run(userId, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userId,
        title: 'Workflow Upgrade Test Project',
        video_status: 'completed',
        source_type: 'upload',
      });
    });
  });

  after(async () => {
    const db = await getMongoDb();
    await db.collection('content_workflows').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('clips').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('content_packs').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('content_pack_items').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('hook_lab_sessions').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('hook_candidates').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('thumbnail_lab_sessions').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('thumbnail_concepts').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('projects').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('published_posts').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await db.collection('brand_brain_profiles').deleteMany({ user_id: { $in: [userId, otherUserId] } });
    await closeMongo().catch(() => undefined);
  });

  // =========================================================================
  // 1. Schema Resolution & Parallel Artifacts Lookups
  // =========================================================================
  describe('1. Schema Resolution & Parallel resolveArtifacts', () => {
    it('accurately resolves inline pack.items and approved counts without reporting 0 items', async () => {
      const clipId = crypto.randomUUID();
      const packId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Inline Pack Clip',
          status: 'ready',
        });

        // Insert pack with inline items array
        await dataRepository.from('content_packs').insert({
          id: packId,
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          items: [
            { id: 'i1', status: 'DRAFT', text: 'Item 1' },
            { id: 'i2', status: 'APPROVED', text: 'Item 2' },
            { id: 'i3', approved: true, text: 'Item 3' },
          ],
        });
      });

      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, clipId);
      assert.ok(artifacts.content_pack, 'Content pack artifact should be resolved');
      assert.equal(artifacts.content_pack.items_count, 3, 'Must detect 3 inline items');
      assert.equal(artifacts.content_pack.approved_count, 2, 'Must detect 2 approved items');
    });

    it('resolves selected hook from hook_candidates text and session_id fallback', async () => {
      const clipId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Hook Candidate Clip',
          status: 'ready',
        });

        await dataRepository.from('hook_lab_sessions').insert({
          id: sessionId,
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
        });

        // Candidate matching session_id rather than hook_lab_session_id
        await dataRepository.from('hook_candidates').insert({
          id: crypto.randomUUID(),
          session_id: sessionId,
          status: 'APPLIED',
          hook_type: 'CURIOSITY',
          delivery_mode: 'SPOKEN_REWRITE',
          text: 'This curiosity hook was resolved from .text field',
        });
      });

      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, clipId);
      assert.ok(artifacts.hook_lab);
      assert.equal(artifacts.hook_lab.candidates_count, 1);
      assert.equal(artifacts.hook_lab.selected_hook, 'This curiosity hook was resolved from .text field');
    });

    it('resolves thumbnail concepts with boolean approved: true or locked: true', async () => {
      const clipId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const conceptId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Thumbnail Concept Clip',
          status: 'ready',
        });

        await dataRepository.from('thumbnail_lab_sessions').insert({
          id: sessionId,
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          aspect_ratio: '16:9',
        });

        await dataRepository.from('thumbnail_concepts').insert({
          id: conceptId,
          session_id: sessionId,
          approved: true,
          status: 'GENERATED',
          style_direction: 'MINIMAL_PREMIUM',
          aspect_ratio: '16:9',
        });
      });

      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, clipId);
      assert.ok(artifacts.thumbnail_lab);
      assert.equal(artifacts.thumbnail_lab.concepts_count, 1);
      assert.equal(artifacts.thumbnail_lab.selected_concept_id, conceptId);
    });

    it('preloadedBrandProfile is passed directly without querying brand_brain_profiles', async () => {
      const preloaded = {
        id: 'brand-preloaded-123',
        status: 'active',
        version: 3,
      };

      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, null, preloaded);
      assert.ok(artifacts.brand_brain);
      assert.equal(artifacts.brand_brain.profile_id, 'brand-preloaded-123');
      assert.equal(artifacts.brand_brain.version, 3);
    });
  });

  // =========================================================================
  // 2. Readiness Transition Guards on AWAITING_APPROVAL & APPROVED
  // =========================================================================
  describe('2. Readiness Transition Guards on AWAITING_APPROVAL & APPROVED', () => {
    it('blocks AWAITING_APPROVAL and APPROVED when clip is not ready', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        // Draft clip
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Draft Clip Unready',
          status: 'draft',
        });

        // Creative artifact is ready
        await dataRepository.from('content_packs').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          items: [{ id: 'item-1', status: 'APPROVED', text: 'Hook' }],
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Workflow With Draft Clip',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'READY_FOR_REVIEW',
      });

      // Readiness evaluation
      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, clipId);
      const readiness = await ContentWorkflowService.evaluateReadiness(userId, wf, artifacts);
      assert.equal(
        readiness.can_transition_to.includes('AWAITING_APPROVAL'),
        false,
        'can_transition_to must block AWAITING_APPROVAL when clip is not ready'
      );

      // Transition enforcement
      await assert.rejects(
        async () => {
          await ContentWorkflowService.transitionWorkflow(userId, wf.id, 'AWAITING_APPROVAL');
        },
        (err: any) => {
          assert.equal(err.code, 'INSUFFICIENT_ARTIFACTS_FOR_REVIEW');
          return true;
        }
      );
    });

    it('blocks AWAITING_APPROVAL and APPROVED when creative artifacts are missing', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        // Ready clip, but ZERO creative assets
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Ready Clip Without Creative Assets',
          status: 'ready',
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Workflow Without Creative Assets',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'READY_FOR_REVIEW',
      });

      const artifacts = await ContentWorkflowService.resolveArtifacts(userId, projectId, clipId);
      const readiness = await ContentWorkflowService.evaluateReadiness(userId, wf, artifacts);
      assert.equal(
        readiness.can_transition_to.includes('AWAITING_APPROVAL'),
        false,
        'can_transition_to must block AWAITING_APPROVAL when creative artifacts are missing'
      );

      await assert.rejects(
        async () => {
          await ContentWorkflowService.transitionWorkflow(userId, wf.id, 'AWAITING_APPROVAL');
        },
        (err: any) => {
          assert.equal(err.code, 'INSUFFICIENT_ARTIFACTS_FOR_REVIEW');
          return true;
        }
      );
    });

    it('allows transition to AWAITING_APPROVAL when both clip and creative artifact are ready', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Fully Prepared Clip',
          status: 'ready',
        });

        await dataRepository.from('content_packs').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          items: [{ id: 'item-1', status: 'APPROVED', text: 'Ready hook' }],
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Fully Prepared Workflow',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'READY_FOR_REVIEW',
      });

      const transitioned = await ContentWorkflowService.transitionWorkflow(userId, wf.id, 'AWAITING_APPROVAL', {
        notes: 'Pre-flight review complete',
      });
      assert.equal(transitioned.current_state, 'AWAITING_APPROVAL');
    });
  });

  // =========================================================================
  // 3. Multi-Hop approveWorkflow() & Revisions Reset
  // =========================================================================
  describe('3. Multi-Hop approveWorkflow & Revisions Reset', () => {
    it('smoothly multi-hops from IN_PREPARATION to APPROVED when prerequisites are met', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Multi-Hop Clip',
          status: 'ready',
        });

        await dataRepository.from('content_packs').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          items: [{ id: 'p1', status: 'APPROVED', text: 'Multi-hop pack' }],
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Multi-Hop In-Preparation Workflow',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'IN_PREPARATION',
      });

      const approved = await ContentWorkflowService.approveWorkflow(
        userId,
        wf.id,
        'Direct 1-click approval from in-preparation'
      );

      assert.equal(approved.current_state, 'APPROVED');
      assert.equal(approved.approved_by, userId);
      assert.equal(approved.approval_notes, 'Direct 1-click approval from in-preparation');

      // Verify audit trail contains intermediate states
      const auditStates = approved.audit_trail.map((a) => a.to_state);
      assert.ok(auditStates.includes('READY_FOR_REVIEW'), 'Must step through READY_FOR_REVIEW');
      assert.ok(auditStates.includes('AWAITING_APPROVAL'), 'Must step through AWAITING_APPROVAL');
      assert.ok(auditStates.includes('APPROVED'), 'Must reach APPROVED');
    });

    it('rejects multi-hop approval from IN_PREPARATION if prerequisites are incomplete', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        // Draft clip, no creative artifacts
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Incomplete Multi-Hop Clip',
          status: 'draft',
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Incomplete Multi-Hop Workflow',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'IN_PREPARATION',
      });

      await assert.rejects(
        async () => {
          await ContentWorkflowService.approveWorkflow(userId, wf.id, 'Should fail');
        },
        (err: any) => {
          assert.equal(err.code, 'INSUFFICIENT_ARTIFACTS_FOR_REVIEW');
          return true;
        }
      );
    });

    it('requestRevisions resets approved_by, approved_at, and approval_notes to null', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Revisions Clip',
          status: 'ready',
        });

        await dataRepository.from('content_packs').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: projectId,
          clip_id: clipId,
          status: 'READY',
          items: [{ id: 'p2', status: 'APPROVED', text: 'Pack for revisions' }],
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Approved Workflow Before Revisions',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'IN_PREPARATION',
      });

      const approved = await ContentWorkflowService.approveWorkflow(userId, wf.id, 'Initial sign-off');
      assert.equal(approved.current_state, 'APPROVED');
      assert.ok(approved.approved_at);
      assert.equal(approved.approved_by, userId);
      assert.equal(approved.approval_notes, 'Initial sign-off');

      // Request revisions
      const revised = await ContentWorkflowService.requestRevisions(
        userId,
        wf.id,
        'Captions need brand font and smaller hook headline'
      );

      assert.equal(revised.current_state, 'IN_PREPARATION');
      assert.equal(revised.approved_by, null, 'approved_by must be reset to null');
      assert.equal(revised.approved_at, null, 'approved_at must be reset to null');
      assert.equal(revised.approval_notes, null, 'approval_notes must be reset to null');
      assert.ok(revised.audit_trail.some((a) => a.action === 'REVISION_REQUEST'));
    });
  });

  // =========================================================================
  // 4. Batch Auto-Sync & Concurrency Protection
  // =========================================================================
  describe('4. Batch Auto-Sync & Optimistic Concurrency', () => {
    it('syncWorkflowsForUserClips auto-advances non-published workflows if a verified published_post exists', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Auto-Sync Published Clip',
          status: 'ready',
        });
      });

      // Create workflow in IN_PREPARATION
      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Unpublished Workflow To Sync',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'IN_PREPARATION',
      });
      assert.equal(wf.current_state, 'IN_PREPARATION');

      // Add a verified published post for this clip
      await ownerContext.run(userId, async () => {
        await dataRepository.from('published_posts').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          clip_id: clipId,
          provider: 'youtube',
          status: 'published',
          published_at: new Date(),
        });
      });

      // Run syncWorkflowsForUserClips
      await ContentWorkflowService.syncWorkflowsForUserClips(userId);

      const refreshed = await ContentWorkflowService.getWorkflow(userId, wf.id);
      assert.equal(
        refreshed.current_state,
        'PUBLISHED',
        'Workflow should be auto-advanced to PUBLISHED'
      );
      assert.ok(
        refreshed.audit_trail.some((a) => a.action === 'PUBLISH_VERIFIED'),
        'Audit trail should record PUBLISH_VERIFIED'
      );
    });

    it('rejects stale expectedVersion with CONCURRENT_MODIFICATION_CONFLICT (409)', async () => {
      const clipId = crypto.randomUUID();

      await ownerContext.run(userId, async () => {
        await dataRepository.from('clips').insert({
          id: clipId,
          user_id: userId,
          project_id: projectId,
          title: 'Concurrency Clip',
          status: 'ready',
        });
      });

      const wf = await ContentWorkflowService.createWorkflow(userId, {
        title: 'Concurrency Workflow',
        project_id: projectId,
        clip_id: clipId,
        initial_state: 'PLANNED',
      });

      assert.equal(wf.version, 1);

      // Stale version: expectedVersion: 99
      await assert.rejects(
        async () => {
          await ContentWorkflowService.transitionWorkflow(userId, wf.id, 'IN_PREPARATION', {
            expectedVersion: 99,
          });
        },
        (err: any) => {
          assert.equal(err.name, 'AppError');
          assert.equal(err.code, 'CONCURRENT_MODIFICATION_CONFLICT');
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });
  });
});
