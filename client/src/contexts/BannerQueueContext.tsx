import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

/**
 * BannerQueue coordinates bottom banners (cookie, install, notifications)
 * so only one shows at a time. Priority order:
 * 1. Cookie Consent (GDPR - must come first)
 * 2. PWA Install
 * 3. Notification Prompt
 */

type BannerId = "cookie" | "pwa-install" | "notification";

interface BannerQueueContextType {
  /** The banner currently allowed to display */
  activeBanner: BannerId | null;
  /** Register a banner as wanting to show */
  register: (id: BannerId) => void;
  /** Mark a banner as dismissed/completed */
  dismiss: (id: BannerId) => void;
}

const BannerQueueContext = createContext<BannerQueueContextType | null>(null);

const PRIORITY: BannerId[] = ["cookie", "pwa-install", "notification"];

export function BannerQueueProvider({ children }: { children: ReactNode }) {
  const [registered, setRegistered] = useState<Set<BannerId>>(new Set());
  const [dismissed, setDismissed] = useState<Set<BannerId>>(new Set());

  const register = useCallback((id: BannerId) => {
    setRegistered((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: BannerId) => {
    setDismissed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setRegistered((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const activeBanner = useMemo(() => {
    for (const id of PRIORITY) {
      if (registered.has(id) && !dismissed.has(id)) {
        return id;
      }
    }
    return null;
  }, [registered, dismissed]);

  return (
    <BannerQueueContext.Provider value={{ activeBanner, register, dismiss }}>
      {children}
    </BannerQueueContext.Provider>
  );
}

export function useBannerQueue() {
  const ctx = useContext(BannerQueueContext);
  if (!ctx) throw new Error("useBannerQueue must be used within BannerQueueProvider");
  return ctx;
}
