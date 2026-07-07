import { Minus, Plus, Trash2, TriangleAlert, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart-context";
import { BUSINESS, formatPrice } from "@/data/menu";

export function CartSheet() {
  const {
    lines,
    removeLine,
    setQty,
    setNotes,
    subtotal,
    deliveryFee,
    total,
    isOpen,
    setOpen,
  } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-primary">Your Cart</SheetTitle>
          <SheetDescription>
            Minimum {BUSINESS.minimumPeople} people per catering order ·{" "}
            {BUSINESS.advanceNoticeHours} hours advance notice required.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Your cart is empty. Add trays from the menu to get started.
            </p>
          ) : (
            <ul className="space-y-4 py-2">
              {lines.map((line) => (
                <li key={line.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{line.name}</p>
                      {line.selections.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {line.selections.join(" · ")}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-accent">
                      {formatPrice(line.unitPrice * line.qty)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(line.key, line.qty - 1)}
                      aria-label={`Decrease quantity of ${line.name}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(line.key, line.qty + 1)}
                      aria-label={`Increase quantity of ${line.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-destructive"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Remove ${line.name} from cart`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Input
                    className="mt-2 h-8 bg-background text-xs"
                    placeholder="Notes for this item (optional)"
                    value={line.notes}
                    onChange={(e) => setNotes(line.key, e.target.value)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <SheetFooter className="border-t border-border bg-muted/40">
            <div className="w-full space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery fee</span>
                <span className="font-semibold">{formatPrice(deliveryFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-bold">Estimated total</span>
                <span className="font-bold text-primary">{formatPrice(total)}</span>
              </div>

              <div className="mt-2 flex items-start gap-2 rounded-md bg-warning p-2 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Catering orders require a minimum of {BUSINESS.minimumPeople}{" "}
                  people. If your order looks small, please double-check it
                  meets the minimum.
                </p>
              </div>

              <Button asChild className="mt-2 w-full" onClick={() => setOpen(false)}>
                <a href="#order">Continue to Order Request</a>
              </Button>

              {/* Placeholder — real payment processing is NOT connected yet */}
              <Button variant="outline" className="w-full" disabled>
                <CreditCard className="h-4 w-4" />
                Payment — Not connected yet
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
