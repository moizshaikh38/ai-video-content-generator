import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// TEST-ONLY: ?harness=studio mounts the studio harness instead of the app.
// The harness self-renders into #root on import.
if (new URLSearchParams(window.location.search).get('harness') === 'studio') {
  import('./harness/studioHarness');
} else {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
