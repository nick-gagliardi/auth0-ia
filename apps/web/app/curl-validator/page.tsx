'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  ArrowUpRight, 
  Download, 
  Terminal, 
  Filter, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock,
  Globe,
  Activity,
  Shield,
  SkipForward,
  FileCode,
  Play,
  Loader2,
  RefreshCw,
  Code
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCurlValidator } from '@/hooks/use-index-data';
import type { CurlValidationResult, CurlValidationStats, CurlValidationIndex } from '@/types';

function CategoryBadge({ category }: { category: CurlValidationResult['category'] }) {
  const variants: Record<CurlValidationResult['category'], string> = {
    working: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
    auth_required: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    not_found: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
    failing: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
    not_executed: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800',
    skipped: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  };
  
  const labels: Record<CurlValidationResult['category'], string> = {
    working: 'Working',
    auth_required: 'Auth Required',
    not_found: 'Not Found',
    failing: 'Failing',
    not_executed: 'Not Executed',
    skipped: 'Skipped',
  };
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${variants[category]}`}>
      {labels[category]}
    </span>
  );
}

function LiveCategoryBadge({ category }: { category: 'working' | 'auth_required' | 'not_found' | 'failing' | 'skipped' }) {
  const variants = {
    working: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
    auth_required: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    not_found: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
    failing: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
    skipped: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  };
  
  const labels = {
    working: 'Working',
    auth_required: 'Auth Required',
    not_found: 'Not Found',
    failing: 'Failing',
    skipped: 'Skipped',
  };
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${variants[category]}`}>
      {labels[category]}
    </span>
  );
}

function CategoryIcon({ category }: { category: CurlValidationResult['category'] }) {
  switch (category) {
    case 'working':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'auth_required':
      return <Shield className="w-4 h-4 text-amber-500" />;
    case 'not_found':
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case 'failing':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'skipped':
      return <SkipForward className="w-4 h-4 text-blue-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-500" />;
  }
}

