'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getOrCreateVoterId } from '@/lib/voter-id';
import type { Trabajo } from '@/lib/types';
import './TrabajosTimeline.css';
import { activable } from '@/lib/a11y';

type Vote = 'like' | 'dislike' | null;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export function TrabajosTimeline({
  trabajos: initial,
  showHint = true,
  emptyText = 'Aún no hay trabajos publicados.',
  autoScroll = false,
}: {
  trabajos: Trabajo[];
  showHint?: boolean;
  emptyText?: string;
  autoScroll?: boolean;
}) {
  const [trabajos, setTrabajos] = useState<Trabajo[]>(initial);
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [selected, setSelected] = useState<Trabajo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voterIdRef = useRef<string>('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const userScrollingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Sync from parent when initial changes (e.g. server hot-refresh in dev).
  useEffect(() => {
    setTrabajos(initial);
  }, [initial]);

  // Bootstrap the per-browser voter id and load this user's vote history
  // for all visible trabajos. The server is the source of truth so the
  // active state persists across navigations / devices on the same browser.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    voterIdRef.current = getOrCreateVoterId();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url || trabajos.length === 0 || !voterIdRef.current) return;

    const ids = trabajos.map((t) => t.id);
    const supabase = createClient();
    supabase
      .rpc('get_my_trabajo_votes', {
        p_voter_id: voterIdRef.current,
        p_trabajo_ids: ids
      })
      .then(({ data }) => {
        if (!data || !Array.isArray(data)) return;
        const map: Record<string, Vote> = {};
        for (const row of data as Array<{ trabajo_id: string; vote: string }>) {
          if (row.vote === 'like' || row.vote === 'dislike') {
            map[row.trabajo_id] = row.vote;
          }
        }
        setVotes(map);
      });
  }, [trabajos]);

  // ESC closes modal.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [selected]);


  const vote = async (t: Trabajo, target: 'like' | 'dislike') => {
    const voterId = voterIdRef.current;
    if (!voterId) return;

    const current = votes[t.id] ?? null;
    // Click the same button you already chose → server clears the vote.
    const rpcTarget: 'like' | 'dislike' | 'clear' =
      current === target ? 'clear' : target;

    // Optimistic deltas mirror what the server will compute.
    let likeDelta = 0;
    let dislikeDelta = 0;
    if (current === 'like') likeDelta -= 1;
    if (current === 'dislike') dislikeDelta -= 1;
    if (rpcTarget === 'like') likeDelta += 1;
    if (rpcTarget === 'dislike') dislikeDelta += 1;

    const snapshot = { likes: t.likes, dislikes: t.dislikes, vote: current };
    setTrabajos((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              likes: Math.max(0, x.likes + likeDelta),
              dislikes: Math.max(0, x.dislikes + dislikeDelta)
            }
          : x
      )
    );
    setVotes((v) => ({
      ...v,
      [t.id]: rpcTarget === 'clear' ? null : rpcTarget
    }));

    const supabase = createClient();
    const { data, error } = await supabase.rpc('vote_trabajo', {
      p_id: t.id,
      p_voter_id: voterId,
      p_target: rpcTarget
    });
    if (error) {
      // Revert to the snapshot.
      setTrabajos((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, likes: snapshot.likes, dislikes: snapshot.dislikes }
            : x
        )
      );
      setVotes((v) => ({ ...v, [t.id]: snapshot.vote }));
      return;
    }
    if (data && Array.isArray(data) && data[0]) {
      const row = data[0] as {
        likes: number;
        dislikes: number;
        my_vote: string | null;
      };
      setTrabajos((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, likes: row.likes, dislikes: row.dislikes }
            : x
        )
      );
      setVotes((v) => ({
        ...v,
        [t.id]:
          row.my_vote === 'like' || row.my_vote === 'dislike'
            ? row.my_vote
            : null
      }));
    }
  };

  // Pause auto-scroll while modal is open.
  useEffect(() => {
    if (autoScroll) pausedRef.current = !!selected;
  }, [selected, autoScroll]);

  // RAF auto-scroll. Pauses when the user is touching or dragging.
  // We detect interaction via touchstart/end and pointer events — NOT via
  // the scroll event, which would also fire when the RAF itself moves scrollLeft.
  useEffect(() => {
    if (!autoScroll) return;
    const el = wrapRef.current;
    if (!el || trabajos.length === 0) return;

    const SPEED = 0.8;
    let animId: number;

    const tick = () => {
      if (!pausedRef.current && !userScrollingRef.current) {
        const half = el.scrollWidth / 2;
        if (half > 0) {
          el.scrollLeft += SPEED;
          if (el.scrollLeft >= half) el.scrollLeft -= half;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    const pause = () => {
      userScrollingRef.current = true;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
    const resume = () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => { userScrollingRef.current = false; }, 1500);
    };

    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('touchend',   resume, { passive: true });
    el.addEventListener('touchcancel',resume, { passive: true });

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener('touchstart',  pause);
      el.removeEventListener('touchend',    resume);
      el.removeEventListener('touchcancel', resume);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [autoScroll, trabajos]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return; // touch handled by native scroll + touchstart/end
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollRef.current = wrapRef.current?.scrollLeft ?? 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    userScrollingRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !wrapRef.current) return;
    e.preventDefault();
    wrapRef.current.scrollLeft = dragStartScrollRef.current + (dragStartXRef.current - e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || !isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { userScrollingRef.current = false; }, 1500);
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (trabajos.length === 0) {
    return <div className="tr-empty">{emptyText}</div>;
  }

  // ── Marquee variant (home page) ───────────────────────────────────────
  if (autoScroll) {
    return (
      <>
        <div
          className={'tr-marquee-wrap' + (isDragging ? ' dragging' : '')}
          ref={wrapRef}
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = !!selected; }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="tr-marquee-inner">
            {[...trabajos, ...trabajos].map((t, i) => {
              const v = votes[t.id];
              return (
                <article
                  key={`${t.id}-${i}`}
                  className="tr-card tr-marquee-card"
                  {...activable(() => setSelected(t), `Ver ${t.titulo}`)}
                >
                  <div className="tr-card-inner">
                    <div className="tr-card-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.imagen} alt={t.titulo} loading="lazy" />
                    </div>
                    <div className="tr-card-body">
                      <h3 className="tr-card-title">{t.titulo}</h3>
                      <p className="tr-card-desc">{t.descripcion}</p>
                      {(t.material || t.etiquetas?.length > 0) && (
                        <div className="tr-card-meta">
                          {t.material && <span className="tr-card-material">{t.material}</span>}
                          {t.etiquetas?.slice(0, 2).map((e) => (
                            <span key={e} className="tr-card-tag">{e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Modal reutilizado */}
        <div
          className={'tr-modal-overlay' + (selected ? ' open' : '')}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          {selected && (
            <div className="tr-modal" role="dialog" aria-modal="true">
              <div className="tr-modal-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.imagen} alt={selected.titulo} />
              </div>
              <div className="tr-modal-body">
                <button className="tr-modal-close" onClick={() => setSelected(null)} aria-label="Cerrar">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="tr-modal-date">{formatDate(selected.fecha_efectiva)}</div>
                <div className="tr-modal-title">{selected.titulo}</div>
                <div className="tr-modal-desc" style={{ whiteSpace: 'pre-wrap' }}>{selected.descripcion}</div>
                {(selected.material || selected.etiquetas?.length > 0) && (
                  <div className="tr-card-meta" style={{ marginBottom: 20 }}>
                    {selected.material && <span className="tr-card-material">{selected.material}</span>}
                    {selected.etiquetas?.map((et) => <span key={et} className="tr-card-tag">{et}</span>)}
                  </div>
                )}
                <div className="tr-vote-row">
                  <button type="button" className={'tr-vote tr-like' + (votes[selected.id] === 'like' ? ' active' : '')} onClick={() => vote(selected, 'like')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={votes[selected.id] === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7l3-12L13 2a2.38 2.38 0 0 1 2 2z" /></svg>
                    <span>{selected.likes}</span>
                  </button>
                  <button type="button" className={'tr-vote tr-dislike' + (votes[selected.id] === 'dislike' ? ' active' : '')} onClick={() => vote(selected, 'dislike')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={votes[selected.id] === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17l-3 12-3 8a2.38 2.38 0 0 1-2-2z" /></svg>
                    <span>{selected.dislikes}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tr-timeline">
        <button
          type="button"
          className="tr-nav tr-nav-left"
          onClick={() => scrollBy(-1)}
          aria-label="Trabajos más recientes"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className="tr-nav tr-nav-right"
          onClick={() => scrollBy(1)}
          aria-label="Trabajos más antiguos"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <div className="tr-rail" />

        <div className="tr-track" ref={scrollRef}>
          <div className="tr-track-pad" />
          {trabajos.map((t) => {
            const v = votes[t.id];
            return (
              <article
                key={t.id}
                className="tr-card"
                {...activable(() => setSelected(t), `Ver ${t.titulo}`)}
              >
                <div className="tr-card-marker">
                  <span className="tr-card-date">{formatDate(t.fecha_efectiva)}</span>
                  <div className="tr-card-dot" />
                  <div className="tr-card-stem" />
                </div>
                <div className="tr-card-inner">
                  <div className="tr-card-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.imagen} alt={t.titulo} loading="lazy" />
                  </div>
                  <div className="tr-card-body">
                    <h3 className="tr-card-title">{t.titulo}</h3>
                    <p className="tr-card-desc">{t.descripcion}</p>
                    {(t.material || (t.etiquetas && t.etiquetas.length > 0)) && (
                      <div className="tr-card-meta">
                        {t.material && (
                          <span className="tr-card-material">{t.material}</span>
                        )}
                        {t.etiquetas?.slice(0, 2).map((e) => (
                          <span key={e} className="tr-card-tag">{e}</span>
                        ))}
                      </div>
                    )}
                    <div className="tr-vote-row">
                      <button
                        type="button"
                        className={'tr-vote tr-like' + (v === 'like' ? ' active' : '')}
                        onClick={(e) => {
                          e.stopPropagation();
                          vote(t, 'like');
                        }}
                        aria-pressed={v === 'like'}
                        aria-label="Me gusta"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={v === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7l3-12L13 2a2.38 2.38 0 0 1 2 2z" />
                        </svg>
                        <span>{t.likes}</span>
                      </button>
                      <button
                        type="button"
                        className={'tr-vote tr-dislike' + (v === 'dislike' ? ' active' : '')}
                        onClick={(e) => {
                          e.stopPropagation();
                          vote(t, 'dislike');
                        }}
                        aria-pressed={v === 'dislike'}
                        aria-label="No me gusta"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={v === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17l-3 12-3 8a2.38 2.38 0 0 1-2-2z" />
                        </svg>
                        <span>{t.dislikes}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="tr-track-pad" />
        </div>

        {showHint && (
          <div className="tr-timeline-hint">
            <span>← más reciente</span>
            <span>más antiguos →</span>
          </div>
        )}
      </div>

      {/* Modal */}
      <div
        className={'tr-modal-overlay' + (selected ? ' open' : '')}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="tr-modal" role="dialog" aria-modal="true">
            <div className="tr-modal-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.imagen} alt={selected.titulo} />
            </div>
            <div className="tr-modal-body">
              <button
                className="tr-modal-close"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="tr-modal-date">{formatDate(selected.fecha_efectiva)}</div>
              <div className="tr-modal-title">{selected.titulo}</div>
              <div className="tr-modal-desc" style={{ whiteSpace: 'pre-wrap' }}>
                {selected.descripcion}
              </div>

              {(selected.material || (selected.etiquetas && selected.etiquetas.length > 0)) && (
                <div className="tr-card-meta" style={{ marginBottom: 20 }}>
                  {selected.material && (
                    <span className="tr-card-material">{selected.material}</span>
                  )}
                  {selected.etiquetas?.map((et) => (
                    <span key={et} className="tr-card-tag">{et}</span>
                  ))}
                </div>
              )}

              <div className="tr-vote-row">
                <button
                  type="button"
                  className={
                    'tr-vote tr-like' +
                    (votes[selected.id] === 'like' ? ' active' : '')
                  }
                  onClick={() => vote(selected, 'like')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={votes[selected.id] === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7l3-12L13 2a2.38 2.38 0 0 1 2 2z" />
                  </svg>
                  <span>{selected.likes}</span>
                </button>
                <button
                  type="button"
                  className={
                    'tr-vote tr-dislike' +
                    (votes[selected.id] === 'dislike' ? ' active' : '')
                  }
                  onClick={() => vote(selected, 'dislike')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={votes[selected.id] === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17l-3 12-3 8a2.38 2.38 0 0 1-2-2z" />
                  </svg>
                  <span>{selected.dislikes}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
