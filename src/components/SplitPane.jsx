import { useEffect, useRef, useState } from 'react';

export default function SplitPane({
  left,
  right,
  initialLeftPercent = 50,
  minLeftPercent = 20,
  maxLeftPercent = 80,
}) {
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    function onMouseMove(event) {
      if (!isDraggingRef.current || !containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const nextPercent = Math.min(maxLeftPercent, Math.max(minLeftPercent, rawPercent));
      setLeftPercent(nextPercent);
    }

    function onMouseUp() {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [maxLeftPercent, minLeftPercent]);

  function onHandleMouseDown() {
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div className="h-full min-w-0 border-r border-amber-900/12 dark:border-amber-200/20" style={{ width: `${leftPercent}%` }}>
        {left}
      </div>
      <button
        type="button"
        aria-label="Resize editor panes"
        onMouseDown={onHandleMouseDown}
        className="group relative w-2.5 shrink-0 cursor-col-resize border-x border-amber-900/15 bg-gradient-to-b from-[#f6ecdc] to-[#ead8bf] hover:from-cyan-100/80 hover:to-cyan-200/75 dark:border-amber-200/20 dark:from-[#3a3228] dark:to-[#2f291f] dark:hover:from-cyan-800/35 dark:hover:to-cyan-700/30"
      >
        <span className="absolute left-1/2 top-1/2 h-12 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-700/55 transition-colors group-hover:bg-cyan-700 dark:bg-amber-100/45 dark:group-hover:bg-cyan-200" />
      </button>
      <div className="h-full min-w-0 flex-1 border-l border-amber-900/10 dark:border-amber-200/15">{right}</div>
    </div>
  );
}
