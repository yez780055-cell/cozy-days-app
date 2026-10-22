import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/cozy.css';
import './styles/swipe.css';
import './styles/round2.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App/></React.StrictMode>,
);
