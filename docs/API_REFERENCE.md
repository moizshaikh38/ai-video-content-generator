# Vireo — Verified API Reference

**Document Version**: 1.0.0  
**Last Updated**: October 10, 2026  
**Audited Commit**: `9d8fce3f01df41925c8679685215c59d5e5d2d4a`  
**Base URL**: `http://localhost:5000/api` (Production: Determined by reverse proxy / ALB)  
**Security & Redaction**: All secrets, provider keys, passwords, and tokens are strictly redacted.

---

## 1. Authentication & Security Architecture

1. **Bearer Token Authentication**:
   - Protected endpoints require an `Authorization: Bearer <supabase_jwt>` header.
   - Verified by `server/src/middleware/authMiddleware.ts` via Supabase Auth Admin.
   - Requests fail-closed with HTTP 503 if Supabase client is unconfigured, or HTTP 401 if token is expired/invalid.
2. **Tenant Isolation (`ownerContext`)**:
   - Every authenticated request runs inside Node's `AsyncLocalStorage` context populated with the verified `user.id`.
   - Data access repositories enforce tenant ownership automatically on all MongoDB queries.
3. **Workspace RBAC (`requireWorkspaceRole`)**:
   - Multi-tenant team endpoints require active workspace membership with role hierarchy: `OWNER` (4) > `ADMIN` (3) > `EDITOR` (2) > `VIEWER` (1).
4. **Rate Limiting**:
   - `generalLimiter`: 300 req / min.
   - `expensiveLimiter`: 15 req / min (applied to heavy AI generation and rendering endpoints).
   - `webhookLimiter`: 120 req / min (unauthenticated webhook endpoints with signature validation).
   - `adminLimiter`: 120 req / min.

---

## 2. API Endpoint Inventory by Domain

### 2.1 System Health & Diagnostics
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/health` (Root) | None | None | Root load balancer liveness probe | `checkHealth` |
| `GET` | `/ready` (Root) | None | None | Root container readiness probe (DB connection check) | `checkReadiness` |
| `GET` | `/api/health` | None | General | Detailed service health, MongoDB status, R2 status | `healthController.ts` |
| `GET` | `/api/ready` | None | General | Detailed readiness probe | `healthController.ts` |
| `GET` | `/api/test/error` | None | General | Error handler regression verification (dev only) | `healthController.ts` |

### 2.2 User & Creator Profiles
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/profiles/me` | Bearer | General | Fetch user profile, display name, preferences | `profileController.ts` |
| `PUT` | `/api/profiles/me` | Bearer | General | Update user profile preferences | `profileController.ts` |
| `GET` | `/api/creator-profile` | Bearer | General | Fetch creator niche, tone, hook styles, platform CTAs | `profileController.ts` |
| `PUT` | `/api/creator-profile` | Bearer | General | Replace creator profile configuration | `profileController.ts` |
| `PATCH` | `/api/creator-profile` | Bearer | General | Partially update creator profile configuration | `profileController.ts` |

