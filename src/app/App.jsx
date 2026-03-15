import { useEffect, useMemo, useRef, useState } from 'react';
import { getRegisteredTools } from '../core/ToolRegistry';
import { getLastUsedTool, getTheme, setLastUsedTool, setTheme } from '../core/settingsStore';

function ToolFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-400">
      Loading tool…
    </div>
  );
}

export default function App() {
  const [tools, setTools] = useState([]);
  const [toolQuery, setToolQuery] = useState('');
  const [activeToolId, setActiveToolId] = useState('');
  const [loadedTool, setLoadedTool] = useState({ id: '', component: null });
  const [theme] = useState(() => getTheme());
  const [isNavOpen, setIsNavOpen] = useState(false);
  const toolSearchRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    setTheme(theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    getRegisteredTools().then((registeredTools) => {
      if (!mounted) {
        return;
      }

      setTools(registeredTools);

      if (!registeredTools.length) {
        setActiveToolId('');
        return;
      }

      const lastTool = getLastUsedTool();
      const hasLastTool = registeredTools.some((tool) => tool.id === lastTool);
      setActiveToolId(hasLastTool ? lastTool : registeredTools[0].id);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeToolId) ?? null,
    [activeToolId, tools],
  );

  const visibleTools = useMemo(() => {
    const query = toolQuery.trim().toLowerCase();

    if (!query) {
      return tools;
    }

    return tools.filter((tool) =>
      `${tool.name} ${tool.category} ${tool.id}`.toLowerCase().includes(query),
    );
  }, [toolQuery, tools]);

  const visibleToolsByCategory = useMemo(() => {
    const grouped = visibleTools.reduce((accumulator, tool) => {
      const category = tool.category || 'Other';

      if (!accumulator[category]) {
        accumulator[category] = [];
      }

      accumulator[category].push(tool);
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryTools]) => ({
        category,
        tools: categoryTools.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [visibleTools]);

  useEffect(() => {
    let cancelled = false;

    if (!activeTool) {
      return () => {
        cancelled = true;
      };
    }

    activeTool.loadComponent().then((component) => {
      if (!cancelled) {
        setLoadedTool({ id: activeTool.id, component });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTool]);

  function onToolSelect(toolId) {
    setActiveToolId(toolId);
    setLastUsedTool(toolId);
    setIsNavOpen(false);
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toolSearchRef.current?.focus();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && /^\d$/.test(event.key)) {
        event.preventDefault();
        const index = Number(event.key) - 1;
        const targetTool = visibleTools[index];

        if (targetTool) {
          onToolSelect(targetTool.id);
        }
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [visibleTools]);

  useEffect(() => {
    function onResize() {
      if (globalThis.innerWidth >= 768) {
        setIsNavOpen(false);
      }
    }

    globalThis.addEventListener('resize', onResize);
    return () => {
      globalThis.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden p-2 text-[#2d241d] md:p-4 dark:text-zinc-100">
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-14rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-rose-400/15 blur-3xl" />

      <div className="relative flex h-full overflow-hidden rounded-[24px] border border-black/10 bg-[#fff7eb]/88 shadow-[0_20px_60px_-28px_rgba(66,32,6,0.45)] backdrop-blur-md transition-colors md:flex-row dark:border-white/10 dark:bg-[#12100e]/84 dark:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.7)]">
        {isNavOpen ? (
          <button
            type="button"
            aria-label="Close tool list"
            onClick={() => setIsNavOpen(false)}
            className="absolute inset-0 z-20 bg-black/30 md:hidden"
          />
        ) : null}

        <aside className={`absolute inset-y-0 left-0 z-30 flex w-[85%] max-w-sm shrink-0 flex-col border-r border-black/10 bg-[#fff4e4]/95 backdrop-blur-sm transition-transform duration-200 md:static md:z-auto md:h-auto md:w-80 md:max-w-none md:translate-x-0 md:border-b-0 dark:border-white/10 dark:bg-[#181512]/95 ${isNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
            <h1 className="text-lg font-bold tracking-[0.02em] text-[#23170f] dark:text-zinc-100">Toolfox</h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-900/65 dark:text-zinc-400">Crafted Utility Suite</p>
          </div>

          <div className="px-3 py-3">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900/70 dark:text-zinc-500">Tools</p>
            <div className="mt-2 px-1">
              <input
                ref={toolSearchRef}
                type="text"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
                placeholder="Search tools"
                className="w-full rounded-lg border border-amber-900/20 bg-white/95 px-3 py-2 text-sm text-amber-950 outline-none transition-colors placeholder:text-amber-800/40 focus:border-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-cyan-400"
              />
            </div>
          </div>

          <nav
            className="sidebar-scrollbar flex-1 overflow-y-auto px-3 pb-3"
            style={{ colorScheme: 'light' }}
          >
            {visibleToolsByCategory.map(({ category, tools: categoryTools }) => (
              <div key={category} className="mb-3 last:mb-0">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900/60 dark:text-zinc-500">
                  {category}
                </p>

                {categoryTools.map((tool) => {
                  const isActive = tool.id === activeToolId;

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => onToolSelect(tool.id)}
                      className={`mb-1.5 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-base transition-all md:py-2.5 md:text-sm ${
                        isActive
                          ? 'border-cyan-600/45 bg-gradient-to-r from-cyan-500/18 to-amber-400/20 text-cyan-900 dark:border-cyan-400/40 dark:from-cyan-500/20 dark:to-amber-400/20 dark:text-cyan-100'
                          : 'border-transparent text-amber-950/90 hover:border-amber-900/20 hover:bg-amber-100/55 hover:text-amber-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="text-xs text-amber-800/65 dark:text-zinc-400">{tool.icon}</span>
                        <span className="truncate font-medium">{tool.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}

            {visibleTools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-900/30 px-3 py-4 text-xs text-amber-900/65 dark:border-zinc-700 dark:text-zinc-400">
                No tools match your search.
              </div>
            ) : null}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 md:pl-0">
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-14 items-center justify-between gap-2 border-b border-black/10 bg-[#fffaf2]/70 px-3 py-2 transition-colors md:px-4 dark:border-white/10 dark:bg-zinc-900/45">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-amber-900/70 dark:text-zinc-500">Active Tool</p>
                <h2 className="text-sm font-bold text-[#271910] dark:text-zinc-100">{activeTool?.name ?? 'Loading'}</h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNavOpen((open) => !open)}
                  className="rounded-md border border-amber-900/25 bg-white/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900 md:hidden dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200"
                >
                  Tools
                </button>
                {activeTool?.category ? (
                  <span className="rounded-md border border-amber-900/25 bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-900 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                    {activeTool.category}
                  </span>
                ) : null}
              </div>
            </header>

            <section className="min-h-0 flex-1 p-2 md:p-4">
              <div className="h-full overflow-hidden rounded-2xl border border-black/10 bg-[#fffdf8]/80 transition-colors dark:border-white/10 dark:bg-zinc-900/35">
                {loadedTool.id === activeTool?.id && loadedTool.component ? (
                  <loadedTool.component />
                ) : (
                  <ToolFallback />
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
