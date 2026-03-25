'use client';

import { useState, useEffect, useCallback } from 'react';

export type ActivityType = 'audit' | 'explain' | 'pr-review' | 'refactor' | 'search';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  url?: string;
  filePath?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

const STORAGE_KEY = 'auth0-ia-activity-history';
const MAX_ITEMS = 100;

function getStoredHistory(): ActivityItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function setStoredHistory(items: ActivityItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or disabled
  }
}

export function useActivityHistory() {
  const [history, setHistory] = useState<ActivityItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(getStoredHistory());
  }, []);

  const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'timestamp'>) => {
    const newItem: ActivityItem = {
      ...item,
      id: `${item.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    setHistory(prev => {
      // Dedupe: remove existing item with same type + title/url combo
      const filtered = prev.filter(existing => {
        if (existing.type !== item.type) return true;
        if (item.url && existing.url === item.url) return false;
        if (item.filePath && existing.filePath === item.filePath) return false;
        if (existing.title === item.title) return false;
        return true;
      });

      const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
      setStoredHistory(updated);
      return updated;
    });

    return newItem;
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setStoredHistory([]);
  }, []);

  const clearByType = useCallback((type: ActivityType) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.type !== type);
      setStoredHistory(updated);
      return updated;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      setStoredHistory(updated);
      return updated;
    });
  }, []);

  const getByType = useCallback((type: ActivityType) => {
    return history.filter(item => item.type === type);
  }, [history]);

  const getRecent = useCallback((limit: number = 10) => {
    return history.slice(0, limit);
  }, [history]);

  return {
    history,
    addActivity,
    clearHistory,
    clearByType,
    removeItem,
    getByType,
    getRecent,
  };
}

// Singleton-like function to add activity from anywhere (e.g., API routes)
export function recordActivity(item: Omit<ActivityItem, 'id' | 'timestamp'>) {
  const history = getStoredHistory();
  const newItem: ActivityItem = {
    ...item,
    id: `${item.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  // Dedupe
  const filtered = history.filter(existing => {
    if (existing.type !== item.type) return true;
    if (item.url && existing.url === item.url) return false;
    if (item.filePath && existing.filePath === item.filePath) return false;
    if (existing.title === item.title) return false;
    return true;
  });

  setStoredHistory([newItem, ...filtered]);
  return newItem;
}
