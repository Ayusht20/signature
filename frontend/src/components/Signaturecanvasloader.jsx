/**
 * SignatureCanvasLoader.jsx
 *
 * Drop-in replacement for wherever you currently write:
 *   import SignatureCanvas from '../components/SignatureCanvas';
 *
 * Change every such import to:
 *   import SignatureCanvas from '../components/SignatureCanvasLoader';
 *
 * That's the only change needed in editor.js / StandaloneEditorPage.
 * The real component is identical — this file just tells Next.js to
 * never try to render it on the server.
 */

import dynamic from 'next/dynamic';

const SignatureCanvas = dynamic(
  () => import('./SignatureCanvas'),
  {
    ssr: false,   // ← prevents "DOMMatrix is not defined" during SSR
    loading: () => (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col gap-3 text-white text-sm font-bold">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        <span>Loading PDF editor…</span>
      </div>
    ),
  }
);

export default SignatureCanvas;