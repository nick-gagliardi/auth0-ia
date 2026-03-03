import {
  Search,
  ListTodo,
  Network,
  LayoutDashboard,
  TrendingUp,
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
    label: 'Core',
    items: [
      { label: 'Explain', href: '/explain', icon: Search },
      { label: 'Work Queue', href: '/work-queue', icon: ListTodo },
      { label: 'Redirects', href: '/redirects', icon: Network },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { label: 'Dashboards', href: '/dashboards', icon: LayoutDashboard },
      { label: 'Impact', href: '/impact', icon: TrendingUp },
      { label: 'Journeys', href: '/journeys', icon: Route },
      { label: 'Broken Links', href: '/broken-links', icon: LinkIcon },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Audit', href: '/audit', icon: ClipboardCheck },
      { label: 'PR Review', href: '/pr-review', icon: GitPullRequest },
      { label: 'Curl Validator', href: '/curl-validator', icon: Terminal },
      { label: 'Snippet Migration', href: '/snippet-migration', icon: FileCode },
      { label: 'Refactor', href: '/refactor', icon: GitBranch },
      { label: 'Verify', href: '/verify', icon: CheckCircle },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Reference',
    items: [
      { label: 'Nav Labels', href: '/nav-labels', icon: Tag },
      { label: 'Landing Pages', href: '/landing-pages', icon: FileText },
      { label: 'Query', href: '/query', icon: Database },
      { label: 'Docs', href: '/docs', icon: BookOpen },
    ],
  },
];
