import {hookAppliedInput} from '../../shared/hookAppliedInput.js';
import {assertSelectionSourceCurrent} from '../selectionSourceGuardService.js';
import {projectHookTextOverlay} from '../../shared/hookTextOverlayProjection.js';
import {getMongoClient,getMongoDb} from '../../db/mongoClient.js';
import {assertHookEditorIdentity,commitHookEditorRevision,hookCandidateEditIdentity} from '../../db/repositories/hookEditorRevisionRepository.js';
import {renderHookSourcePreview} from './hookSourcePreview.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { ProEditorService } from '../proEditorService.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  EditorProject,
  HookCandidate,
} from '../../types/index.js';


export interface ApplyHookResult {
  updatedProject: EditorProject;
  previousProjectSnapshot: EditorProject;
  appliedOperations: string[];
}

export class HookEditorIntegration {
  /**
   * Adds an explicit text-overlay candidate to its matching saved timeline.
   * Other delivery modes require their own source-bound edit workflow.
   * The transaction retains the previous revision for guarded Undo.
   */
  public static async applyCandidateToProject(
    userId: string,
    editorProjectId: string,
    candidate: HookCandidate
  ): Promise<ApplyHookResult> {
    return await ownerContext.run(userId, async () => {
      const currentProject = await ProEditorService.getEditorProject(editorProjectId, userId);
      const {data:persisted}=await dataRepository.from('hook_candidates').select('*').eq('id',candidate.id).eq('user_id',userId).single();
      const {data:hookSession}=await dataRepository.from('hook_lab_sessions').select('*').eq('id',candidate.hook_lab_session_id).eq('user_id',userId).single();
      const {data:clip}=await dataRepository.from('clips').select('*').eq('id',currentProject.clip_id).eq('user_id',userId).single();
      assertHookEditorIdentity(userId,persisted,hookSession,clip,currentProject);
      if(hookCandidateEditIdentity(persisted)!==hookCandidateEditIdentity(candidate))throw new AppError('The hook changed. Reload before applying it.',409,'HOOK_EDITOR_IDENTITY_REQUIRED');
      if(persisted.applied||(persisted as any).editor_apply_receipt?.state==='applied')throw new AppError('This hook is already applied. Undo it before applying it again.',409,'HOOK_ALREADY_APPLIED');
      const previousSnapshot = JSON.parse(JSON.stringify(currentProject)) as EditorProject;
      const appliedOperations: string[] = [];

      const {data:sourceProject}=await dataRepository.from('projects').select('*').eq('id',currentProject.project_id).eq('user_id',userId).single();
      const {data:transcript}=await dataRepository.from('transcripts').select('*').eq('project_id',currentProject.project_id).eq('user_id',userId).single();
      const appliedInput=hookAppliedInput(clip,sourceProject,transcript);
      await assertSelectionSourceCurrent(userId,currentProject.project_id,clip.selection_source_receipt,clip.source_storage_path);
      const projected=projectHookTextOverlay(currentProject,persisted as HookCandidate);
      const updatedTracks=projected.tracks;
      appliedOperations.push('Added the current text-overlay hook with its planned timing and normalized canvas position');

      // Update editor project in DB
      const updates=await ProEditorService.prepareEditorRevision(currentProject,userId,{tracks:updatedTracks,version:currentProject.version});
      const updatedProject=await commitHookEditorRevision(await getMongoClient(),await getMongoDb(),{userId,candidate:persisted,expectedEditor:currentProject,updates,appliedInput}) as unknown as EditorProject;

      logger.info('Applied HookCandidate to EditorProject', {
        editorProjectId,
        candidateId: candidate.id,
        operations: appliedOperations,
      });

      return {
        updatedProject,
        previousProjectSnapshot: previousSnapshot,
        appliedOperations,
      };
    });
  }

  /**
   * Reverts an applied hook operation by restoring the previous EditorProject snapshot.
   */
  public static async revertCandidateInEditor(userId:string,editorProjectId:string,snapshot:EditorProject,candidate:HookCandidate):Promise<EditorProject>{
    return ownerContext.run(userId,async()=>{
      const current=await ProEditorService.getEditorProject(editorProjectId,userId);
      const {data:persisted}=await dataRepository.from('hook_candidates').select('*').eq('id',candidate.id).eq('user_id',userId).single();
      const {data:hookSession}=await dataRepository.from('hook_lab_sessions').select('*').eq('id',candidate.hook_lab_session_id).eq('user_id',userId).single();
      const {data:clip}=await dataRepository.from('clips').select('*').eq('id',current.clip_id).eq('user_id',userId).single();
      assertHookEditorIdentity(userId,persisted,hookSession,clip,current,snapshot);
      if(hookCandidateEditIdentity(persisted)!==hookCandidateEditIdentity(candidate))throw new AppError('The hook changed. Reload before undoing it.',409,'HOOK_EDITOR_IDENTITY_REQUIRED');
      const receipt=(persisted as any).editor_apply_receipt;
      if(receipt?.version!==1||receipt.state!=='applied'||!receipt.before)throw new AppError('This old hook has no verifiable undo receipt. Use Studio history instead.',409,'HOOK_EDITOR_IDENTITY_REQUIRED');
      // Only the server's retained prior revision is restored. Client snapshots
      // are identity confirmations, never arbitrary replacement instructions.
      const before=receipt.before;
      const updates=await ProEditorService.prepareEditorRevision(current,userId,{tracks:before.tracks,canvas:before.canvas,settings:before.settings,title:before.title,version:current.version});
      return await commitHookEditorRevision(await getMongoClient(),await getMongoDb(),{userId,candidate:persisted,expectedEditor:current,updates,snapshot,revert:true}) as unknown as EditorProject;
    });
  }

  /** Read-only source excerpt. Saved Studio changes are not part of this preview. */
  public static async renderHookPreview(userId:string,clipId:string,candidate:HookCandidate):Promise<{previewUrl:string;duration:number;verified:boolean}>{
    return renderHookSourcePreview(userId,clipId,candidate);
  }
}
