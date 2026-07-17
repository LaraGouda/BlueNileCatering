import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  Home,
  LogOut,
  Mail,
  MapPin,
  PauseCircle,
  Phone,
  PlayCircle,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DASHBOARD_ORDER_STATUSES,
  loadDashboardOrders,
  saveDashboardOrders,
  type DashboardOrder,
  type DashboardOrderStatus,
  type DashboardPaymentStatus,
} from "@/lib/order-store";
import {
  deleteGoogleSheetsOrder,
  loadOrdersFromGoogleSheets,
  updateGoogleSheetsOrderStatus,
} from "@/lib/google-sheets.functions";
import {
  cancelStripeAuthorizedPayment,
  captureStripeAuthorizedPayment,
} from "@/lib/stripe.functions";
import { updateServiceStatusSettings } from "@/lib/service-status.functions";
import { useServiceStatus } from "@/lib/use-service-status";
import {
  DEFAULT_SERVICE_STATUS,
  DEFAULT_SUSPENSION_MESSAGE,
  getServiceSuspensionMessage,
  type ServiceMessageMode,
  type ServiceStatus,
} from "@/lib/service-status";
import { formatPrice } from "@/data/menu";
import logoUrl from "@/assets/logo.png?url";

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

const DASHBOARD_SESSION_KEY = "blue-nile-dashboard-unlocked";
const DASHBOARD_PIN = import.meta.env.VITE_OWNER_DASHBOARD_PIN?.trim() ?? "";

const STATUS_LABELS: Record<DashboardOrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  declined: "Declined",
};

const PAYMENT_LABELS: Record<DashboardPaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  canceled: "Canceled",
  failed: "Failed",
  refunded: "Refunded",
};

type DashboardOrderView = DashboardOrderStatus | "all";

const STATUS_OPTIONS = DASHBOARD_ORDER_STATUSES;
const ORDER_VIEW_OPTIONS: DashboardOrderView[] = ["all", ...DASHBOARD_ORDER_STATUSES];
const ORDER_VIEW_LABELS: Record<DashboardOrderView, string> = {
  all: "All",
  ...STATUS_LABELS,
};

function DashboardRoute() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setUnlocked(window.sessionStorage.getItem(DASHBOARD_SESSION_KEY) === "true");
  }, []);

  if (!unlocked) return <DashboardLock onUnlock={() => setUnlocked(true)} />;

  return (
    <DashboardShell
      onSignOut={() => {
        window.sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
        setUnlocked(false);
      }}
    />
  );
}

function DashboardLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!DASHBOARD_PIN) {
      toast.error("Dashboard passcode is not configured.");
      return;
    }
    if (pin === DASHBOARD_PIN) {
      window.sessionStorage.setItem(DASHBOARD_SESSION_KEY, "true");
      onUnlock();
      return;
    }
    toast.error("Incorrect passcode.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm bg-card/95">
        <CardHeader className="items-center text-center">
          <img src={logoUrl} alt="" aria-hidden="true" className="h-16 w-16 object-contain" />
          <CardTitle className="font-display text-2xl text-primary">Owner Access</CardTitle>
          <CardDescription>Blue Nile kitchen dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-pin">Passcode</Label>
              <Input
                id="dashboard-pin"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              <ShieldCheck className="h-4 w-4" />
              Enter Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function DashboardShell({ onSignOut }: { onSignOut: () => void }) {
  const loadOrdersFromSheets = useServerFn(loadOrdersFromGoogleSheets);
  const updateOrderStatusOnSheets = useServerFn(updateGoogleSheetsOrderStatus);
  const deleteOrderFromSheets = useServerFn(deleteGoogleSheetsOrder);
  const capturePaymentOnStripe = useServerFn(captureStripeAuthorizedPayment);
  const cancelPaymentOnStripe = useServerFn(cancelStripeAuthorizedPayment);
  const updateServiceStatus = useServerFn(updateServiceStatusSettings);
  const {
    status: serviceStatus,
    source: serviceStatusSource,
    fallbackReason: serviceStatusFallbackReason,
    setServiceStatus,
  } = useServiceStatus();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<DashboardOrderView>("new");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [ordersSource, setOrdersSource] = useState<"google" | "local">("google");
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceMessageMode, setServiceMessageMode] = useState<ServiceMessageMode>("default");
  const [serviceCustomMessage, setServiceCustomMessage] = useState("");
  const [serviceResumeDate, setServiceResumeDate] = useState("");
  const [isSavingServiceStatus, setIsSavingServiceStatus] = useState(false);

  const refreshOrders = useCallback(async () => {
    setIsLoadingOrders(true);

    try {
      const result = await loadOrdersFromSheets();
      const loadedOrders = result.loadedFromGoogleSheets ? result.orders : loadDashboardOrders();

      setOrders(loadedOrders);
      setSelectedOrderId((current) =>
        loadedOrders.some((order) => order.id === current) ? current : (loadedOrders[0]?.id ?? ""),
      );
      setOrdersSource(result.loadedFromGoogleSheets ? "google" : "local");

      if (!result.loadedFromGoogleSheets) {
        toast.warning(`Showing local dashboard orders. ${result.reason}`);
      }
    } catch (error) {
      console.error("Google Sheets order load failed:", error);

      const fallbackOrders = loadDashboardOrders();
      setOrders(fallbackOrders);
      setSelectedOrderId((current) =>
        fallbackOrders.some((order) => order.id === current)
          ? current
          : (fallbackOrders[0]?.id ?? ""),
      );
      setOrdersSource("local");
      toast.error("Could not load Google Sheets orders. Showing local dashboard orders.");
    } finally {
      setIsLoadingOrders(false);
    }
  }, [loadOrdersFromSheets]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (selectedStatus !== "all" && order.status !== selectedStatus) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.customer.name.toLowerCase().includes(q) ||
        order.customer.phone.toLowerCase().includes(q) ||
        order.event.deliveryAddress.toLowerCase().includes(q)
      );
    });
  }, [orders, query, selectedStatus]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? orders[0];

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      newOrders: orders.filter((order) => order.status === "new").length,
      todayEvents: orders.filter((order) => order.event.date === today).length,
      openOrders: orders.filter((order) => order.status !== "completed").length,
      revenue: orders.reduce((sum, order) => sum + order.totals.estimatedTotal, 0),
    };
  }, [orders]);

  const setOrderStatus = async (orderId: string, status: DashboardOrderStatus) => {
    const previousOrders = orders;
    const nextOrders = orders.map((order) => (order.id === orderId ? { ...order, status } : order));

    setOrders(nextOrders);
    setSelectedStatus(status);
    setSavingOrderId(orderId);

    try {
      const result = await updateOrderStatusOnSheets({ data: { orderId, status } });

      if (result.updatedGoogleSheets) {
        setOrdersSource("google");
        toast.success("Order status updated in Google Sheets.");
      } else {
        saveDashboardOrders(nextOrders);
        setOrdersSource("local");
        toast.warning(`Order status saved locally only. ${result.reason}`);
      }
    } catch (error) {
      console.error("Google Sheets status update failed:", error);
      setOrders(previousOrders);
      toast.error("Could not update the order status in Google Sheets.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const confirmAndChargeOrder = async (order: DashboardOrder) => {
    if (!order.payment.stripePaymentIntentId) {
      toast.error("This order does not have a Stripe payment intent yet.");
      return;
    }

    setSavingOrderId(order.id);

    try {
      const result = await capturePaymentOnStripe({
        data: {
          orderId: order.id,
          paymentIntentId: order.payment.stripePaymentIntentId,
        },
      });

      if (result.completed) {
        toast.success("Payment captured and order confirmed.");
        setSelectedStatus("confirmed");
        await refreshOrders();
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      console.error("Stripe capture failed:", error);
      toast.error("Could not capture the payment.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const declineAndReleaseOrder = async (order: DashboardOrder) => {
    if (!order.payment.stripePaymentIntentId) {
      toast.error("This order does not have a Stripe payment intent yet.");
      return;
    }

    setSavingOrderId(order.id);

    try {
      const result = await cancelPaymentOnStripe({
        data: {
          orderId: order.id,
          paymentIntentId: order.payment.stripePaymentIntentId,
        },
      });

      if (result.completed) {
        toast.success("Authorization canceled and order declined.");
        setSelectedStatus("declined");
        await refreshOrders();
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      console.error("Stripe cancellation failed:", error);
      toast.error("Could not cancel the payment authorization.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const deleteOrder = async (order: DashboardOrder) => {
    const previousOrders = orders;
    const nextOrders = orders.filter((existingOrder) => existingOrder.id !== order.id);

    setOrders(nextOrders);
    setSelectedOrderId(nextOrders[0]?.id ?? "");
    setSavingOrderId(order.id);

    try {
      const result = await deleteOrderFromSheets({ data: { orderId: order.id } });

      if (result.updatedGoogleSheets) {
        setOrdersSource("google");
        toast.success("Order deleted from Google Sheets.");
      } else {
        saveDashboardOrders(nextOrders);
        setOrdersSource("local");
        toast.warning(`Order deleted locally only. ${result.reason}`);
      }
    } catch (error) {
      console.error("Google Sheets order delete failed:", error);
      setOrders(previousOrders);
      setSelectedOrderId(order.id);
      toast.error("Could not delete the order from Google Sheets.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const openServiceDialog = () => {
    const nextMode = serviceStatus.messageMode ?? DEFAULT_SERVICE_STATUS.messageMode;
    setServiceMessageMode(nextMode);
    setServiceCustomMessage(serviceStatus.customMessage);
    setServiceResumeDate(serviceStatus.resumeDate);
    setServiceDialogOpen(true);
  };

  const saveServiceAvailability = async (nextStatus: ServiceStatus) => {
    setIsSavingServiceStatus(true);

    try {
      const result = await updateServiceStatus({ data: nextStatus });
      setServiceStatus(nextStatus);

      if (result.updatedGoogleSheets) {
        toast.success(
          nextStatus.suspended ? "Service suspension is live." : "Service is accepting orders.",
        );
      } else {
        toast.warning(`Service status saved locally only. ${result.reason}`);
      }

      setServiceDialogOpen(false);
    } catch (error) {
      console.error("Service status update failed:", error);
      toast.error("Could not update service status.");
    } finally {
      setIsSavingServiceStatus(false);
    }
  };

  const suspendService = async (event: FormEvent) => {
    event.preventDefault();

    if (serviceMessageMode === "custom" && !serviceCustomMessage.trim()) {
      toast.error("Enter a custom message or use the default message.");
      return;
    }

    await saveServiceAvailability({
      suspended: true,
      messageMode: serviceMessageMode,
      customMessage: serviceMessageMode === "custom" ? serviceCustomMessage.trim() : "",
      resumeDate: serviceResumeDate,
      updatedAt: new Date().toISOString(),
    });
  };

  const resumeService = async () => {
    await saveServiceAvailability({
      ...serviceStatus,
      suspended: false,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="" aria-hidden="true" className="h-11 w-11 object-contain" />
            <div>
              <h1 className="font-display text-2xl text-primary">Kitchen Dashboard</h1>
              <p className="text-sm text-muted-foreground">Blue Nile Mediterranean Grill</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <Home className="h-4 w-4" />
                Site
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <ServiceAvailabilityCard
          status={serviceStatus}
          source={serviceStatusSource}
          fallbackReason={serviceStatusFallbackReason}
          isSaving={isSavingServiceStatus}
          onSuspend={openServiceDialog}
          onResume={resumeService}
        />

        <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ShoppingBag} label="New Orders" value={String(metrics.newOrders)} />
          <MetricCard icon={CalendarClock} label="Today" value={String(metrics.todayEvents)} />
          <MetricCard icon={Clock} label="Open Orders" value={String(metrics.openOrders)} />
          <MetricCard
            icon={DollarSign}
            label="Estimated Sales"
            value={formatPrice(metrics.revenue)}
          />
        </section>

        <ServiceSuspensionDialog
          open={serviceDialogOpen}
          messageMode={serviceMessageMode}
          customMessage={serviceCustomMessage}
          resumeDate={serviceResumeDate}
          isSaving={isSavingServiceStatus}
          onOpenChange={setServiceDialogOpen}
          onMessageModeChange={setServiceMessageMode}
          onCustomMessageChange={setServiceCustomMessage}
          onResumeDateChange={setServiceResumeDate}
          onSubmit={suspendService}
        />

        <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="bg-card/95">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="font-display text-xl text-primary">Order Queue</CardTitle>
                  <CardDescription>
                    {isLoadingOrders
                      ? "Loading orders from Google Sheets"
                      : `${filteredOrders.length} orders in this view${
                          ordersSource === "local" ? " (local fallback)" : ""
                        }`}
                  </CardDescription>
                </div>
                <div className="relative w-full lg:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search orders"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {ORDER_VIEW_OPTIONS.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={selectedStatus === status ? "default" : "outline"}
                    className="shrink-0 rounded-full"
                    onClick={() => setSelectedStatus(status)}
                  >
                    {ORDER_VIEW_LABELS[status]}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingOrders ? (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Loading orders from Google Sheets...
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No orders match this view.
                </p>
              ) : (
                filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-secondary/70 ${
                      selectedOrder?.id === order.id
                        ? "border-primary bg-secondary"
                        : "border-border bg-background/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{order.customer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatEventDate(order.event.date)} at {formatTime(order.event.time)}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <PaymentBadge status={order.payment.status} />
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {order.event.numberOfPeople} people
                      </span>
                      <span>{order.cart.length} line items</span>
                      <span className="font-semibold text-accent">
                        {formatPrice(order.totals.estimatedTotal)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <OrderDetails
            order={selectedOrder}
            savingOrderId={savingOrderId}
            onStatusChange={setOrderStatus}
            onConfirmAndCharge={confirmAndChargeOrder}
            onDeclineAndRelease={declineAndReleaseOrder}
            onDeleteOrder={deleteOrder}
          />
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
}) {
  return (
    <Card className="bg-card/95">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceAvailabilityCard({
  status,
  source,
  fallbackReason,
  isSaving,
  onSuspend,
  onResume,
}: {
  status: ServiceStatus;
  source: "google" | "local";
  fallbackReason: string;
  isSaving: boolean;
  onSuspend: () => void;
  onResume: () => void;
}) {
  const isSuspended = status.suspended;
  const publicMessage = getServiceSuspensionMessage(status);

  return (
    <Card className="bg-card/95">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
              isSuspended ? "bg-warning text-warning-foreground" : "bg-secondary text-primary"
            }`}
          >
            {isSuspended ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="font-display text-xl text-primary">Service Availability</h2>
            <div
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold ${
                isSuspended
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {isSuspended ? (
                <PauseCircle className="h-4 w-4" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Current Status: {isSuspended ? "Suspended service" : "Accepting orders"}
            </div>
            {isSuspended && <p className="text-sm text-muted-foreground">{publicMessage}</p>}
            {source === "local" && fallbackReason && (
              <p className="text-xs text-destructive">Local fallback only: {fallbackReason}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isSuspended ? (
            <>
              <Button variant="outline" onClick={onSuspend} disabled={isSaving}>
                Edit Message
              </Button>
              <Button onClick={onResume} disabled={isSaving}>
                <PlayCircle className="h-4 w-4" />
                {isSaving ? "Saving..." : "Resume Service"}
              </Button>
            </>
          ) : (
            <Button onClick={onSuspend} disabled={isSaving}>
              <PauseCircle className="h-4 w-4" />
              Suspend Service
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceSuspensionDialog({
  open,
  messageMode,
  customMessage,
  resumeDate,
  isSaving,
  onOpenChange,
  onMessageModeChange,
  onCustomMessageChange,
  onResumeDateChange,
  onSubmit,
}: {
  open: boolean;
  messageMode: ServiceMessageMode;
  customMessage: string;
  resumeDate: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onMessageModeChange: (mode: ServiceMessageMode) => void;
  onCustomMessageChange: (message: string) => void;
  onResumeDateChange: (date: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const previewMessage =
    messageMode === "custom" && customMessage.trim()
      ? getServiceSuspensionMessage({
          suspended: true,
          messageMode: "custom",
          customMessage,
          resumeDate,
          updatedAt: "",
        })
      : getServiceSuspensionMessage({
          suspended: true,
          messageMode: "default",
          customMessage: "",
          resumeDate,
          updatedAt: "",
        });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary">
              Suspend Service
            </DialogTitle>
            <DialogDescription>
              Customers will see this under the navbar and in ordering popups.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={messageMode}
            onValueChange={(value) => onMessageModeChange(value as ServiceMessageMode)}
            className="gap-3"
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/70 p-3">
              <RadioGroupItem value="default" id="service-message-default" className="mt-1" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Use default message</p>
                <p className="text-sm text-muted-foreground">{DEFAULT_SUSPENSION_MESSAGE}</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/70 p-3">
              <RadioGroupItem value="custom" id="service-message-custom" className="mt-1" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold">Write custom message</p>
                <Textarea
                  value={customMessage}
                  onChange={(event) => onCustomMessageChange(event.target.value)}
                  onFocus={() => onMessageModeChange("custom")}
                  placeholder="Example: We are away for a family event and will reopen soon."
                  rows={3}
                />
              </div>
            </label>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="service-resume-date">Return Date (optional)</Label>
            <Input
              id="service-resume-date"
              type="date"
              value={resumeDate}
              onChange={(event) => onResumeDateChange(event.target.value)}
            />
          </div>

          <div className="rounded-lg bg-warning p-3 text-sm text-warning-foreground">
            {previewMessage}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <PauseCircle className="h-4 w-4" />
              {isSaving ? "Saving..." : "Suspend Service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetails({
  order,
  savingOrderId,
  onStatusChange,
  onConfirmAndCharge,
  onDeclineAndRelease,
  onDeleteOrder,
}: {
  order: DashboardOrder | undefined;
  savingOrderId: string | null;
  onStatusChange: (orderId: string, status: DashboardOrderStatus) => void;
  onConfirmAndCharge: (order: DashboardOrder) => void;
  onDeclineAndRelease: (order: DashboardOrder) => void;
  onDeleteOrder: (order: DashboardOrder) => void;
}) {
  if (!order) {
    return (
      <Card className="bg-card/95">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Select an order to view details.
        </CardContent>
      </Card>
    );
  }

  const fullAddress = [
    order.event.deliveryAddress,
    order.event.deliveryAddressLine2,
    order.event.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="bg-card/95">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-xl text-primary">{order.id}</CardTitle>
            <CardDescription>Submitted {formatDateTime(order.submittedAt)}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <PaymentBadge status={order.payment.status} />
            <StatusBadge status={order.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Customer
          </h2>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">{order.customer.name}</p>
            <a
              href={`tel:${order.customer.phone}`}
              className="flex items-center gap-2 hover:underline"
            >
              <Phone className="h-4 w-4 text-accent" />
              {order.customer.phone}
            </a>
            <a
              href={`mailto:${order.customer.email}`}
              className="flex items-center gap-2 hover:underline"
            >
              <Mail className="h-4 w-4 text-accent" />
              {order.customer.email}
            </a>
          </div>
        </section>

        <Separator />

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Event</h2>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-accent" />
              {formatEventDate(order.event.date)} at {formatTime(order.event.time)}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-accent" />
              <span>{fullAddress}</span>
            </p>
            <p className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              {order.event.numberOfPeople} people
            </p>
            {order.event.individuallyWrapped && (
              <Badge variant="secondary">Individually wrapped</Badge>
            )}
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Items</h2>
          <div className="space-y-3">
            {order.cart.map((line) => (
              <div
                key={`${line.item}-${line.quantity}`}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-foreground">{line.item}</p>
                  <p className="font-semibold text-accent">{formatPrice(line.lineTotal)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Qty {line.quantity} x {formatPrice(line.unitPrice)}
                </p>
                {line.selections.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">{line.selections.join(", ")}</p>
                )}
                {line.notes && <p className="mt-1 text-sm text-muted-foreground">{line.notes}</p>}
              </div>
            ))}
          </div>
        </section>

        {order.event.specialInstructions && (
          <>
            <Separator />
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Notes
              </h2>
              <p className="rounded-lg bg-muted p-3 text-sm">{order.event.specialInstructions}</p>
            </section>
          </>
        )}

        <Separator />

        <section className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(order.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span>{formatPrice(order.totals.deliveryFee)}</span>
          </div>
          {order.totals.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatPrice(order.totals.tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-primary">
            <span>{order.totals.finalTotal === null ? "Estimated Total" : "Final Total"}</span>
            <span>{formatPrice(order.totals.finalTotal ?? order.totals.estimatedTotal)}</span>
          </div>
        </section>

        <Separator />

        <section className="space-y-2 text-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Payment
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <PaymentBadge status={order.payment.status} />
          </div>
          {order.payment.stripeCheckoutSessionId && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Checkout Session</span>
              <span className="truncate font-mono text-xs">
                {order.payment.stripeCheckoutSessionId}
              </span>
            </div>
          )}
          {order.payment.stripePaymentIntentId && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Payment Intent</span>
              <span className="truncate font-mono text-xs">
                {order.payment.stripePaymentIntentId}
              </span>
            </div>
          )}
          {order.payment.stripeReceiptUrl && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={order.payment.stripeReceiptUrl} target="_blank" rel="noreferrer">
                Receipt
              </a>
            </Button>
          )}
          {order.payment.status === "authorized" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                disabled={savingOrderId === order.id}
                onClick={() => onConfirmAndCharge(order)}
              >
                <DollarSign className="h-4 w-4" />
                Confirm & Charge
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={savingOrderId === order.id}
                onClick={() => onDeclineAndRelease(order)}
              >
                <XCircle className="h-4 w-4" />
                Decline & Release
              </Button>
            </div>
          )}
          {order.payment.status === "pending" && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Waiting for Stripe to confirm the card authorization.
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={order.status === status ? "default" : "outline"}
              disabled={savingOrderId === order.id}
              onClick={() => onStatusChange(order.id, status)}
            >
              {status === "completed" && <CheckCircle2 className="h-4 w-4" />}
              {STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        <Separator />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={savingOrderId === order.id}
            >
              <Trash2 className="h-4 w-4" />
              Delete Order
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete order {order.id}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the order and its item rows from the dashboard storage. It
                does not cancel, refund, or release any Stripe payment by itself.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDeleteOrder(order)}
              >
                Delete Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: DashboardOrderStatus }) {
  return (
    <Badge className={`${getStatusClass(status)} border-transparent`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PaymentBadge({ status }: { status: DashboardPaymentStatus }) {
  return (
    <Badge className={`${getPaymentClass(status)} border-transparent`}>
      {PAYMENT_LABELS[status]}
    </Badge>
  );
}

function getStatusClass(status: DashboardOrderStatus) {
  switch (status) {
    case "new":
      return "bg-primary text-primary-foreground";
    case "confirmed":
      return "bg-secondary text-secondary-foreground";
    case "preparing":
      return "bg-warning text-warning-foreground";
    case "ready":
      return "bg-accent text-accent-foreground";
    case "completed":
      return "bg-muted text-muted-foreground";
    case "declined":
      return "bg-destructive text-destructive-foreground";
  }
}

function getPaymentClass(status: DashboardPaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-accent text-accent-foreground";
    case "authorized":
      return "bg-primary text-primary-foreground";
    case "pending":
      return "bg-warning text-warning-foreground";
    case "failed":
      return "bg-destructive text-destructive-foreground";
    case "canceled":
      return "bg-muted text-muted-foreground";
    case "refunded":
      return "bg-secondary text-secondary-foreground";
    case "unpaid":
      return "bg-muted text-muted-foreground";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, Number(hours), Number(minutes)));
}
