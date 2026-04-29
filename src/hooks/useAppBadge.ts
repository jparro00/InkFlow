import { useEffect } from 'react';
import { useConsentSubmissionStore } from '../stores/consentSubmissionStore';

// Narrow the global Navigator type so we don't have to drag a DOM lib bump
// in just for two methods. The Badging API is still vendor-prefixed in some
// type packages and missing from older lib.dom.d.ts.
type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Mirror the count of consent submissions awaiting review onto the OS app
 * icon via the W3C Badging API. Works without any prompt on Chrome/Edge
 * desktop and on iOS 16.4+ when the app is installed to the home screen
 * AND the user has granted notification permission. We don't request that
 * permission here — until it's granted, calls are silent no-ops, and the
 * in-app sidebar badge keeps showing the same count.
 *
 * Mount once at the top of the authenticated tree (AppShell). DataLoader
 * keeps the consent-submission store in sync via realtime subscription, so
 * this hook automatically tracks new submissions as they arrive.
 */
export function useAppBadge() {
  const awaitingReview = useConsentSubmissionStore((s) =>
    s.submissions.filter((sub) => sub.status === 'submitted').length,
  );

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as BadgingNavigator;
    if (!nav.setAppBadge || !nav.clearAppBadge) return;

    // setAppBadge(0) is supposed to clear, but a few platforms still render
    // a "0" pip — call clearAppBadge explicitly when there's nothing to show.
    const promise =
      awaitingReview > 0 ? nav.setAppBadge(awaitingReview) : nav.clearAppBadge();
    promise.catch(() => {
      // Usually means notification permission isn't granted (iOS PWA). The
      // visible sidebar badge still works, so swallow it.
    });
  }, [awaitingReview]);

  // Clear the OS badge when AppShell unmounts (sign-out). Otherwise a stale
  // count lingers on the icon until the user opens the app again.
  useEffect(() => {
    return () => {
      const nav = navigator as BadgingNavigator;
      nav.clearAppBadge?.().catch(() => {});
    };
  }, []);
}
