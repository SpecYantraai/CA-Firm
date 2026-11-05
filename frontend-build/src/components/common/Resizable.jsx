import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const readLS = (key, fallback) => {
  try { const v = localStorage.getItem(key); const n = Number(v); return v == null || Number.isNaN(n) ? fallback : n; }
  catch { return fallback; }
};
const writeLS = (key, val) => { try { localStorage.setItem(key, String(Math.round(val))); } catch { /* storage disabled */ } };

/** Boolean media-query hook (e.g. to disable resizing on small screens). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setMatches(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [query]);
  return matches;
}

/**
 * Owns a panel's width: persistence, clamping, pointer-drag, keyboard, collapse-snap.
 * Width is updated on a CSS variable imperatively while dragging (no re-renders),
 * and committed to React state + localStorage on release.
 *
 * Persistence: localStorage key `storageKey` (namespaced, try/catch guarded).
 */
export function useResizablePanel({
  storageKey, defaultWidth, minWidth, maxWidth,
  cssVar, targetRef, anchorRef, getMaxWidth,
  collapsible = false, collapseBelow = 0, collapsed = false, onCollapsedChange,
  disabled = false,
}) {
  const [width, setWidth] = useState(() => clamp(readLS(storageKey, defaultWidth), minWidth, maxWidth));
  const [dragging, setDragging] = useState(false);
  const liveWidth = useRef(width);
  const frame = useRef(0);
  const collapsedRef = useRef(collapsed);
  useEffect(() => { collapsedRef.current = collapsed; }, [collapsed]);

  const effMax = useCallback(() => {
    let m = maxWidth;
    if (getMaxWidth) { const g = getMaxWidth(); if (Number.isFinite(g)) m = Math.min(m, g); }
    return Math.max(minWidth, m);
  }, [maxWidth, minWidth, getMaxWidth]);

  const setVar = useCallback((w) => { targetRef?.current?.style.setProperty(cssVar, `${Math.round(w)}px`); }, [targetRef, cssVar]);

  const commit = useCallback((w) => {
    const c = clamp(w, minWidth, effMax());
    liveWidth.current = c;
    setWidth(c);
    writeLS(storageKey, c);
    return c;
  }, [minWidth, effMax, storageKey]);

  const reset = useCallback(() => {
    if (collapsible && collapsedRef.current) onCollapsedChange?.(false);
    commit(defaultWidth);
    setVar(clamp(defaultWidth, minWidth, effMax()));
  }, [collapsible, onCollapsedChange, commit, defaultWidth, setVar, minWidth, effMax]);

  const onPointerDown = useCallback((e) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    const handleEl = e.currentTarget;
    try { handleEl.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const panelLeft = anchorRef?.current ? anchorRef.current.getBoundingClientRect().left : 0;
    setDragging(true);
    document.body.classList.add('is-resizing');

    const move = (ev) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const raw = ev.clientX - panelLeft;
        const max = effMax();
        if (collapsible && raw < collapseBelow) {
          if (!collapsedRef.current) onCollapsedChange?.(true);
          setVar(clamp(raw, 48, max)); // keep the handle under the cursor while snapped to the rail
          return;
        }
        if (collapsible && collapsedRef.current && raw >= collapseBelow) onCollapsedChange?.(false);
        const w = clamp(raw, minWidth, max);
        liveWidth.current = w;
        setVar(w);
      });
    };
    const up = () => {
      cancelAnimationFrame(frame.current);
      try { handleEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(false);
      document.body.classList.remove('is-resizing');
      if (!(collapsible && collapsedRef.current)) commit(liveWidth.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [disabled, anchorRef, setVar, effMax, collapsible, collapseBelow, onCollapsedChange, minWidth, commit]);

  const onKeyDown = useCallback((e) => {
    if (disabled) return;
    const step = e.shiftKey ? 48 : 16;
    let handled = true;
    if (e.key === 'ArrowLeft') commit(liveWidth.current - step);
    else if (e.key === 'ArrowRight') commit(liveWidth.current + step);
    else if (e.key === 'Home') commit(minWidth);
    else if (e.key === 'End') commit(effMax());
    else if (e.key === 'Enter' || e.key === ' ') reset();
    else handled = false;
    if (handled) {
      e.preventDefault();
      if (collapsible && collapsedRef.current && e.key !== 'Enter' && e.key !== ' ') onCollapsedChange?.(false);
    }
  }, [disabled, commit, minWidth, effMax, reset, collapsible, onCollapsedChange]);

  return { width, dragging, onPointerDown, onKeyDown, reset, min: minWidth, max: maxWidth };
}

/**
 * Presentational, keyboard-accessible resize separator.
 * Position it with a `className` that sets `left` (e.g. `resize-sidebar`).
 */
export function ResizeHandle({ className = '', ariaLabel, width, min, max, dragging, onPointerDown, onKeyDown, onReset }) {
  return (
    <div
      className={`resize-handle ${dragging ? 'is-dragging' : ''} ${className}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    >
      <span className="resize-handle-grip" aria-hidden="true" />
    </div>
  );
}

/** Toggles data-top/data-bottom (scroll shadows) and .is-scrolling (auto-hide scrollbar). */
export function useScrollFades(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let hideTimer = 0;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const overflow = scrollHeight - clientHeight > 2;
      el.toggleAttribute('data-top', overflow && scrollTop > 2);
      el.toggleAttribute('data-bottom', overflow && scrollTop + clientHeight < scrollHeight - 2);
    };
    const onScroll = () => {
      update();
      el.classList.add('is-scrolling');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el.classList.remove('is-scrolling'), 800);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro;
    try { ro = new ResizeObserver(update); ro.observe(el); } catch { /* unsupported */ }
    return () => { el.removeEventListener('scroll', onScroll); ro?.disconnect(); clearTimeout(hideTimer); };
  }, [ref]);
}

/** Scrollable container with themed thin auto-hiding scrollbar + top/bottom scroll shadows. */
export function ScrollArea({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null);
  useScrollFades(ref);
  return <Tag ref={ref} className={`scroll-area ${className}`} {...rest}>{children}</Tag>;
}
