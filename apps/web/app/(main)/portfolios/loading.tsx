export default function PortfoliosLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="mb-4 break-inside-avoid space-y-2 rounded-lg border p-3"
          >
            <div
              className="w-full animate-pulse rounded bg-muted"
              style={{ height: `${150 + (i % 3) * 60}px` }}
            />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
