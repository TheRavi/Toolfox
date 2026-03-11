export default function StatusBar({ message, status = 'idle' }) {
  const toneClass =
    status === 'error'
      ? 'text-rose-700 dark:text-rose-300'
      : status === 'success'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-amber-900/80 dark:text-zinc-300';

  const dotClass =
    status === 'error'
      ? 'bg-rose-400'
      : status === 'success'
        ? 'bg-emerald-400'
        : 'bg-zinc-500';

  return (
    <div className="flex items-center gap-2 border-t border-black/10 bg-[#fffbf4]/90 px-4 py-2 transition-colors dark:border-white/10 dark:bg-[#161412]/85">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <p className={`text-xs font-semibold tracking-wide ${toneClass}`}>{message}</p>
    </div>
  );
}
