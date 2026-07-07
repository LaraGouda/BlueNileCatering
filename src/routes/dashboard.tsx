import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  loadDashboardOrders,
  saveDashboardOrders,
  type DashboardOrder,
  type DashboardOrderStatus,
} from "@/lib/order-store";
import { formatPrice } from "@/data/menu";
import logoUrl from "@/assets/logo.png?url";

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

const DASHBOARD_SESSION_KEY = "blue-nile-dashboard-unlocked";
const DASHBOARD_PIN = import.meta.env.VITE_OWNER_DASHBOARD_PIN ?? "2468";

const STATUS_LABELS: Record<DashboardOrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as DashboardOrderStatus[];

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
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<DashboardOrderStatus>("new");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  useEffect(() => {
    const loadedOrders = loadDashboardOrders();
    setOrders(loadedOrders);
    setSelectedOrderId(loadedOrders[0]?.id ?? "");
  }, []);

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

  const setOrderStatus = (orderId: string, status: DashboardOrderStatus) => {
    setOrders((prev) => {
      const next = prev.map((order) => (order.id === orderId ? { ...order, status } : order));
      saveDashboardOrders(next);
      return next;
    });
    setSelectedStatus(status);
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
                  <CardDescription>{filteredOrders.length} orders in this view</CardDescription>
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
              {filteredOrders.length === 0 ? (
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
                      <StatusBadge status={order.status} />
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

          <OrderDetails order={selectedOrder} onStatusChange={setOrderStatus} />
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
  onStatusChange,
}: {
  order: DashboardOrder | undefined;
  onStatusChange: (orderId: string, status: DashboardOrderStatus) => void;
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
          <StatusBadge status={order.status} />
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
          <div className="flex justify-between text-base font-bold text-primary">
            <span>Total</span>
            <span>{formatPrice(order.totals.estimatedTotal)}</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={order.status === status ? "default" : "outline"}
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
