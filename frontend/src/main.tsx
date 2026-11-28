import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/api/queryClient'
import './pwa/register'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <App />
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
)
