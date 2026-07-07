import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice, type MenuItem } from "@/data/menu";
import { useCart } from "@/lib/cart-context";

export function MenuCard({ item }: { item: MenuItem }) {
  const { addLine } = useCart();

  const [variantLabel, setVariantLabel] = useState(
    item.variants?.[0]?.label ?? "",
  );
  const [singleChoices, setSingleChoices] = useState<Record<string, string>>({});
  const [addons, setAddons] = useState<Record<string, boolean>>({});

  const unitPrice = useMemo(() => {
    const base = item.variants
      ? (item.variants.find((v) => v.label === variantLabel)?.price ??
        item.variants[0].price)
      : (item.price ?? 0);
    const addonTotal = (item.options ?? [])
      .filter((o) => o.type === "addon")
      .flatMap((o) => o.choices)
      .reduce((sum, c) => sum + (addons[c.label] ? (c.priceDelta ?? 0) : 0), 0);
    return base + addonTotal;
  }, [item, variantLabel, addons]);

  const singleOptions = (item.options ?? []).filter((o) => o.type === "single");
  const addonOptions = (item.options ?? []).filter((o) => o.type === "addon");

  const handleAdd = () => {
    // Require a choice for every single-select option
    for (const opt of singleOptions) {
      if (!singleChoices[opt.name]) {
        toast.warning(`Please choose a ${opt.name.toLowerCase()} for ${item.name}.`);
        return;
      }
    }
    const selections: string[] = [];
    if (item.variants) selections.push(variantLabel);
    for (const opt of singleOptions) {
      selections.push(`${opt.name}: ${singleChoices[opt.name]}`);
    }
    for (const opt of addonOptions) {
      for (const choice of opt.choices) {
        if (addons[choice.label]) selections.push(choice.label);
      }
    }
    addLine({ itemId: item.id, name: item.name, unitPrice, selections });
    toast.success(`${item.name} added to cart`);
  };

  const priceLabel = item.variants
    ? item.variants.map((v) => `${v.label} ${formatPrice(v.price)}`).join(" / ")
    : `${formatPrice(item.price ?? 0)}${item.unit ? ` ${item.unit}` : ""}`;
  const servingLabel =
    item.serves === "Serves 10" ? "Tray serves 10" : (item.serves ?? item.unit);

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card/95 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base leading-snug text-primary">
          {item.name}
        </h3>
        <p className="shrink-0 text-right text-sm font-bold text-accent">
          {formatPrice(unitPrice)}
        </p>
      </div>

      <div className="mt-1 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
          {item.category}
        </span>
        {servingLabel && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {servingLabel}
          </span>
        )}
      </div>

      {item.description && (
        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
      )}

      <div className="mt-3 flex flex-1 flex-col justify-end gap-2.5">
        {item.variants && (
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">
              Option — {priceLabel}
            </Label>
            <Select value={variantLabel} onValueChange={setVariantLabel}>
              <SelectTrigger className="h-9 w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {item.variants.map((v) => (
                  <SelectItem key={v.label} value={v.label}>
                    {v.label} — {formatPrice(v.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {singleOptions.map((opt) => (
          <div key={opt.name}>
            <Label className="mb-1 block text-xs text-muted-foreground">
              {opt.name}
            </Label>
            <Select
              value={singleChoices[opt.name] ?? ""}
              onValueChange={(v) =>
                setSingleChoices((prev) => ({ ...prev, [opt.name]: v }))
              }
            >
              <SelectTrigger className="h-9 w-full bg-background">
                <SelectValue placeholder={`Choose ${opt.name.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {opt.choices.map((c) => (
                  <SelectItem key={c.label} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {addonOptions.flatMap((opt) =>
          opt.choices.map((c) => (
            <label
              key={c.label}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={!!addons[c.label]}
                onCheckedChange={(checked) =>
                  setAddons((prev) => ({ ...prev, [c.label]: checked === true }))
                }
              />
              <span>
                {c.label}
                {c.priceDelta ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (+{formatPrice(c.priceDelta)})
                  </span>
                ) : null}
              </span>
            </label>
          )),
        )}

        <Button onClick={handleAdd} className="w-full" size="sm">
          <Plus className="h-4 w-4" />
          Add to Cart — {formatPrice(unitPrice)}
        </Button>
      </div>
    </article>
  );
}
