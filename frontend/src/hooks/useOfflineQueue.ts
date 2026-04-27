import { useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const STORAGE_KEY = 'communityos_offline_queue';

export interface QueuedAction {
  collection: string;
  docId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

async function applyAction(action: QueuedAction): Promise<void> {
  const ref = doc(db, action.collection, action.docId);
  const existing = await getDoc(ref);

  // Last-write-wins: skip if remote doc has a newer timestamp
  if (existing.exists()) {
    const remoteTs = (existing.data().updated_at?.seconds ?? 0) * 1000;
    if (remoteTs > action.timestamp) {
      return;
    }
  }

  await setDoc(ref, { ...action.data, updated_at: new Date(action.timestamp) }, { merge: true });
}

export function useOfflineQueue() {
  const syncingRef = useRef(false);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const queue = loadQueue();
      const failed: QueuedAction[] = [];

      for (const action of queue) {
        try {
          await applyAction(action);
        } catch {
          failed.push(action);
        }
      }

      saveQueue(failed);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const queueAction = useCallback(
    (action: QueuedAction) => {
      const queue = loadQueue();
      queue.push(action);
      saveQueue(queue);

      if (navigator.onLine) {
        void syncQueue();
      }
    },
    [syncQueue]
  );

  // Sync when coming back online
  useEffect(() => {
    const handleOnline = () => void syncQueue();
    window.addEventListener('online', handleOnline);

    // Attempt sync on mount if online
    if (navigator.onLine) {
      void syncQueue();
    }

    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue]);

  return { queueAction, syncQueue };
}
