'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/AppLayout';
import { RefreshCw } from 'lucide-react';

type SettingsData = {
  githubUsername: string;
  hasAnthropicKey: boolean;
  hasGithubPat: boolean;
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingPat, setIsSavingPat] = useState(false);
  const [isDeletingPat, setIsDeletingPat] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch current settings
  useEffect(() => {
    if (status === 'authenticated') {
      fetchSettings();
    }
  }, [status]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load settings',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveKey = async () => {
    if (!anthropicKey.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an Anthropic API key',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: anthropicKey }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Anthropic API key saved successfully',
        });
        setAnthropicKey('');
        await fetchSettings();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to save API key',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save API key',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!confirm('Are you sure you want to delete your Anthropic API key? You will need to enter it again to use AI features.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Anthropic API key deleted',
        });
        await fetchSettings();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete API key',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete API key',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveGithubPat = async () => {
    if (!githubPat.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a GitHub Personal Access Token',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingPat(true);
    try {
      const response = await fetch('/api/settings/github-pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubPat }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'GitHub PAT saved successfully',
        });
        setGithubPat('');
        await fetchSettings();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to save GitHub PAT',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save GitHub PAT',
        variant: 'destructive',
      });
    } finally {
      setIsSavingPat(false);
    }
  };

  const handleDeleteGithubPat = async () => {
    if (!confirm('Are you sure you want to delete your GitHub PAT? PR creation will fall back to using your OAuth token.')) {
      return;
    }

    setIsDeletingPat(true);
    try {
      const response = await fetch('/api/settings/github-pat', {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'GitHub PAT deleted',
        });
        await fetchSettings();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete GitHub PAT',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete GitHub PAT',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingPat(false);
    }
  };

  const handleReindex = async () => {
    if (!confirm('This will trigger a full reindex of the Auth0 docs. This may take several minutes. Continue?')) {
      return;
    }

    setIsReindexing(true);
    try {
      const response = await fetch('/api/maintenance/reindex', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Reindex Started',
          description: 'The reindex workflow has been triggered. Check the Actions tab on GitHub for progress.',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to trigger reindex',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to trigger reindex',
        variant: 'destructive',
      });
    } finally {
      setIsReindexing(false);
    }
  };


  if (status === 'loading' || isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect to login
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {/* GitHub Account */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>GitHub Account</CardTitle>
            <CardDescription>
              Your authenticated GitHub account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Username</Label>
                <div className="mt-1 text-lg font-medium">
                  @{settings?.githubUsername || session?.user?.name || 'Unknown'}
                </div>
              </div>
              <Alert>
                <AlertDescription>
                  Your GitHub access token is securely stored and used for PR operations.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        {/* GitHub Personal Access Token */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>GitHub Personal Access Token (Optional)</CardTitle>
            <CardDescription>
              For organizations with OAuth app restrictions, provide a personal access token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current Status */}
              <Alert>
                <AlertDescription>
                  {settings?.hasGithubPat ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      ✓ Personal Access Token configured
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No PAT configured. Using OAuth token for PR operations.
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              {/* Info Alert */}
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Why use a PAT?</strong> Some organizations (like auth0) have OAuth app restrictions.
                  If you get &quot;OAuth app access restricted&quot; errors when creating PRs, configure a PAT here.
                  Your PAT will be used instead of the OAuth token for PR operations.
                </AlertDescription>
              </Alert>

              {/* Input Section */}
              <div className="space-y-2">
                <Label htmlFor="github-pat">
                  {settings?.hasGithubPat ? 'Update Personal Access Token' : 'Enter Personal Access Token'}
                </Label>
                <Input
                  id="github-pat"
                  type="password"
                  placeholder="ghp_... or github_pat_..."
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  disabled={isSavingPat}
                />
                <p className="text-sm text-muted-foreground">
                  Create a token at{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    github.com/settings/tokens
                  </a>
                  {' '}with <code className="bg-muted px-1 py-0.5 rounded">repo</code> scope
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSaveGithubPat}
                  disabled={!githubPat.trim() || isSavingPat}
                >
                  {isSavingPat ? 'Saving...' : settings?.hasGithubPat ? 'Update PAT' : 'Save PAT'}
                </Button>

                {settings?.hasGithubPat && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteGithubPat}
                    disabled={isDeletingPat}
                  >
                    {isDeletingPat ? 'Deleting...' : 'Delete PAT'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Anthropic API Key */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Anthropic API Key</CardTitle>
            <CardDescription>
              Your personal API key for AI-powered features (audit suggestions, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current Status */}
              <Alert>
                <AlertDescription>
                  {settings?.hasAnthropicKey ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      ✓ API key configured
                    </span>
                  ) : (
                    <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                      ⚠ No API key configured. AI features will not work.
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              {/* Input Section */}
              <div className="space-y-2">
                <Label htmlFor="anthropic-key">
                  {settings?.hasAnthropicKey ? 'Update API Key' : 'Enter API Key'}
                </Label>
                <Input
                  id="anthropic-key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  disabled={isSaving}
                />
                <p className="text-sm text-muted-foreground">
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSaveKey}
                  disabled={!anthropicKey.trim() || isSaving}
                >
                  {isSaving ? 'Validating and saving...' : settings?.hasAnthropicKey ? 'Update Key' : 'Save Key'}
                </Button>

                {settings?.hasAnthropicKey && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteKey}
                    disabled={isSaving || isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Key'}
                  </Button>
                )}
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  Your API key is encrypted and stored securely. It is never logged or shared.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        {/* Reindex */}
        <Card>
          <CardHeader>
            <CardTitle>Reindex Documentation</CardTitle>
            <CardDescription>
              Refresh the search index with the latest Auth0 documentation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Last indexed: <span className="font-medium">March 3, 2026</span> (2215 pages, 201 snippets)
                </AlertDescription>
              </Alert>

              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Triggers a GitHub Actions workflow that fetches the latest docs from the{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">auth0/docs-v2</code> repository
                  and rebuilds the search index. This typically takes 5-10 minutes.
                </p>

                <Button
                  onClick={handleReindex}
                  disabled={isReindexing}
                  variant="outline"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isReindexing ? 'animate-spin' : ''}`} />
                  {isReindexing ? 'Triggering Reindex...' : 'Reindex Now'}
                </Button>
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  Monitor progress on the{' '}
                  <a
                    href="https://github.com/nick-gagliardi/auth0-ia/actions/workflows/reindex.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    GitHub Actions page
                  </a>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        {/* GitHub Repository */}
        <Card>
          <CardHeader>
            <CardTitle>GitHub Repository</CardTitle>
            <CardDescription>
              Source code and issue tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This application is open source. View the code, report issues, or contribute on GitHub.
              </p>

              <Button variant="outline" asChild>
                <a
                  href="https://github.com/nick-gagliardi/auth0-ia"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  View on GitHub
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </AppLayout>
  );
}
