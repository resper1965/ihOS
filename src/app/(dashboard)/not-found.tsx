"use client";

import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Search className="h-8 w-8 text-primary" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-text-primary">
        Page Not Found
      </h2>
      <p className="mb-8 max-w-xs text-sm text-text-secondary">
        The page you are looking for doesn't exist or has been moved to a different location.
      </p>
      <Link
        href="/"
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-95"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}
