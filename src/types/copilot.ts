export type CopilotOperationType =
  | 'PAUSE_CUT'
  | 'WORD_HIGHLIGHT'
  | 'HOOK_ENHANCE'
  | 'PUNCH_IN_ZOOM'
  | 'STYLE_PRESET'
  | 'SPEAKER_REFRAME';

export interface CopilotOperation {
  id: string;
  type: CopilotOperationType;
  title: string;
  description: string;
  parameters: Record<string, any>;
  applied: boolean;
}

export interface CopilotPlan {
  command: string;
  reasoning: string;
  operations: CopilotOperation[];
  createdAt: string;
}
