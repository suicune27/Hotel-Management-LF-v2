export function RoomCardSkeleton() {
  return (
    <div className="rounded-xl border border-surface-100 bg-white overflow-hidden animate-pulse">
      <div className="h-24 bg-surface-50" />
      <div className="p-2.5 space-y-2">
        <div className="flex justify-between">
          <div className="h-3.5 w-14 bg-surface-100 rounded" />
          <div className="h-3 w-10 bg-surface-100 rounded" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-16 bg-surface-100 rounded" />
          <div className="h-2.5 w-12 bg-surface-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export function RoomGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, i) => <RoomCardSkeleton key={i} />)}
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 animate-pulse">
          <div className="w-7 h-7 bg-surface-100 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-20 bg-surface-100 rounded" />
            <div className="h-2 w-28 bg-surface-50 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
