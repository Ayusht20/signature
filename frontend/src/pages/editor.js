import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// ✅ Inline dynamic import — no separate SignatureCanvasLoader file needed.
// ssr: false prevents "DOMMatrix is not defined" during Next.js server rendering.
const SignatureCanvas = dynamic(
  () => import('../components/SignatureCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col gap-3 text-white text-sm font-bold">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        <span>Loading PDF editor…</span>
      </div>
    ),
  }
);

export default function StandaloneEditorPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [docId, setDocId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const targetDocId = localStorage.getItem('active_demo_doc');

    if (!savedToken || !targetDocId) {
      alert("Session footprint missing. Redirecting back to dashboard...");
      window.close();
      router.push('/dashboard');
    } else {
      setToken(savedToken);
      setDocId(targetDocId);
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-bold text-sm tracking-wide gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        <span>Initializing editor...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 flex flex-col justify-between w-full">

      {/* Header */}
      <div className="w-full mx-auto mb-4 flex justify-between items-center text-slate-300 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛠️</span>
          <h1 className="text-sm font-black tracking-wider uppercase text-white">PDF Signature Studio</h1>
        </div>
        <button
          onClick={() => window.close()}
          className="text-xs bg-slate-800 border border-slate-700 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl transition-all font-black shadow-sm"
        >
          ✕ Close
        </button>
      </div>

      {/* Editor */}
      <div className="w-full mx-auto flex-1 flex flex-col">
        <SignatureCanvas
          docId={docId}
          token={token}
          onComplete={() => router.push('/dashboard')}
        />
      </div>

    </div>
  );
}