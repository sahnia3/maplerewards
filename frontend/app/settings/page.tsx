"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
        Redirecting to profile...
      </p>
    </div>
  );
}
