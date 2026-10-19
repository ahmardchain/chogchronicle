import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { config } from './wagmi';
import App from './App';
import './index.css';
const qc = new QueryClient();
createRoot(document.getElementById('root')!).render(
  <StrictMode><WagmiProvider config={config}><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></WagmiProvider></StrictMode>
);
