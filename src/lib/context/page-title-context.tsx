"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageMeta {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
}

interface PageTitleContextValue {
  meta: PageMeta | null;
  setMeta: (meta: PageMeta | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const PageTitleContext = createContext<PageTitleContextValue>({
  meta: null,
  setMeta: () => {},
});

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMetaState] = useState<PageMeta | null>(null);

  const setMeta = useCallback((m: PageMeta | null) => {
    setMetaState(m);
  }, []);

  return (
    <PageTitleContext.Provider value={{ meta, setMeta }}>
      {children}
    </PageTitleContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook — used by each page to declare its title
// ─────────────────────────────────────────────────────────────────────────────

export function usePageTitle(meta: PageMeta) {
  const { setMeta } = useContext(PageTitleContext);

  // Run synchronously on first render and whenever meta values change.
  // We use a layout effect pattern via a ref to avoid the
  // "cannot update during rendering" warning.
  const metaRef = React.useRef(meta);
  metaRef.current = meta;

  React.useEffect(() => {
    setMeta(metaRef.current);
    return () => setMeta(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Consumer hook — used by the layout header
// ─────────────────────────────────────────────────────────────────────────────

export function useCurrentPageMeta() {
  return useContext(PageTitleContext).meta;
}
