'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookOpen, Search, ListTodo, ArrowRight } from 'lucide-react';

const ONBOARDING_KEY = 'auth0-ia-onboarding-dismissed';

export function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(ONBOARDING_KEY);
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Welcome to Docs Ops Console
          </DialogTitle>
          <DialogDescription>
            A writer-first tool for navigating, auditing, and refactoring Auth0 documentation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Search className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Explain</h4>
              <p className="text-xs text-muted-foreground">
                Pick any page and get a risk + context summary with inbound links, nav paths, and shared references.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ListTodo className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Work Queue</h4>
              <p className="text-xs text-muted-foreground">
                Triage orphans, broken links, and duplicates into a concrete list of fixes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Skip
          </Button>
          <Button size="sm" onClick={handleDismiss}>
            Get Started <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