### 2.3 Projects & Media Ingestion
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/projects` | Bearer | General | List creator's video projects (paginated, sorted) | `projectController.ts` |
| `POST` | `/api/projects` | Bearer | General | Create a new project record | `projectController.ts` |
| `POST` | `/api/projects/ingest-url` | Bearer | Expensive | Ingest media via direct URL or YouTube (`yt-dlp`) | `urlIngestionService.ts` |
| `POST` | `/api/projects/:id/upload-url` | Bearer | General | Generate presigned Cloudflare R2 upload URL | `projectController.ts` |
| `POST` | `/api/projects/:id/confirm-upload` | Bearer | General | Confirm R2 upload completion & trigger metadata probe | `projectController.ts` |
| `GET` | `/api/projects/:id/source-preview-url` | Bearer | General | Get temporary presigned streaming URL for source video | `projectController.ts` |
| `GET` | `/api/projects/:id` | Bearer | General | Get detailed project state, duration, and status | `projectController.ts` |
| `PATCH` | `/api/projects/:id` | Bearer | General | Update project title or description | `projectController.ts` |
| `DELETE` | `/api/projects/:id` | Bearer | General | Cascading delete project, source media, and clips | `projectController.ts` |
| `POST` | `/api/projects/:id/process` | Bearer | Expensive | Initiate transcription and viral moment extraction | `projectController.ts` |
| `GET` | `/api/projects/:id/transcript` | Bearer | General | Fetch word-level transcript segments with timestamps | `transcriptionService.ts` |

### 2.4 AI Video Processing & Clip Analysis
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `POST` | `/api/projects/:id/analyze-clips` | Bearer | Expensive | Run LLM viral candidate detection on transcript | `clipAnalysisService.ts` |
| `GET` | `/api/projects/:id/clip-candidates` | Bearer | General | List generated clip candidates and viral scores | `clipController.ts` |
| `PATCH` | `/api/projects/:id/clip-candidates/:cid`| Bearer | General | Modify candidate start/end timestamps or title | `clipController.ts` |
| `POST` | `/api/projects/:id/clips` | Bearer | Expensive | Create clip record from candidate or custom range | `clipController.ts` |
| `GET` | `/api/projects/:id/clips` | Bearer | General | List all rendered/draft clips for project | `clipController.ts` |
| `GET` | `/api/clips/:clipId` | Bearer | General | Get single clip metadata and render status | `clipController.ts` |
| `POST` | `/api/clips/:clipId/render` | Bearer | Expensive | Enqueue clip render job with burned subtitles | `clipRenderService.ts` |
| `DELETE` | `/api/clips/:clipId` | Bearer | General | Delete clip, rendered files in R2, and associated data | `clipController.ts` |
| `GET` | `/api/clips/:clipId/preview-url` | Bearer | General | Temporary signed URL for in-browser playback | `clipController.ts` |
| `GET` | `/api/clips/:clipId/download-url` | Bearer | General | Temporary signed URL with attachment headers | `clipController.ts` |

### 2.5 Focused Clip Editor, Captions & Auto-Reframe
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/clips/:clipId/editor` | Bearer | General | Fetch clip editor timeline, trims, and caption styles | `clipController.ts` |
| `PATCH` | `/api/clips/:clipId/editor` | Bearer | General | Save trim points, crop coordinates, caption styles | `clipController.ts` |
| `POST` | `/api/clips/:clipId/editor/reset` | Bearer | General | Reset clip edits back to original candidate bounds | `clipController.ts` |
| `GET` | `/api/clips/:clipId/captions` | Bearer | General | Fetch word-level timing for on-screen caption preview | `clipController.ts` |
| `POST` | `/api/clips/:clipId/reframe/analyze` | Bearer | Expensive | Run facial detection & calculate 9:16 reframe track | `smartReframeService.ts` |
| `GET` | `/api/clips/:clipId/reframe` | Bearer | General | Retrieve calculated horizontal pan curve | `clipController.ts` |

### 2.6 Vireo Producer (Autonomous AI Agent)
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `POST` | `/api/clips/:clipId/producer/plan` | Bearer | Expensive | Generate multi-step natural language editing plan | `producerAgentService.ts`|
| `GET` | `/api/clips/:clipId/producer/plans` | Bearer | General | List historical producer plans for clip | `clipController.ts` |
| `GET` | `/api/clips/:clipId/producer/plans/:id`| Bearer | General | Retrieve specific producer plan details | `clipController.ts` |
| `POST` | `/api/clips/:clipId/producer/plans/:id/revise` | Bearer | Expensive | Revise plan based on user feedback prompt | `producerAgentService.ts`|
| `POST` | `/api/clips/:clipId/producer/plans/:id/preview` | Bearer | Expensive | Generate low-res preview of producer edits | `clipController.ts` |
| `POST` | `/api/clips/:clipId/producer/plans/:id/apply` | Bearer | Expensive | Apply plan edits directly to Pro Editor timeline | `producerAgentService.ts`|
| `DELETE` | `/api/clips/:clipId/producer/plans/:id` | Bearer | General | Delete producer plan record | `clipController.ts` |

