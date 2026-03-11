export default function Toolbar({ children }) {
  return (
    <div className="flex h-auto w-full flex-col gap-2 overflow-x-auto border-b border-black/10 bg-[#fff9f0]/85 px-2.5 py-2.5 backdrop-blur-sm transition-colors md:px-4 md:py-3 dark:border-white/10 dark:bg-[#1b1916]/75">
      {children}
    </div>
  );
}
