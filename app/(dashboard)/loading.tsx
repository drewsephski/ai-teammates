import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  )
}
