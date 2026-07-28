export default function SearchLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
      <div className="flex gap-4">
        <div className="h-8 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-16 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
