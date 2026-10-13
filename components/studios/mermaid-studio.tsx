"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanMermaidSource, toggleDiagramOrientation } from "@/lib/computer/diagram";

export { cleanMermaidSource, toggleDiagramOrientation };

export interface MermaidStudioProps {
  chart: string;
  className?: string;
  fileName?: string;
}

export function MermaidStudio({ chart, className = "", fileName = "diagram" }: MermaidStudioProps) {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [orientation, setOrientation] = useState<"TD" | "LR" | "AUTO">("AUTO");

  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  const cleanSource = cleanMermaidSource(chart);
  const effectiveSource = orientation === "AUTO"
    ? cleanSource
    : toggleDiagramOrientation(cleanSource, orientation);

  // Render Mermaid to SVG via dynamic import
  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setLoading(true);
      setError(null);

      if (!effectiveSource) {
        setError("Empty diagram source.");
        setLoading(false);
        return;
      }

      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            darkMode: true,
            background: "#0c0c0e",
            primaryColor: "#1d2027",
            primaryTextColor: "#f4f4f5",
            primaryBorderColor: "#e7ff3a",
            lineColor: "#e7ff3a",
            secondaryColor: "#181a20",
            tertiaryColor: "#121316",
            fontFamily: "monospace, system-ui, sans-serif",
          },
          securityLevel: "loose",
        });

        const id = `mermaid-canvas-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, effectiveSource);

        if (!cancelled) {
          setSvgHtml(svg);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setLoading(false);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [effectiveSource]);

  // Pan controls
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => Math.min(4, Math.max(0.2, prev * zoomFactor)));
  }, []);

  // Zoom actions
  const zoomIn = () => setScale((prev) => Math.min(4, prev * 1.25));
  const zoomOut = () => setScale((prev) => Math.max(0.2, prev * 0.8));
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Toggle layout direction
  const cycleOrientation = () => {
    if (orientation === "AUTO") setOrientation("LR");
    else if (orientation === "LR") setOrientation("TD");
    else setOrientation("AUTO");
  };

  // Export as SVG
  const exportSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export as PNG
  const exportPng = () => {
    if (!svgHtml) return;
    const svgBlob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
    const URLObject = window.URL || window.webkitURL || window;
    const svgUrl = URLObject.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scaleFactor = 2; // High-DPI export
      canvas.width = img.width * scaleFactor;
      canvas.height = img.height * scaleFactor;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Dark background
      ctx.fillStyle = "#0c0c0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `${fileName.replace(/\.[^/.]+$/, "")}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
        URLObject.revokeObjectURL(svgUrl);
      }, "image/png");
    };

    img.src = svgUrl;
  };

  return (
    <div className={`relative flex h-full flex-col overflow-hidden bg-[#0c0c0e] ${className}`}>
      {/* Floating Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#14151a]/90 p-1.5 backdrop-blur-md shadow-lg">
        {/* Layout Orientation Button */}
        <button
          type="button"
          onClick={cycleOrientation}
          title={`Layout Orientation: ${orientation} (Click to toggle)`}
          className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          {orientation === "AUTO" ? "📐 Auto" : orientation === "LR" ? "➡️ LR" : "⬇️ TD"}
        </button>

        <div className="mx-0.5 h-3.5 w-px bg-white/15" />

        <button
          type="button"
          onClick={zoomOut}
          title="Zoom Out"
          className="rounded-lg p-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={resetView}
          title="Reset View"
          className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          title="Zoom In"
          className="rounded-lg p-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="mx-1 h-3.5 w-px bg-white/15" />

        <button
          type="button"
          onClick={exportSvg}
          title="Export as SVG"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#e7ff3a] hover:bg-[#e7ff3a]/10 transition"
        >
          SVG
        </button>

        <button
          type="button"
          onClick={exportPng}
          title="Export as PNG"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/10 transition"
        >
          PNG
        </button>
      </div>

      {/* Main Interactive Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`relative flex h-full flex-1 items-center justify-center overflow-hidden p-6 select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-white/50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e7ff3a] border-t-transparent" />
            <span className="font-mono text-xs">Rendering Mermaid diagram…</span>
          </div>
        ) : error ? (
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-950/20 p-5 text-left text-xs text-red-200">
            <div className="flex items-center gap-2 font-semibold text-red-400 mb-2">
              <span>⚠️</span>
              <span>Mermaid Diagram Syntax Error</span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-red-300/80 whitespace-pre-wrap">{error}</p>
            <p className="mt-3 text-[11px] text-white/40">Switch to the Source tab to edit the diagram definition.</p>
          </div>
        ) : (
          <div
            ref={svgWrapperRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.05s ease-out",
            }}
            className="flex items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:drop-shadow-lg"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Bottom Hint Footer */}
      <div className="flex items-center justify-between border-t border-white/5 bg-black/40 px-4 py-2 font-mono text-[11px] text-white/40">
        <span>Drag to pan • Scroll to zoom</span>
        <span>Interactive Mermaid Studio</span>
      </div>
    </div>
  );
}
