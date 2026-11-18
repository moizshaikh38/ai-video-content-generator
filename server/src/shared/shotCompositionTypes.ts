import type {ReframeSample} from '../types/index.js';
import type {AutomaticLayoutPolicy} from './automaticLayoutPolicy.js';
/** Existing planner input contract. Extraction does not change evidence or policy. */
export interface ShotCompositionOptions {
    layoutPolicy?:AutomaticLayoutPolicy;
    rawSamples?: ReframeSample[] | null; sceneCuts?: number[]; duration: number;
    sourceWidth: number; sourceHeight: number;
    /** Review-only opt-in. No production caller selects this policy. */
    unresolvedContextPolicy?: 'preserve' | 'shared-subject-window' | 'balanced-inset-review';
    /** Scene-adaptive opt-in. Unknown shots remain full source locally. */
    windowScope?: 'clip' | 'shot';
    /** Explicit presentation preference. Crop conflicts remain review-required. */
    automaticFitAspect?: '4:3';
    /** Developmental opt-in only. Not read from project/user settings. */
    pairFocusReview?: boolean;
    /** Review-only. Requires independently supplied hand observations. */
    sharedViewReview?: boolean;
    /** Internal positive-hand-evidence seam veto. Off by default, not a setting. */
    splitHandSafetyReview?: boolean;
    bodyOnlyPortraitReview?: boolean;
    /** Requires independently declared podcast/interview context. */
    allowConversationSplit?: boolean;
    /** Offline participant assignment qualification. Not enabled by production callers. */
    participantPanelsReview?: boolean;
    /** Offline face-window-only panel qualification. Never read from user settings. */
    participantFaceWindowReview?: boolean;
    /** Optional measured regions, local qualification only. Not semantic proof. */
    protectedContentRegions?: Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>;
  }
