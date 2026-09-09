// src/lib/dashboard/navigation.ts
// The navigation as data, so it can be asserted without rendering React.
//
// Grouped by the question a user arrives holding, taken from the consumer table
// in docs/superpowers/specs/2026-09-09-the-dynamic-design.md. Nobody comes to
// work thinking "I want to look at a control"; they come thinking "a hospital
// asked us this".
//
// The COVER/ANSWER split is load-bearing, not decoration. COVER answers "how
// much of this framework do we even map" and needs only the crosswalk. ANSWER
// answers "and how much of it do we meet" and needs evidence verdicts. Those
// were one tangled percentage before.

import {
  LayoutDashboard, MessageSquare, Target, ClipboardCheck, FileText,
  BarChart3, ShieldCheck, Database, AlertTriangle, Flag, Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** null renders a divider instead of a heading. */
  heading: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: null,
    items: [{ label: 'Overview', href: '/', icon: LayoutDashboard }],
  },
  {
    heading: 'Answer',
    items: [
      // Renamed from "Audits & Checks": the database, the API and every
      // document call these assessments.
      { label: 'Assessments', href: '/assessments', icon: ClipboardCheck },
      { label: 'Partner Requirements', href: '/compliance/scrms', icon: Target },
      { label: 'Chat', href: '/chat', icon: MessageSquare },
    ],
  },
  {
    heading: 'Cover',
    items: [
      // Renamed from "Standards & Norms" for the same reason as Assessments.
      { label: 'Frameworks', href: '/compliance', icon: ShieldCheck },
      // Renamed from "Evidence Map", which showed no evidence — it is
      // control-to-requirement mapping, and the old name sent people to the
      // wrong page looking for evidence.
      { label: 'Control Crosswalk', href: '/compliance/mappings', icon: Database },
    ],
  },
  {
    heading: 'Observe',
    items: [
      { label: 'Posture', href: '/posture', icon: Activity },
      { label: 'Risk Analysis', href: '/threat-modeling', icon: AlertTriangle },
    ],
  },
  {
    // The utility drawer: reached when needed, not a question anyone arrives
    // with. A divider rather than a heading says that without naming it.
    heading: null,
    items: [
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Goals & Tasks', href: '/goals', icon: Flag },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
];

/** Every item, flattened. The active-route resolver needs all hrefs to compare. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Whether `href` is the item the current `pathname` belongs to.
 *
 * Longest-prefix wins, so /compliance/scrms lights Partner Requirements and
 * leaves Frameworks dark. Moved here verbatim from layout.tsx so the rule can
 * be tested; the behaviour is unchanged.
 */
export function isNavItemActive(
  href: string,
  pathname: string,
  allItems: readonly NavItem[],
): boolean {
  const isExact = pathname === href;
  const isPrefix = href !== '/' && pathname.startsWith(href);
  const hasMoreSpecificMatch = allItems.some(
    (other) =>
      other.href !== href &&
      other.href !== '/' &&
      pathname.startsWith(other.href) &&
      other.href.length > href.length,
  );
  return (isExact || isPrefix) && !hasMoreSpecificMatch;
}
