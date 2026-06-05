export default function ChatLoading() {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* Messages skeleton */}
      <div className="flex-1 space-y-6 overflow-y-auto py-6">
        {/* Assistant message skeleton */}
        <div className="flex gap-3">
          <div className="h-8 w-8 shrink-0 animate-shimmer rounded-xl" />
          <div className="space-y-2">
            <div className="h-4 w-72 animate-shimmer rounded-lg" />
            <div className="h-4 w-56 animate-shimmer rounded-lg" />
            <div className="h-4 w-64 animate-shimmer rounded-lg" />
          </div>
        </div>

        {/* User message skeleton */}
        <div className="flex justify-end gap-3">
          <div className="space-y-2">
            <div className="h-4 w-48 animate-shimmer rounded-lg" />
          </div>
          <div className="h-8 w-8 shrink-0 animate-shimmer rounded-xl" />
        </div>

        {/* Assistant message skeleton */}
        <div className="flex gap-3">
          <div className="h-8 w-8 shrink-0 animate-shimmer rounded-xl" />
          <div className="space-y-2">
            <div className="h-4 w-80 animate-shimmer rounded-lg" />
            <div className="h-4 w-60 animate-shimmer rounded-lg" />
          </div>
        </div>
      </div>

      {/* Input skeleton */}
      <div className="shrink-0 border-t border-border-glass pb-4 pt-4">
        <div className="glass-card flex items-center gap-3 p-3">
          <div className="h-10 flex-1 animate-shimmer rounded-xl" />
          <div className="h-10 w-10 shrink-0 animate-shimmer rounded-xl" />
        </div>
      </div>
    </div>
  );
}
