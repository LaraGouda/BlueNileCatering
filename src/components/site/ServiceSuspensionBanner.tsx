import { TriangleAlert } from "lucide-react";

import { getServiceSuspensionMessage } from "@/lib/service-status";
import { useServiceStatus } from "@/lib/use-service-status";

export function ServiceSuspensionBanner() {
  const { status } = useServiceStatus();

  if (!status.suspended) return null;

  return (
    <div className="border-b border-[oklch(0.32_0.13_27)] bg-[oklch(0.4_0.16_27)] px-4 py-3 text-white shadow-sm">
      <div className="mx-auto flex max-w-4xl items-start justify-center gap-2 text-center text-sm font-bold leading-6">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{getServiceSuspensionMessage(status)}</p>
      </div>
    </div>
  );
}