### 2.7 Pro Video Editor (Multi-Track Timeline)
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `POST` | `/api/clips/:clipId/editor-project` | Bearer | General | Get or initialize multi-track timeline project | `proEditorController.ts` |
| `GET` | `/api/editor-projects/:id` | Bearer | General | Retrieve multi-track timeline state (tracks/items) | `proEditorController.ts` |
| `PATCH` | `/api/editor-projects/:id` | Bearer | General | Update timeline track items, keyframes, transitions | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/split` | Bearer | General | Split timeline item at playhead timestamp | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/ripple-delete` | Bearer | General | Ripple delete item and close timeline gap | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/duplicate` | Bearer | General | Duplicate timeline item | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/freeze` | Bearer | General | Insert freeze frame at playhead position | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/snapshot` | Bearer | General | Snapshot timeline state for undo/redo restore | `proEditorController.ts` |
| `POST` | `/api/editor-projects/:id/insert-broll` | Bearer | General | Insert B-roll asset directly into timeline B-roll track | `proEditorController.ts` |

### 2.8 AI B-Roll & Visual Media Intelligence
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/media/capabilities` | Bearer | General | Return supported media providers and formats | `mediaController.ts` |
| `POST` | `/api/media/search` | Bearer | General | Search media assets library by keyword | `mediaLibraryService.ts` |
| `GET` | `/api/media/assets` | Bearer | General | List uploaded or indexed media assets | `mediaLibraryService.ts` |
| `GET` | `/api/media/assets/:id` | Bearer | General | Retrieve specific media asset details | `mediaController.ts` |
| `GET` | `/api/media/assets/:id/similar` | Bearer | General | Find semantically similar visual assets | `brollAnalysisService.ts`|
| `POST` | `/api/media/import` | Bearer | Expensive | Import external media asset via URL | `mediaController.ts` |
| `POST` | `/api/clips/:clipId/broll/opportunities` | Bearer | General | Analyze transcript to detect visual B-roll cues | `brollAnalysisService.ts`|
| `POST` | `/api/clips/:clipId/broll/plan` | Bearer | Expensive | Generate AI B-roll placement and overlay plan | `brollAnalysisService.ts`|
| `GET` | `/api/clips/:clipId/broll/plan` | Bearer | General | Fetch active B-roll overlay plan | `mediaController.ts` |
| `POST` | `/api/broll-plans/:planId/apply` | Bearer | General | Apply B-roll plan directly to editor timeline | `mediaController.ts` |

