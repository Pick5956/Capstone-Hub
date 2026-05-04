"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { DashboardPageSkeleton } from "./Skeleton";

export default function DashboardRestaurantGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, memberships, activeMembership } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!activeMembership) {
      router.replace(`/restaurants?next=${encodeURIComponent(pathname)}`);
    }
  }, [activeMembership, loading, memberships.length, pathname, router, user]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  if (!user || !activeMembership) {
    return null;
  }

  return <>{children}</>;
}
