import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/lib/cart-context";
import {
  createDashboardOrder,
  saveDashboardOrder,
  type NewDashboardOrder,
} from "@/lib/order-store";
import { submitOrderToGoogleSheets } from "@/lib/google-sheets.functions";
import { BUSINESS, formatPrice } from "@/data/menu";

interface FormState {
  name: string;
  phone: string;
  email: string;
  eventDate: string;
  eventTime: string;
  address: string;
  addressLine2: string;
  zipCode: string;
  people: string;
  individuallyWrapped: string;
  instructions: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  eventDate: "",
  eventTime: "",
  address: "",
  addressLine2: "",
  zipCode: "",
  people: "",
  individuallyWrapped: "no",
  instructions: "",
};

export function OrderRequestForm() {
  const { lines, subtotal, deliveryFee, total, clear } = useCart();
  const submitOrderToSheets = useServerFn(submitOrderToGoogleSheets);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const peopleNum = Number(form.people);
  const underMinimum =
    form.people !== "" && !Number.isNaN(peopleNum) && peopleNum < BUSINESS.minimumPeople;

  const hoursUntilEvent = (): number | null => {
    if (!form.eventDate || !form.eventTime) return null;
    const eventAt = new Date(`${form.eventDate}T${form.eventTime}`);
    if (Number.isNaN(eventAt.getTime())) return null;
    return (eventAt.getTime() - Date.now()) / (1000 * 60 * 60);
  };
  const hours = hoursUntilEvent();
  const tooSoon = hours !== null && hours < BUSINESS.advanceNoticeHours;

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!/^[\d\s()+-]{7,20}$/.test(form.phone.trim())) next.phone = "Enter a valid phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = "Enter a valid email address.";
    if (!form.eventDate) next.eventDate = "Event date is required.";
    if (!form.eventTime) next.eventTime = "Event time is required.";
    if (!form.address.trim()) next.address = "Delivery address is required.";
    if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) next.zipCode = "Enter a valid ZIP code.";
    if (!form.people || Number.isNaN(peopleNum) || peopleNum < 1)
      next.people = "Enter the number of people.";
    else if (peopleNum < BUSINESS.minimumPeople)
      next.people = `Minimum ${BUSINESS.minimumPeople} people per catering order.`;
    if (hours !== null && hours < BUSINESS.advanceNoticeHours)
      next.eventTime = `We need at least ${BUSINESS.advanceNoticeHours} hours advance notice.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (lines.length === 0) {
      toast.warning("Your cart is empty — add menu items before submitting.");
      return;
    }
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const orderPayload: NewDashboardOrder = {
      submittedAt: new Date().toISOString(),
      business: BUSINESS.name,
      customer: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      },
      event: {
        date: form.eventDate,
        time: form.eventTime,
        deliveryAddress: form.address.trim(),
        deliveryAddressLine2: form.addressLine2.trim(),
        zipCode: form.zipCode.trim(),
        numberOfPeople: peopleNum,
        individuallyWrapped: form.individuallyWrapped === "yes",
        specialInstructions: form.instructions.trim(),
      },
      cart: lines.map((l) => ({
        item: l.name,
        selections: l.selections,
        notes: l.notes,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.unitPrice * l.qty,
      })),
      totals: {
        subtotal,
        deliveryFee,
        estimatedTotal: total,
      },
    };

    const order = createDashboardOrder(orderPayload);

    try {
      setIsSubmitting(true);
      const result = await submitOrderToSheets({ data: order });
      saveDashboardOrder(order);
      console.log("Order request payload:", order);

      if (result.savedToGoogleSheets) {
        toast.success("Order request sent! We'll confirm your order soon.");
      } else {
        toast.warning(`Order captured locally only. ${result.reason}`);
      }

      setForm(EMPTY_FORM);
      clear();
    } catch (error) {
      console.error("Order request submission failed:", error);
      toast.error("We couldn't send your order request. Please try again or call us.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (id: keyof FormState, label: string, input: React.ReactNode) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {errors[id] && <p className="text-xs text-destructive">{errors[id]}</p>}
    </div>
  );

  return (
    <section id="order" className="scroll-mt-20 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="section-title text-center text-3xl">Request an Order</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Fill out the form and we’ll confirm your order. You can also call or text us at{" "}
          <a href={BUSINESS.phoneHref} className="font-semibold text-primary underline">
            {BUSINESS.phone}
          </a>
          .
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-6 space-y-4 rounded-2xl border border-border bg-card/95 p-5 shadow-sm sm:p-8"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "name",
              "Full Name *",
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />,
            )}
            {field(
              "phone",
              "Phone *",
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="856-555-0123"
                autoComplete="tel"
              />,
            )}
          </div>

          {field(
            "email",
            "Email *",
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "eventDate",
              "Event Date *",
              <Input
                id="eventDate"
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate")(e.target.value)}
              />,
            )}
            {field(
              "eventTime",
              "Event Time *",
              <Input
                id="eventTime"
                type="time"
                value={form.eventTime}
                onChange={(e) => set("eventTime")(e.target.value)}
              />,
            )}
          </div>

          {tooSoon && (
            <div className="flex items-start gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                This event is less than {BUSINESS.advanceNoticeHours} hours away. We need at least{" "}
                {BUSINESS.advanceNoticeHours} hours advance notice — please pick a later time or
                call us at {BUSINESS.phone}.
              </p>
            </div>
          )}

          {field(
            "address",
            "Delivery Address *",
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              placeholder="Street address"
              autoComplete="address-line1"
            />,
          )}

          {field(
            "addressLine2",
            "Address Line 2",
            <Input
              id="addressLine2"
              value={form.addressLine2}
              onChange={(e) => set("addressLine2")(e.target.value)}
              placeholder="Apartment, suite, floor, company name, etc. (optional)"
              autoComplete="address-line2"
            />,
          )}

          {field(
            "zipCode",
            "ZIP Code *",
            <Input
              id="zipCode"
              value={form.zipCode}
              onChange={(e) => set("zipCode")(e.target.value)}
              placeholder="08690"
              autoComplete="postal-code"
              inputMode="numeric"
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "people",
              `Number of People * (min ${BUSINESS.minimumPeople})`,
              <Input
                id="people"
                type="number"
                min={1}
                value={form.people}
                onChange={(e) => set("people")(e.target.value)}
                placeholder="e.g. 25"
              />,
            )}
            <div className="space-y-1">
              <Label htmlFor="individuallyWrapped">Individually Wrapped Meals?</Label>
              <Select value={form.individuallyWrapped} onValueChange={set("individuallyWrapped")}>
                <SelectTrigger id="individuallyWrapped" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes ({BUSINESS.wrappedRange})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {underMinimum && (
            <div className="flex items-start gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Catering orders require a minimum of {BUSINESS.minimumPeople} people.</p>
            </div>
          )}

          {field(
            "instructions",
            "Special Instructions",
            <Textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
              placeholder="Allergies, setup notes, gate codes, etc."
              rows={4}
            />,
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Cart ({lines.length} item{lines.length === 1 ? "" : "s"})
              </span>
              <span className="font-semibold">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="font-semibold">{formatPrice(deliveryFee)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-bold">
              <span>Estimated total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            <Send className="h-4 w-4" />
            {isSubmitting ? "Submitting..." : "Submit Order Request"}
          </Button>

          {/* Placeholder — payment is NOT connected yet. Do not treat as a real checkout. */}
          <Button type="button" variant="outline" size="lg" className="w-full" disabled>
            Payment — Coming Soon (not connected yet)
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Payment will be collected before delivery once ordering is confirmed. Online payment is
            not available yet.
          </p>
        </form>
      </div>
    </section>
  );
}
