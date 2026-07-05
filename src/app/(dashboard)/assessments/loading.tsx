export default function AssessmentsLoading() {
  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-60 animate-shimmer rounded-xl" />
          <div className="h-4 w-96 animate-shimmer rounded-lg" />
        </div>
        <div className="h-10 w-44 animate-shimmer rounded-xl" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-card flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-shimmer rounded-2xl" />
              <div className="space-y-2">
                <div className="h-5 w-48 animate-shimmer rounded-lg" />
                <div className="h-4 w-64 animate-shimmer rounded-lg opacity-60" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:block space-y-2">
                <div className="h-3 w-20 animate-shimmer rounded-md ml-auto" />
                <div className="h-4 w-12 animate-shimmer rounded-md ml-auto" />
              </div>
              <div className="h-6 w-24 animate-shimmer rounded-full" />
              <div className="h-8 w-8 animate-shimmer rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
