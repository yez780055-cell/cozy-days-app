import React from 'react';
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

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App/><PwaUpdate/>{import.meta.env.MODE === 'android' && Capacitor.getPlatform() === 'android'
    && <AndroidWebUpdatePrompt/>}</React.StrictMode>,
);

registerServiceWorker();
