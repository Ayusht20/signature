import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AuditLogRegistry from '@/components/AuditLogRegistry';

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [documents, setDocuments] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) {
      router.push('/');
    } else {
      setToken(savedToken);
      loadDocuments(savedToken);
    }
  }, []);

  const loadDocuments = async (authToken) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/docs', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      
      if (Array.isArray(data)) {
        setDocuments(data);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      console.error("Failed to load documents registry array:", err);
      setDocuments([]);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return alert('Select a target PDF file path first!');

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/docs/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Multipart streaming post processing failure.');
      
      alert('Document Ingestion tracking profile logged successfully!');
      setUploadFile(null);
      e.target.reset();
      loadDocuments(token);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-600 text-white py-4 px-8 flex justify-between items-center shadow-md">
        <h1 className="text-lg font-bold">📄 Secure Signature Dashboard</h1>
        <button 
          onClick={() => { localStorage.clear(); router.push('/'); }} 
          className="text-xs font-semibold uppercase tracking-wider bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg transition"
        >
          Sign Out
        </button>
      </nav>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        
        {/* TOP LEVEL DOCUMENT STREAM UPLOAD DRIVER */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">Upload Contract Document (`POST /api/docs/upload`)</h2>
          <form onSubmit={handleFileUpload} className="flex gap-4 items-center">
            <input 
              type="file" accept=".pdf" 
              className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer flex-1"
              onChange={(e) => setUploadFile(e.target.files[0])}
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition shadow-md">
              Upload Stream Package
            </button>
          </form>
        </div>

        {/* VAULT DIRECTORY SHEET LIST DISPLAY REGISTRY */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-4">Tracked Vault Documents (`GET /api/docs`)</h2>
          <div className="divide-y text-sm">
            {!Array.isArray(documents) || documents.length === 0 ? (
              <p className="text-gray-400 italic py-6 text-center">No structural files loaded for this profile session footprint.</p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="py-4 flex justify-between items-center gap-4 animate-fadeIn">
                  <div>
                    <p className="font-bold text-gray-800 font-mono text-xs">ID: #{doc.id}</p>
                    <p className="text-gray-600 font-semibold text-sm">{doc.title}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-3 py-1 rounded-md text-xs font-black tracking-wide shadow-sm ${doc.status === 'signed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {doc.status.toUpperCase()}
                    </span>
                    
                    {doc.status !== 'signed' ? (
                      <button 
                        onClick={() => {
                          localStorage.setItem('active_demo_doc', doc.id);
                          window.open('/editor', '_blank'); 
                        }} 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition text-xs shadow-md"
                      >
                        Open Editor ↗
                      </button>
                    ) : (
                      /* 🚀 THE UX UPGRADE: Show both View and Download options once signed */
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => window.open(`http://127.0.0.1:8000/api/docs/download/${doc.id}`, '_blank')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition text-xs shadow-md inline-flex items-center gap-1.5"
                        >
                          👁️ View PDF
                        </button>
                        
                        <a 
                          href={`http://127.0.0.1:8000/api/docs/download/${doc.id}?export=true`}
                          download
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold transition text-xs shadow-md inline-flex items-center gap-1.5"
                        >
                          📥 Download
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECURE COMPONENT MOUNT */}
        {token && <AuditLogRegistry token={token} />}

      </main>
    </div>
  );
}