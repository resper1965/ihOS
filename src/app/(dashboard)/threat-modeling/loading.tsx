export default function ThreatModelingLoading() {
  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 animate-shimmer rounded-xl" />
          <div className="h-4 w-80 animate-shimmer rounded-lg" />
        </div>
        <div className="h-10 w-40 animate-shimmer rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-card space-y-4 p-6">
            <div className="flex items-start justify-between">
              <div className="h-6 w-3/4 animate-shimmer rounded-lg" />
              <div className="h-5 w-5 animate-shimmer rounded-full" />
            </div>
            <div className="h-4 w-1/2 animate-shimmer rounded-lg opacity-60" />
            <div className="space-y-2 pt-4">
              <div className="h-2 w-full animate-shimmer rounded-full bg-white/5" />
              <div className="flex justify-between">
                <div className="h-3 w-16 animate-shimmer rounded-md" />
                <div className="h-3 w-10 animate-shimmer rounded-md" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <div className="h-5 w-16 animate-shimmer rounded-full" />
              <div className="h-5 w-16 animate-shimmer rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
