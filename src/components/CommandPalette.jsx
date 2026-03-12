import { useEffect, useMemo, useRef, useState } from 'react';
import { enter, mod, shift } from '../core/platform.js';

const DEFAULT_COMMANDS = [
  { id: 'format', label: 'Format JSON', category: 'Formatter', keys: `${mod}${enter}` },
  { id: 'minify', label: 'Minify JSON', category: 'Formatter', keys: `${mod}${shift}M` },
  { id: 'validate', label: 'Validate JSON', category: 'Formatter', keys: `${mod}${shift}V` },
  { id: 'copy', label: 'Copy Output', category: 'Formatter', keys: 'N/A' },
  { id: 'search', label: 'Search Output', category: 'Formatter', keys: `${mod}F` },
  { id: 'theme', label: 'Toggle Theme', category: 'Settings', keys: `${mod}J` },
];

function rankMatch(query, text) {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  if (!lowerQuery) return 0;
  if (lowerText === lowerQuery) return 1000;
  if (lowerText.startsWith(lowerQuery)) return 500;

  let score = 0;
  let searchPos = 0;

  for (let i = 0; i < lowerText.length; i++) {
    if (lowerText[i] === lowerQuery[searchPos]) {
      score += 100 - i;
      searchPos += 1;

      if (searchPos === lowerQuery.length) {
        return score;
      }
    }
  }

  return searchPos === lowerQuery.length ? score : -1;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSelect,
  commands = DEFAULT_COMMANDS,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    const scored = commands
      .map((cmd) => ({
        ...cmd,
        score: rankMatch(query, cmd.label),
      }))
      .filter((cmd) => cmd.score >= 0)
      .sort((a, b) => b.score - a.score);

    return scored;
  }, [query, commands]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (results[activeIndex]) {
        onSelect(results[activeIndex].id);
        onClose();
      }

      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    }
  }

  if (!isOpen) {
    return null;
  }

  // Clamp activeIndex to valid range (derived value, not state)
  const clampedActiveIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-50 flex flex-col overflow-hidden rounded-xl bg-gradient-to-b from-white/95 to-white/90 shadow-2xl dark:from-zinc-900/95 dark:to-zinc-900/90"
    >
      <div className="border-b border-slate-200 bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search commands…"
          className="w-full border-0 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-zinc-400">
            No commands match "{query}"
          </div>
        ) : (
          <div className="p-2">
            {results.map((result, index) => {
              const isActive = index === clampedActiveIndex;

              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    onSelect(result.id);
                    onClose();
                  }}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                    isActive
                      ? 'border-indigo-400/60 bg-gradient-to-r from-indigo-500/10 to-sky-500/10 text-indigo-700 dark:border-indigo-500/40 dark:from-indigo-500/20 dark:to-sky-500/20 dark:text-indigo-200'
                      : 'border-transparent text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{result.label}</p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      {result.category}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 text-[11px] text-slate-400 dark:text-zinc-500">
                    {result.keys}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white/70 px-3 py-2 text-[11px] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400">
        <span className="font-medium">↵ Select</span> · <span className="font-medium">↑↓ Navigate</span> ·{' '}
        <span className="font-medium">Esc Close</span>
      </div>
    </div>
  );
}
