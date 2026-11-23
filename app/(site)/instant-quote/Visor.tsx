'use client';

// The viewer box: drop zone, 3D canvas, the active piece's size and the
// button to add another piece.

import { useState, type ChangeEvent, type DragEvent, type RefObject } from 'react';
import type { Pieza } from '@/lib/quote/types';
import { ACCEPT, MAX_FILES } from './modelo';
import type { Visor as VisorRefs } from './useVisor';

/** mm → «4,5» cm: what anyone can picture. */
const cm = (mm: number) => (mm / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });

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
  /** Name of the file being opened, if any. */
  loadingFile: string | null;
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
          <span className="qt-drop-icon">
            <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </span>
          <span className="btn-primary qt-drop-btn">Sube tu archivo 3D</span>
        </button>
      )}
      {loadingFile && (
        <div className="qt-overlay-msg" role="status">
          <span className="cat-spinner qt-spinner" aria-hidden="true" />
          Abriendo {loadingFile}…
        </div>
      )}
      {fileError && <div className="qt-overlay-err">{fileError}</div>}

      {activePieza && (
        <div className="qt-meta">
          <span className="qt-meta-file" title={activePieza.name}>
            {activePieza.name}
          </span>
          <span>
            {cm(activePieza.metrics.bboxMm.x)} × {cm(activePieza.metrics.bboxMm.z)} ×{' '}
            {cm(activePieza.metrics.bboxMm.y)} cm
          </span>
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
