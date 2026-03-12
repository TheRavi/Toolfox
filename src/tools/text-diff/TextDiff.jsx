import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';

const INITIAL_LEFT = `The quick brown fox\njumps over\nthe lazy dog.`;
const INITIAL_RIGHT = `The quick brown fox\njumped over\nthe very lazy dog.`;

export default function TextDiff() {
  const [leftText, setLeftText] = useState(INITIAL_LEFT);
  const [rightText, setRightText] = useState(INITIAL_RIGHT);
  const [showSideBySide, setShowSideBySide] = useState(true);
  const [ignoreTrimWhitespace, setIgnoreTrimWhitespace] = useState(true);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const [diffSummary, setDiffSummary] = useState({
    hunks: 0,
    added: 0,
    removed: 0,
  });

  const diffEditorRef = useRef(null);
  const disposablesRef = useRef([]);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);

  const getEditorTexts = useCallback(() => {
    const models = diffEditorRef.current?.getModel();

    return {
      left: models?.original?.getValue() ?? leftText,
      right: models?.modified?.getValue() ?? rightText,
    };
  }, [leftText, rightText]);

  const requestSummary = useCallback(({ originalText, modifiedText }) => {
    if (!workerRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    workerRef.current.postMessage({
      type: 'summarize',
      payload: {
        requestId,
        originalText,
        modifiedText,
        ignoreTrimWhitespace,
      },
    });
  }, [ignoreTrimWhitespace]);

  const requestSummaryFromEditor = useCallback(() => {
    const { left, right } = getEditorTexts();
    requestSummary({ originalText: left, modifiedText: right });
  }, [getEditorTexts, requestSummary]);

  const summaryText = useMemo(() => {
    const { hunks, added, removed } = diffSummary;
    return `${hunks} hunk${hunks === 1 ? '' : 's'} · +${added} -${removed}`;
  }, [diffSummary]);

  useEffect(
    () => () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
    },
    [],
  );

  useEffect(() => {
    const worker = new Worker(new URL('./textDiffWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response) {
        return;
      }

      if (typeof response.requestId === 'number' && response.requestId !== requestIdRef.current) {
        return;
      }

      if (!response.success) {
        setStatus({ type: 'error', message: response?.error?.message || 'Diff summary failed.' });
        return;
      }

      const result = response.result ?? {};

      setDiffSummary({
        hunks: Number(result.hunks) || 0,
        added: Number(result.added) || 0,
        removed: Number(result.removed) || 0,
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  async function copyText(side) {
    const { left, right } = getEditorTexts();
    const value = side === 'left' ? left : right;
    const label = side === 'left' ? 'Left' : 'Right';

    if (!value.length) {
      setStatus({ type: 'error', message: `No ${label} text to copy.` });
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setStatus({ type: 'success', message: `${label} text copied.` });
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy to clipboard.' });
    }
  }

  function clearAll() {
    setLeftText('');
    setRightText('');
    setStatus({ type: 'idle', message: 'Both panes cleared.' });
    requestSummary({ originalText: '', modifiedText: '' });
  }

  function swapSides() {
    const { left, right } = getEditorTexts();
    setLeftText(right);
    setRightText(left);
    setStatus({ type: 'success', message: 'Left and right panes swapped.' });
    requestSummary({ originalText: right, modifiedText: left });
  }

  function onMount(editor) {
    diffEditorRef.current = editor;

    disposablesRef.current.forEach((disposable) => disposable.dispose());
    disposablesRef.current = [];

    const models = editor.getModel();

    if (!models) {
      return;
    }

    const onOriginalChange = models.original.onDidChangeContent(() => {
      requestSummaryFromEditor();
    });

    const onModifiedChange = models.modified.onDidChangeContent(() => {
      requestSummaryFromEditor();
    });

    disposablesRef.current = [onOriginalChange, onModifiedChange];

    requestSummaryFromEditor();
  }

  useEffect(() => {
    requestSummaryFromEditor();
  }, [ignoreTrimWhitespace, requestSummaryFromEditor]);

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <button
            type="button"
            onClick={swapSides}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-2 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 md:py-1.5 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Swap Sides
          </button>

          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 md:py-1.5 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => copyText('left')}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 md:py-1.5 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Copy Left
          </button>

          <button
            type="button"
            onClick={() => copyText('right')}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 md:py-1.5 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Copy Right
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <label className="flex shrink-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
            <input
              type="checkbox"
              checked={showSideBySide}
              onChange={(event) => setShowSideBySide(event.target.checked)}
              className="h-4 w-4 rounded border-amber-900/30 text-cyan-700 focus:ring-cyan-500"
            />
            <span>Side by side</span>
          </label>

          <label className="flex shrink-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
            <input
              type="checkbox"
              checked={ignoreTrimWhitespace}
              onChange={(event) => setIgnoreTrimWhitespace(event.target.checked)}
              className="h-4 w-4 rounded border-amber-900/30 text-cyan-700 focus:ring-cyan-500"
            />
            <span>Ignore trim whitespace</span>
          </label>

          <p className="shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            {summaryText}
          </p>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={`${status.message} · ${summaryText}`} />

      <div className="min-h-0 flex-1 p-2 md:p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Left (Original)
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Right (Modified)
          </p>
        </div>

        <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
          <DiffEditor
            height="100%"
            original={leftText}
            modified={rightText}
            theme="vs-light"
            onMount={onMount}
            options={{
              automaticLayout: true,
              renderSideBySide: showSideBySide,
              ignoreTrimWhitespace,
              originalEditable: true,
              readOnly: false,
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 13,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
      </div>
    </div>
  );
}
