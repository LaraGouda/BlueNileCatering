import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BUSINESS } from "@/data/menu";

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  /** Chosen variant/options, e.g. ["Beef Shawarma", "Side: Rice"] */
  selections: string[];
  notes: string;
}

interface CartContextValue {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "key" | "qty" | "notes"> & { qty?: number }) => void;
  removeLine: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  itemCount: number;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const STORAGE_KEY = "blue-nile-cart-v1";

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage full / unavailable — cart still works in memory
    }
  }, [lines, hydrated]);

  const addLine: CartContextValue["addLine"] = (line) => {
    const key = `${line.itemId}::${line.selections.join("|")}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, qty: l.qty + (line.qty ?? 1) } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: line.itemId,
          name: line.name,
          unitPrice: line.unitPrice,
          qty: line.qty ?? 1,
          selections: line.selections,
          notes: "",
        },
      ];
    });
    setOpen(true);
  };

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  const setQty = (key: string, qty: number) =>
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
    );

  const setNotes = (key: string, notes: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, notes } : l)));

  const clear = () => setLines([]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
    const deliveryFee = lines.length > 0 ? BUSINESS.deliveryFee : 0;
    return {
      lines,
      addLine,
      removeLine,
      setQty,
      setNotes,
      clear,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
      isOpen,
      setOpen,
    };
  }, [lines, isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
