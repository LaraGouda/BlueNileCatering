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
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
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
import { Separator } from "@/components/ui/separator";
import {
  DASHBOARD_ORDER_STATUSES,
  loadDashboardOrders,
  saveDashboardOrders,
  type DashboardOrder,
  type DashboardOrderStatus,
  type DashboardPaymentStatus,
} from "@/lib/order-store";
import {
  loadOrdersFromGoogleSheets,
  updateGoogleSheetsOrderStatus,
} from "@/lib/google-sheets.functions";
import {
  cancelStripeAuthorizedPayment,
  captureStripeAuthorizedPayment,
} from "@/lib/stripe.functions";
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

const STATUS_OPTIONS = DASHBOARD_ORDER_STATUSES;

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
  const capturePaymentOnStripe = useServerFn(captureStripeAuthorizedPayment);
  const cancelPaymentOnStripe = useServerFn(cancelStripeAuthorizedPayment);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<DashboardOrderStatus>("new");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [ordersSource, setOrdersSource] = useState<"google" | "local">("google");

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
      if (order.status !== selectedStatus) return false;
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
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ShoppingBag} label="New Orders" value={String(metrics.newOrders)} />
          <MetricCard icon={CalendarClock} label="Today" value={String(metrics.todayEvents)} />
          <MetricCard icon={Clock} label="Open Orders" value={String(metrics.openOrders)} />
          <MetricCard
            icon={DollarSign}
            label="Estimated Sales"
            value={formatPrice(metrics.revenue)}
          />
        </section>

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
                {STATUS_OPTIONS.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={selectedStatus === status ? "default" : "outline"}
                    className="shrink-0 rounded-full"
                    onClick={() => setSelectedStatus(status)}
                  >
                    {STATUS_LABELS[status]}
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

function OrderDetails({
  order,
  savingOrderId,
  onStatusChange,
  onConfirmAndCharge,
  onDeclineAndRelease,
}: {
  order: DashboardOrder | undefined;
  savingOrderId: string | null;
  onStatusChange: (orderId: string, status: DashboardOrderStatus) => void;
  onConfirmAndCharge: (order: DashboardOrder) => void;
  onDeclineAndRelease: (order: DashboardOrder) => void;
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
