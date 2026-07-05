export default function DocumentsLoading() {
  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-shimmer rounded-xl" />
          <div className="h-4 w-72 animate-shimmer rounded-lg" />
        </div>
        <div className="h-10 w-36 animate-shimmer rounded-xl" />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="border-b border-border-glass px-6 py-4">
          <div className="h-6 w-32 animate-shimmer rounded-lg" />
        </div>
        <div className="px-6 py-4">
          <div className="mb-6 flex gap-4 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-24 flex-shrink-0 animate-shimmer rounded-lg" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-border-glass last:border-0">
                <div className="h-10 w-10 animate-shimmer rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 animate-shimmer rounded-lg" />
                  <div className="h-3 w-1/4 animate-shimmer rounded-lg opacity-50" />
                </div>
                <div className="h-6 w-20 animate-shimmer rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
