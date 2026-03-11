import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import SplitPane from '../../components/SplitPane';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';
import { getIndentation, setIndentation } from '../../core/settingsStore';

const INITIAL_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<toolbox>\n  <tool name="xml-formatter" enabled="true"/>\n</toolbox>`;

export default function XmlFormatter() {
  const [input, setInput] = useState(INITIAL_XML);
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(getIndentation());
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready' });
  const workerRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./xmlWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'XML operation failed.',
        });
        return;
      }

      if (response.result === 'valid') {
        setStatus({ type: 'success', message: 'XML is valid.' });
        return;
      }

      if (typeof response.result === 'string') {
        setOutput(response.result);
      }

      setStatus({ type: 'success', message: 'Operation completed successfully.' });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  function onIndentationChange(event) {
    const nextIndent = Number(event.target.value) === 4 ? 4 : 2;
    setIndent(nextIndent);
    setIndentation(nextIndent);
  }

  const runOperation = useCallback((type) => {
    if (!workerRef.current) {
      return;
    }

    setStatus({ type: 'idle', message: 'Processing…' });

    workerRef.current.postMessage({
      type,
      payload: {
        text: input,
        indent,
      },
    });
  }, [indent, input]);

  const runFormat = useCallback(() => {
    runOperation('format');
  }, [runOperation]);

  const runMinify = useCallback(() => {
    runOperation('minify');
  }, [runOperation]);

  const runValidate = useCallback(() => {
    runOperation('validate');
  }, [runOperation]);

  const onCopyOutput = useCallback(async () => {
    if (!output.trim()) {
      setStatus({ type: 'idle', message: 'Nothing to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setStatus({ type: 'success', message: 'Output copied to clipboard.' });
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy output.' });
    }
  }, [output]);

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={runFormat}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Format
          </button>
          <button
            type="button"
            onClick={runMinify}
            className="shrink-0 rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Minify
          </button>
          <button
            type="button"
            onClick={runValidate}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Validate
          </button>

          <div className="mx-1 hidden h-6 w-px shrink-0 bg-amber-900/20 dark:bg-amber-200/20 md:block" />

          <button
            type="button"
            onClick={onCopyOutput}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/70 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/75 dark:border-cyan-300/35 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
          >
            Copy Output
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <p className="mr-1 shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            Format, minify, and validate XML.
          </p>

          <label className="flex shrink-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1 text-sm text-amber-900 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
            Indent
            <select
              value={indent}
              onChange={onIndentationChange}
              className="rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100"
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
            </select>
          </label>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Input (XML)
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Output
          </p>
        </div>

        <SplitPane
          left={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                language="xml"
                value={input}
                onChange={(value) => setInput(value ?? '')}
                theme="vs-light"
                options={{
                  automaticLayout: true,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  minimap: { enabled: false },
                  padding: { top: 12, bottom: 12 },
                  fontSize: 13,
                }}
              />
            </div>
          }
          right={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                language="xml"
                value={output}
                theme="vs-light"
                options={{
                  automaticLayout: true,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  readOnly: true,
                  minimap: { enabled: false },
                  padding: { top: 12, bottom: 12 },
                  fontSize: 13,
                }}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}
