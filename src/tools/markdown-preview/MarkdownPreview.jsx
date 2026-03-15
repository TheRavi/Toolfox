import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import SplitPane from '../../components/SplitPane';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';
import CommandPalette from '../../components/CommandPalette';
import { mod, shift } from '../../core/platform.js';

const INITIAL_MARKDOWN = `# Markdown Preview\n\nWrite Markdown on the left and preview it on the right.\n\n## Features\n\n- Live preview\n- GitHub Flavored Markdown support\n- Sanitized rendering for safety\n\n### Example Code\n\n\`\`\`js\nfunction greet(name) {\n  return \`Hello, \${name}\`;\n}\n\nconsole.log(greet('Toolfox'));\n\`\`\`\n\n> Tip: Use **bold**, _italic_, and [links](https://example.com).\n`;

export default function MarkdownPreview() {
  const [input, setInput] = useState(INITIAL_MARKDOWN);
  const [wordCount, setWordCount] = useState(0);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Ready',
  });
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const latestQueuedRequestIdRef = useRef(0);
  const inputEditorRef = useRef(null);
  const previewContainerRef = useRef(null);
  const inputScrollDisposableRef = useRef(null);
  const isSyncingFromInputRef = useRef(false);
  const isSyncingFromPreviewRef = useRef(false);
  const analyzeDebounceTimerRef = useRef(null);

  const paletteCommands = [
    { id: 'copy', label: 'Copy Markdown', category: 'Markdown', keys: `${mod}${shift}C` },
    { id: 'clear', label: 'Clear Editor', category: 'Markdown', keys: `${mod}${shift}K` },
    { id: 'load-example', label: 'Load Example', category: 'Markdown', keys: `${mod}${shift}L` },
    { id: 'focus-editor', label: 'Focus Editor', category: 'Markdown', keys: `${mod}F` },
  ];

  const scheduleAnalyze = useCallback((text, immediate = false) => {
    if (!workerRef.current) {
      return;
    }

    if (analyzeDebounceTimerRef.current) {
      clearTimeout(analyzeDebounceTimerRef.current);
      analyzeDebounceTimerRef.current = null;
    }

    const run = () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      latestQueuedRequestIdRef.current = requestId;

      workerRef.current?.postMessage({
        type: 'analyze',
        payload: {
          requestId,
          text,
        },
      });
    };

    if (immediate) {
      run();
      return;
    }

    analyzeDebounceTimerRef.current = setTimeout(run, 120);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./markdownWorker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;

      if (response?.requestId !== latestQueuedRequestIdRef.current) {
        return;
      }

      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'Markdown analysis failed.',
        });
        return;
      }

      const nextWordCount = response?.result?.wordCount ?? 0;
      setWordCount((previous) => (previous === nextWordCount ? previous : nextWordCount));
    };

    scheduleAnalyze(INITIAL_MARKDOWN, true);

    return () => {
      if (analyzeDebounceTimerRef.current) {
        clearTimeout(analyzeDebounceTimerRef.current);
        analyzeDebounceTimerRef.current = null;
      }

      worker.terminate();
      workerRef.current = null;
    };
  }, [scheduleAnalyze]);

  useEffect(() => {
    return () => {
      if (inputScrollDisposableRef.current) {
        inputScrollDisposableRef.current.dispose();
        inputScrollDisposableRef.current = null;
      }
    };
  }, []);

  function bindInputScrollSync(editor) {
    if (inputScrollDisposableRef.current) {
      inputScrollDisposableRef.current.dispose();
      inputScrollDisposableRef.current = null;
    }

    inputScrollDisposableRef.current = editor.onDidScrollChange(() => {
      if (isSyncingFromPreviewRef.current) {
        return;
      }

      const previewContainer = previewContainerRef.current;

      if (!previewContainer) {
        return;
      }

      const sourceScrollTop = editor.getScrollTop();
      const sourceScrollableHeight = Math.max(1, editor.getScrollHeight() - editor.getLayoutInfo().height);
      const sourceRatio = sourceScrollTop / sourceScrollableHeight;
      const targetScrollableHeight = Math.max(0, previewContainer.scrollHeight - previewContainer.clientHeight);

      isSyncingFromInputRef.current = true;
      previewContainer.scrollTop = sourceRatio * targetScrollableHeight;
      requestAnimationFrame(() => {
        isSyncingFromInputRef.current = false;
      });
    });
  }

  function onPreviewScroll() {
    if (isSyncingFromInputRef.current) {
      return;
    }

    const previewContainer = previewContainerRef.current;
    const editor = inputEditorRef.current;

    if (!previewContainer || !editor) {
      return;
    }

    const targetScrollableHeight = Math.max(1, previewContainer.scrollHeight - previewContainer.clientHeight);
    const targetRatio = previewContainer.scrollTop / targetScrollableHeight;
    const sourceScrollableHeight = Math.max(0, editor.getScrollHeight() - editor.getLayoutInfo().height);

    isSyncingFromPreviewRef.current = true;
    editor.setScrollTop(targetRatio * sourceScrollableHeight);
    requestAnimationFrame(() => {
      isSyncingFromPreviewRef.current = false;
    });
  }

  const onCopyMarkdown = useCallback(async () => {
    if (!input.trim()) {
      setStatus({
        type: 'error',
        message: 'Nothing to copy.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(input);
      setStatus({
        type: 'success',
        message: 'Markdown copied to clipboard.',
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to copy markdown.',
      });
    }
  }, [input]);

  const onClear = useCallback(() => {
    setInput('');
    scheduleAnalyze('', true);
    setStatus({
      type: 'idle',
      message: 'Editor cleared.',
    });
  }, [scheduleAnalyze]);

  const onLoadExample = useCallback(() => {
    setInput(INITIAL_MARKDOWN);
    scheduleAnalyze(INITIAL_MARKDOWN, true);
    setStatus({
      type: 'success',
      message: 'Example markdown loaded.',
    });
  }, [scheduleAnalyze]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setIsPaletteOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        onCopyMarkdown();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onClear();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        onLoadExample();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        inputEditorRef.current?.focus();
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [onClear, onCopyMarkdown, onLoadExample]);

  function onInputChange(value) {
    const nextValue = value ?? '';
    setInput(nextValue);
    scheduleAnalyze(nextValue);

    if (!nextValue.trim()) {
      setStatus({
        type: 'idle',
        message: 'Start typing markdown to preview.',
      });
    }
  }

  function onCommandSelect(commandId) {
    switch (commandId) {
      case 'copy':
        onCopyMarkdown();
        break;
      case 'clear':
        onClear();
        break;
      case 'load-example':
        onLoadExample();
        break;
      case 'focus-editor':
        inputEditorRef.current?.focus();
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
        onSelect={onCommandSelect}
        commands={paletteCommands}
      />

      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={onCopyMarkdown}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-2 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 md:py-1.5 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Copy Markdown
          </button>
          <button
            type="button"
            onClick={onLoadExample}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 md:py-1.5 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Load Example
          </button>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 md:py-1.5 dark:border-amber-200/25 dark:bg-amber-800/25 dark:text-amber-100 dark:hover:bg-amber-700/35"
          >
            Clear
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <p className="mr-1 shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            {`${mod}${shift}P Commands · ${mod}${shift}C Copy · ${mod}${shift}K Clear · ${mod}${shift}L Load`} 
          </p>
          <span className="shrink-0 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900/85 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100/85">
            {wordCount} words
          </span>
        </div>
      </Toolbar>

      <StatusBar status={status.type} message={status.message} />

      <div className="min-h-0 flex-1 p-2 md:p-3">
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Input (Markdown)
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            Preview
          </p>
        </div>

        <SplitPane
          left={
            <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
              <Editor
                height="100%"
                language="markdown"
                value={input}
                onChange={onInputChange}
                onMount={(editor) => {
                  inputEditorRef.current = editor;
                  bindInputScrollSync(editor);
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
            <div
              ref={previewContainerRef}
              onScroll={onPreviewScroll}
              className="h-full overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-[15px] leading-7 text-slate-800 dark:border-amber-200/20 dark:bg-[#2e281f] dark:text-zinc-100"
              style={{ colorScheme: 'light' }}
            >
              {input.trim() ? (
                <article className="space-y-4 break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      a: ({ ...props }) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-700 underline decoration-cyan-700/50 underline-offset-2 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
                        />
                      ),
                      code: ({ className, children, ...props }) => {
                        const isBlock = Boolean(className);

                        if (isBlock) {
                          return (
                            <code
                              {...props}
                              className="block overflow-x-auto rounded-md bg-slate-100 px-3 py-2 font-mono text-[13px] text-slate-900 dark:bg-[#201b16] dark:text-zinc-100"
                            >
                              {children}
                            </code>
                          );
                        }

                        return (
                          <code
                            {...props}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-900 dark:bg-[#201b16] dark:text-zinc-100"
                          >
                            {children}
                          </code>
                        );
                      },
                      h1: ({ ...props }) => <h1 {...props} className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" />,
                      h2: ({ ...props }) => <h2 {...props} className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white" />,
                      h3: ({ ...props }) => <h3 {...props} className="text-xl font-semibold text-slate-900 dark:text-white" />,
                      ul: ({ ...props }) => <ul {...props} className="list-disc pl-5" />,
                      ol: ({ ...props }) => <ol {...props} className="list-decimal pl-5" />,
                      blockquote: ({ ...props }) => (
                        <blockquote
                          {...props}
                          className="border-l-4 border-amber-500/70 bg-amber-50/70 px-4 py-2 text-slate-700 dark:border-amber-300/70 dark:bg-[#3a3123]/60 dark:text-zinc-200"
                        />
                      ),
                      table: ({ ...props }) => (
                        <div className="overflow-x-auto">
                          <table {...props} className="w-full border-collapse text-sm" />
                        </div>
                      ),
                      th: ({ ...props }) => <th {...props} className="border border-slate-300 bg-slate-100 px-3 py-2 text-left dark:border-zinc-700 dark:bg-[#201b16]" />,
                      td: ({ ...props }) => <td {...props} className="border border-slate-300 px-3 py-2 dark:border-zinc-700" />,
                    }}
                  >
                    {input}
                  </ReactMarkdown>
                </article>
              ) : (
                <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-amber-900/25 bg-amber-50/35 px-4 text-sm text-amber-900/75 dark:border-amber-200/25 dark:bg-[#2a241d]/55 dark:text-amber-100/80">
                  Markdown preview appears here.
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
