"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Moves fulfilled rows out of Current when their 10-minute window ends. */
export function RecentRequestAutoRefresh({
  expiryTimes,
}: {
  expiryTimes: number[];
}) {
  const router = useRouter();
  useEffect(() => {
    const next = expiryTimes
      .filter((time) => time > Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = window.setTimeout(
      () => router.refresh(),
      Math.max(250, next - Date.now() + 250),
    );
    return () => window.clearTimeout(timer);
  }, [expiryTimes, router]);
  return null;
}
