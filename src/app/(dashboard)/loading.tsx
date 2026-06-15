export default function DashboardLoading() {
  return (
    <div className="w-full space-y-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 animate-shimmer rounded-xl" />
        <div className="h-4 w-96 animate-shimmer rounded-lg" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 animate-shimmer rounded-xl" />
              <div className="h-5 w-12 animate-shimmer rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-8 w-24 animate-shimmer rounded-lg" />
              <div className="h-4 w-32 animate-shimmer rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Activity skeleton */}
      <div className="glass-card p-6">
        <div className="mb-5 h-6 w-40 animate-shimmer rounded-lg" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-shimmer rounded-lg" />
                <div className="h-4 w-56 animate-shimmer rounded-lg" />
              </div>
              <div className="h-3 w-16 animate-shimmer rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
