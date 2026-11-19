import React from 'react';
import type {InstagramAccountSelection} from '../services/socialService';
export const InstagramAccountChoice:React.FC<{
  selection:InstagramAccountSelection|null;loading:boolean;busy:boolean;error:string|null;
  selectedId:string;replacementConfirmed:boolean;onSelect:(id:string)=>void;
  onReplacementConfirmed:(value:boolean)=>void;onConfirm:()=>void;onCancel:()=>void;
}> =({selection,loading,busy,error,selectedId,replacementConfirmed,onSelect,onReplacementConfirmed,onConfirm,onCancel})=>{
  const validChoice=Boolean(selection?.choices.some(choice=>choice.providerAccountId===selectedId));
  const replacing=Boolean(selection?.replacesAccountId&&selection.replacesAccountId!==selectedId);
  return <section aria-label="Choose Instagram Professional account" className="space-y-3 rounded-2xl border border-border p-4 text-xs">
    <h3 className="font-semibold text-sm">Choose the Instagram Professional account</h3>
    <p>No account has been connected or replaced by this selection yet. Choose the exact account and linked Facebook Page. This does not publish anything or request new permissions.</p>
    {loading&&<p role="status">Loading account choices...</p>}
    {error&&<p role="alert" className="text-destructive break-words">{error}</p>}
    {selection&&<>
      <p>Selection expires: {new Date(selection.expiresAt).toLocaleString()}. Expiry or cancellation leaves existing connections unchanged.</p>
      {selection.replacesAccountId&&<p>Existing destination account ID: <strong className="break-all">{selection.replacesAccountId}</strong></p>}
      <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Available accounts, none selected by default</legend>
        {selection.choices.map(choice=><label key={choice.providerAccountId} className="flex items-start gap-2 rounded-xl border border-border p-3">
          <input type="radio" name="instagram-professional-account" value={choice.providerAccountId} checked={selectedId===choice.providerAccountId} onChange={()=>onSelect(choice.providerAccountId)}/>
          <span className="min-w-0 break-words"><strong>{choice.accountName}</strong>{choice.username?` (@${choice.username})`:''}<br/>Instagram ID: {choice.providerAccountId}<br/>Page: {choice.pageName||'Name not returned'} (ID: {choice.pageId})</span>
        </label>)}
      </fieldset>
      {replacing&&selectedId&&<label className="flex items-start gap-2"><input type="checkbox" checked={replacementConfirmed} disabled={busy} onChange={e=>onReplacementConfirmed(e.target.checked)}/><span>I approve replacing the existing Instagram connection with this selected destination. Existing scheduled posts will not be redirected to it.</span></label>}
    </>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy||loading||!selection||!validChoice||Boolean(error)||(replacing&&!replacementConfirmed)} onClick={onConfirm} className="rounded-xl border border-border px-3 py-2 font-semibold disabled:opacity-50">{busy?'Saving choice...':'Confirm selected account'}</button>
      <button type="button" disabled={busy} onClick={onCancel} className="underline disabled:opacity-50">Cancel, keep existing connection</button>
    </div>
  </section>;
};