### 2.9 Audio & Voice Studio
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/audio/capabilities` | Bearer | General | Return audio processing & voice capabilities | `audioStudioController.ts`|
| `POST` | `/api/audio/analyze` | Bearer | General | Analyze audio waveform, loudness (LUFS), noise | `audioEnhancementService.ts`|
| `POST` | `/api/audio/enhance-preview` | Bearer | Expensive | Preview noise reduction & loudness normalization | `audioEnhancementService.ts`|
| `POST` | `/api/audio/filler-words` | Bearer | General | Detect filler words ("um", "uh", "like") with timestamps | `audioStudioController.ts`|
| `POST` | `/api/audio/repeated-phrases` | Bearer | General | Detect repetitive sentence loops | `audioStudioController.ts`|
| `POST` | `/api/audio/silence-tighten` | Bearer | General | Calculate silence removal cut points (> 500ms) | `audioStudioController.ts`|
| `GET` | `/api/audio/voices` | Bearer | General | List available TTS and cloned voice profiles | `voiceoverService.ts` |
| `POST` | `/api/audio/voiceover/preview` | Bearer | Expensive | Generate TTS voiceover audio preview | `voiceoverService.ts` |
| `POST` | `/api/audio/voice-clone` | Bearer | Expensive | Initiate voice profile cloning from audio sample | `voiceoverService.ts` |
| `POST` | `/api/editor-projects/:id/audio-studio` | Bearer | General | Apply audio filters directly to timeline audio track | `audioStudioController.ts`|

### 2.10 Vireo Translate & Multilingual Dubbing
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/translation/languages` | Bearer | General | List supported target languages (50+ languages) | `translationController.ts`|
| `GET` | `/api/translation/capabilities` | Bearer | General | Return translation & dubbing capabilities | `translationController.ts`|
| `POST` | `/api/translation/detect` | Bearer | General | Detect spoken source language from transcript | `translationService.ts` |
| `POST` | `/api/translation/projects` | Bearer | General | Create translation project for clip | `translationController.ts`|
| `GET` | `/api/translation/projects/:id` | Bearer | General | Retrieve translated subtitle segments | `translationController.ts`|
| `GET` | `/api/translation/clips/:cid/projects`| Bearer | General | List translation projects for clip | `translationController.ts`|
| `POST` | `/api/translation/projects/:id/translate` | Bearer | Expensive | Execute neural translation preserving timestamps | `translationService.ts` |
| `PUT` | `/api/translation/projects/:id/segments/:sid` | Bearer | General | Edit specific translated subtitle line | `translationController.ts`|
| `POST` | `/api/translation/projects/:id/approve-all` | Bearer | General | Human approval gate for all translated segments | `translationController.ts`|
| `POST` | `/api/translation/projects/:id/export-subtitles` | Bearer | General | Export translated SRT / VTT subtitle file | `translationService.ts` |
| `POST` | `/api/translation/dub-projects` | Bearer | General | Initiate voiceover dubbing alignment project | `dubbingService.ts` |

### 2.11 Content Pack Studio
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/content-packs/capabilities` | Bearer | General | Return supported repurposing platforms & models | `contentPackController.ts`|
| `POST` | `/api/content-packs/generate` | Bearer | Expensive | Generate omnichannel content pack for clip | `contentPackService.ts` |
| `GET` | `/api/content-packs/:id` | Bearer | General | Retrieve content pack items (LinkedIn, X, blog) | `contentPackController.ts`|
| `PATCH` | `/api/content-packs/:id/items/:itemId`| Bearer | General | Edit text content or hashtags of specific item | `contentPackController.ts`|
| `POST` | `/api/content-packs/:id/items/:itemId/regenerate` | Bearer | Expensive | Regenerate specific platform copy | `contentPackService.ts` |
| `POST` | `/api/content-packs/:id/platforms/:p/regenerate` | Bearer | Expensive | Regenerate all items for a platform | `contentPackService.ts` |
| `POST` | `/api/content-packs/:id/regenerate` | Bearer | Expensive | Regenerate entire content pack | `contentPackService.ts` |
| `POST` | `/api/content-packs/:id/approve` | Bearer | General | Approve content pack for publication readiness | `contentPackController.ts`|
| `POST` | `/api/content-packs/:id/translate` | Bearer | Expensive | Translate pack copy into another language | `contentPackService.ts` |
| `GET` | `/api/content-packs/:id/publish-handoff/:platform` | Bearer | General | Normalized payload handoff to social publishing | `contentPackController.ts`|

### 2.12 Hook Lab
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/hook-lab/capabilities` | Bearer | General | Return hook generation taxonomies and limits | `hookLabController.ts` |
| `GET` | `/api/hook-lab/analytics-advisory` | Bearer | General | Return evidence-backed hook performance insights | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions` | Bearer | Expensive | Create or load Hook Lab session for clip | `hookLabService.ts` |
| `GET` | `/api/hook-lab/sessions/:id` | Bearer | General | Retrieve session candidates and scores | `hookLabController.ts` |
| `GET` | `/api/hook-lab/sessions/:id/existing-lines` | Bearer | General | Get opening spoken lines from transcript | `hookLabController.ts` |
| `POST` | `/api/hook-lab/sessions/:id/generate` | Bearer | Expensive | Generate taxonomy-categorized hook variants | `hookLabService.ts` |
| `PATCH` | `/api/hook-lab/sessions/:id/candidates/:cid`| Bearer | General | Update hook text, lock status, favorite status | `hookLabController.ts` |
| `POST` | `/api/hook-lab/sessions/:id/candidates/:cid/regenerate` | Bearer | Expensive | Regenerate single hook candidate | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/candidates/:cid/apply` | Bearer | Expensive | Replace opening line in timeline & adjust timing | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/candidates/:cid/revert` | Bearer | Expensive | Revert hook changes back to original transcript | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/candidates/:cid/preview` | Bearer | Expensive | Render short 5s preview of hook intro | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/candidates/:cid/approve` | Bearer | General | Approve hook & record evidence in Brand Brain | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/import-content-pack` | Bearer | General | Import hooks from Content Pack | `hookLabService.ts` |
| `POST` | `/api/hook-lab/sessions/:id/sync-content-pack` | Bearer | General | Synchronize approved hook back to Content Pack | `hookLabService.ts` |

