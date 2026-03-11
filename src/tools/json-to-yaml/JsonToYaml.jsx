import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import SplitPane from '../../components/SplitPane';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';
import { getIndentation, setIndentation } from '../../core/settingsStore';

const INITIAL_JSON = '{\n  "name": "YAML Converter",\n  "version": 1,\n  "features": ["json-to-yaml", "yaml-to-json"]\n}';

export default function JsonToYaml() {
  const [input, setInput] = useState(INITIAL_JSON);
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(getIndentation());
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const [mode, setMode] = useState('json-to-yaml'); // Direction of conversion

  const workerRef = useRef(null);
  const outputEditorRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./yamlWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        const err = response?.error ?? {
          message: 'Conversion failed.',
          line: 1,
          column: 1,
        };

        setStatus({
          type: 'error',
          message: `${err.message} (line ${err.line}, col ${err.column})`,
        });
        setOutput('');
        return;
      }

      setOutput(response.result);
      setStatus({
        type: 'success',
        message: 'Conversion successful.',
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const runConversion = useCallback(
    (conversionMode) => {
      if (!workerRef.current || !input.trim()) {
        setOutput('');
        setStatus({
          type: 'idle',
          message: 'Enter input to convert',
        });
        return;
      }

      setStatus({
        type: 'idle',
        message: 'Converting…',
      });

      workerRef.current.postMessage({
        type: conversionMode,
        payload: {
          text: input,
          indent,
        },
      });
    },
    [indent, input],
  );

  function onIndentationChange(event) {
    const nextIndent = Number(event.target.value) === 4 ? 4 : 2;
    setIndent(nextIndent);
    setIndentation(nextIndent);
  }

  const convertToYAML = useCallback(() => {
    setMode('json-to-yaml');
    runConversion('json-to-yaml');
  }, [runConversion]);

  const convertToJSON = useCallback(() => {
    setMode('yaml-to-json');
    runConversion('yaml-to-json');
  }, [runConversion]);

  const onCopyOutput = useCallback(async () => {
    if (!output) {
      setStatus({
        type: 'idle',
        message: 'Nothing to copy',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setStatus({
        type: 'success',
        message: 'Copied to clipboard',
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to copy to clipboard',
      });
    }
  }, [output]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runConversion(mode);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        onCopyOutput();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        convertToYAML();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'j'
      ) {
        event.preventDefault();
        convertToJSON();
        return;
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [runConversion, mode, convertToYAML, convertToJSON, onCopyOutput]);

  const inputLanguage = mode === 'json-to-yaml' ? 'json' : 'yaml';
  const outputLanguage = mode === 'json-to-yaml' ? 'yaml' : 'json';

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={convertToYAML}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
              mode === 'json-to-yaml'
                ? 'border-cyan-700/30 bg-cyan-100/75 text-cyan-900 hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45'
                : 'border-amber-900/25 bg-white/95 text-amber-900 hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]'
            }`}
          >
            JSON → YAML
          </button>
          <button
            type="button"
            onClick={convertToJSON}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
              mode === 'yaml-to-json'
                ? 'border-cyan-700/30 bg-cyan-100/75 text-cyan-900 hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45'
                : 'border-amber-900/25 bg-white/95 text-amber-900 hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]'
            }`}
          >
            YAML → JSON
          </button>

          <div className="mx-1 shrink-0 hidden h-6 w-px bg-amber-900/20 dark:bg-amber-200/20 md:block" />

          <button
            type="button"
            onClick={onCopyOutput}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/70 px-3 py-2 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/75 md:py-1.5 dark:border-cyan-300/35 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
          >
            Copy Output
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <p className="mr-1 shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            ⌘↵ Convert · ⌘⇧Y JSON→YAML · ⌘⇧J YAML→JSON · ⌘C Copy
          </p>

          <label className="shrink-0 flex items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
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

      <div className="min-h-0 flex-1 p-2 md:p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {mode === 'json-to-yaml' ? 'Input (JSON)' : 'Input (YAML)'}
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {mode === 'json-to-yaml' ? 'Output (YAML)' : 'Output (JSON)'}
          </p>
        </div>

        <SplitPane
          left={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                language={inputLanguage}
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
                language={outputLanguage}
                value={output}
                onMount={(editor) => {
                  outputEditorRef.current = editor;
                }}
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
