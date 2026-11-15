// TEST-ONLY harness: mounts the production ExportDialog standalone so the
// watermark entitlement notice can be visually verified (the full-app modal
// layer does not composite in headless screenshots).
import '../index.css';
import { createRoot } from 'react-dom/client';
import { ExportDialog } from '../components/editor/ExportDialog';

createRoot(document.getElementById('root')!).render(
  <ExportDialog
    isOpen={true}
    onClose={() => {}}
    clip={{ id: 'harness-clip', render_status: 'ready' } as any}
    duration={206.13}
    isRendering={false}
    renderProgress={0}
    renderStage={''}
    renderError={null}
    renderSuccessMsg={null}
    onTriggerRender={() => {}}
    downloadUrl={null}
    watermarkRequired={true}
  />
);
