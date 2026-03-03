'use client';

import { useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Github } from 'lucide-react';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  // Redirect if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSignIn = async () => {
    await signIn('github', { callbackUrl });
  };

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold">Auth0 Internal Assistant</CardTitle>
          <CardDescription>
            Sign in with your GitHub account to access the tool
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button
              onClick={handleSignIn}
              className="w-full gap-2"
              size="lg"
              disabled={status === 'loading'}
            >
              <Github className="w-5 h-5" />
              {status === 'loading' ? 'Loading...' : 'Sign in with GitHub'}
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>This tool requires GitHub OAuth authentication.</p>
            <p>Your credentials are securely stored and encrypted.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
