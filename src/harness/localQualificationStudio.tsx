/** Local-only retained-media qualification. Real page/hooks/controllers, synthetic owner. */
import ReactDOM from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ClipEditorPage} from '../pages/ClipEditorPage';
import {ExportDialog} from '../components/editor/ExportDialog';
import '../index.css';
const params=new URLSearchParams(location.search),clip=params.get('clip');
const draft=params.get('resolutionOnly')==='1';
ReactDOM.createRoot(document.getElementById('root')!).render(draft?<ExportDialog duration={3} isOpen={true} onClose={()=>{}} clip={{id:'local-resolution-fixture',render_status:'draft',render_resolution:'720p'}as any} isRendering={false} renderProgress={0} renderStage="idle" renderError={null} renderSuccessMsg={null} onTriggerRender={()=>{throw Error('No encode permitted in resolution-only fixture');}}/>:<MemoryRouter initialEntries={['/clips/'+clip+'/edit']}><Routes><Route path="/clips/:clipId/edit" element={<ClipEditorPage/>}/></Routes></MemoryRouter>);
