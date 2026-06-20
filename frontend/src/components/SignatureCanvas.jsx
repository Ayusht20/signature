/**
 * SignatureCanvas — precise zoom/scroll-aware PDF signature placement
 * with expanded font + colour options.
 *
 * Coordinate fix details:
 * 1. We measure clicks against the react-pdf <canvas> element directly
 * (canvasPageRef), NOT the outer Document wrapper div. This eliminates
 * any padding/margin that react-pdf adds around the canvas.
 * 2. The overlay marker uses translate(0, 0) — top-left anchored — so it
 * lines up with where PyMuPDF stamps the text (which also uses x,y as
 * the top-left origin of the text rect).
 * 3. Colour is sent as a hex string in the payload and decoded on the
 * backend into an (r, g, b) tuple for fitz.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// ─── constants ───────────────────────────────────────────────────────────────
const PDF_W    = 595;
const PDF_H    = 842;
const ZOOM_STEP = 0.25;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 3.0;

const FONT_OPTIONS = [
  // Serif
  { id: 'f1',  label: 'Times Italic',    css: 'font-serif italic',                               pdf: 'Times-Italic'         },
  { id: 'f2',  label: 'Times Bold Italic',    css: 'font-serif italic font-bold',                     pdf: 'Times-BoldItalic'     },
  // Sans
  { id: 'f3',  label: 'Helvetica',            css: 'font-sans',                                      pdf: 'Helvetica'            },
  { id: 'f4',  label: 'Helvetica Oblique',    css: 'font-sans italic',                               pdf: 'Helvetica-Oblique'    },
  { id: 'f5',  label: 'Helvetica Bold',       css: 'font-sans font-bold',                             pdf: 'Helvetica-Bold'       },
  { id: 'f6',  label: 'Helvetica Bold Obl',   css: 'font-sans italic font-bold',                      pdf: 'Helvetica-BoldOblique'},
  // Mono
  { id: 'f7',  label: 'Courier',              css: 'font-mono',                                      pdf: 'Courier'              },
  { id: 'f8',  label: 'Courier Oblique',      css: 'font-mono italic',                               pdf: 'Courier-Oblique'      },
  { id: 'f9',  label: 'Courier Bold',         css: 'font-mono font-bold',                             pdf: 'Courier-Bold'         },
  { id: 'f10', label: 'Courier Bold Obl',     css: 'font-mono italic font-bold',                      pdf: 'Courier-BoldOblique'  },
  // Decorative (CSS only – mapped to closest PDF font)
  { id: 'f11', label: 'Script / Cursive',     css: 'italic',          style: { fontFamily: 'cursive' },            pdf: 'Times-Italic'         },
  { id: 'f12', label: 'Fantasy',              css: '',            style: { fontFamily: 'fantasy' },            pdf: 'Times-BoldItalic'     },
];

const COLOR_OPTIONS = [
  { id: 'c1',  label: 'Legal Blue',   hex: '#1a2e6e', rgb: [0.10, 0.18, 0.43] },
  { id: 'c2',  label: 'Navy',         hex: '#003366', rgb: [0.00, 0.20, 0.40] },
  { id: 'c3',  label: 'Ink Black',    hex: '#0a0a0a', rgb: [0.04, 0.04, 0.04] },
  { id: 'c4',  label: 'Charcoal',     hex: '#2d2d2d', rgb: [0.18, 0.18, 0.18] },
  { id: 'c5',  label: 'Forest Green', hex: '#1a4d2e', rgb: [0.10, 0.30, 0.18] },
  { id: 'c6',  label: 'Emerald',      hex: '#047857', rgb: [0.02, 0.47, 0.34] },
  { id: 'c7',  label: 'Burgundy',     hex: '#7c1d1d', rgb: [0.49, 0.11, 0.11] },
  { id: 'c8',  label: 'Deep Purple',  hex: '#4c1d95', rgb: [0.30, 0.11, 0.58] },
  { id: 'c9',  label: 'Slate',        hex: '#475569', rgb: [0.28, 0.34, 0.41] },
  { id: 'c10', label: 'Rose Gold',    hex: '#9d4e4e', rgb: [0.62, 0.31, 0.31] },
];

function hexToRgbPayload(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return `${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`;
}

// ─── component ───────────────────────────────────────────────────────────────
export default function SignatureCanvas({ docId, token, onComplete }) {
  const [numPages,       setNumPages]      = useState(null);
  const [targetPage,     setTargetPage]    = useState(1);
  const [scale,          setScale]         = useState(1.0);
  const [cacheBuster,    setCacheBuster]   = useState(null);
  const [workerReady,    setWorkerReady]   = useState(false);

  const [isPlacing,       setIsPlacing]      = useState(false);
  const [showSignOptions, setShowSignOptions] = useState(false);
  const [coords,          setCoords]         = useState({ x: 0, y: 0 });

  const [signMethod,    setSignMethod]    = useState('type');
  const [typedName,     setTypedName]     = useState('');
  const [selectedFont,  setSelectedFont]  = useState(FONT_OPTIONS[0].id);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0].id);
  const [isDrawing,     setIsDrawing]     = useState(false);
  const [userIp,        setUserIp]        = useState('127.0.0.1');

  // ── refs ──────────────────────────────────────────────────────────────────
  const scrollRef      = useRef(null);  
  const canvasPageRef  = useRef(null);  
  const drawRef        = useRef(null);  

  // 🚀 THE MEMOIZATION FIX: Prevents options object recreation on every single render loop cycle
  const PDF_OPTIONS = useMemo(() => ({
    cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    withCredentials: false
  }), []);

  // ── 🚀 100% OFFLINE LOCAL VERSION-MATCHED WORKER PATH ─────────────────────
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    setWorkerReady(true);
    setCacheBuster(Date.now());
  }, []);

  // ── visitor IP ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => { if (d.ip) setUserIp(d.ip); })
      .catch(() => {});
  }, []);

  // ── drawing ink setup ─────────────────────────────────────────────────────
  const activeColor = COLOR_OPTIONS.find(c => c.id === selectedColor) || COLOR_OPTIONS[0];

  useEffect(() => {
    if (signMethod === 'draw' && drawRef.current) {
      const ctx = drawRef.current.getContext('2d');
      ctx.strokeStyle = activeColor.hex;
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
    }
  }, [signMethod, showSignOptions, selectedColor, activeColor.hex]);

  const handlePageClick = useCallback((e) => {
    if (!isPlacing) return;

    const target = canvasPageRef.current ?? e.currentTarget;
    const rect   = target.getBoundingClientRect();

    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    if (cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) return;

    const pdfX = Math.round(cssX / scale);
    const pdfY = Math.round(cssY / scale);

    setCoords({
      x: Math.max(0, Math.min(pdfX, PDF_W)),
      y: Math.max(0, Math.min(pdfY, PDF_H)),
    });
    setIsPlacing(false);
    setShowSignOptions(true);
  }, [isPlacing, scale]);

  const zoomIn  = () => setScale(s => Math.min(+(s + ZOOM_STEP).toFixed(2), ZOOM_MAX));
  const zoomOut = () => setScale(s => Math.max(+(s - ZOOM_STEP).toFixed(2), ZOOM_MIN));
  const zoomFit = () => setScale(1.0);

  const startDraw = (e) => {
    const rect = drawRef.current.getBoundingClientRect();
    const ctx  = drawRef.current.getContext('2d');
    ctx.strokeStyle = activeColor.hex;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    const rect = drawRef.current.getBoundingClientRect();
    const ctx  = drawRef.current.getContext('2d');
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const clearPad = () => {
    const ctx = drawRef.current.getContext('2d');
    ctx.clearRect(0, 0, drawRef.current.width, drawRef.current.height);
  };

  const handleFinalize = async () => {
    const font  = FONT_OPTIONS.find(f => f.id === selectedFont) || FONT_OPTIONS[0];
    const color = COLOR_OPTIONS.find(c => c.id === selectedColor) || COLOR_OPTIONS[0];

    let signaturePayload = '';
    if (signMethod === 'type') {
      if (!typedName.trim()) return alert('Please type your signature name!');
      signaturePayload = `TEXT:${typedName}|FONT:${font.pdf}|COLOR:${hexToRgbPayload(color.hex)}`;
    } else {
      signaturePayload = drawRef.current.toDataURL('image/png');
    }

    try {
      const resPlot = await fetch(
        `http://127.0.0.1:8000/api/signatures?doc_id=${docId}&x=${coords.x}&y=${coords.y}&page=${targetPage}&ip_address=${userIp}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature_data: signaturePayload }),
        }
      );
      if (!resPlot.ok) throw new Error('Failed to save signature.');

      const resFinal = await fetch(
        `http://127.0.0.1:8000/api/signatures/finalize?doc_id=${docId}`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!resFinal.ok) throw new Error('Failed to finalize PDF.');

      alert('Document signed and sealed!');
      setShowSignOptions(false);
      setTypedName('');
      setCacheBuster(Date.now());
      onComplete();
    } catch (err) {
      alert(err.message);
    }
  };

const pdfUrl = cacheBuster
    ? {
        url: `http://127.0.0.1:8000/api/docs/download/${docId}?t=${cacheBuster}`,
        headers: { 'Authorization': `Bearer ${token}` }
      }
    : null;

  const overlayLeft = coords.x * scale;
  const overlayTop  = coords.y * scale;

  const activeFont = FONT_OPTIONS.find(f => f.id === selectedFont) || FONT_OPTIONS[0];

  return (
    <div className="w-full bg-slate-900 flex flex-col rounded-xl border border-slate-700 overflow-hidden shadow-2xl flex-1 min-h-[calc(100vh-140px)]">

      {/* ── TOOLBAR ── */}
      <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center justify-between shadow-md z-10 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold px-3 py-1.5 bg-slate-900 rounded-lg text-slate-400 font-mono border border-slate-700">
            Doc #{docId}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-emerald-500 font-bold">●</span>
            <span className="font-mono text-slate-300">{userIp}</span>
          </div>

          {/* Page */}
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Page:</label>
            <input
              type="number" min="1" max={numPages || 100}
              value={targetPage}
              onChange={e => setTargetPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 bg-slate-800 text-white font-mono text-center rounded-lg border border-slate-600 py-0.5 text-xs focus:outline-none"
            />
            {numPages && <span className="text-[10px] text-slate-500">/ {numPages}</span>}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-xl border border-slate-700">
            <button onClick={zoomOut} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold flex items-center justify-center">−</button>
            <button onClick={zoomFit} className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-[11px] font-mono font-bold min-w-[3.5rem] text-center">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={zoomIn}  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold flex items-center justify-center">+</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setIsPlacing(true); setShowSignOptions(false); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black tracking-wide transition shadow-md
              ${isPlacing ? 'bg-amber-500 text-slate-950 scale-95' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
          >
            ✒️ {isPlacing ? 'Click the PDF…' : 'Place Signature'}
          </button>
          <button
            onClick={handleFinalize}
            disabled={!showSignOptions}
            className={`px-5 py-2 rounded-xl text-xs font-black tracking-wider uppercase shadow-md transition
              ${showSignOptions ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            ✓ Seal
          </button>
        </div>
      </div>

      {/* ── SIGN OPTIONS PANEL ── */}
      {showSignOptions && (
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-col gap-4 z-10">
          <div className="flex gap-2">
            <button
              onClick={() => setSignMethod('type')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition
                ${signMethod === 'type' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'}`}
            >⌨️ Type</button>
            <button
              onClick={() => setSignMethod('draw')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition
                ${signMethod === 'draw' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'}`}
            >✍️ Draw</button>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* ── LEFT: input area ── */}
            <div className="flex-1 flex flex-col gap-3">
              {signMethod === 'type' ? (
                <>
                  <input
                    type="text" placeholder="Type your name…"
                    className="w-full max-w-md border border-slate-600 p-3 rounded-xl text-sm focus:outline-none focus:border-indigo-500 bg-white text-slate-900 font-bold shadow-inner"
                    value={typedName} onChange={e => setTypedName(e.target.value)}
                  />

                  {typedName && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-w-2xl">
                      {FONT_OPTIONS.map(font => (
                        <button
                          key={font.id}
                          onClick={() => setSelectedFont(font.id)}
                          className={`border rounded-xl px-2 py-2 cursor-pointer text-center transition flex flex-col items-center gap-1
                            ${selectedFont === font.id
                              ? 'border-indigo-400 bg-indigo-950/70 ring-2 ring-indigo-500'
                              : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}
                        >
                          <span
                            className={`text-sm text-white leading-tight ${font.css}`}
                            style={{ color: activeColor.hex, ...font.style }}
                          >
                            {typedName.length > 14 ? typedName.slice(0, 14) + '…' : typedName}
                          </span>
                          <span className="text-[9px] text-slate-500 truncate w-full text-center">{font.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex gap-4 items-start">
                  <div className="flex flex-col gap-2">
                    <canvas
                      ref={drawRef} width={340} height={110}
                      onMouseDown={startDraw} onMouseMove={draw}
                      onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)}
                      className="border-2 border-slate-600 bg-white rounded-xl cursor-crosshair touch-none shadow-inner"
                      style={{ borderColor: activeColor.hex + '66' }}
                    />
                    <button onClick={clearPad} className="text-[10px] font-black text-red-400 hover:text-red-300 uppercase tracking-wider self-start">
                      &times; Clear pad
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: colour picker ── */}
            <div className="flex flex-col gap-3 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ink Colour</p>
              <div className="grid grid-cols-5 gap-2">
                {COLOR_OPTIONS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => setSelectedColor(color.id)}
                    title={color.label}
                    className={`w-8 h-8 rounded-full border-2 transition-all shadow-md
                      ${selectedColor === color.id ? 'border-white scale-110 ring-2 ring-offset-2 ring-offset-slate-800' : 'border-slate-600 hover:border-slate-400 hover:scale-105'}`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 rounded-full border border-slate-600" style={{ backgroundColor: activeColor.hex }} />
                <span className="text-[10px] text-slate-400 font-mono">{activeColor.label} &middot; {activeColor.hex}</span>
              </div>

              <div className="text-xs text-slate-400 font-mono bg-slate-900 p-3 rounded-xl border border-slate-700 mt-2">
                X: <span className="text-indigo-400 font-bold">{coords.x}pt</span>&nbsp;
                Y: <span className="text-indigo-400 font-bold">{coords.y}pt</span><br />
                Page <span className="text-amber-400 font-bold">#{targetPage}</span> &middot; <span className="text-emerald-400 font-bold">{Math.round(scale * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF VIEWER ── */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-slate-700 shadow-inner">
        <div className="flex justify-center py-8 px-4 min-h-full">
          <div
            onClick={handlePageClick}
            className={`relative shadow-2xl select-none inline-block
              ${isPlacing ? 'ring-4 ring-amber-500 cursor-crosshair' : 'cursor-default'}`}
            style={{ lineHeight: 0 }}
          >
            {pdfUrl && workerReady ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                options={PDF_OPTIONS}
                loading={
                  <div style={{ width: PDF_W * scale, height: PDF_H * scale }}
                       className="bg-white flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <p className="font-mono text-[11px] italic">Streaming file from cloud vault...</p>
                  </div>
                }
                error={
                  <div style={{ width: PDF_W * scale, height: PDF_H * scale }}
                       className="bg-white flex items-center justify-center text-red-400 text-sm">
                    Failed to render secure stream mapping.
                  </div>
                }
              >
                <Page
                  pageNumber={targetPage}
                  scale={scale}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  canvasRef={canvasPageRef}
                />
              </Document>
            ) : (
              <div style={{ width: PDF_W, height: PDF_H }}
                   className="bg-white flex items-center justify-center text-slate-400 text-sm">
                Initialising Studio Canvas Environment...
              </div>
            )}

            {/* ── SIGNATURE MARKER ── */}
            {showSignOptions && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: overlayLeft,
                  top:  overlayTop,
                }}
              >
                <div
                  className="absolute -top-1 -left-1 w-2 h-2 rounded-full border border-white shadow"
                  style={{ backgroundColor: activeColor.hex }}
                />
                <div
                  className="text-[9px] text-white font-black px-2 py-1 rounded shadow-xl whitespace-nowrap"
                  style={{ backgroundColor: activeColor.hex + 'cc' }}
                >
                  {typedName
                    ? <span className={activeFont.css} style={activeFont.style}>{typedName}</span>
                    : '✒️ Signature'}
                </div>
                <div className="h-px w-full mt-0.5" style={{ backgroundColor: activeColor.hex }} />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}