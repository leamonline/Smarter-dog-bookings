import { OverlayProvider } from 'react-aria';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { SignupApprovalQueue } from '/src/components/views/humans/SignupApprovalQueue';
import { approveFixture } from './repository';
createRoot(document.getElementById('root')!).render(<OverlayProvider><main className="min-h-screen bg-brand-paper p-4 sm:p-8"><div className="mx-auto max-w-5xl"><p className="mb-4 text-sm text-slate-500">Synthetic preview · no customer data or messages</p><h1 className="mb-5 text-3xl font-bold text-brand-purple">Humans Directory</h1><SignupApprovalQueue enabled onApprove={approveFixture} /><div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">Human directory continues below</div></div></main></OverlayProvider>);