### 2.13 Thumbnail Lab
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/thumbnail-lab/capabilities` | Bearer | General | Return image providers and safe-area capabilities | `thumbnailLabController.ts`|
| `POST` | `/api/thumbnail-lab/sessions` | Bearer | Expensive | Create or load Thumbnail Lab session | `thumbnailLabService.ts` |
| `GET` | `/api/thumbnail-lab/sessions/:id` | Bearer | General | Retrieve thumbnail session concepts and scores | `thumbnailLabController.ts`|
| `GET` | `/api/thumbnail-lab/sessions/:id/source-frames` | Bearer | General | Extract high-contrast video frames via FFmpeg | `thumbnailSourceFrameService.ts`|
| `POST` | `/api/thumbnail-lab/sessions/:id/generate` | Bearer | Expensive | Generate concepts across 8 style directions | `thumbnailLabService.ts` |
| `PATCH` | `/api/thumbnail-lab/sessions/:id/concepts/:cid` | Bearer | General | Edit headline typography, colors, position, lock | `thumbnailLabController.ts`|
| `POST` | `/api/thumbnail-lab/sessions/:id/concepts/:cid/approve` | Bearer | General | Approve concept & record snapshot version | `thumbnailLabService.ts` |
| `POST` | `/api/thumbnail-lab/sessions/:id/versions/:vid/restore` | Bearer | General | Restore previous thumbnail snapshot version | `thumbnailLabService.ts` |
| `POST` | `/api/thumbnail-lab/sessions/:id/import-content-pack` | Bearer | General | Import thumbnail copy from Content Pack | `thumbnailLabService.ts` |
| `GET` | `/api/thumbnail-lab/sessions/:id/concepts/:cid/publishing-handoff` | Bearer | General | Format thumbnail for publishing composer handoff | `thumbnailLabController.ts`|

### 2.14 Full Pipeline Autopilot
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/autopilot/capabilities` | Bearer | General | Return autonomous stages & execution constraints | `autopilotController.ts` |
| `POST` | `/api/autopilot/runs` | Bearer | General | Create Autopilot run record for clip | `autopilotService.ts` |
| `GET` | `/api/autopilot/runs/:runId` | Bearer | General | Passive poll status of Autopilot run (idempotent) | `autopilotController.ts` |
| `GET` | `/api/autopilot/clips/:clipId` | Bearer | General | List Autopilot runs for specific clip | `autopilotController.ts` |
| `POST` | `/api/autopilot/runs/:runId/execute` | Bearer | Expensive | Execute automated pipeline with distributed lock | `autopilotService.ts` |
| `POST` | `/api/autopilot/runs/:runId/retry` | Bearer | Expensive | Retry failed stage using exponential backoff | `autopilotService.ts` |
| `POST` | `/api/autopilot/runs/:runId/approve` | Bearer | General | Explicit human sign-off approving Autopilot output | `autopilotService.ts` |