function exportToCSV(results: CurlValidationResult[]) {
  const headers = ['File', 'Start Line', 'URL', 'Method', 'Category', 'Status Code', 'Response Time (ms)', 'Error', 'Original Command'];
  const rows = results.map((r) => [
    r.filePath,
    String(r.startLine),
    r.url,
    r.method,
    r.category,
    r.statusCode?.toString() || '',
    r.responseTimeMs?.toString() || '',
    r.error || '',
    r.originalCommand,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `curl-validator-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportHealthReport(healthReport: any) {
  const json = JSON.stringify(healthReport, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `endpoint-health-report-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Live execution types
type LiveExecutionResult = {
  originalCommand: string;
  modifiedCommand: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  executed: boolean;
  statusCode?: number;
  statusText?: string;
  responseTimeMs?: number;
  responseBody?: string;
  error?: string;
  category: 'working' | 'auth_required' | 'not_found' | 'failing' | 'skipped';
  warnings: string[];
  rateLimitStatus?: {
    currentRequests: number;
    maxRequests: number;
  };
};

export default function CurlValidatorPage() {
  const { data, isLoading, error, refetch } = useCurlValidator();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [method, setMethod] = useState<string>('all');
  const [domain, setDomain] = useState<string>('all');

  const results = data?.results ?? [];
  const stats = data?.stats;
  const config = data?.config;
  const healthReport = data?.healthReport;

  const categories = useMemo(() => {
    const cats = new Set(results.map((r) => r.category));
    return ['all', ...Array.from(cats).sort()];
  }, [results]);

  const methods = useMemo(() => {
    const meths = new Set(results.map((r) => r.method).filter(Boolean));
    return ['all', ...Array.from(meths).sort()];
  }, [results]);

  const domains = useMemo(() => {
    const doms = new Set<string>();
    for (const r of results) {
      try {
        const url = new URL(r.url);
        doms.add(url.hostname);
      } catch {
        // Invalid URL
      }
    }
    return ['all', ...Array.from(doms).sort()];
  }, [results]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return results.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (method !== 'all' && r.method !== method) return false;
      if (domain !== 'all') {
        try {
          const url = new URL(r.url);
          if (url.hostname !== domain) return false;
        } catch {
          return false;
        }
      }
      if (!qq) return true;
      
      const hay = `${r.filePath} ${r.url} ${r.method} ${r.originalCommand} ${r.error || ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [results, q, category, method, domain]);

  const byCategory = useMemo(() => {
    const grouped: Record<string, CurlValidationResult[]> = {};
    for (const r of filtered) {
      grouped[r.category] = grouped[r.category] || [];
      grouped[r.category].push(r);
    }
    return grouped;
  }, [filtered]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Loading curl validator…</div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">cURL Validator</h1>
          <p className="text-muted-foreground mb-4">Failed to load curl validation data.</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">cURL Validator</h1>
          <p className="text-muted-foreground">
            Live execution validation of curl commands in documentation. Tests endpoints safely with rate limiting and GET-only safety.
          </p>
        </div>

        <Tabs defaultValue="results">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="results" className="gap-2">
              <Terminal className="w-4 h-4" />
              Validation Results
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <Play className="w-4 h-4" />
              Live Test
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-2">
              <Activity className="w-4 h-4" />
              Endpoint Health
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="mt-6">
            <ValidationResultsTab 
              results={results}
              stats={stats}
              config={config}
              filtered={filtered}
              byCategory={byCategory}
              categories={categories}
              methods={methods}
              domains={domains}
              category={category}
              setCategory={setCategory}
              method={method}
              setMethod={setMethod}
              domain={domain}
              setDomain={setDomain}
              q={q}
              setQ={setQ}
            />
          </TabsContent>

          <TabsContent value="live" className="mt-6">
            <LiveTestTab />
          </TabsContent>

          <TabsContent value="health" className="mt-6">
            <HealthTab healthReport={healthReport} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ValidationResultsTab({
  results,
  stats,
  config,
  filtered,
  byCategory,
  categories,
  methods,
  domains,
  category,
  setCategory,
  method,
  setMethod,
  domain,
  setDomain,
  q,
  setQ,
}: {
  results: CurlValidationResult[];
  stats?: CurlValidationStats;
  config?: CurlValidationIndex['config'];
  filtered: CurlValidationResult[];
  byCategory: Record<string, CurlValidationResult[]>;
  categories: string[];
  methods: string[];
  domains: string[];
  category: string;
  setCategory: (v: string) => void;
  method: string;
  setMethod: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
}) {
  if (!results.length) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-muted-foreground">
          No curl commands found in the documentation. Run the indexer to generate validation data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Config Card */}
      {config && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Validation Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Test Domain</div>
                <div className="font-mono">{config.testDomain}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Timeout</div>
                <div>{config.timeoutMs}ms</div>
              </div>
              <div>
                <div className="text-muted-foreground">Rate Limit</div>
                <div>{config.maxRequestsPerMinute}/min</div>
              </div>
              <div>
                <div className="text-muted-foreground">Max Retries</div>
                <div>{config.maxRetries}</div>
              </div>
              <div>
                <div className="text-muted-foreground">GET Only</div>
                <div>{config.getOnly ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            <div className="text-xs text-muted-foreground">Total Commands</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats?.working ?? 0}</div>
            <div className="text-xs text-muted-foreground">Working</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats?.authRequired ?? 0}</div>
            <div className="text-xs text-muted-foreground">Auth Required</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">{stats?.notFound ?? 0}</div>
            <div className="text-xs text-muted-foreground">Not Found</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats?.failing ?? 0}</div>
            <div className="text-xs text-muted-foreground">Failing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats?.skipped ?? 0}</div>
            <div className="text-xs text-muted-foreground">Skipped (Safety)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-600">{stats?.notExecuted ?? 0}</div>
            <div className="text-xs text-muted-foreground">Not Executed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.executed ?? 0}</div>
            <div className="text-xs text-muted-foreground">Executed</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Search and filter curl commands by category, HTTP method, and domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search file path, URL, or command..."
                className="pl-12 h-12 rounded-2xl"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                className="h-12 rounded-2xl border bg-card px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="working">Working</option>
                <option value="auth_required">Auth Required</option>
                <option value="not_found">Not Found</option>
                <option value="failing">Failing</option>
                <option value="skipped">Skipped</option>
                <option value="not_executed">Not Executed</option>
              </select>
              <select
                className="h-12 rounded-2xl border bg-card px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m === 'all' ? 'All Methods' : m}
                  </option>
                ))}
              </select>
              <select
                className="h-12 rounded-2xl border bg-card px-3 text-sm"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d === 'all' ? 'All Domains' : d}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="icon" onClick={() => exportToCSV(filtered)} title="Export to CSV">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Category Summary */}
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground mb-2">Filter by category:</div>
            <div className="flex flex-wrap gap-1">
              {[
                { key: 'working', label: 'Working', count: stats?.working },
                { key: 'auth_required', label: 'Auth Required', count: stats?.authRequired },
                { key: 'not_found', label: 'Not Found', count: stats?.notFound },
                { key: 'failing', label: 'Failing', count: stats?.failing },
                { key: 'skipped', label: 'Skipped', count: stats?.skipped },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setCategory(category === key ? 'all' : key)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    category === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {label}: {count}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">
            All ({filtered.length})
          </TabsTrigger>
          <TabsTrigger value="working">
            Working ({byCategory.working?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="issues">
            Issues ({(byCategory.failing?.length || 0) + (byCategory.not_found?.length || 0)})
          </TabsTrigger>
          <TabsTrigger value="auth">
            Auth Required ({byCategory.auth_required?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="skipped">
            Skipped ({byCategory.skipped?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ResultList results={filtered} />
        </TabsContent>
        <TabsContent value="working" className="mt-4">
          <ResultList results={byCategory.working || []} />
        </TabsContent>
        <TabsContent value="issues" className="mt-4">
          <ResultList results={[...(byCategory.failing || []), ...(byCategory.not_found || [])]} />
        </TabsContent>
        <TabsContent value="auth" className="mt-4">
          <ResultList results={byCategory.auth_required || []} />
        </TabsContent>
        <TabsContent value="skipped" className="mt-4">
          <ResultList results={byCategory.skipped || []} />
        </TabsContent>
      </Tabs>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No curl commands match the current filters.
        </div>
      )}
    </div>
  );
}

// Variable type
type Variable = { key: string; value: string };

// Extended result type for production mode
type ExtendedExecutionResult = LiveExecutionResult & {
  processedCommand?: string;
  responseHeaders?: Record<string, string>;
  variablesApplied?: string[];
  safeMode?: boolean;
};

// Load saved variables from localStorage
function loadSavedVariables(): Variable[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem('curl-validator-variables');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// Save variables to localStorage
function saveVariables(variables: Variable[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('curl-validator-variables', JSON.stringify(variables));
  } catch {}
}

function LiveTestTab() {
  const [command, setCommand] = useState('');
  const [result, setResult] = useState<ExtendedExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);

  // Variables state
  const [variables, setVariables] = useState<Variable[]>(() => loadSavedVariables());
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [showVariables, setShowVariables] = useState(true);

  // Options state
  const [options, setOptions] = useState({
    safeMode: true,
    allowAllMethods: false,
    timeoutMs: 30000,
  });

  // Save variables when they change
  const updateVariables = (newVars: Variable[]) => {
    setVariables(newVars);
    saveVariables(newVars);
  };

  const addVariable = () => {
    if (!newVarKey.trim()) return;
    const newVar: Variable = { key: newVarKey.trim(), value: newVarValue };
    updateVariables([...variables, newVar]);
    setNewVarKey('');
    setNewVarValue('');
  };

  const removeVariable = (index: number) => {
    updateVariables(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    updateVariables(updated);
  };

  const executeCommand = async () => {
    if (!command.trim()) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Convert variables array to object
      const variablesObj: Record<string, string> = {};
      for (const v of variables) {
        if (v.key.trim()) {
          variablesObj[v.key.trim()] = v.value;
        }
      }

      const response = await fetch('/api/curl-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.trim(),
          variables: variablesObj,
          options: {
            safeMode: options.safeMode,
            allowAllMethods: options.allowAllMethods,
            timeoutMs: options.timeoutMs,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Execution failed');
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setIsExecuting(false);
    }
  };

  const loadExample = (example: string) => {
    setCommand(example);
    setResult(null);
    setError(null);
  };

  const loadExampleWithVariables = () => {
    setCommand(`curl -X POST "https://{{tenant}}/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{"client_id":"{{client_id}}","client_secret":"{{client_secret}}","audience":"{{audience}}","grant_type":"client_credentials"}'`);

    // Add example variables if not present
    const existingKeys = new Set(variables.map(v => v.key));
    const newVars = [...variables];

    if (!existingKeys.has('tenant')) {
      newVars.push({ key: 'tenant', value: 'your-tenant.us.auth0.com' });
    }
    if (!existingKeys.has('client_id')) {
      newVars.push({ key: 'client_id', value: '' });
    }
    if (!existingKeys.has('client_secret')) {
      newVars.push({ key: 'client_secret', value: '' });
    }
    if (!existingKeys.has('audience')) {
      newVars.push({ key: 'audience', value: 'https://your-tenant.us.auth0.com/api/v2/' });
    }

    updateVariables(newVars);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Variables Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Code className="w-5 h-5" />
              Variables
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVariables(!showVariables)}
            >
              {showVariables ? 'Hide' : 'Show'}
            </Button>
          </div>
          <CardDescription>
            Define variables like <code className="text-xs bg-muted px-1 rounded">{`{{tenant}}`}</code> or <code className="text-xs bg-muted px-1 rounded">{`\${client_id}`}</code> to use in your commands. Variables are saved locally.
          </CardDescription>
        </CardHeader>
        {showVariables && (
          <CardContent className="space-y-3">
            {/* Existing Variables */}
            {variables.length > 0 && (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={v.key}
                      onChange={(e) => updateVariable(i, 'key', e.target.value)}
                      placeholder="Variable name"
                      className="w-32 font-mono text-sm"
                    />
                    <span className="text-muted-foreground">=</span>
                    <Input
                      value={v.value}
                      onChange={(e) => updateVariable(i, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 font-mono text-sm"
                      type={v.key.toLowerCase().includes('secret') || v.key.toLowerCase().includes('password') ? 'password' : 'text'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeVariable(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Variable */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                value={newVarKey}
                onChange={(e) => setNewVarKey(e.target.value)}
                placeholder="New variable name"
                className="w-32 font-mono text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addVariable()}
              />
              <span className="text-muted-foreground">=</span>
              <Input
                value={newVarValue}
                onChange={(e) => setNewVarValue(e.target.value)}
                placeholder="Value"
                className="flex-1 font-mono text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addVariable()}
              />
              <Button variant="outline" size="sm" onClick={addVariable}>
                Add
              </Button>
            </div>

            {/* Quick Add Common Variables */}
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-xs text-muted-foreground">Quick add:</span>
              {['tenant', 'client_id', 'client_secret', 'access_token', 'audience'].map((key) => (
                !variables.some(v => v.key === key) && (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => updateVariables([...variables, { key, value: '' }])}
                  >
                    + {key}
                  </Button>
                )
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Execution Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Live Curl Execution
          </CardTitle>
          <CardDescription>
            Test curl commands in real-time. Use production mode to test with real credentials against your Auth0 tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Options */}
          <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-3">
              <div className="font-medium text-sm">Execution Mode</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!options.safeMode}
                  onChange={(e) => setOptions({ ...options, safeMode: !e.target.checked })}
                  className="rounded"
                />
                <span className={!options.safeMode ? 'text-amber-600 font-medium' : ''}>
                  Production mode
                </span>
                <span className="text-xs text-muted-foreground">
                  (use real credentials)
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.allowAllMethods}
                  onChange={(e) => setOptions({ ...options, allowAllMethods: e.target.checked })}
                  className="rounded"
                />
                <span className={options.allowAllMethods ? 'text-amber-600 font-medium' : ''}>
                  Allow all HTTP methods
                </span>
                <span className="text-xs text-muted-foreground">
                  (POST, PUT, DELETE)
                </span>
              </label>
            </div>
            <div className="space-y-3">
              <div className="font-medium text-sm">Settings</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Timeout:</span>
                <select
                  className="text-sm border rounded px-2 py-1 bg-background"
                  value={options.timeoutMs}
                  onChange={(e) => setOptions({ ...options, timeoutMs: parseInt(e.target.value) })}
                >
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                  <option value={30000}>30s</option>
                  <option value={60000}>60s</option>
                </select>
              </div>
            </div>
          </div>

          {/* Warning for production mode */}
          {(!options.safeMode || options.allowAllMethods) && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Warning:</strong> You have enabled production features.
                {!options.safeMode && ' Commands will be executed with real credentials.'}
                {options.allowAllMethods && ' Non-GET methods may modify data.'}
              </div>
            </div>
          )}

          {/* Command Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Curl Command</label>
            <Textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={`curl https://{{tenant}}/api/v2/users \\
  -H "Authorization: Bearer {{access_token}}"`}
              className="font-mono min-h-[150px]"
            />
            {variables.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Available variables: {variables.map(v => `{{${v.key}}}`).join(', ')}
              </div>
            )}
          </div>

          {/* Examples */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Quick examples:</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadExample('curl https://{{tenant}}/.well-known/openid-configuration')}
              >
                <Code className="w-3 h-3 mr-1" />
                OIDC Discovery
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadExample(`curl "https://{{tenant}}/api/v2/users" \\
  -H "Authorization: Bearer {{access_token}}"`)}
              >
                <Code className="w-3 h-3 mr-1" />
                List Users
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadExampleWithVariables}
              >
                <Code className="w-3 h-3 mr-1" />
                Client Credentials (POST)
              </Button>
            </div>
          </div>

          {/* Execute Button */}
          <Button
            onClick={executeCommand}
            disabled={isExecuting || !command.trim()}
            className="w-full"
            variant={!options.safeMode || options.allowAllMethods ? 'destructive' : 'default'}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Execute Command
                {!options.safeMode && ' (Production)'}
              </>
            )}
          </Button>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/50 rounded-lg text-red-600">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">Result:</span>
                <LiveCategoryBadge category={result.category} />
                {result.statusCode && (
                  <Badge variant={result.statusCode < 400 ? 'default' : 'destructive'}>
                    HTTP {result.statusCode} {result.statusText}
                  </Badge>
                )}
                {result.responseTimeMs && (
                  <span className="text-sm text-muted-foreground">
                    {result.responseTimeMs}ms
                  </span>
                )}
                {result.safeMode === false && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">
                    Production
                  </Badge>
                )}
              </div>

              {result.variablesApplied && result.variablesApplied.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Variables applied: {result.variablesApplied.join(', ')}
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((warning, i) => (
                    <div key={i} className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {result.rateLimitStatus && (
                <div className="text-xs text-muted-foreground">
                  Rate limit: {result.rateLimitStatus.currentRequests}/{result.rateLimitStatus.maxRequests} requests/min
                </div>
              )}

              {result.processedCommand && result.processedCommand !== result.originalCommand && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Processed Command (with variables):</div>
                  <code className="block p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-xs font-mono break-all border border-green-200 dark:border-green-800">
                    {result.processedCommand}
                  </code>
                </div>
              )}

              {result.url && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Request URL:</div>
                  <code className="block p-3 bg-secondary rounded-lg text-xs font-mono break-all">
                    {result.method} {result.url}
                  </code>
                </div>
              )}

              {result.error && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-red-600">Error:</div>
                  <div className="p-3 bg-red-50 dark:bg-red-950/50 rounded-lg text-sm text-red-600">
                    {result.error}
                  </div>
                </div>
              )}

              {result.responseHeaders && Object.keys(result.responseHeaders).length > 0 && (
                <div className="space-y-2">
                  <button
                    className="text-sm font-medium flex items-center gap-1 hover:underline"
                    onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                  >
                    Response Headers ({Object.keys(result.responseHeaders).length})
                    {showResponseHeaders ? ' ▼' : ' ▶'}
                  </button>
                  {showResponseHeaders && (
                    <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto max-h-[200px]">
                      {JSON.stringify(result.responseHeaders, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {result.responseBody && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Response Body:</div>
                  <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto max-h-[400px]">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(result.responseBody), null, 2);
                      } catch {
                        return result.responseBody;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthTab({ healthReport }: { healthReport?: CurlValidationIndex['healthReport'] }) {
  if (!healthReport) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No health report available. Run the indexer to generate endpoint health data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-green-200 dark:border-green-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Endpoint Health Report
            </span>
            <Button variant="outline" size="sm" onClick={() => exportHealthReport(healthReport)}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </CardTitle>
          <CardDescription>
            {healthReport.summary.totalEndpoints} unique endpoints analyzed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{healthReport.summary.healthy}</div>
              <div className="text-xs text-green-700 dark:text-green-400">Healthy</div>
            </div>
            <div className="text-center p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{healthReport.summary.authRequired}</div>
              <div className="text-xs text-amber-700 dark:text-amber-400">Auth Required</div>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{healthReport.summary.broken}</div>
              <div className="text-xs text-red-700 dark:text-red-400">Broken</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{healthReport.summary.notTested}</div>
              <div className="text-xs text-gray-700 dark:text-gray-400">Not Tested</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoint Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {healthReport.endpoints.map((endpoint, i) => (
              <div key={i} className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={endpoint.status === 'healthy' ? 'default' : 'destructive'}>
                    {endpoint.status}
                  </Badge>
                  <Badge variant="secondary">{endpoint.method}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {endpoint.occurrences} occurrence{endpoint.occurrences !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="mt-1 text-sm font-mono break-all">{endpoint.url}</div>
                {endpoint.avgResponseTimeMs && (
                  <div className="text-xs text-muted-foreground">
                    Avg response time: {endpoint.avgResponseTimeMs}ms
                  </div>
                )}
                {endpoint.errors.length > 0 && (
                  <div className="mt-2 text-sm text-red-600">
                    {endpoint.errors.map((e, j) => (
                      <div key={j}>{e}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultList({ results }: { results: CurlValidationResult[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newSet = new Set(expanded);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpanded(newSet);
  };

  return (
    <div className="space-y-2">
      {results.slice(0, 200).map((result) => (
        <div key={result.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge category={result.category} />
                <Badge variant="secondary">{result.method || 'UNKNOWN'}</Badge>
                {result.statusCode && (
                  <Badge variant="outline">HTTP {result.statusCode}</Badge>
                )}
                {result.responseTimeMs && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    {result.responseTimeMs}ms
                  </Badge>
                )}
              </div>

              <div className="mt-2 text-sm font-mono break-all text-muted-foreground">
                <FileCode className="w-4 h-4 inline mr-1" />
                {result.filePath}:{result.startLine}
              </div>

              {result.url && (
                <div className="mt-1 text-sm font-mono break-all text-primary">
                  <Globe className="w-4 h-4 inline mr-1" />
                  {result.url}
                </div>
              )}

              {result.error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 p-2 rounded">
                  <XCircle className="w-4 h-4 inline mr-1" />
                  {result.error}
                </div>
              )}

              {result.skipReason && (
                <div className="mt-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-950/50 p-2 rounded">
                  <SkipForward className="w-4 h-4 inline mr-1" />
                  {result.skipReason}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  href={`/explain?id=${encodeURIComponent(result.filePath)}`}
                >
                  Explain page <ArrowUpRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => toggleExpand(result.id)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Terminal className="w-4 h-4" />
                  {expanded.has(result.id) ? 'Hide command' : 'Show command'}
                </button>
              </div>

              {expanded.has(result.id) && (
                <div className="mt-3 space-y-2">
                  <div className="p-3 bg-secondary rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Original Command:</div>
                    <code className="text-xs font-mono break-all block">{result.originalCommand}</code>
                  </div>
                  {result.modifiedCommand !== result.originalCommand && (
                    <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                      <div className="text-xs text-green-700 dark:text-green-400 mb-1">Modified (safe to execute):</div>
                      <code className="text-xs font-mono break-all block">{result.modifiedCommand}</code>
                    </div>
                  )}
                  {Object.keys(result.headers).length > 0 && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Headers:</div>
                      <pre className="text-xs font-mono overflow-x-auto">
                        {JSON.stringify(result.headers, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {results.length > 200 && (
        <div className="text-xs text-muted-foreground text-center">
          Showing first 200 of {results.length} results
        </div>
      )}
    </div>
  );
}
