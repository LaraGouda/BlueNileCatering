import { useContext } from "react";

import { ServiceStatusContext } from "@/lib/service-status-store";

export function useServiceStatus() {
  const ctx = useContext(ServiceStatusContext);
  if (!ctx) throw new Error("useServiceStatus must be used within ServiceStatusProvider");
  return ctx;
}
