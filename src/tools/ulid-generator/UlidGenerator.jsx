import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';

export default function UlidGenerator() {
  const [count, setCount] = useState(1);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const workerRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./ulidWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'ULID generation failed.',
        });
        return;
      }

      const result = Array.isArray(response.result) ? response.result : [];
      setItems(result);
      setStatus({
        type: 'success',
        message: `Generated ${result.length} ULID${result.length === 1 ? '' : 's'}.`,
      });
    };

    worker.postMessage({ type: 'generate', payload: { count: 1 } });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const allItemsText = useMemo(() => items.join('\n'), [items]);

  const generate = useCallback(() => {
    if (!workerRef.current) {
      return;
    }

    setStatus({ type: 'idle', message: 'Generating…' });

    workerRef.current.postMessage({
      type: 'generate',
      payload: { count },
    });
  }, [count]);

  const copyAll = useCallback(async () => {
    if (!items.length) {
      setStatus({
        type: 'error',
        message: 'Nothing to copy.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(allItemsText);
      setStatus({
        type: 'success',
        message: `Copied ${items.length} ULID${items.length === 1 ? '' : 's'} to clipboard.`,
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to copy to clipboard.',
      });
    }
  }, [allItemsText, items.length]);

  const copyOne = useCallback(async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({
        type: 'success',
        message: `Copied ULID ${value}.`,
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to copy to clipboard.',
      });
    }
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            className="rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Generate
          </button>

          <button
            type="button"
            onClick={copyAll}
            className="rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Copy All
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1 text-sm text-amber-900 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
            Count
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCount(Number.isNaN(next) ? 1 : next);
              }}
              className="w-20 rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100"
            />
          </label>

          <p className="rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            Generates lexicographically sortable ULIDs.
          </p>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="rounded-xl border border-amber-900/15 bg-[#fffaf2]/85 p-3 dark:border-amber-200/15 dark:bg-[#241f19]/90">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
            ULIDs ({items.length})
          </p>

          <div className="space-y-1 font-mono text-sm text-amber-950 dark:text-amber-50">
            {items.map((value, index) => (
              <div
                key={`${value}-${index}`}
                className="flex items-center gap-2 rounded-md border border-amber-900/15 bg-amber-50/70 px-2 py-1 dark:border-amber-200/15 dark:bg-[#2d261e]/75"
              >
                <p className="min-w-0 flex-1 overflow-x-auto">{value}</p>
                <button
                  type="button"
                  onClick={() => copyOne(value)}
                  className="shrink-0 rounded border border-cyan-800/30 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-900 transition-colors hover:bg-cyan-100 dark:border-cyan-300/25 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
