import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Mail, ReceiptText, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/data/menu";
import {
  requestCustomerOrdersCode,
  verifyCustomerOrdersCode,
} from "@/lib/customer-orders.functions";
import { normalizeCustomerEmail, type CustomerOrderView } from "@/lib/customer-orders";

type Step = "email" | "code" | "orders";

const ORDER_STATUS_LABELS: Record<CustomerOrderView["status"], string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  declined: "Declined",
};

const PAYMENT_STATUS_LABELS: Record<CustomerOrderView["paymentStatus"], string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  canceled: "Canceled",
  failed: "Failed",
  refunded: "Refunded",
};

export function CustomerOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const requestCode = useServerFn(requestCustomerOrdersCode);
  const verifyCode = useServerFn(verifyCustomerOrdersCode);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [orders, setOrders] = useState<CustomerOrderView[]>([]);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const reset = () => {
    setStep("email");
    setEmail("");
    setCode("");
    setVerifiedEmail("");
    setOrders([]);
    setIsSendingCode(false);
    setIsVerifying(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

  const requestVerificationCode = async () => {
    const normalizedEmail = normalizeCustomerEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter a valid email address.");
      return false;
    }

    setIsSendingCode(true);

    try {
      const result = await requestCode({ data: { email: normalizedEmail } });

      if (!result.sent) {
        toast.error(result.reason);
        return false;
      }

      setEmail(normalizedEmail);
      setStep("code");
      toast.success("If we found orders for that email, we sent a verification code.");
      return true;
    } catch (error) {
      console.error("Customer order code request failed:", error);
      toast.error("Could not send a verification code. Please try again.");
      return false;
    } finally {
      setIsSendingCode(false);
    }
  };

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    await requestVerificationCode();
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("Enter the 6-digit code.");
      return;
    }

    setIsVerifying(true);

    try {
      const result = await verifyCode({
        data: {
          email,
          code: code.trim(),
        },
      });

      if (!result.verified) {
        toast.error(result.reason);
        return;
      }

      setVerifiedEmail(result.email);
      setOrders(result.orders);
      setStep("orders");
    } catch (error) {
      console.error("Customer order verification failed:", error);
      toast.error("Could not verify that code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden bg-card p-0">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-primary">
              <ReceiptText className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-2xl text-primary">My Orders</DialogTitle>
            <DialogDescription>
              Enter your email and a verification code to view orders connected to that email.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step === "email" && (
              <form onSubmit={sendCode} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer-orders-email">Email</Label>
                  <Input
                    id="customer-orders-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  We will send a 6-digit code if this email can receive messages.
                </p>
                <Button type="submit" disabled={isSendingCode} className="w-full">
                  <Mail className="h-4 w-4" />
                  {isSendingCode ? "Sending..." : "Send Verification Code"}
                </Button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={verify} className="space-y-4">
                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  If we found orders for{" "}
                  <span className="font-semibold text-foreground">{email}</span>, we sent a
                  verification code.
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-orders-code">Verification Code</Label>
                  <Input
                    id="customer-orders-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="text-center text-lg font-bold tracking-[0.35em]"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={isVerifying} className="flex-1">
                    <CheckCircle2 className="h-4 w-4" />
                    {isVerifying ? "Verifying..." : "Verify & View Orders"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSendingCode}
                    onClick={() => requestVerificationCode()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Send New Code
                  </Button>
                </div>
              </form>
            )}

            {step === "orders" && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  Showing orders for{" "}
                  <span className="font-semibold text-foreground">{verifiedEmail}</span>.
                </div>

                {orders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No orders are listed for this email yet.
                  </p>
                ) : (
                  orders.map((order) => <CustomerOrderCard key={order.id} order={order} />)
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerOrderCard({ order }: { order: CustomerOrderView }) {
  const finalTotal = order.totals.finalTotal ?? order.totals.estimatedTotal;

  return (
    <article className="rounded-lg border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-primary">{order.id}</h3>
          <p className="text-sm text-muted-foreground">
            {formatEventDate(order.event.date)} at {formatTime(order.event.time)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={order.status === "declined" ? "destructive" : "secondary"}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge variant="outline">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Guests:</span>{" "}
          <span className="font-semibold">{order.event.numberOfPeople}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Total:</span>{" "}
          <span className="font-semibold text-primary">{formatPrice(finalTotal)}</span>
        </p>
        <p className="sm:col-span-2">
          <span className="text-muted-foreground">Delivery:</span>{" "}
          <span className="font-semibold">{formatAddress(order)}</span>
        </p>
      </div>

      <Separator className="my-4" />

      <ul className="space-y-2 text-sm">
        {order.cart.map((line, index) => (
          <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
            <span>
              {line.quantity} x {line.item}
              {line.selections.length > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {line.selections.join(" · ")}
                </span>
              )}
              {line.notes && (
                <span className="block text-xs text-muted-foreground">{line.notes}</span>
              )}
            </span>
            <span className="shrink-0 font-semibold">{formatPrice(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function formatAddress(order: CustomerOrderView) {
  return [order.event.deliveryAddress, order.event.deliveryAddressLine2, order.event.zipCode]
    .filter(Boolean)
    .join(", ");
}

function formatEventDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hour, minute));
}
