import { useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';

export default function LoremIpsum() {
  const [paragraphs, setParagraphs] = useState(3);
  const [text, setText] = useState('');
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const workerRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./loremWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'Lorem Ipsum generation failed.',
        });
        return;
      }

      setText(response.result || '');
      setStatus({
        type: 'success',
        message: `Generated ${response.paragraphs} paragraph${response.paragraphs === 1 ? '' : 's'}.`,
      });
    };

    worker.postMessage({
      type: 'generate',
      payload: { paragraphs: 3 },
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const stats = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    return { words, chars };
  }, [text]);

  function generate() {
    const nextValue = Math.min(20, Math.max(1, Number(paragraphs) || 1));

    if (!workerRef.current) {
      return;
    }

    setStatus({
      type: 'idle',
      message: 'Generating…',
    });

    workerRef.current.postMessage({
      type: 'generate',
      payload: { paragraphs: nextValue },
    });
  }

  async function copyText() {
    if (!text.trim()) {
      setStatus({
        type: 'error',
        message: 'Nothing to copy.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus({
        type: 'success',
        message: 'Copied text to clipboard.',
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to copy to clipboard.',
      });
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <button
            type="button"
            onClick={generate}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-2 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 md:py-1.5 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Generate
          </button>

          <button
            type="button"
            onClick={copyText}
            className="shrink-0 rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 md:py-1.5 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Copy
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <label className="flex shrink-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
            <span>Paragraphs</span>
            <input
              type="number"
              min={1}
              max={20}
              value={paragraphs}
              onChange={(event) => setParagraphs(event.target.value)}
              className="w-20 rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100"
            />
          </label>

          <p className="shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            {stats.words} words · {stats.chars} chars
          </p>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 p-3">
        <div className="h-full rounded-xl border border-amber-900/15 bg-[#fffaf2]/85 p-3 dark:border-amber-200/15 dark:bg-[#241f19]/90">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none rounded-lg border border-amber-900/20 bg-white p-3 font-mono text-sm text-amber-950 outline-none focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#2d261e] dark:text-amber-50"
          />
        </div>
      </div>
    </div>
  );
}
