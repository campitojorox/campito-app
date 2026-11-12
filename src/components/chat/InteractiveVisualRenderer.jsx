// src/components/chat/InteractiveVisualRenderer.jsx
// Renderizador interactivo de salidas visuales generadas por Gemini:
// 1. Dibujos Técnicos y Croquis Vectoriales (SVG) con botones de Zoom, Descarga e Impresión.
// 2. Diagramas y Esquemas de Flujo (Mermaid.js).

import { useState, useRef, useEffect } from 'react';
import { Download, Printer, Maximize2, Minimize2, ZoomIn, ZoomOut, Check, Code } from 'lucide-react';

export default function InteractiveVisualRenderer({ type = 'svg', code = '', title = 'Dibujo Técnico' }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState('');
  const [mermaidError, setMermaidError] = useState(null);
  const containerRef = useRef(null);

  // Carga e inicialización dinámica de Mermaid si el tipo es mermaid
  useEffect(() => {
    if (type !== 'mermaid' || !code) return;
    let isMounted = true;

    async function renderMermaid() {
      try {
        // Importación dinámica segura del bundle de Mermaid ESM
        const mermaidModule = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
        const mermaid = mermaidModule.default || mermaidModule;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#00979d',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#007a7e',
            lineColor: '#38bdf8',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a',
          },
        });

        const id = 'mermaid_' + Math.random().toString(36).substring(7);
        const { svg } = await mermaid.render(id, code.trim());
        if (isMounted) {
          setMermaidSvg(svg);
          setMermaidError(null);
        }
      } catch (err) {
        if (isMounted) {
          setMermaidError(err.message || 'Error renderizando diagrama');
        }
      }
    }

    renderMermaid();
    return () => {
      isMounted = false;
    };
  }, [type, code]);

  const handleDownloadSvg = () => {
    const content = type === 'mermaid' ? mermaidSvg : code;
    if (!content) return;
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = type === 'mermaid' ? mermaidSvg : code;
    printWindow.document.write(`
      <html>
        <head>
          <title>${title} — Campito Jorox</title>
          <style>
            body { margin: 20px; font-family: sans-serif; text-align: center; background: #fff; color: #000; }
            h2 { margin-bottom: 8px; }
            svg { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          <p style="font-size: 12px; color: #666;">Campito Jorox — Parcelas 195 y 196</p>
          <div>${content}</div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const cleanSvg = (raw) => {
    if (!raw) return '';
    // Asegurar que el SVG sea responsivo
    return raw
      .replace(/<svg\s+/, '<svg style="max-width: 100%; height: auto; display: block; margin: 0 auto;" ')
      .trim();
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        border: '1.5px solid #00979d',
        backgroundColor: '#1e293b',
        color: '#ffffff',
        margin: '12px 0',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        ...(isFullscreen
          ? {
              position: 'fixed',
              top: 10,
              left: 10,
              right: 10,
              bottom: 10,
              zIndex: 9999,
              margin: 0,
            }
          : {}),
      }}
    >
      {/* Barra superior de herramientas del visualizador */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #334155',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
          {type === 'mermaid' ? '📊 Esquema de Flujo / Diagrama' : '📐 Plano Técnico / Croquis Vectorial'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            title="Alejar"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <ZoomOut size={16} />
          </button>
          <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            title="Acercar"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <ZoomIn size={16} />
          </button>

          <div style={{ width: 1, height: 16, backgroundColor: '#334155', margin: '0 4px' }} />

          <button
            onClick={handleDownloadSvg}
            title="Descargar SVG"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              backgroundColor: '#00979d',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Download size={14} /> Descargar
          </button>

          <button
            onClick={handlePrint}
            title="Imprimir plano"
            style={{
              background: '#334155',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Printer size={14} />
          </button>

          <button
            onClick={handleCopyCode}
            title="Copiar código"
            style={{
              background: '#334155',
              border: 'none',
              borderRadius: 6,
              color: copied ? '#4ade80' : '#ffffff',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {copied ? <Check size={14} /> : <Code size={14} />}
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Minimizar' : 'Pantalla completa'}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Área del plano o diagrama */}
      <div
        style={{
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0b1120',
          minHeight: 220,
          maxHeight: isFullscreen ? 'calc(100vh - 70px)' : 420,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease',
            width: '100%',
          }}
        >
          {type === 'mermaid' ? (
            mermaidError ? (
              <div style={{ color: '#f87171', fontSize: '0.82rem', textAlign: 'center', padding: 12 }}>
                ⚠️ Error renderizando diagrama Mermaid: {mermaidError}
                <pre style={{ marginTop: 8, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'left' }}>{code}</pre>
              </div>
            ) : mermaidSvg ? (
              <div dangerouslySetInnerHTML={{ __html: mermaidSvg }} />
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                Cargando diagrama Mermaid...
              </div>
            )
          ) : (
            <div dangerouslySetInnerHTML={{ __html: cleanSvg(code) }} />
          )}
        </div>
      </div>
    </div>
  );
}

