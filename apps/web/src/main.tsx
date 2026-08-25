/**
 * Entry point.
 *
 * `origin` is read once, here, and threaded down. Development authentication is
 * refused anywhere but localhost (W5-A), and passing the origin explicitly makes
 * that decision testable rather than hidden inside a component.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './design/index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App origin={window.location.origin} />
  </StrictMode>,
);
