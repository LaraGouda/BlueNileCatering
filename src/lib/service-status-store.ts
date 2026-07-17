import { createContext } from "react";

import type { ServiceStatus } from "@/lib/service-status";

export interface ServiceStatusContextValue {
  status: ServiceStatus;
  isLoading: boolean;
  source: "google" | "local";
  fallbackReason: string;
  refreshServiceStatus: () => Promise<void>;
  setServiceStatus: (status: ServiceStatus) => void;
  openSuspensionDialog: () => void;
}

export const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(null);
