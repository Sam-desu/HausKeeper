import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// useApi('/rooms?status=available') → { data, loading, error, status, reload }
// Pass null to skip the request. Changing the path refetches, keeping old data on screen meanwhile.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(path)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err) => !cancelled && setState({ data: null, error: err.message, status: err.status, loading: false }));
    return () => { cancelled = true; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}