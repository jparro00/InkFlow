import { useEffect, useState } from 'react';
import { fetchR2Blob } from '../lib/r2';

/**
 * Loads a single R2 object as a blob: URL. Re-runs when `key` changes,
 * revokes the previous URL on cleanup so we don't leak. Returns null while
 * loading or if the key is missing / fetch failed (a missing image is
 * indistinguishable from a slow network here, so callers usually render a
 * placeholder for either case).
 */
export function useR2Image(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    if (key) {
      fetchR2Blob(key)
        .then((blob) => {
          if (cancelled || !blob) return;
          blobUrl = URL.createObjectURL(blob);
          setUrl(blobUrl);
        })
        .catch((err) => {
          if (!cancelled) console.error('useR2Image failed', err);
        });
    }
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      // Cleanup phase — clear stale URL so the next render doesn't show a
      // revoked blob: while the new key's fetch is in flight.
      setUrl(null);
    };
  }, [key]);

  return url;
}
