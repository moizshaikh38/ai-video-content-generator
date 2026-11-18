import {ClipEditorPage} from './pages/ClipEditorPage';
import {ExportDialog} from './components/editor/ExportDialog';
import './index.css';
// Retain both component graphs during static compilation. No mounting or calls.
Object.defineProperty(globalThis, '__VIREO_STATIC_PREPARATION__', {
  value: Object.freeze({ClipEditorPage, ExportDialog}),
  configurable: true,
});
