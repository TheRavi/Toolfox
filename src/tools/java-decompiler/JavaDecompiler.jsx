import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import Toolbar from '../../components/Toolbar';
import StatusBar from '../../components/StatusBar';
import { enter, mod } from '../../core/platform.js';

const ACCEPTED_FILE_EXT = '.class';

function preventDefault(event) {
  event.preventDefault();
}

function stripClassExtension(fileName) {
  return fileName.replace(/\.class$/i, '') || 'DecompiledClass';
}

// Dynamically import Tauri invoke so the tool still works in a browser context.
async function tauriInvoke(cmd, args) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
}

export default function JavaDecompiler() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [output, setOutput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState({ matches: [], activeIndex: -1 });
  const [metadata, setMetadata] = useState(null);
  const [engineUsed, setEngineUsed] = useState(null);
  const [nativeStatus, setNativeStatus] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Select a .class file to start decompiling.',
  });

  const fileInputRef = useRef(null);
  const workerRef = useRef(null);
  const outputEditorRef = useRef(null);

  // Probe the native decompiler availability (only meaningful in Tauri).
  const checkNativeStatus = useCallback(async () => {
    try {
      const s = await tauriInvoke('check_decompiler_status');
      setNativeStatus(s);
    } catch {
      setNativeStatus(null); // running in browser or command unavailable
    }
  }, []);

  useEffect(() => {
    // JS worker fallback.
    const worker = new Worker(new URL('./javaDecompilerWorker.js', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const response = event.data;
      if (!response?.success) {
        setStatus({
          type: 'error',
          message: response?.error?.message || 'Decompilation failed.',
        });
        return;
      }
      const result = response.result ?? {};
      setOutput(result.javaSource || '');
      setMetadata(result.metadata || null);
      setEngineUsed('js');
      setSearchState({ matches: [], activeIndex: -1 });
      setStatus({
        type: 'success',
        message: 'Decompilation completed (JS interpreter). Install CFR for full source.',
      });
    };

    checkNativeStatus();

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [checkNativeStatus]);

  const decompileFile = useCallback(async (file) => {
    if (!file) {
      setStatus({ type: 'error', message: 'Select a .class file first.' });
      return;
    }
    if (!file.name.toLowerCase().endsWith(ACCEPTED_FILE_EXT)) {
      setStatus({ type: 'error', message: 'Only .class files are supported.' });
      return;
    }

    setStatus({ type: 'idle', message: 'Decompiling…' });
    setSearchState({ matches: [], activeIndex: -1 });

    try {
      const buffer = await file.arrayBuffer();

      // ── Try native Tauri decompiler first ──────────────────────────────────
      const canUseNative =
        nativeStatus?.cfr_available ||
        nativeStatus?.javap_available ||
        nativeStatus?.java_available;

      if (canUseNative) {
        try {
          // Convert to a plain array so Tauri can JSON-serialise it as Vec<u8>.
          const bytes = Array.from(new Uint8Array(buffer));
          const result = await tauriInvoke('decompile_class', {
            bytes,
            fileName: file.name,
          });

          setOutput(result.source || '');
          setEngineUsed(result.engine || 'native');
          // Native engines don't return per-field metadata; clear it.
          setMetadata({
            engine: result.engine,
            hasFullSource: result.has_full_source,
          });
          setStatus({
            type: 'success',
            message: result.has_full_source
              ? `Full Java source via ${result.engine}.`
              : `Bytecode disassembly via ${result.engine}. Download CFR for full source.`,
          });
          return;
        } catch (nativeErr) {
          // Surface the native error but fall through to the JS worker.
          setStatus({
            type: 'idle',
            message: `Native decompiler error: ${nativeErr}. Falling back to JS interpreter…`,
          });
        }
      }

      // ── Fall back to JS Web Worker ─────────────────────────────────────────
      if (!workerRef.current) {
        setStatus({ type: 'error', message: 'No decompiler available.' });
        return;
      }

      workerRef.current.postMessage(
        { type: 'decompile', payload: { fileName: file.name, buffer } },
        [buffer],
      );
    } catch {
      setStatus({ type: 'error', message: 'Unable to read the class file.' });
    }
  }, [nativeStatus]);

  const downloadCfr = useCallback(async () => {
    setIsDownloading(true);
    setStatus({ type: 'idle', message: 'Downloading CFR decompiler (~2.5 MB)…' });
    try {
      await tauriInvoke('download_cfr');
      await checkNativeStatus();
      setStatus({ type: 'success', message: 'CFR downloaded. Ready for full Java source decompilation.' });
    } catch (err) {
      setStatus({ type: 'error', message: `CFR download failed: ${err}` });
    } finally {
      setIsDownloading(false);
    }
  }, [checkNativeStatus]);

  const onSelectFile = useCallback((file) => {
    setSelectedFile(file);
    setOutput('');
    setMetadata(null);
    setEngineUsed(null);
    setSearchState({ matches: [], activeIndex: -1 });
    setStatus({ type: 'idle', message: `Loaded ${file.name}. Click Decompile.` });
  }, []);

  function onFileInputChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    onSelectFile(file);
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0] || null;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(ACCEPTED_FILE_EXT)) {
      setStatus({ type: 'error', message: 'Drop a .class file.' });
      return;
    }
    onSelectFile(file);
  }

  async function onCopyOutput() {
    if (!output.trim()) {
      setStatus({ type: 'error', message: 'No output to copy.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setStatus({ type: 'success', message: 'Decompiled source copied.' });
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy output.' });
    }
  }

  function onDownloadOutput() {
    if (!output.trim()) {
      setStatus({ type: 'error', message: 'No output to download.' });
      return;
    }
    const baseName = stripClassExtension(selectedFile?.name || 'DecompiledClass.class');
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.java`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ type: 'success', message: `Downloaded ${baseName}.java.` });
  }

  function focusMatch(match) {
    if (!outputEditorRef.current || !match) return;
    outputEditorRef.current.setSelection(match.range);
    outputEditorRef.current.revealRangeInCenter(match.range);
    outputEditorRef.current.focus();
  }

  function onSearchOutput() {
    const query = searchQuery.trim();
    const editor = outputEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    if (!query) {
      setSearchState({ matches: [], activeIndex: -1 });
      setStatus({ type: 'error', message: 'Enter text to search.' });
      return;
    }
    const matches = model.findMatches(query, false, false, false, null, false);
    if (!matches.length) {
      setSearchState({ matches: [], activeIndex: -1 });
      setStatus({ type: 'error', message: `No matches for "${query}".` });
      return;
    }
    focusMatch(matches[0]);
    setSearchState({ matches, activeIndex: 0 });
    setStatus({ type: 'success', message: `Match 1 of ${matches.length}.` });
  }

  const navigateSearch = useCallback((direction) => {
    if (!searchState.matches.length || searchState.activeIndex < 0) {
      setStatus({ type: 'error', message: 'Run search first.' });
      return;
    }
    const total = searchState.matches.length;
    const nextIndex = (searchState.activeIndex + direction + total) % total;
    focusMatch(searchState.matches[nextIndex]);
    setSearchState((prev) => ({ ...prev, activeIndex: nextIndex }));
    setStatus({ type: 'success', message: `Match ${nextIndex + 1} of ${total}.` });
  }, [searchState]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        decompileFile(selectedFile);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const el = document.getElementById('java-decompiler-search');
        el?.focus();
        el?.select();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
      }
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [decompileFile, navigateSearch, selectedFile]);

  // ── derive Monaco language from engine ──────────────────────────────────────
  const monacoLanguage = engineUsed === 'javap' ? 'plaintext' : 'java';

  // ── derive decompiler status banner content ──────────────────────────────────
  function renderNativeBanner() {
    if (nativeStatus === null) {
      // Not in Tauri, or still loading.
      return null;
    }
    if (nativeStatus.cfr_available) {
      return (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-green-600/30 bg-green-50/80 px-3 py-2 text-xs text-green-800 dark:border-green-400/25 dark:bg-green-900/20 dark:text-green-200">
          <span className="font-semibold">CFR ready</span>
          <span>— full Java source decompilation enabled.</span>
          {nativeStatus.java_version && (
            <span className="ml-auto text-green-700/70 dark:text-green-300/60">{nativeStatus.java_version}</span>
          )}
        </div>
      );
    }
    if (nativeStatus.java_available) {
      return (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-600/35 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">JDK found</span>
          <span>— javap disassembly only. Download CFR for full Java source.</span>
          <button
            type="button"
            disabled={isDownloading}
            onClick={downloadCfr}
            className="ml-auto shrink-0 rounded border border-amber-700/40 bg-amber-100 px-2 py-0.5 font-semibold transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-300/30 dark:bg-amber-800/40 dark:hover:bg-amber-700/50"
          >
            {isDownloading ? 'Downloading…' : 'Download CFR'}
          </button>
        </div>
      );
    }
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-red-600/30 bg-red-50/80 px-3 py-2 text-xs text-red-800 dark:border-red-400/25 dark:bg-red-900/20 dark:text-red-200">
        <span className="font-semibold">No JDK found</span>
        <span>— using JS bytecode interpreter (limited output). Install a JDK to enable CFR / javap.</span>
      </div>
    );
  }

  // ── metadata bar content ─────────────────────────────────────────────────────
  function renderMetadata() {
    if (!metadata) {
      return 'Class metadata will appear after decompilation';
    }
    if (metadata.engine) {
      const kind = metadata.hasFullSource ? 'Full source' : 'Disassembly';
      return `Engine: ${metadata.engine} | ${kind}`;
    }
    return [
      metadata.className && `Class: ${metadata.className}`,
      metadata.declarationName && `Decl: ${metadata.declarationName}`,
      metadata.fields != null && `Fields: ${metadata.fields}`,
      metadata.methods != null && `Methods: ${metadata.methods}`,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_EXT}
            onChange={onFileInputChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Select .class
          </button>

          <button
            type="button"
            onClick={() => decompileFile(selectedFile)}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/75 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/80 dark:border-cyan-300/35 dark:bg-cyan-900/35 dark:text-cyan-100 dark:hover:bg-cyan-800/45"
          >
            Decompile
          </button>

          <button
            type="button"
            onClick={onCopyOutput}
            className="shrink-0 rounded-md border border-cyan-700/30 bg-cyan-100/70 px-3 py-1.5 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-200/75 dark:border-cyan-300/35 dark:bg-cyan-900/30 dark:text-cyan-100 dark:hover:bg-cyan-800/40"
          >
            Copy Output
          </button>

          <button
            type="button"
            onClick={onDownloadOutput}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Download .java
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
          <p className="shrink-0 rounded-md border border-amber-900/20 bg-amber-50/90 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:border-amber-200/15 dark:bg-[#2a241d]/75 dark:text-amber-100/85">
            {`${mod}O Open · ${mod}${enter} Decompile · ${mod}F Search · F3 Next`}
          </p>

          <input
            id="java-decompiler-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') onSearchOutput(); }}
            placeholder="Search output"
            className="w-52 rounded-md border border-amber-900/20 bg-white/95 px-2.5 py-1.5 text-sm text-amber-900 outline-none placeholder:text-amber-900/50 focus:border-cyan-600 dark:border-amber-200/20 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:placeholder:text-amber-100/45"
          />

          <button
            type="button"
            onClick={onSearchOutput}
            className="shrink-0 rounded-md border border-amber-900/25 bg-white/95 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/75 dark:border-amber-200/25 dark:bg-[#2a241d]/90 dark:text-amber-100 dark:hover:bg-[#352d23]"
          >
            Find
          </button>
        </div>
      </Toolbar>

      <div className="min-h-0 flex flex-1 flex-col p-2 md:p-3">
        {renderNativeBanner()}

        <div className="mb-2 rounded-md border border-amber-900/20 bg-amber-50/80 px-3 py-2 text-xs text-amber-900/85 dark:border-amber-200/20 dark:bg-[#2a241d]/80 dark:text-amber-100/85">
          {engineUsed === 'CFR'
            ? 'Full Java source reconstructed by CFR. Variable names may differ from originals.'
            : engineUsed === 'javap'
              ? 'Bytecode disassembly via javap. Download CFR for full Java source.'
              : 'Output is reconstructed from bytecode and may differ from original source.'}
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={preventDefault}
          className="mb-2 w-full rounded-md border border-dashed border-amber-900/30 bg-white/70 px-3 py-2 text-left text-xs text-amber-900/80 transition-colors hover:bg-amber-50/80 dark:border-amber-200/25 dark:bg-[#2a241d]/60 dark:text-amber-100/85 dark:hover:bg-[#332a1f]"
        >
          Drop a .class file here, or click to browse.
        </button>

        <div className="mb-2 grid grid-cols-1 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 md:grid-cols-2 dark:text-amber-100/70">
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {selectedFile ? `Input: ${selectedFile.name}` : 'Input: no file selected'}
          </p>
          <p className="rounded-md border border-amber-900/20 bg-white px-2 py-1 dark:border-amber-200/20 dark:bg-[#2a241d]/75">
            {renderMetadata()}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-amber-200/20 dark:bg-[#2e281f]">
          <Editor
            height="100%"
            language={monacoLanguage}
            value={output}
            theme="vs-light"
            onMount={(editor) => { outputEditorRef.current = editor; }}
            options={{
              automaticLayout: true,
              lineNumbers: 'on',
              wordWrap: 'off',
              readOnly: true,
              minimap: { enabled: false },
              padding: { top: 12, bottom: 12 },
              fontSize: 13,
            }}
          />
        </div>
      </div>

      <StatusBar status={status.type} message={status.message} />
    </div>
  );
}
