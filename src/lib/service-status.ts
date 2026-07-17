export type ServiceMessageMode = "default" | "custom";

export interface ServiceStatus {
  suspended: boolean;
  messageMode: ServiceMessageMode;
  customMessage: string;
  resumeDate: string;
  updatedAt: string;
}

export const DEFAULT_SERVICE_STATUS: ServiceStatus = {
  suspended: false,
  messageMode: "default",
  customMessage: "",
  resumeDate: "",
  updatedAt: "",
};

export const SERVICE_STATUS_STORAGE_KEY = "blue-nile-service-status-v1";

export const DEFAULT_SUSPENSION_MESSAGE =
  "Service is temporarily suspended. We are not accepting catering orders right now.";

export function getServiceSuspensionMessage(status: ServiceStatus) {
  if (!status.suspended) return "";

  const base =
    status.messageMode === "custom" && status.customMessage.trim()
      ? status.customMessage.trim()
      : DEFAULT_SUSPENSION_MESSAGE;
  const resumeDate = formatServiceResumeDate(status.resumeDate);

  if (!resumeDate) return ensureTerminalPunctuation(base);

  return appendSentence(base, `We expect to be back on ${resumeDate}.`);
}

export function formatServiceResumeDate(value: string) {
  if (!isDateInputValue(value)) return "";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function withServiceStatusDefaults(value: Partial<ServiceStatus> | null | undefined) {
  const messageMode = value?.messageMode === "custom" ? "custom" : "default";

  return {
    suspended: value?.suspended === true,
    messageMode,
    customMessage: typeof value?.customMessage === "string" ? value.customMessage : "",
    resumeDate:
      typeof value?.resumeDate === "string" && isDateInputValue(value.resumeDate)
        ? value.resumeDate
        : "",
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  } satisfies ServiceStatus;
}

export function isServiceMessageMode(value: string): value is ServiceMessageMode {
  return value === "default" || value === "custom";
}

export function isDateInputValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function appendSentence(base: string, sentence: string) {
  return `${ensureTerminalPunctuation(base)} ${sentence}`;
}

function ensureTerminalPunctuation(value: string) {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
