import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, installGlobalErrorHandlers } from './ui/ErrorBoundary';
import { eventBus } from './core/event-bus';
import { markCleanShutdown } from './core/recovery';
import { validatePlannerConfig } from './core/config';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

installGlobalErrorHandlers();

// Iteration 3 BACK09: fail loudly at boot when central tuning is invalid.
const configIssues = validatePlannerConfig();
if (configIssues.length > 0) {
  console.warn('[planner-config] invalid tuning detected:', configIssues);
}

// BACK08: orderly exits clear the crash-recovery sentinel.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => markCleanShutdown());
}

// BACK14: prompt-mode service-worker updates surface through the bus so
// the HUD can offer a one-tap reload instead of silently going stale.
export let applyPwaUpdate: (() => void) | null = null;
try {
  const updateSW = registerSW({
    onNeedRefresh() {
      applyPwaUpdate = () => {
        void updateSW(true);
      };
      eventBus.emit('pwa:update-available', {});
    },
  });
} catch {
  /* PWA registration unavailable (private mode, insecure context) */
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
