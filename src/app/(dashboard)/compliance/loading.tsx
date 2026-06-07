export default function ComplianceLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-shimmer rounded-xl" />
        <div className="space-y-2">
          <div className="h-8 w-64 animate-shimmer rounded-xl" />
          <div className="h-4 w-80 animate-shimmer rounded-lg" />
        </div>
      </div>

      {/* Quick stats skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card flex items-center gap-4 p-4">
            <div className="h-10 w-10 animate-shimmer rounded-xl" />
            <div className="space-y-2">
              <div className="h-7 w-16 animate-shimmer rounded-lg" />
              <div className="h-3 w-24 animate-shimmer rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Scorecard skeleton */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <div className="h-6 w-44 animate-shimmer rounded-lg" />
          <div className="h-5 w-16 animate-shimmer rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-shimmer rounded-lg" />
                <div className="h-5 w-24 animate-shimmer rounded-lg" />
              </div>
              <div className="h-2 w-full animate-shimmer rounded-full" />
              <div className="flex justify-between">
                <div className="h-4 w-16 animate-shimmer rounded-lg" />
                <div className="h-4 w-12 animate-shimmer rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence + Domain skeleton */}
      <section className="glass-card p-6">
        <div className="mb-5 h-6 w-48 animate-shimmer rounded-lg" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-shimmer rounded-xl" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-shimmer rounded-lg" />
            ))}
          </div>
        </div>
      </section>

      {/* Gap table skeleton */}
      <section className="glass-card p-6">
        <div className="mb-5 h-6 w-36 animate-shimmer rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-shimmer rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
