'use client';

import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Key } from 'lucide-react';

interface AnthropicKeyPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnthropicKeyPrompt({ open, onOpenChange }: AnthropicKeyPromptProps) {
  const router = useRouter();

  const handleConfigureNow = () => {
    onOpenChange(false);
    router.push('/settings');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-5 h-5 text-primary" />
            <AlertDialogTitle>Anthropic API Key Required</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 text-left">
            <p>
              AI-powered features (like audit suggestions) require an Anthropic API key. This key is:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Personal to you (not shared with other users)</li>
              <li>Encrypted and stored securely</li>
              <li>Used only for AI features you request</li>
            </ul>
            <p className="text-sm">
              You can get a free API key from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                console.anthropic.com
              </a>
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Skip for Now</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfigureNow}>
            Configure Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