### 2.15 A/B Testing Studio
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/ab-studio/capabilities` | Bearer | General | Return statistical testing engine capabilities | `abStudioController.ts` |
| `GET` | `/api/ab-studio/experiments` | Bearer | General | List experiments with status & dimension filters | `abStudioService.ts` |
| `POST` | `/api/ab-studio/experiments` | Bearer | General | Create single-dimension experiment (2–5 variants) | `abStudioService.ts` |
| `GET` | `/api/ab-studio/experiments/:id` | Bearer | General | Retrieve experiment variants and current metrics | `abStudioController.ts` |
| `GET` | `/api/ab-studio/experiments/:id/report` | Bearer | General | Detailed statistical report (Z-score, p-value, Wilson) | `abStatisticalEngine.ts` |
| `GET` | `/api/ab-studio/experiments/:id/export` | Bearer | General | Export RFC 4180 CSV report with formula escaping | `abStudioController.ts` |
| `DELETE` | `/api/ab-studio/experiments/:id` | Bearer | General | Delete draft or concluded experiment | `abStudioController.ts` |
| `GET` | `/api/ab-studio/clips/:clipId` | Bearer | General | List experiments running on specific clip | `abStudioController.ts` |
| `POST` | `/api/ab-studio/experiments/:id/start` | Bearer | General | Activate experiment to collect observations | `abStudioService.ts` |
| `POST` | `/api/ab-studio/experiments/:id/pause` | Bearer | General | Pause active experiment | `abStudioService.ts` |
| `POST` | `/api/ab-studio/experiments/:id/observations` | Bearer | General | Ingest impressions/clicks with SHA-256 idempotency | `abStudioService.ts` |
| `POST` | `/api/ab-studio/experiments/:id/import-csv/preview` | Bearer | General | Dry-run preview and schema validation of CSV file | `abCsvImportService.ts` |
| `POST` | `/api/ab-studio/experiments/:id/import-csv/execute` | Bearer | General | Execute verified CSV observation import | `abCsvImportService.ts` |
| `POST` | `/api/ab-studio/experiments/:id/declare-winner` | Bearer | General | Compute & declare winning variant | `abStatisticalEngine.ts` |
| `POST` | `/api/ab-studio/experiments/:id/promote-winner` | Bearer | General | Human confirmation promoting winner to clip & brand | `abStudioService.ts` |

### 2.16 Content Performance Dashboard
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/analytics/dashboard` | Bearer | General | Unified dashboard KPI metrics with honest denominators | `contentPerformanceDashboardService.ts`|
| `GET` | `/api/analytics/overview` | Bearer | General | Aggregated views, watch time, shares, comments | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/timeline` | Bearer | General | Historical performance timeline across date ranges | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/platforms` | Bearer | General | Performance breakdown by platform (YT/TT/IG/LI) | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/posts` | Bearer | General | Granular post-level analytics table with pagination | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/capabilities` | Bearer | General | Return analytics sync capabilities & data sources | `analyticsController.ts` |
| `POST` | `/api/analytics/sync` | Bearer | Expensive | Trigger external platform performance sync | `analyticsController.ts` |
| `GET` | `/api/analytics/growth-coach` | Bearer | General | AI Growth Coach strategic recommendations | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/memories` | Bearer | General | Semantic content performance memories | `analyticsQueryService.ts` |
| `GET` | `/api/analytics/creator-context`| Bearer | General | High-level performance context for prompt enrichment | `analyticsQueryService.ts` |

### 2.17 Content Workflow Automation
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/workflows` | Bearer | General | List tracked clips in workflow pipeline (Kanban/table) | `contentWorkflowService.ts` |
| `POST` | `/api/workflows` | Bearer | General | Initialize or track clip in content workflow | `contentWorkflowService.ts` |
| `GET` | `/api/workflows/:id` | Bearer | General | Retrieve workflow state, readiness score, audit log | `workflowController.ts` |
| `POST` | `/api/workflows/:id/transition` | Bearer | General | Transition lifecycle state with prerequisite checks | `contentWorkflowService.ts` |
| `POST` | `/api/workflows/:id/approve` | Bearer | General | Explicit human sign-off approving clip for publish | `contentWorkflowService.ts` |
| `POST` | `/api/workflows/:id/request-revisions` | Bearer | General | Send back to `IN_PREPARATION` with revision notes | `contentWorkflowService.ts` |

