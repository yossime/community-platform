export default function MessagesLoading() {
  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      {/* Conversation list */}
      <div className="w-80 space-y-2 rounded-lg border p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md p-2">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      {/* Chat area */}
      <div className="flex-1 rounded-lg border p-4">
        <div className="h-full animate-pulse rounded bg-muted/30" />
      </div>
    </div>
  );
}
