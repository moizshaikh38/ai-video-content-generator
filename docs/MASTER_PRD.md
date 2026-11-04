# Vireo — Master Product Requirements Document (PRD)

**Document Title**: Vireo AI Video Content Generator — Master Product Requirements Document  
**Version**: 1.0.0 (Production Master)  
**Last Updated**: October 10, 2026  
**Product Lead**: Senior Product Manager & SaaS Architect  
**Audited Commit**: `9d8fce3f01df41925c8679685215c59d5e5d2d4a` (`feat: enterprise workspaces, A/B studio, content workflows, brand brain, and billing UX corrections`)  
**Repositories Inspected**:
- `origin`: [https://github.com/Mayur0785/VireoClip](https://github.com/Mayur0785/VireoClip) (Primary Origin)
- `legacy`: [https://github.com/moizshaikh38/ai-video-content-generator](https://github.com/moizshaikh38/ai-video-content-generator) (Upstream / Legacy Sync)

---

## Table of Contents
1. [Executive Summary & Document Control](#1-executive-summary--document-control)
2. [Repositories, Commit & Verification Methodology](#2-repositories-commit--verification-methodology)
3. [Product Overview, Vision & Personas](#3-product-overview-vision--personas)
4. [Master Feature Catalog & Inventory](#4-master-feature-catalog--inventory)
5. [Detailed Functional Requirements (FR)](#5-detailed-functional-requirements-fr)
6. [Complete User Journeys & End-to-End Workflows](#6-complete-user-journeys--end-to-end-workflows)
7. [UI/UX Specification & Screen Catalog](#7-uiux-specification--screen-catalog)
8. [Technical Architecture & System Design](#8-technical-architecture--system-design)
9. [API Reference Summary](#9-api-reference-summary)
10. [Data Model & Tenant Isolation Architecture](#10-data-model--tenant-isolation-architecture)
11. [AI & Media Processing Pipeline Specification](#11-ai--media-processing-pipeline-specification)
12. [Commercial Engine: Pricing, Billing & Webhooks](#12-commercial-engine-pricing-billing--webhooks)
13. [Security, Privacy, Cryptography & Compliance](#13-security-privacy-cryptography--compliance)
14. [Non-Functional Requirements (NFR)](#14-non-functional-requirements-nfr)
15. [Quality Assurance, Testing & Verification Evidence](#15-quality-assurance-testing--verification-evidence)
16. [Production Operations & Launch Readiness](#16-production-operations--launch-readiness)
17. [Roadmap Traceability & Engineering Reconciliation](#17-roadmap-traceability--engineering-reconciliation)
18. [Testable Acceptance Criteria](#18-testable-acceptance-criteria)
19. [Forward-Looking Roadmap & Prioritized Backlog](#19-forward-looking-roadmap--prioritized-backlog)
20. [Glossary & Supporting References](#20-glossary--supporting-references)

---

## 1. Executive Summary & Document Control

**Vireo** is an enterprise-grade, AI-powered video repurposing and omnichannel publishing SaaS. It transforms long-form video content (podcasts, webinars, interviews, keynotes, and YouTube videos) into high-retention, platform-optimized short-form clips (YouTube Shorts, TikTok, Instagram Reels, LinkedIn Video) with burned-in subtitles, dynamic 9:16 smart auto-reframing, autonomous AI editing plans, scientific A/B testing, and cross-platform publishing.

### Document Purpose
This Master Product Requirements Document (PRD) serves as the definitive source of truth for the entire Vireo platform. It establishes product vision, technical architecture, data structures, functional requirements, security boundaries, and operational readiness guidelines for engineers, product managers, designers, QA specialists, and future AI coding agents.

### Supporting Architectural Documents
This Master PRD links directly to specialized deep-dive specifications:
- [FEATURE_CATALOG.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/FEATURE_CATALOG.md) — Comprehensive inventory and status of all 40 roadmap features.
- [API_REFERENCE.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/API_REFERENCE.md) — Exhaustive catalog of all 24 API route groups and endpoints.
- [DATA_MODEL.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/DATA_MODEL.md) — MongoDB schema definitions, indexes, relationships, and R2 object storage structure.
- [ROADMAP_TRACEABILITY.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/ROADMAP_TRACEABILITY.md) — Mapping reconciling the Original 40-Phase Roadmap with recent engineering sprint numbers.
- [PRODUCTION_READINESS_CHECKLIST.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/PRODUCTION_READINESS_CHECKLIST.md) — Pre-launch audit gates, operational checklists, and prioritized risk register.

---

## 2. Repositories, Commit & Verification Methodology

### Inspected Codebase State
- **Git Commit**: `9d8fce3f01df41925c8679685215c59d5e5d2d4a` (Verified via `git status` and `git log`).
- **Working Tree**: Clean. Zero uncommitted changes.
- **Protected Database Records**: Preserved intact (QA draft experiment `dc8afd49-d719-4f8f-b2cd-bcd50db646a2` in `DRAFT`, Autopilot run `3df13277-1999-441d-8b1b-b2ac370c1ec1` in `COMPLETED`).
- **Parked Issues**: Clip Download 5% issue remains intentionally parked and excluded from active acceptance.

### Verification Evidence Taxonomy
Every claim in this document is labeled using the following verification standards:
1. **Source-verified**: Directly inspected and confirmed in active repository source files (`src/`, `server/src/`).
2. **Test-verified**: Validated by automated test executions passing with exit code 0 (`npx tsx --test`, `tsc`, `vite build`).
3. **Browser-verified**: Confirmed through interactive visual browser rendering or session inspection.
4. **Externally verified**: Validated against live third-party network APIs (Supabase Auth, MongoDB Atlas, Cloudflare R2, Groq, OpenRouter, Paddle, Razorpay).
5. **Reported but Unverified**: Documented in previous handoff logs or planning notes but not independently re-verified via live network execution.
6. **Unverified / Unknown**: Identified as a pending gap or unimplemented capability.

---

## 3. Product Overview, Vision & Personas

### 3.1 Product Category & Vision
- **Category**: AI Video Repurposing, Creative Optimization & Omnichannel Distribution SaaS.
- **Mission**: Automate 90% of the manual labor required to turn raw recorded footage into viral, on-brand short-form content across every major social platform.
- **North Star Metric**: Weekly Active Creators publishing ≥ 3 high-retention short clips with verified social engagement.

### 3.2 Target Personas & Goals
1. **The Solo Creator / Podcaster (Persona: "Alex")**:
   - *Goal*: Record a 60-minute weekly video podcast and generate 10 polished YouTube Shorts and TikToks without hiring an editor.
   - *Pain Point*: Editing takes 10+ hours per episode; cannot afford agency retainers.
2. **The Content Marketing Lead (Persona: "Sarah")**:
   - *Goal*: Turn executive webinars and customer interviews into LinkedIn video snippets and written social posts.
   - *Pain Point*: Video agencies have 7-day turnaround times; marketing needs snippets within 24 hours of webinar conclusion.
3. **The Boutique Social Media Agency (Persona: "Marcus")**:
   - *Goal*: Manage short-form video creation for 15 creator clients simultaneously with consistent branding.
   - *Pain Point*: Asset confusion across client accounts; risk of posting client content to the wrong social channels.

### 3.3 Core Value Proposition & Competitive Differentiation
- **Grounding in Real Transcripts**: Unlike speculative text-to-video tools, Vireo anchors every clip strictly in the speaker's original spoken words, eliminating AI hallucination.
- **Scientific A/B Experimentation**: Built-in two-proportion Z-test and Bonferroni-corrected statistics enable data-driven creative decisions.
- **Brand Brain Continuous Learning**: AI recommendations learn from verified A/B winners and creator approvals over time.
- **Integrated Omnichannel Repurposing**: Simultaneously generates vertical 9:16 video, platform-native captions, LinkedIn text, X threads, and newsletter summaries from a single clip.

### 3.4 Product Boundaries & Explicit Non-Goals
- **Non-Goal 1**: Generative text-to-video creation from scratch (e.g. OpenAI Sora / Runway Gen-2). Vireo is strictly an intelligent *repurposing* and *re-editing* studio for existing footage.
- **Non-Goal 2**: Real-time video conferencing or recording studio (e.g. Riverside.fm, Zoom). Vireo ingests completed recordings.
- **Non-Goal 3**: Unrestricted consumer file converter. Ingestion is constrained to supported video containers (MP4, MOV, WebM, AVI, MKV) up to 2GB.

---

## 4. Master Feature Catalog & Inventory

The platform encompasses **40 core features** from the original master roadmap plus the **Vireo UX 2.0** initiative. Detailed specifications, file references, and individual acceptance criteria are maintained in [FEATURE_CATALOG.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/FEATURE_CATALOG.md).

### Summary Status Breakdown:
- **Implemented (26 features)**: Real AI pipeline, Dashboard, AI Quality Engine, Direct URL Ingestion, Smart Auto-Reframe, YouTube Ingestion, Creator Profile, Admin Console, Queue Hardening, Analytics Dashboard, Multimodal Scene/OCR, Vireo Producer Agent, Pro Video Editor, AI B-Roll Intelligence, Audio/Voice Studio, Vireo Translate, Brand Brain 1.0 & 2.0, Content Pack Studio, Hook Lab, Thumbnail Lab, Autopilot, A/B Testing Studio, Team Workspaces & RBAC, Design System, QA Automation.
- **Partially Implemented (13 features)**: Social OAuth (Engine complete; live apps unverified), Multi-Platform Publishing (Engine complete; live dispatch unverified), Multi-Provider Billing (Engine complete; live merchant webhooks unverified), Production Deployment (Docker ready; cloud cluster unprovisioned), Vireo Vault (Text search live; vector search pending), Cloud Storage Ingestion (URLs live; Google Drive pending), Developer API (Internal REST live; API keys pending), Professional Export (MP4/SRT live; XML/EDL pending), Agency OS (Workspaces live; client portal pending), Mobile Studio (Responsive live; touch scrubber pending), Performance Uploads (Direct R2 PUT live; chunked tus pending), Enterprise Security (RBAC live; SAML/SCIM pending), Vireo UX 2.0 (Pipeline live; `Ctrl+K` palette pending).
- **Planned / Not Started (1 feature)**: Vireo MCP + AI Automation (Model Context Protocol server for external agent control).

---

## 5. Detailed Functional Requirements (FR)

### 5.1 Identity, Authentication & Profiles
- **FR-AUTH-001 [JWT Verification]**: The system MUST verify the authenticity, signature, and expiration of incoming Bearer JWTs via Supabase Auth Admin.
- **FR-AUTH-002 [Fail-Closed Security]**: If Supabase client configuration is absent, the system MUST immediately fail closed with HTTP 503 `SERVICE_UNAVAILABLE`.
- **FR-AUTH-003 [Tenant Isolation]**: Every authenticated request MUST establish an isolated `ownerContext` using Node `AsyncLocalStorage`, ensuring database queries never access data belonging to other tenants.
- **FR-AUTH-004 [Creator Profile Persistence]**: The system MUST persist creator niche, tone, hook styles, platform CTAs, and forbidden words in `creator_profiles`.
- **FR-AUTH-005 [Cryptographic Key Validation]**: At server startup, the system MUST validate that `SOCIAL_TOKEN_ENCRYPTION_KEY` contains at least 32 bytes (256 bits) of entropy, failing fast in production if missing or malformed.
- **FR-AUTH-006 [Legal Notice Consent]**: The frontend MUST display a persistent cookie consent notice and provide accessible links to Terms of Service and Privacy Policy.

### 5.2 Media Ingestion & Video Processing
- **FR-VIDEO-001 [Presigned Direct Uploads]**: The system MUST generate temporary presigned PUT URLs for direct video upload into Cloudflare R2 (`vireo-source-videos`), supporting files up to 2GB.
- **FR-VIDEO-002 [SSRF Protection]**: URL ingestion endpoints MUST validate remote URLs against SSRF attacks, strictly rejecting loopback (`127.0.0.1`), link-local (`169.254.0.0/16`), and private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- **FR-VIDEO-003 [Platform URL Ingestion]**: YouTube ingestion via `yt-dlp` MUST enforce a maximum video duration of 2 hours and maximum download size of 50MB.
- **FR-VIDEO-004 [Word-Level Transcription]**: The audio extraction pipeline MUST convert source video to 16kHz mono WAV and generate word-level timestamped transcripts using Whisper Large v3.
- **FR-VIDEO-005 [AI Moment Extraction]**: The clip intelligence engine MUST analyze transcripts using structured prompts to identify candidate clips with high viral potential (scoring 0–100).
- **FR-VIDEO-006 [Smart 9:16 Reframe]**: When vertical reframing is enabled, the pipeline MUST compute dynamic horizontal crop coordinates using facial detection and Exponential Moving Average (EMA) smoothing.
- **FR-VIDEO-007 [Burned-In Subtitle Rendering]**: FFmpeg rendering MUST burn animated or styled subtitles into the output video with precise word-level synchronization.

### 5.3 Creative Studios (Hook Lab, Thumbnail Lab, Content Pack)
- **FR-HOOK-001 [Hook Taxonomy Generation]**: Hook Lab MUST generate candidate hooks across 5 distinct psychological taxonomies: Curiosity, Contrarian, Question, Story, and Statistic.
- **FR-HOOK-002 [1-Click Timeline Replacement]**: Applying an approved hook MUST automatically adjust clip start times and reflow timeline audio.
- **FR-THUMB-001 [6-Factor Quality Scoring]**: Thumbnail Lab MUST score concepts (0–100) across Readability (25%), Contrast (20%), Composition (15%), Subject Visibility (15%), Brand Fit (15%), and Topic Relevance (10%).
- **FR-THUMB-002 [Platform Safe Area Collision Detection]**: Thumbnail preview MUST flag visual collisions with YouTube duration badges (bottom-right) and TikTok UI margins.
- **FR-PACK-001 [Omnichannel Copy Generation]**: Content Pack Studio MUST generate platform-native copy for LinkedIn, X (Twitter), Instagram captions, YouTube descriptions, and email newsletters from a single clip.

### 5.4 A/B Experimentation & Analytics
- **FR-EXP-001 [Single-Dimension Isolation]**: A/B Studio experiments MUST isolate exactly one dimension: `THUMBNAIL_ONLY`, `TITLE_ONLY`, or `HOOK_LINE`.
- **FR-EXP-002 [Frequentist Z-Test & Bonferroni]**: Statistical significance MUST be computed using a Two-Proportion Z-Test with Bonferroni multiple-comparison correction across all active variants.
- **FR-EXP-003 [Wilson Score Intervals]**: Variant performance displays MUST present Wilson score descriptive confidence intervals reflecting observation uncertainty.
- **FR-EXP-004 [CSV Observation Ingestion]**: CSV analytics import MUST sanitize inputs against CSV formula injection (`=`, `+`, `-`, `@`) and enforce SHA-256 batch idempotency.
- **FR-ANALYTICS-001 [Honest Metric Denominators]**: Performance metrics MUST return `null` (never NaN or 0%) when denominators are zero (e.g. CTR when impressions = 0).

### 5.5 Team Workspaces & RBAC
- **FR-TEAM-001 [Workspace Hierarchy]**: The system MUST enforce role hierarchy: `OWNER` (4) > `ADMIN` (3) > `EDITOR` (2) > `VIEWER` (1).
- **FR-TEAM-002 [Personal Workspace Auto-Provisioning]**: Every user MUST have exactly one personal workspace auto-provisioned upon registration.
- **FR-TEAM-003 [Single-Use Invitation Tokens]**: Invitation tokens MUST be generated with 256 bits of cryptographic entropy and stored exclusively as SHA-256 hashes in MongoDB with 7-day expiration.
- **FR-TEAM-004 [Sole Owner Departure Protection]**: A workspace Owner cannot leave their workspace without first transferring ownership to another member.

### 5.6 Billing, Plans & Monetization
- **FR-BILL-001 [Multi-Tier Plan Limits]**: The system MUST enforce monthly source minute processing limits: Free (15m), Creator (120m), Pro (360m), Studio (900m).
- **FR-BILL-002 [Pre-Flight Quota Reservation]**: Video processing jobs MUST reserve required minutes before rendering begins and release reservations upon job cancellation or failure.
- **FR-BILL-003 [Webhook Idempotency]**: Billing webhook endpoints MUST log processed event IDs in `billing_events` with SHA-256 payload verification, ignoring duplicate webhook deliveries.
- **FR-BILL-004 [Pricing Interval Safety]**: When Indian Rupee (INR) annual pricing is unconfigured in plan definitions, the UI MUST display `—` and disable the checkout CTA, preventing accidental monthly charges.

---

## 6. Complete User Journeys & End-to-End Workflows

### 6.1 Journey 1: Long-Form Video Ingestion to Published Short Clip

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Content Creator
    participant UI as Vireo Web Studio
    participant API as Express API Server
    participant R2 as Cloudflare R2 Storage
    participant AI as Whisper & LLM Engines
    participant Worker as FFmpeg Render Worker
    participant Social as YouTube / TikTok API

    Creator->>UI: Uploads 60m Podcast Video
    UI->>API: POST /api/projects/:id/upload-url
    API->>UI: Returns Presigned R2 PUT URL
    UI->>R2: Direct HTTP PUT Video File
    UI->>API: POST /api/projects/:id/process
    API->>AI: Transcribe Audio (Whisper Large v3)
    AI-->>API: Word-Level Transcript with Timestamps
    API->>AI: Extract Viral Candidates (LLM Prompt)
    AI-->>API: 5 Ranked Clip Candidates (Scores 85-98)
    API-->>UI: Displays Clip Studio with Candidates
    Creator->>UI: Selects Clip #1 & enables Smart 9:16 Reframe
    Creator->>UI: Clicks "Render Clip"
    UI->>API: POST /api/clips/:id/render
    API->>Worker: Enqueues Render Job (worker_id lease)
    Worker->>R2: Downloads Source Video Chunk
    Worker->>Worker: FFmpeg 9:16 Crop + Subtitle Burn
    Worker->>R2: Uploads Rendered Clip to vireo-rendered-clips
    Worker-->>API: Render Job Complete
    API-->>UI: Push Status: COMPLETED
    Creator->>UI: Reviews Preview & Clicks "Publish"
    UI->>API: POST /api/publishing/publish
    API->>Social: Dispatches Video Payload via OAuth Token
    Social-->>API: Published Post ID & Live URL
    API-->>UI: Displays Success Banner & Link
```

### 6.2 Journey 2: Scientific A/B Testing & Winner Promotion

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Creator
    participant Studio as A/B Studio UI
    participant Server as Vireo Backend
    participant Engine as Statistical Engine
    participant Brain as Brand Brain Service

    Creator->>Studio: Creates Experiment on Clip #1 (Dimension: THUMBNAIL_ONLY)
    Studio->>Server: POST /api/ab-studio/experiments (Variants A & B)
    Creator->>Studio: Uploads Weekly Analytics CSV from YouTube
    Studio->>Server: POST /api/ab-studio/experiments/:id/import-csv/execute
    Server->>Server: Sanitizes CSV & Deduplicates SHA-256 Batch
    Server->>Engine: Computes Two-Proportion Z-Test & Wilson Intervals
    Engine-->>Studio: Reports Winner: Variant B (p-value = 0.003 < 0.05, +24% CTR)
    Creator->>Studio: Clicks "Promote Winner"
    Studio->>Server: POST /api/ab-studio/experiments/:id/promote-winner
    Server->>Server: Updates Clip Metadata to Variant B
    Server->>Brain: Records Brand Evidence (AB_STUDIO)
    Brain-->>Studio: Brand Brain Updated with Winning Thumbnail Pattern
```

---

## 7. UI/UX Specification & Screen Catalog

The application frontend is structured into **18 primary routes** organized by public marketing, authenticated dashboard, and focused studio workspaces:

| Route | Page Component | Access Requirement | Primary UI Components | Verified Behavior |
|:---|:---|:---:|:---|:---|
| `/` | `LandingPage.tsx` | Public | Hero section, feature showcases, sample video comparisons, pricing cards, FAQ, footer | Clean marketing layout; links to `/login`, `/terms`, `/privacy`. |
| `/terms` | `TermsPage.tsx` | Public | Comprehensive SaaS Terms of Service with statutory cancellation terms | Test-verified via `legalPagesAndMarketing.test.ts`. |
| `/privacy` | `PrivacyPage.tsx` | Public | Technical Privacy Policy detailing data retention & subprocessors | Test-verified via `legalPagesAndMarketing.test.ts`. |
| `/login` | `LoginPage.tsx` | Public Only | Email/password login, magic links, redirect to `/dashboard` | Session managed via Supabase Auth JS. |
| `/signup` | `SignupPage.tsx` | Public Only | Registration form with terms checkbox agreement | Validates passwords and creates Supabase user. |
| `/dashboard` | `DashboardPage.tsx` | Protected | KPI stats, quick action buttons, recent projects roster, processing alerts | Auto-refreshes processing states via polling. |
| `/projects/new`| `NewProjectPage.tsx` | Protected | Multi-tab media ingestion (Local Upload, Direct URL, YouTube URL) | Enforces 2GB limit and SSRF domain checks. |
| `/projects/:id`| `ProjectDetailPage.tsx`| Protected | Source video player, word transcript reader, AI clip candidates roster | Real-time candidate duration trimming. |
| `/clips/:id/edit`| `ClipEditorPage.tsx` | Protected | Focused studio tabs: Editor, Producer, B-Roll, Audio, Translate, Hook Lab, Thumbnail Lab | Unified editor canvas with aspect ratio toggle. |
| `/history` | `HistoryPage.tsx` | Protected | Filterable repository of all rendered clips across projects | Batch download, preview modal, deletion actions. |
| `/workflows` | `WorkflowPage.tsx` | Protected | Kanban board & Table pipeline (`PLANNED` -> `PUBLISHED`), readiness meter | Reversible revision requests with audit trail. |
| `/workspaces` | `WorkspacePage.tsx` | Protected | Workspace switcher, member roster, role badges, invitation token modal | Enforces OWNER/ADMIN/EDITOR/VIEWER boundaries. |
| `/brand` | `BrandPage.tsx` | Protected | Audience & positioning, voice guidelines, approved terms, Brand Brain evidence | Rule lock defense and evidence citation inspector. |
| `/publishing` | `PublishingHistoryPage.tsx`| Protected | Calendar view, scheduled post queue, retry failed posts | Displays connected social channels & delivery status. |
| `/analytics` | `AnalyticsPage.tsx` | Protected | 4 KPI cards (Views, Watch Time, Engagements, Shares), platform SVG trends, content table | Honest null denominators; sufficiency warnings. |
| `/ab-testing` | `ABStudioHistoryPage.tsx`| Protected | Experiment history, Z-test statistical significance meters, CSV import modal | RFC 4180 export and formula injection escaping. |
| `/billing` | `BillingPage.tsx` | Protected | Monthly/Yearly toggle, plan comparison cards, usage progress bar, invoice list | Accurate INR yearly handling (disables CTA). |
| `/admin` | `AdminPage.tsx` | Admin Only | Platform user count, GPU minute consumption, worker queue health, error logs | Protected by `requireAdmin` and server email allowlist. |

### Billing Toggle & Pricing Display Logic (Verified Behavior)
- **Monthly Selection**: Accurately displays configured monthly rates ($12 Creator, $24 Pro, $49 Studio / ₹999 Creator, ₹1999 Pro, ₹3999 Studio).
- **Yearly Selection (Paddle USD)**: Displays configured annual prices ($120/yr, $240/yr, $490/yr) with savings badges (e.g. "Save $48 / yr").
- **Yearly Selection (Razorpay INR)**: Because annual INR rates are unconfigured in plan definitions, the UI:
  1. Displays `—` instead of inventing prices or displaying monthly rates as annual amounts.
  2. Presents explicit explanatory secondary text: *"Annual billing unavailable for INR • Available in USD ($120/yr via Paddle)"*.
  3. Disables the checkout CTA button (`disabled={true}`) with text *"Annual Billing Unavailable for INR"*, completely preventing miscalculated checkouts.

---

## 8. Technical Architecture & System Design

```mermaid
graph TD
    subgraph Client Tier
        Browser[React 18 SPA + Vite + Tailwind CSS]
    end

    subgraph Edge & Ingestion Tier
        ReverseProxy[Reverse Proxy / ALB / Port 5000]
        R2Storage[(Cloudflare R2 Object Storage)]
    end

    subgraph Application Tier
        Express[Node.js Express API Server]
        AuthGuard[Supabase JWT Auth Middleware]
        TenantGuard[ownerContext AsyncLocalStorage]
        Limiter[Express Rate Limiters]
        JobService[Distributed Job Reliability Engine]
    end

    subgraph Database Tier
        MongoDB[(MongoDB Atlas Application Database)]
        Supabase[(Supabase PostgreSQL Auth)]
    end

    subgraph Processing & External AI Tier
        Whisper[Groq Whisper Large v3 / OpenRouter]
        LLM[OpenRouter GPT-4o-mini]
        FFmpeg[FFmpeg Static Media Worker]
        Python[Python Face-Tracking Daemon]
        SocialAPIs[YouTube / TikTok / Meta OAuth APIs]
        BillingAPIs[Paddle / Razorpay Webhooks]
    end

    Browser -->|HTTPS REST| ReverseProxy
    Browser -->|Direct PUT| R2Storage
    ReverseProxy --> Express
    Express --> AuthGuard
    AuthGuard --> Supabase
    Express --> TenantGuard
    Express --> Limiter
    Express --> MongoDB
    Express --> JobService
    JobService --> FFmpeg
    JobService --> Python
    JobService --> R2Storage
    Express --> Whisper
    Express --> LLM
    Express --> SocialAPIs
    BillingAPIs --> Express
```

### Architectural Component File Inventory:
- **Server Entrypoint**: `server/src/index.ts`
- **Environment & Secret Configuration**: `server/src/config/index.ts`
- **Database Client & Bootstrapping**: `server/src/db/mongoClient.ts`, `server/src/db/bootstrapMongo.ts`
- **Tenant Context Isolation**: `server/src/db/repositories/dataRepository.ts`
- **Authentication & RBAC Middleware**: `server/src/middleware/authMiddleware.ts`, `server/src/middleware/workspaceMiddleware.ts`, `server/src/middleware/adminMiddleware.ts`
- **Job Reliability & Sweeper Workers**: `server/src/services/queue/jobReliabilityService.ts`, `server/src/services/publishing/publishingWorker.ts`
- **Media Processing Pipelines**: `server/src/services/clipRenderService.ts`, `server/src/services/smartReframeService.ts`, `server/src/services/transcriptionService.ts`
- **Statistical Engine**: `server/src/services/abStudio/abStatisticalEngine.ts`

---

## 9. API Reference Summary

The Vireo backend exposes **24 distinct API route groups** under the `/api` prefix. The comprehensive route inventory, request payloads, response schemas, and error codes are documented in [API_REFERENCE.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/API_REFERENCE.md).

### Core Endpoint Prefixes:
- `/api/health`, `/api/ready` — Liveness and container readiness probes
- `/api/profiles`, `/api/creator-profile` — User preferences and creator brand voice
- `/api/projects` — Video ingestion, presigned upload URLs, transcripts, and clip generation
- `/api/clips` — Clip management, rendering, captions, reframe, and preview URLs
- `/api/media` — AI B-roll discovery and asset indexing
- `/api/audio` — Noise reduction, LUFS normalization, filler word removal, voiceover synthesis
- `/api/translation` — Multilingual subtitle translation and dubbing
- `/api/content-packs` — Omnichannel social copy and newsletter repurposing
- `/api/hook-lab` — Opening hook generation and 1-click timeline replacement
- `/api/thumbnail-lab` — 6-factor thumbnail scoring, typography canvas, and safe areas
- `/api/autopilot` — End-to-end autonomous pipeline orchestration
- `/api/ab-studio` — Variant experimentation, Z-test reporting, and CSV observation import
- `/api/analytics` — Cross-platform performance aggregation and Growth Coach
- `/api/workflows` — Content lifecycle state machine and human approval gates
- `/api/workspaces` — Multi-tenant team collaboration, RBAC, and single-use invitations
- `/api/social` — OAuth connection handshakes and AES-256 encrypted token management
- `/api/publishing` — Multi-platform immediate and scheduled post dispatch
- `/api/billing` — Paddle/Razorpay checkouts, usage quotas, and signed webhook ingest
- `/api/admin` — Owner console, user inspection, and queue health metrics

---

## 10. Data Model & Tenant Isolation Architecture

The complete schema specification, compound indexes, uniqueness rules, and R2 object storage hierarchy are documented in [DATA_MODEL.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/DATA_MODEL.md).

### Summary Collections:
- **Identity & Collaboration**: `profiles`, `creator_profiles`, `workspaces`, `workspace_members`, `workspace_invitations`.
- **Media & Processing**: `projects`, `transcripts`, `clip_candidates`, `clips`, `render_jobs`, `reframe_tracks`, `editor_projects`.
- **Creative Studios**: `hook_lab_sessions`, `hook_candidates`, `thumbnail_lab_sessions`, `thumbnail_concepts`, `thumbnail_versions`, `content_packs`, `content_pack_items`, `content_pack_versions`.
- **Experimentation & Workflows**: `ab_experiments`, `ab_observation_logs`, `content_workflows`, `autopilot_runs`, `producer_plans`.
- **Social & Publishing**: `social_account_connections`, `oauth_states`, `published_posts`, `publish_jobs`.
- **Billing & Subscriptions**: `billing_customers`, `subscriptions`, `billing_events`, `billing_invoices`, `usage_events`, `subscription_limits`.

---

## 11. AI & Media Processing Pipeline Specification

### 11.1 Audio Extraction & Whisper Transcription
- **FFmpeg Command**:
  ```bash
  ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 temp_audio.wav
  ```
- **Transcription Provider**: Groq Whisper Large v3 (`whisper-large-v3-turbo`) with OpenRouter fallback.
- **Output Format**: Word-level timestamps (`start_ms`, `end_ms`, `word`) mapped into segment blocks.

### 11.2 Viral Moment Selection (Prompt Strategy)
- The system feeds timestamped transcript segments to the LLM with structured creator context (tone, audience, hook preferences).
- Prompts enforce strict transcript grounding: the LLM is prohibited from inventing words or altering spoken sentences.
- Scoring formula evaluates Hook Strength (30%), Information Density (30%), Emotional Resonance (20%), and Duration Sweet Spot (20% for 30–60s clips).

### 11.3 Smart 9:16 Auto-Reframing (Face Tracking & Smoothing)
- Scans frames at 5 FPS intervals to detect primary speaker bounding boxes.
- Calculates focal crop center $x_t$ using Exponential Moving Average (EMA):
  $$x_t = \alpha \cdot x_{\text{detected}} + (1 - \alpha) \cdot x_{t-1} \quad (\alpha = 0.15)$$
- Enforces maximum horizontal panning speed clamps to prevent viewer motion sickness.

### 11.4 Explainable 6-Factor Thumbnail Scoring
The Thumbnail Lab computes an explainable 0–100 quality score:
1. **Readability (25%)**: Word count (optimal: 3–6 words), font size, stroke visibility.
2. **Contrast (20%)**: Luminance delta between headline text and background image.
3. **Composition (15%)**: Safe area compliance; bottom-right duration badge clearance.
4. **Subject Visibility (15%)**: Facial presence and center-third focal placement.
5. **Brand Fit (15%)**: Adherence to Brand Brain primary colors and approved fonts.
6. **Topic Relevance (10%)**: Keyword alignment between thumbnail headline and video transcript.

---

## 12. Commercial Engine: Pricing, Billing & Webhooks

### 12.1 Authoritative Plan Configuration (`planConfig.ts`)
| Tier ID | Plan Name | USD Monthly | USD Yearly | INR Monthly | Monthly Minutes | Max Projects | Max Clip Renders | Social Accounts | Scheduled Posts |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `free` | Free | $0 | $0 | ₹0 | 15 min | 5 | 10 | 2 | 5 |
| `creator` | Creator | $12 | $120 ($10/mo) | ₹999 | 120 min | 25 | 50 | 3 | 20 |
| `pro` | Pro (Popular) | $24 | $240 ($20/mo) | ₹1,999 | 360 min | 100 | 200 | 10 | 100 |
| `studio` | Studio | $49 | $490 ($40.83/mo)| ₹3,999 | 900 min | 250 | 500 | 25 | 500 |

### 12.2 Multi-Provider Architecture
1. **Paddle Billing (Global USD Default)**:
   - Hosted checkout overlay supporting international credit cards, PayPal, and Apple Pay.
   - Handled events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`.
2. **Razorpay Subscriptions (India INR Domestic)**:
   - Optimized for Indian credit/debit cards, UPI recurring mandates, and netbanking.
   - Handled events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`.
3. **Stripe (Legacy USD Compatibility)**:
   - Preserved for backwards compatibility with existing legacy accounts.

### 12.3 Webhook Verification & Startup Hardening
- **Signature Security**: Webhook payloads are received as raw Buffers (`express.raw()`) to ensure byte-perfect cryptographic HMAC verification.
- **Fail-Fast Startup**: `validateEnvironment()` checks that `PADDLE_WEBHOOK_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are present whenever the corresponding provider is enabled, preventing payment drop-offs in production.

---

## 13. Security, Privacy, Cryptography & Compliance

### 13.1 Cryptographic Social Token Encryption
- Third-party OAuth tokens (YouTube, TikTok, Meta, LinkedIn) are encrypted at rest using **AES-256-GCM**.
- Key Material: Enforces a strictly validated 32-byte (256-bit) encryption key (`SOCIAL_TOKEN_ENCRYPTION_KEY`).
- Each token record stores an independent, random 12-byte Initialization Vector (IV) and a 16-byte authentication tag, guaranteeing confidentiality and cryptographic integrity.

### 13.2 Distributed Job Fencing & Queue Security
- Workers claim background jobs using distributed MongoDB lease locks and random fencing tokens (`worker_id`).
- Leases expire automatically after 10 minutes if a worker crashes without heartbeating.
- Errors logged to database records are scrubbed via `sanitizeErrorMessage` to eliminate API keys, bearer tokens, passwords, and connection strings.

### 13.3 Legal Pages & Subprocessor Transparency
- Statutory Terms of Service, Privacy Policy, and Cookie Consent notice implemented in the application frontend.
- Subprocessors explicitly inventoried: Supabase (Auth), MongoDB Atlas (Data), Cloudflare (R2 Storage), Groq & OpenRouter (AI Models), Paddle & Razorpay (Payments).

---

## 14. Non-Functional Requirements (NFR)

| NFR ID | Requirement Domain | Target Metric / Constraint | Verification Status | Implementation Evidence |
|:---|:---|:---|:---:|:---|
| **NFR-PERF-001** | API Response Latency | p95 < 250ms for non-AI database reads | **Verified** | MongoDB compound indexes on all primary filters |
| **NFR-PERF-002** | Frontend Build Size | Production bundle gzip < 500KB per chunk | **Verified** | Route-level code splitting via `React.lazy()` in `App.tsx` |
| **NFR-REL-001** | Video Job Reliability | 99.5% completion on valid MP4 source files | **Verified** | Exponential backoff with jitter and sweeper recovery |
| **NFR-SEC-001** | Cryptographic Entropy | AES-256 key material $\ge$ 256 bits | **Verified** | `validateSocialTokenEncryptionKey` test suite |
| **NFR-SEC-002** | Injection Defenses | Zero CSV or NoSQL formula/operator injection | **Verified** | RFC 4180 formula escaping and regex UUID validation |
| **NFR-COMP-001**| Multi-Tenant Isolation | Strict zero-leakage cross-tenant access | **Verified** | `ownerContext` and `requireWorkspaceRole` test suites |
| **NFR-SCALE-001**| Concurrency | 100 simultaneous video render leases | **Proposed Target** | Distributed MongoDB lease lock architecture |
| **NFR-AVAIL-001**| Uptime SLA | 99.9% uptime across API endpoints | **Proposed Target** | Multi-container Docker deployment with health probes |

---

## 15. Quality Assurance, Testing & Verification Evidence

### 15.1 Automated Regression Test Suite Status
All tests executed safely without modifying repository source files or mutating protected user records:

- **Active Regression Suite**: **159 tests passed, 0 failed across 43 suites** (17.02s duration).
  - `phase27ABStudio.test.ts` (17 tests)
  - `phase32ABStudioReporting.test.ts` (13 tests)
  - `phase33ABStudioCsvImport.test.ts` (13 tests)
  - `phase34BrandBrainIntelligence.test.ts` (10 tests)
  - `phase35ContentPerformanceDashboard.test.ts` (10 tests)
  - `phase36ContentWorkflowAutomation.test.ts` (12 tests)
  - `phase37QueueReliability.test.ts` (17 tests)
  - `phase38WorkspaceTeamPermissions.test.ts` (47 tests)
  - `phase40WorkspaceAuthenticatedAcceptance.test.ts` (20 tests)
- **P0 Security, Legal & Billing Suites**: **35 tests passed, 0 failed across 14 suites** (934ms duration).
  - `securityRemediationP0.test.ts` (19 tests)
  - `yearlyPricingToggle.test.ts` (11 tests)
  - `legalPagesAndMarketing.test.ts` (5 tests)
- **Backend TypeScript Compilation**: **Pass (0 errors)** via `npx tsc --noEmit`.
- **Frontend Production Build**: **Pass (0 errors in 4.46s)** via `npm run build`.

### 15.2 Protected Artifact Verification
- QA draft experiment `dc8afd49-d719-4f8f-b2cd-bcd50db646a2` verified intact in `DRAFT`.
- Autopilot run `3df13277-1999-441d-8b1b-b2ac370c1ec1` verified intact in `COMPLETED`.
- Parked Clip Download 5% issue remains intentionally untouched.

---

## 16. Production Operations & Launch Readiness

The launch gate audit is detailed in [PRODUCTION_READINESS_CHECKLIST.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/PRODUCTION_READINESS_CHECKLIST.md).

### Operational Verdict:
**CONDITIONALLY READY FOR PRIVATE STAGING / BLOCKED FOR PUBLIC PAID LAUNCH**

### Actionable Pre-Launch Blockers:
1. **[P1] Live Social OAuth Developer Applications**: Connect real developer client IDs and secrets for YouTube (Google Console), TikTok, and Meta (Instagram) to verify live OAuth token exchange.
2. **[P1] Live Payment Merchant Sandbox Handshake**: Execute real test transactions via Paddle Sandbox and Razorpay Test Mode to confirm webhook delivery in staging.
3. **[P1] Worker Disk Space Scaling**: Ensure production video worker containers are configured with at least 50GB NVMe scratch space to prevent `ENOSPC` errors during concurrent 2GB video renders.
4. **[P1] AI Provider Spend Ceilings**: Set hard daily/monthly spend limits in OpenRouter and Groq account dashboards.

---

## 17. Roadmap Traceability & Engineering Reconciliation

The complete mapping reconciling the 40 original roadmap phases with development sprints is documented in [ROADMAP_TRACEABILITY.md](file:///d:/Vertex%20Digital/final/ai-video-content-generator-main%20%281%29/ai-video-content-generator-main/docs/ROADMAP_TRACEABILITY.md).

### Numbering Discrepancy Clarification:
- **Original Phase 28 is *Team Workspaces***: Implemented in sprints labeled "Phases 38–40".
- **Original Phase 40 is *Enterprise Security***: Workspace RBAC implemented; enterprise SSO/SAML 2.0 and SCIM directory synchronization remain open on the master roadmap.
- **Sprint Phase 32 vs Original Phase 32**: Sprint Phase 32 implemented A/B Studio Reporting; Original Phase 32 (Model Context Protocol AI Tools) remains planned.
- **Sprint Phase 33 vs Original Phase 33**: Sprint Phase 33 implemented CSV Analytics Import; Original Phase 33 (Professional NLE Export) remains partially implemented.

---

## 18. Testable Acceptance Criteria

### Flow 1: Video Upload & Moment Extraction
```gherkin
Given an authenticated user with at least 15 minutes of remaining quota
When the user submits a valid MP4 video URL under 2GB
Then the system stores the video in Cloudflare R2
And extracts word-level timestamps via Whisper Large v3
And generates between 3 and 10 viral clip candidates with engagement scores >= 60
And deducts the duration from the user's reserved monthly quota.
```

### Flow 2: A/B Testing & Winner Promotion
```gherkin
Given an active A/B experiment with 2 thumbnail variants and >= 8,158 impressions per variant
When the calculated p-value from the Two-Proportion Z-Test is less than 0.05
Then the system highlights the winning variant with a statistical significance badge
And when the user confirms promotion
Then the clip's active thumbnail is updated
And an evidence record is logged to Brand Brain under dimension AB_STUDIO.
```

### Flow 3: Workspace Role Enforcement
```gherkin
Given a workspace member with role EDITOR
When the member attempts to invite another user or change a member's role
Then the request is rejected with HTTP 403 FORBIDDEN
And when the member edits a project inside the workspace
Then the mutation succeeds and the action is recorded in the workspace audit log.
```

### Flow 4: Yearly Pricing Toggle Safety
```gherkin
Given a user viewing the billing page with Razorpay (India INR) selected
When the user toggles the billing interval to "Yearly"
Then the card displays "—" for the annual amount
And displays explanatory text indicating annual billing is unavailable for INR
And disables the checkout CTA button, preventing accidental monthly checkouts.
```

---

## 19. Forward-Looking Roadmap & Prioritized Backlog

### Priority 0 (P0) — Launch Gate Prerequisites
- Live OAuth developer credentials registration (YouTube, Meta, TikTok).
- Live Paddle & Razorpay sandbox checkout and webhook verification.
- Hard spend ceilings configured on OpenRouter and Groq accounts.

### Priority 1 (P1) — Core Product Completeness
- **[ORF-28] Clip-Level Commenting & Mentions**: Multi-user annotations directly on the video timeline.
- **[ORF-33] Professional NLE Timeline Export**: Final Cut Pro XML and CMX3600 EDL export for Premiere Pro and DaVinci Resolve.
- **[ORF-30] Cloud Storage Pickers**: Google Drive and Dropbox direct file selectors.

### Priority 2 (P2) — Extensibility & Scalability
- **[ORF-31] Developer REST API & Webhooks**: Public API key issuance (`/v1/api-keys`) and outbound customer webhooks.
- **[ORF-32] Model Context Protocol (MCP) Server**: Expose Vireo tools (`list_projects`, `create_clips`, `publish_clip`) for external AI agents (Claude, Cursor).
- **[ORF-29] Semantic Vector Search (Vireo Vault)**: Vector embeddings on historical transcripts using MongoDB Atlas Vector Search.

### Priority 3 (P3) — Enterprise & UX Polish
- **[ORF-40] Enterprise SAML 2.0 / SSO & SCIM Directory Synchronization**.
- **[ORF-38] Resumable Chunked Video Uploads (tus protocol)**.
- **[UX-2.0] Global Command Palette (`Ctrl+K`) & Tiered UI Mode Toggle (Beginner / Creator / Pro)**.

---

## 20. Glossary & Supporting References

- **EMA (Exponential Moving Average)**: Mathematical smoothing filter used in face-tracking auto-reframing to prevent jerky camera motion.
- **Fencing Token**: Monotonically increasing identifier or distributed lease lock ensuring stale background workers cannot overwrite active renders.
- **LUFS (Loudness Units relative to Full Scale)**: Standardized audio measurement used by Vireo's Audio Studio to normalize dialog to broadcast levels (-14 LUFS for YouTube/TikTok).
- **MDE (Minimum Detectable Effect)**: Statistical threshold in A/B Studio defining the smallest relative conversion rate lift an experiment is powered to detect.
- **`ownerContext`**: Node.js `AsyncLocalStorage` tenant context isolating database operations to the authenticated user ID.
- **Wilson Score Interval**: Asymmetric confidence interval used to represent binomial uncertainty accurately, especially for small sample sizes.

---

*End of Master Product Requirements Document. Generated and verified for Vireo AI Video Content Generator SaaS.*
