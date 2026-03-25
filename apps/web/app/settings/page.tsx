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

type SettingsData = {
  githubUsername: string;
  hasAnthropicKey: boolean;
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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


  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Settings</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect to login
  }

  return (
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

        {/* Anthropic API Key */}
        <Card>
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
      </div>
    </div>
  );
}
