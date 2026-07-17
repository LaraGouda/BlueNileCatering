import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadServiceStatusFromGoogleSheets,
  updateServiceStatusInGoogleSheets,
} from "./google-sheets.server";
import { isDateInputValue, type ServiceStatus } from "./service-status";

const serviceStatusSchema: z.ZodType<ServiceStatus> = z.object({
  suspended: z.boolean(),
  messageMode: z.enum(["default", "custom"]),
  customMessage: z.string(),
  resumeDate: z.string().refine((value) => value === "" || isDateInputValue(value), {
    message: "Resume date must use YYYY-MM-DD format.",
  }),
  updatedAt: z.string(),
});

export const loadServiceStatusFromSettings = createServerFn({ method: "GET" }).handler(async () => {
  return loadServiceStatusFromGoogleSheets();
});

export const updateServiceStatusSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) => serviceStatusSchema.parse(data))
  .handler(async ({ data }) => {
    return updateServiceStatusInGoogleSheets(data);
  });
