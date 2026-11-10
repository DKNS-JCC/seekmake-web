'use client';

// The viewer box: drop zone, 3D canvas, the active piece's size and the
// button to add another piece.

import { useState, type ChangeEvent, type DragEvent, type RefObject } from 'react';
import type { Pieza } from '@/lib/quote/types';
import { ACCEPT, MAX_FILES, MAX_FILE_MB } from './modelo';
import type { Visor as VisorRefs } from './useVisor';

export function Visor({
  visor,
  fileInputRef,
  numPiezas,
  activePieza,
  loadingFile,
  fileError,
  addFiles
}: {
  visor: VisorRefs;
  fileInputRef: RefObject<HTMLInputElement>;
  numPiezas: number;
  activePieza: Pieza | null;
  loadingFile: boolean;
  fileError: string | null;
  addFiles: (files: FileList | File[]) => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = '';
  }

  return (
    <div
      ref={visor.wrapRef}
      className={'qt-viewer' + (dragging ? ' dragging' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <canvas ref={visor.canvasRef} className="qt-canvas" />

      {!numPiezas && !loadingFile && (
        <button
          type="button"
          className="qt-drop"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="qt-drop-icon">
            <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </div>
          <div className="qt-drop-title">Arrastra aquí tus archivos 3D</div>
          <div className="qt-drop-sub">
            STL · 3MF · OBJ — hasta {MAX_FILE_MB} MB · máx. {MAX_FILES} piezas
          </div>
          <div className="qt-drop-aviso">
            Tu archivo no sale de tu navegador hasta que nos pides el presupuesto. Para ajustar
            precios guardamos 30 días una miniatura de la pieza y el precio calculado, sin datos
            tuyos (más en la política de privacidad).
          </div>
        </button>
      )}
      {loadingFile && <div className="qt-overlay-msg">Analizando pieza…</div>}
      {fileError && <div className="qt-overlay-err">{fileError}</div>}

      {activePieza && (
        <div className="qt-meta">
          <span className="qt-meta-file" title={activePieza.name}>
            {activePieza.name}
          </span>
          <span>
            {activePieza.metrics.bboxMm.x} × {activePieza.metrics.bboxMm.z} ×{' '}
            {activePieza.metrics.bboxMm.y} mm
          </span>
          <span>{activePieza.metrics.volumenCm3.toFixed(1)} cm³</span>
        </div>
      )}

      {numPiezas > 0 && numPiezas < MAX_FILES && (
        <button
          type="button"
          className="qt-changefile"
          onClick={() => fileInputRef.current?.click()}
        >
          + Añadir pieza
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onPick}
        style={{ display: 'none' }}
      />
    </div>
  );
}
