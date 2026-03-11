import { useEffect, useRef, useState } from 'react';

export default function SplitPane({
  left,
  right,
  initialLeftPercent = 50,
  minLeftPercent = 20,
  maxLeftPercent = 80,
}) {
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent);
  const [isMobile, setIsMobile] = useState(() => globalThis.innerWidth < 1024);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    function onResize() {
      setIsMobile(globalThis.innerWidth < 1024);
    }

    function onPointerMove(event) {
      if (!isDraggingRef.current || !containerRef.current || isMobile) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const nextPercent = Math.min(maxLeftPercent, Math.max(minLeftPercent, rawPercent));
      setLeftPercent(nextPercent);
    }

    function onPointerUp() {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    globalThis.addEventListener('resize', onResize);
    globalThis.addEventListener('pointermove', onPointerMove);
    globalThis.addEventListener('pointerup', onPointerUp);

    return () => {
      globalThis.removeEventListener('resize', onResize);
      globalThis.removeEventListener('pointermove', onPointerMove);
      globalThis.removeEventListener('pointerup', onPointerUp);
    };
  }, [isMobile, maxLeftPercent, minLeftPercent]);

  function onHandlePointerDown() {
    if (isMobile) {
      return;
    }

    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col overflow-hidden lg:flex-row">
      <div
        className="min-h-0 min-w-0 border-b border-amber-900/12 lg:h-full lg:border-b-0 lg:border-r dark:border-amber-200/20"
        style={isMobile ? { height: '50%' } : { width: `${leftPercent}%` }}
      >
        {left}
      </div>
      {isMobile ? null : (
        <button
          type="button"
          aria-label="Resize editor panes"
          onPointerDown={onHandlePointerDown}
          className="group relative hidden w-2.5 shrink-0 cursor-col-resize border-x border-amber-900/15 bg-gradient-to-b from-[#f6ecdc] to-[#ead8bf] hover:from-cyan-100/80 hover:to-cyan-200/75 lg:block dark:border-amber-200/20 dark:from-[#3a3228] dark:to-[#2f291f] dark:hover:from-cyan-800/35 dark:hover:to-cyan-700/30"
        >
          <span className="absolute left-1/2 top-1/2 h-12 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-700/55 transition-colors group-hover:bg-cyan-700 dark:bg-amber-100/45 dark:group-hover:bg-cyan-200" />
        </button>
      )}
      <div className="min-h-0 min-w-0 flex-1 border-t border-amber-900/10 lg:h-full lg:border-l lg:border-t-0 dark:border-amber-200/15">{right}</div>
    </div>
  );
}
