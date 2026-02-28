"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecommendationsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/map");
  }, [router]);

  return <p className="read-box text-sm">Redirecting to InfraPulse map...</p>;
}





