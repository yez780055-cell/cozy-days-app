import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { PwaUpdate } from './PwaUpdate';
import { Capacitor } from '@capacitor/core';
import { AndroidWebUpdatePrompt } from './native/AndroidWebUpdate';
import { registerServiceWorker } from './pwa';
import './styles/tokens.css';
import './styles/global.css';
import './styles/swipe.css';
import './styles/settings.css';

const CloudGate = import.meta.env.VITE_CLOUDBASE_ENABLED === 'true'
  ? lazy(() => import('./features/cloud/CloudGate').then(module => ({ default: module.CloudGate })))
  : null;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{CloudGate
    ? <Suspense fallback={<p role="status">正在打开小饱日常…</p>}><CloudGate><App/></CloudGate></Suspense>
    : <App/>}<PwaUpdate/>{import.meta.env.MODE === 'android' && Capacitor.getPlatform() === 'android'
    && <AndroidWebUpdatePrompt/>}</React.StrictMode>,
);

registerServiceWorker();
