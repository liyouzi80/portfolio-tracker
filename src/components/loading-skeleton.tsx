import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20 bg-zinc-800" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-28 bg-zinc-800" />
              <Skeleton className="h-3 w-16 mt-2 bg-zinc-800" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <Skeleton className="h-4 w-24 bg-zinc-800" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full bg-zinc-800" />
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <Skeleton className="h-4 w-16 bg-zinc-800" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full bg-zinc-800" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full bg-zinc-800" />
      ))}
    </div>
  );
}
