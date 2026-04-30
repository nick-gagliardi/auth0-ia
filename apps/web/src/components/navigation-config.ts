import {
  Search,
  Network,
  Route,
  LinkIcon,
  Terminal,
  FileCode,
  GitBranch,
  GitPullRequest,
  CheckCircle,
  Tag,
  FileText,
  Database,
  BookOpen,
  ClipboardCheck,
  Settings,
  History,
  HeartPulse,
  BarChart3,
  AlertTriangle,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigationGroups: NavGroup[] = [
  {
    label: 'Search & Explore',
    items: [
      { label: 'Explain', href: '/explain', icon: Search },
      { label: 'Query', href: '/query', icon: Database },
      { label: 'Journeys', href: '/journeys', icon: Route },
    ],
  },
  {
    label: 'Health & Audit',
    items: [
      { label: 'Health', href: '/health', icon: HeartPulse },
      { label: 'Audit', href: '/audit', icon: ClipboardCheck },
      { label: 'PR Review', href: '/pr-review', icon: GitPullRequest },
      { label: 'Broken Links', href: '/broken-links', icon: LinkIcon },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
      { label: 'Feedback', href: '/feedback', icon: MessagesSquare },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { label: 'Redirects', href: '/redirects', icon: Network },
      { label: 'Refactor', href: '/refactor', icon: GitBranch },
      { label: 'Verify', href: '/verify', icon: CheckCircle },
      { label: 'Snippet Migration', href: '/snippet-migration', icon: FileCode },
      { label: 'Rules Deprecation', href: '/rules-deprecation', icon: AlertTriangle },
      { label: 'Curl Validator', href: '/curl-validator', icon: Terminal },
      { label: 'Doc Generator', href: '/doc-generator', icon: FileText },
    ],
  },
  {
    label: 'Reference',
    items: [
      { label: 'Nav Labels', href: '/nav-labels', icon: Tag },
      { label: 'Landing Pages', href: '/landing-pages', icon: FileText },
      { label: 'Docs', href: '/docs', icon: BookOpen },
    ],
  },
  {
    label: 'User',
    items: [
      { label: 'History', href: '/history', icon: History },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];
