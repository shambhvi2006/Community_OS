import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type OrderByDirection,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export function useCollection<T>(
  collectionName: string,
  ngoId: string | null,
  orderByField?: string,
  orderDirection?: OrderByDirection
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ngoId) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const constraints: QueryConstraint[] = [where('ngo_id', '==', ngoId)];
    if (orderByField) {
      constraints.push(orderBy(orderByField, orderDirection ?? 'asc'));
    }

    const q = query(collection(db, collectionName), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as T
        );
        setData(docs);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [collectionName, ngoId, orderByField, orderDirection]);

  return { data, loading, error };
}
