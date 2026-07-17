import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadServiceStatusFromSettings } from "@/lib/service-status.functions";
import {
  DEFAULT_SERVICE_STATUS,
  SERVICE_STATUS_STORAGE_KEY,
  getServiceSuspensionMessage,
  withServiceStatusDefaults,
  type ServiceStatus,
} from "@/lib/service-status";
import { ServiceStatusContext, type ServiceStatusContextValue } from "@/lib/service-status-store";

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const loadServiceStatus = useServerFn(loadServiceStatusFromSettings);
  const [status, setStatus] = useState<ServiceStatus>(DEFAULT_SERVICE_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState<"google" | "local">("google");
  const [fallbackReason, setFallbackReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const applyStatus = useCallback((nextStatus: ServiceStatus) => {
    const normalizedStatus = withServiceStatusDefaults(nextStatus);
    setStatus(normalizedStatus);
    writeStoredServiceStatus(normalizedStatus);
  }, []);

  const refreshServiceStatus = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await loadServiceStatus();

      if (result.loadedFromGoogleSheets) {
        applyStatus(result.status);
        setSource("google");
        setFallbackReason("");
        return;
      }

      const storedStatus = readStoredServiceStatus();
      setStatus(storedStatus ?? result.status);
      setSource("local");
      setFallbackReason(result.reason);
    } catch (error) {
      console.error("Service status load failed:", error);
      const storedStatus = readStoredServiceStatus();
      setStatus(storedStatus ?? DEFAULT_SERVICE_STATUS);
      setSource("local");
      setFallbackReason("Could not load service status from Google Sheets.");
    } finally {
      setIsLoading(false);
    }
  }, [applyStatus, loadServiceStatus]);

  useEffect(() => {
    const storedStatus = readStoredServiceStatus();
    if (storedStatus) setStatus(storedStatus);
    refreshServiceStatus();
  }, [refreshServiceStatus]);

  const value = useMemo<ServiceStatusContextValue>(
    () => ({
      status,
      isLoading,
      source,
      fallbackReason,
      refreshServiceStatus,
      setServiceStatus: applyStatus,
      openSuspensionDialog: () => setDialogOpen(true),
    }),
    [applyStatus, fallbackReason, isLoading, refreshServiceStatus, source, status],
  );

  const suspensionMessage = getServiceSuspensionMessage(status);

  return (
    <ServiceStatusContext.Provider value={value}>
      {children}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-warning bg-card">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-2xl text-primary">
              Service Temporarily Suspended
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-6 text-muted-foreground">
              {suspensionMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ServiceStatusContext.Provider>
  );
}

function readStoredServiceStatus() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SERVICE_STATUS_STORAGE_KEY);
    if (!raw) return null;
    return withServiceStatusDefaults(JSON.parse(raw) as Partial<ServiceStatus>);
  } catch {
    return null;
  }
}

function writeStoredServiceStatus(status: ServiceStatus) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SERVICE_STATUS_STORAGE_KEY, JSON.stringify(status));
  } catch {
    // Keep the in-memory value even if localStorage is unavailable.
  }
}
