# 13. Recommended Integration Strategy

**Audit Date:** 2026-10-11  
**Scope:** Evaluation of integration strategies for combining Local and Friend implementations.

---

## 1. Strategy Options Evaluation

```mermaid
graph TD
    subgraph Option A: Blind Git Merge
        A1["git merge mayur/main"] --> A2["Merge Conflicts in 12 Files"]
        A2 --> A3["High Risk of Overwriting Local Hero or Showcase"]
        A3 --> A4["Status: REJECTED"]
    end

    subgraph Option B: Friend Repo as Base
        B1["Checkout Friend Branch"] --> B2["Manually Port 87 Local Editor & Server Files"]
        B2 --> B3["High Effort & Risk of Regressing Render Pipelines"]
        B3 --> B4["Status: REJECTED"]
    end

    subgraph Option C: Local Repo as Base (RECOMMENDED)
        C1["Keep Local Worktree as Base"] --> C2["Copy Friend Landing Files & Assets"]
        C2 --> C3["Mount AiClippingPreview into Local Hero"]
        C3 --> C4["Mount Friend Post-Hero Sections in LandingPage"]
        C4 --> C5["Preserve 100% of Local Editor & Server"]
        C5 --> C6["Status: STRONGLY RECOMMENDED"]
    end
```

---

## 2. Comparative Strategy Analysis

| Strategy | Risk Level | Effort Required | Work Loss Hazard | Conflict Volume | Testability | Recommendation |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **OPTION A: Automated Git Merge** | **CRITICAL** | Medium | **EXTREME** (Git 3-way merge would overwrite local hero or fail on uncommitted editor tree) | 12 complex JSX & CSS conflicts | Poor | **REJECTED** |
| **OPTION B: Friend as Base + Port Local** | **HIGH** | Very High | **HIGH** (Requires manually re-applying 87 editor and server files across backend and frontend) | Massive (87 files to verify) | Medium | **REJECTED** |
| **OPTION C: Local as Base + Port Friend Landing (Selective Composition)** | **LOW** | Low to Medium | **ZERO** (Local hero, editor, backend, and tests remain 100% untouched and preserved) | Minimal (Controlled component slots) | **EXCELLENT** | **STRONGLY RECOMMENDED** |

---

## 3. Rationale for Option C (Selective Composition)

1. **Alignment with Product Intent:**
   - The user requested:
     - Keep Local Hero as source of truth.
     - Take Friend's animated showcase (`AiClippingPreview`) and embed it in local hero.
     - Take Friend's sections after hero.
     - Preserve Local editor services and backend changes.
   - Option C maps **1-to-1** with this architectural desire.
2. **Asymmetric Work Scope:**
   - Friend modified **only landing page and frontend marketing files**.
   - Local modified **the video editor, multi-track render graph, backend routes, tests, and cinematic hero**.
   - It is significantly faster and safer to bring 41 frontend landing assets/components into local than to attempt transplanting the entire multi-track video editor onto the friend's repo.
3. **Zero Backend & Editor Risk:**
   - All 641 existing backend and editor unit/integration tests remain intact and running on the local base.
4. **Isolated Verification:**
   - The friend's carousel can be verified independently inside `<div className="vc-showcase-shell">` without touching any other part of the application.
