import { useState, useEffect } from 'react';

export default function AuditLogRegistry({ token }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🚀 Fetch all historic tracking records directly from your backend endpoints
    fetch('https://ayushtrilokchandani-signature.hf.space/api/signatures/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setLogs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading verification history data records:", err);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return <div className="text-slate-400 text-xs font-mono animate-pulse">Loading secure transaction tracking matrices...</div>;
  }

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl mt-8">
      <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <h2 className="text-xs font-black tracking-widest text-white uppercase">Cryptographic Signature Audit & Verification Logs</h2>
        </div>
        <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-md">
          PostgreSQL Connected
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 text-[10px] font-black tracking-wider uppercase border-b border-slate-700">
              <th className="p-4">Log ID</th>
              <th className="p-4">Document ID</th>
              <th className="p-4">Verification Stamp Info</th>
              <th className="p-4 text-center">Target Page</th>
              <th className="p-4">Placement Coords</th>
              <th className="p-4 font-mono text-indigo-400">Captured Audit IP</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300 text-xs">
            {logs.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500 font-medium italic">
                  No secure signature transactions recorded in current database snapshot profile registry tracks.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-850/40 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-400">#SEC-{log.id}39</td>
                  <td className="p-4 font-bold text-slate-400">Doc #{log.doc_id}</td>
                  <td className="p-4 truncate max-w-xs font-medium">
                    {log.signature_data?.startsWith("TEXT:") ? (
                      <span className="px-2 py-1 bg-indigo-950 text-indigo-300 rounded border border-indigo-900 font-semibold">
                        Type: {log.signature_data.split("|")[0].replace("TEXT:", "")}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-amber-950 text-amber-300 rounded border border-amber-900 font-semibold">
                        ✍️ Freehand Draw Vector
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center font-black text-amber-400">Page {log.page_num}</td>
                  <td className="p-4 font-mono text-[11px] text-slate-400">
                    X: <span className="font-bold text-slate-300">{log.x_coord}pt</span> | Y: <span className="font-bold text-slate-300">{log.y_coord}pt</span>
                  </td>
                  <td className="p-4 font-mono font-bold text-emerald-400 bg-emerald-950/20">{log.ip_address || "127.0.0.1"}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      log.status === "signed" 
                        ? "bg-emerald-950 border-emerald-700 text-emerald-400" 
                        : "bg-amber-950 border-amber-700 text-amber-400"
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}