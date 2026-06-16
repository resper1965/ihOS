"use client";

import { usePageTitle } from "@/lib/context/page-title-context";
import type { PageMeta } from "@/lib/context/page-title-context";

/**
 * Drop-in component for Server Components.
 * Registers the page title/subtitle/icon into the header context.
 * Usage: <PageTitleRegistrar title="..." subtitle="..." icon={<Icon />} />
 */
export function PageTitleRegistrar(props: PageMeta) {
  usePageTitle(props);
  return null;
}
