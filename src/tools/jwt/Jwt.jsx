import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import SplitPane from '../../components/SplitPane';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';

const INITIAL_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.eyJzdWIiOiJ0b29sZm94Iiwicm9sZSI6ImRldiJ9.';
const INITIAL_PAYLOAD = '{\n  "sub": "toolfox",\n  "role": "dev"\n}';
const INITIAL_HEADER = '{\n  "typ": "JWT"\n}';

export default function Jwt() {
  const [mode, setMode] = useState('decode');
  const [tokenInput, setTokenInput] = useState(INITIAL_TOKEN);
  const [payloadInput, setPayloadInput] = useState(INITIAL_PAYLOAD);
  const [headerInput, setHeaderInput] = useState(INITIAL_HEADER);
  const [algorithm, setAlgorithm] = useState('none');
  const [secret, setSecret] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready' });

  const workerRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./jwtWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'JWT operation failed.',
        });
        return;
      }

      const result = response.result ?? {};

      if (mode === 'encode') {
        setOutput(result.token || '');
        setStatus({ type: 'success', message: 'JWT token generated.' });
        return;
      }

      if (mode === 'verify') {
        setOutput(JSON.stringify(result, null, 2));
        setStatus({
          type: result.valid ? 'success' : 'error',
          message: result.valid ? 'JWT signature is valid.' : 'JWT signature is invalid.',
        });
        return;
      }

      setOutput(JSON.stringify(result, null, 2));
      setStatus({ type: 'success', message: 'JWT decoded.' });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [mode]);

  const runOperation = useCallback(() => {
    if (!workerRef.current) {
      return;
    }

    setStatus({ type: 'idle', message: 'Processing…' });

    if (mode === 'encode') {
      workerRef.current.postMessage({
        type: 'encode',
        payload: {
          payloadText: payloadInput,
          headerText: headerInput,
          algorithm,
          secret,
        },
      });
      return;
    }

    if (mode === 'verify') {
      workerRef.current.postMessage({
        type: 'verify',
        payload: {
          token: tokenInput,
          secret,
        },
      });
      return;
    }

    workerRef.current.postMessage({
      type: 'decode',
      payload: {
        token: tokenInput,
      },
    });
  }, [algorithm, headerInput, mode, payloadInput, secret, tokenInput]);

  const copyOutput = useCallback(async () => {
    if (!output.trim()) {
      setStatus({ type: 'error', message: 'No output to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setStatus({ type: 'success', message: 'Output copied to clipboard.' });
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy to clipboard.' });
    }
  }, [output]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runOperation();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyOutput();
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [runOperation, copyOutput]);

  const inputLabel = mode === 'encode' ? 'Input (Payload JSON)' : 'Input (JWT)';
  const outputLabel = mode === 'encode' ? 'Output (JWT)' : 'Output (JSON)';
  const inputLanguage = mode === 'encode' ? 'json' : 'plaintext';
  const outputLanguage = mode === 'encode' ? 'plaintext' : 'json';

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <button
            type="button"
            onClick={() => { setMode('decode'); setOutput(''); setStatus({ type: 'idle', message: 'Ready' }); }}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
              mode === 'decode'
                ? 'border-cyan-700/30 bg-cyan-100/75 text-cyan-900 hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45'
                : 'border-amber-900/25 bg-white/95 text-amber-900 hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]'
            }`}
          >
            Decode
          </button>

          <button
            type="button"
            onClick={() => { setMode('encode'); setOutput(''); setStatus({ type: 'idle', message: 'Ready' }); }}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
              mode === 'encode'
                ? 'border-cyan-700/30 bg-cyan-100/75 text-cyan-900 hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45'
                : 'border-amber-900/25 bg-white/95 text-amber-900 hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]'
            }`}
          >
            Encode
          </button>

          <button
            type="button"
            onClick={() => { setMode('verify'); setOutput(''); setStatus({ type: 'idle', message: 'Ready' }); }}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
              mode === 'verify'
                ? 'border-cyan-700/30 bg-cyan-100/75 text-cyan-900 hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45'
                : 'border-amber-900/25 bg-white/95 text-amber-900 hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]'
            }`}
          >
            Verify
          </button>

          <div className="mx-1 hidden h-6 w-px shrink-0 bg-amber-900/20 dark:bg-amber-200/20 md:block" />

          <button
            type="button"
            onClick={runOperation}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/70 px-3 py-2 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/75 md:py-1.5 dark:border-cyan-300/35 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
          >
            Run
          </button>

          <button
            type="button"
            onClick={copyOutput}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 md:py-1.5 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Copy Output
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          {mode === 'encode' ? (
            <>
              <label className="flex shrink-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
                <span>Algorithm</span>
                <select
                  value={algorithm}
                  onChange={(event) => setAlgorithm(event.target.value === 'HS256' ? 'HS256' : 'none')}
                  className="rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100"
                >
                  <option value="none">none</option>
                  <option value="HS256">HS256</option>
                </select>
              </label>

              <label className="flex min-w-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
                <span>Secret</span>
                <input
                  type="text"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="Required for HS256"
                  className="w-44 rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none placeholder:text-amber-900/40 focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100 dark:placeholder:text-amber-100/45"
                />
              </label>

              <label className="flex min-w-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
                <span>Header JSON</span>
                <input
                  type="text"
                  value={headerInput}
                  onChange={(event) => setHeaderInput(event.target.value)}
                  placeholder='{"typ":"JWT"}'
                  className="w-52 rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none placeholder:text-amber-900/40 focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100 dark:placeholder:text-amber-100/45"
                />
              </label>

              <p className="shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
                ⌘↵ Run · ⌘⇧C Copy
              </p>
            </>
          ) : (
            <>
              <label className="flex min-w-0 items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 md:py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
                <span>Secret</span>
                <input
                  type="text"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={mode === 'verify' ? 'Required for HS256 verify' : 'Optional'}
                  className="w-56 rounded border border-amber-900/20 bg-white px-2 py-1 text-amber-950 outline-none placeholder:text-amber-900/40 focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100 dark:placeholder:text-amber-100/45"
                />
              </label>

              <p className="shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
                ⌘↵ Run · ⌘⇧C Copy
              </p>
            </>
          )}
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 p-2 md:p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {inputLabel}
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {outputLabel}
          </p>
        </div>

        <SplitPane
          left={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                language={inputLanguage}
                value={mode === 'encode' ? payloadInput : tokenInput}
                onChange={(value) => {
                  if (mode === 'encode') {
                    setPayloadInput(value ?? '');
                    return;
                  }

                  setTokenInput(value ?? '');
                }}
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