### 2.18 Team Workspaces & RBAC
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---|:---|:---|
| `GET` | `/api/workspaces` | Bearer | General | List accessible personal and team workspaces | `workspaceController.ts` |
| `POST` | `/api/workspaces` | Bearer | General | Create a new team workspace | `workspaceService.ts` |
| `GET` | `/api/workspaces/:id` | Bearer | General | Retrieve workspace details and current role | `workspaceController.ts` |
| `PATCH` | `/api/workspaces/:id` | Bearer | General | Update workspace name or brand settings | `workspaceController.ts` |
| `DELETE` | `/api/workspaces/:id` | Bearer | General | Delete team workspace (Owner only; cascading) | `workspaceService.ts` |
| `GET` | `/api/workspaces/:id/members` | Bearer | General | List workspace members, roles, join dates | `workspaceController.ts` |
| `PATCH` | `/api/workspaces/:id/members/:mid` | Bearer | General | Update member role (Owner/Admin only) | `workspaceService.ts` |
| `DELETE` | `/api/workspaces/:id/members/:mid` | Bearer | General | Remove member from workspace (Sole Owner protected) | `workspaceService.ts` |
| `GET` | `/api/workspaces/:id/invitations` | Bearer | General | List pending invitations (tokens hashed) | `workspaceController.ts` |
| `POST` | `/api/workspaces/:id/invitations` | Bearer | General | Generate single-use 256-bit invitation token | `workspaceService.ts` |
| `DELETE` | `/api/workspaces/:id/invitations/:iid`| Bearer | General | Revoke pending invitation | `workspaceService.ts` |
| `POST` | `/api/workspaces/invitations/accept` | Bearer | General | Accept invitation token and join workspace | `workspaceService.ts` |
| `POST` | `/api/workspaces/invitations/decline` | Bearer | General | Decline invitation token | `workspaceService.ts` |

