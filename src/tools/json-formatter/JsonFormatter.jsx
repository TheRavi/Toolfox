import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import SplitPane from '../../components/SplitPane';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';
import CommandPalette from '../../components/CommandPalette';
import { getIndentation, setIndentation } from '../../core/settingsStore';

const INITIAL_INPUT = '{\n  "name": "Devtils",\n  "version": 1,\n  "features": ["format", "minify", "validate"]\n}';

export default function JsonFormatter() {
  const [input, setInput] = useState(INITIAL_INPUT);
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(getIndentation());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState({
    matches: [],
    activeIndex: -1,
    query: '',
  });
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const workerRef = useRef(null);
  const outputEditorRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    // Parsing/serialization is offloaded to a worker to keep the UI responsive
    // with large multi-MB JSON payloads.
    const worker = new Worker(new URL('./jsonWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (!response?.success) {
        const err = response?.error ?? {
          message: 'JSON processing failed.',
          line: 1,
          column: 1,
        };

        setStatus({
          type: 'error',
          message: `${err.message} (line ${err.line}, col ${err.column})`,
        });
        setSearchState({ matches: [], activeIndex: -1, query: '' });
        return;
      }

      if (typeof response.result === 'string' && response.result !== 'Valid JSON') {
        setOutput(response.result);
        setSearchState({ matches: [], activeIndex: -1, query: '' });
      }

      setStatus({
        type: 'success',
        message:
          response.result === 'Valid JSON'
            ? 'JSON is valid.'
            : 'Operation completed successfully.',
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const runOperation = useCallback((type) => {
    if (!workerRef.current) {
      return;
    }

    setStatus({
      type: 'idle',
      message: 'Processing…',
    });

    workerRef.current.postMessage({
      type,
      payload: {
        text: input,
        indent,
      },
    });
  }, [indent, input]);

  function onIndentationChange(event) {
    const nextIndent = Number(event.target.value) === 4 ? 4 : 2;
    setIndent(nextIndent);
    setIndentation(nextIndent);
  }

  async function onCopyOutput() {
    if (!output.trim()) {
      setStatus({ type: 'error', message: 'No output available to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setStatus({ type: 'success', message: 'Output copied to clipboard.' });
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy output to clipboard.' });
    }
  }

  function focusMatch(match) {
    if (!outputEditorRef.current || !match) {
      return;
    }

    outputEditorRef.current.setSelection(match.range);
    outputEditorRef.current.revealRangeInCenter(match.range);
    outputEditorRef.current.focus();
  }

  function onSearchOutput() {
    const query = searchQuery.trim();
    const editor = outputEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model) {
      return;
    }

    if (!query) {
      setSearchState({ matches: [], activeIndex: -1, query: '' });
      setStatus({ type: 'error', message: 'Enter a search value for output.' });
      return;
    }

    const matches = model.findMatches(query, false, false, false, null, false);

    if (!matches.length) {
      setSearchState({ matches: [], activeIndex: -1, query });
      setStatus({ type: 'error', message: `No matches for "${query}".` });
      return;
    }

    const nextIndex = 0;

    focusMatch(matches[nextIndex]);
    setSearchState({ matches, activeIndex: nextIndex, query });
    setStatus({
      type: 'success',
      message: `Match ${nextIndex + 1} of ${matches.length}.`,
    });
  }

  const navigateSearch = useCallback((direction) => {
    if (!searchState.matches.length || searchState.activeIndex < 0) {
      setStatus({ type: 'error', message: 'Run search first to navigate matches.' });
      return;
    }

    const total = searchState.matches.length;
    const nextIndex = (searchState.activeIndex + direction + total) % total;
    const nextMatch = searchState.matches[nextIndex];

    focusMatch(nextMatch);
    setSearchState((previous) => ({
      ...previous,
      activeIndex: nextIndex,
    }));
    setStatus({
      type: 'success',
      message: `Match ${nextIndex + 1} of ${total}.`,
    });
  }, [searchState]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setIsPaletteOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runOperation('format');
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        runOperation('minify');
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        runOperation('validate');
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigateSearch, runOperation]);

  function handleCommandSelect(commandId) {
    switch (commandId) {
      case 'format':
        runOperation('format');
        break;
      case 'minify':
        runOperation('minify');
        break;
      case 'validate':
        runOperation('validate');
        break;
      case 'copy':
        onCopyOutput();
        break;
      case 'search':
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        break;
      case 'theme':
        // This will be handled by parent passing themeMode prop
        break;
      default:
        break;
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSelect={handleCommandSelect}
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2 overflow-x-hidden">
          <button
            type="button"
            onClick={() => runOperation('format')}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Format
          </button>
          <button
            type="button"
            onClick={() => runOperation('minify')}
            className="shrink-0 rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Minify
          </button>
          <button
            type="button"
            onClick={() => runOperation('validate')}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Validate
          </button>

          <div className="mx-1 shrink-0 hidden h-6 w-px bg-amber-900/20 dark:bg-amber-200/20 md:block" />

          <button
            type="button"
            onClick={onCopyOutput}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/70 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/75 dark:border-cyan-300/35 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
          >
            Copy Output
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 overflow-x-hidden">
          <p className="mr-1 shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            ⌘↵ Format · ⌘⇧M Minify · ⌘⇧V Validate · ⌘F Search
          </p>

          <label className="shrink-0 flex items-center gap-2 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1 text-sm text-amber-900 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100">
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

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSearchOutput();
              }
            }}
            placeholder="Search output"
            className="w-44 shrink-0 rounded-md border border-amber-900/20 bg-white px-2.5 py-1.5 text-sm text-amber-950 outline-none placeholder:text-amber-900/40 focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#201b16] dark:text-amber-100 dark:placeholder:text-amber-100/45 dark:focus:border-cyan-400"
          />

          <button
            type="button"
            onClick={onSearchOutput}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Search
          </button>

          <button
            type="button"
            onClick={() => navigateSearch(-1)}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => navigateSearch(1)}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Next
          </button>

          <span className="shrink-0 min-w-24 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-center text-xs font-medium text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/80">
            {searchState.matches.length && searchState.activeIndex >= 0
              ? `${searchState.activeIndex + 1}/${searchState.matches.length}`
              : '0/0'}
          </span>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">Input JSON</p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">Output JSON</p>
        </div>

        <SplitPane
          left={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                defaultLanguage="json"
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
                defaultLanguage="json"
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
