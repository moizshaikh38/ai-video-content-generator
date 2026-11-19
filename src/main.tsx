import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Development-only: ?harness=studio mounts the local fixture instead of the app.
// Vite removes this import from production output.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('harness') === 'studio') {
  import('./harness/studioHarness');
} else {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