### 2.19 Social Accounts & Publishing
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/social/accounts` | Bearer | General | List connected social accounts (tokens concealed) | `socialController.ts` |
| `POST` | `/api/social/:provider/connect` | Bearer | General | Initiate OAuth flow with single-use cryptographic state | `socialAccountService.ts` |
| `GET` | `/api/social/:provider/callback` | None | General | Provider OAuth redirect callback with state verification | `socialAccountService.ts` |
| `POST` | `/api/social/:connectionId/disconnect`| Bearer | General | Revoke connection and wipe encrypted tokens | `socialController.ts` |
| `POST` | `/api/social/:connectionId/refresh` | Bearer | General | Refresh OAuth access token using refresh token | `socialAccountService.ts` |
| `GET` | `/api/social/:connectionId/status` | Bearer | General | Check connection health and token expiration | `socialController.ts` |
| `GET` | `/api/publishing/accounts` | Bearer | General | List channels eligible for publishing | `publishingController.ts` |
| `POST` | `/api/publishing/preview` | Bearer | General | Validate metadata, duration, character limits | `publishingService.ts` |
| `POST` | `/api/publishing/publish` | Bearer | Expensive | Enqueue immediate publishing job | `publishingService.ts` |
| `POST` | `/api/publishing/schedule` | Bearer | Expensive | Enqueue future scheduled post | `publishingService.ts` |
| `GET` | `/api/publishing/posts` | Bearer | General | List publishing history and scheduled queue | `publishingController.ts` |
| `GET` | `/api/publishing/posts/:id` | Bearer | General | Get detailed post status, platform ID, error logs | `publishingController.ts` |
| `POST` | `/api/publishing/posts/:id/cancel` | Bearer | General | Cancel scheduled post | `publishingService.ts` |
| `PATCH` | `/api/publishing/posts/:id/schedule`| Bearer | General | Reschedule post to a new timestamp | `publishingService.ts` |
| `POST` | `/api/publishing/posts/:id/retry` | Bearer | Expensive | Retry failed publishing post | `publishingService.ts` |

### 2.20 Billing, Plans & Webhooks
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/billing/plans` | None | General | Public: Return configured plans, limits, and pricing | `billingController.ts` |
| `GET` | `/api/billing/usage` | Bearer | General | Current billing period usage vs quota limits | `usageService.ts` |
| `GET` | `/api/billing/subscription` | Bearer | General | Active subscription, tier, renewal date, status | `subscriptionService.ts` |
| `POST` | `/api/billing/checkout` | Bearer | General | Create checkout session (Paddle/Razorpay/Stripe) | `billingController.ts` |
| `POST` | `/api/billing/cancel` | Bearer | General | Cancel subscription at period end | `subscriptionService.ts` |
| `POST` | `/api/billing/portal` | Bearer | General | Generate customer self-service billing portal session | `billingController.ts` |
| `GET` | `/api/billing/invoices` | Bearer | General | List past paid invoices and download receipts | `billingController.ts` |
| `POST` | `/api/billing/webhooks/paddle` | Signature | Webhook | Handle Paddle subscription lifecycle webhooks | `paddleBillingProvider.ts` |
| `POST` | `/api/billing/webhooks/razorpay` | Signature | Webhook | Handle Razorpay subscription payment webhooks | `razorpayBillingProvider.ts` |
| `POST` | `/api/billing/webhook` | Signature | Webhook | Handle legacy Stripe webhook events | `stripeBillingProvider.ts` |

### 2.21 Administration & Owner Console
| Method | Route | Auth | Rate Limit | Purpose | Controller / Service |
|:---|:---|:---:|:---:|:---|:---|
| `GET` | `/api/admin/overview` | Admin | Admin | Platform-wide user, project, job, and revenue totals | `adminController.ts` |
| `GET` | `/api/admin/users` | Admin | Admin | Paginated user roster with tier and usage summaries | `adminController.ts` |
| `GET` | `/api/admin/users/:userId` | Admin | Admin | Granular user inspection with activity and projects | `adminController.ts` |
| `GET` | `/api/admin/projects` | Admin | Admin | Platform-wide projects list and processing statuses | `adminController.ts` |
| `GET` | `/api/admin/render-jobs` | Admin | Admin | Real-time queue health, active leases, error logs | `adminController.ts` |
| `GET` | `/api/admin/subscriptions` | Admin | Admin | Platform subscription distribution and churn metrics | `adminController.ts` |
| `GET` | `/api/admin/publishing` | Admin | Admin | Social post delivery rates and failure logs | `adminController.ts` |
| `GET` | `/api/admin/social-accounts`| Admin | Admin | Connected third-party accounts overview | `adminController.ts` |
| `GET` | `/api/admin/usage` | Admin | Admin | Aggregate GPU/FFmpeg minutes consumed | `adminController.ts` |
| `GET` | `/api/admin/health` | Admin | Admin | Infrastructure probe (MongoDB, Cloudflare R2, AI) | `adminController.ts` |

---

*End of API Reference. See [MASTER_PRD.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/MASTER_PRD.md) for master architecture and workflow requirements.*
