import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CATEGORIES, MENU_ITEMS } from "@/data/menu";
import { MenuCard } from "./MenuCard";
import menuPdfUrl from "@/assets/menu.pdf?url";

export function MenuSection() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const categories = CATEGORIES;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MENU_ITEMS.filter((item) => {
      if (item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  return (
    <section id="menu" className="scroll-mt-20 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="section-title text-center text-3xl">Catering Menu</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          View the menu as a PDF{" "}
          <a
            href={menuPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
          >
            here
          </a>
          .
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card/95 p-4 shadow-sm transition-all duration-300 ease-out sm:p-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
          <aside className="lg:border-r lg:border-border lg:pr-5">
            <div
              className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
              role="tablist"
              aria-label="Menu categories"
            >
              {categories.map((cat) => {
                const isActive = category === cat;
                return (
                  <Button
                    key={cat}
                    size="sm"
                    variant={isActive ? "default" : "ghost"}
                    className={`shrink-0 justify-start rounded-full px-4 lg:w-full lg:rounded-md ${
                      isActive
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-foreground/75 hover:bg-secondary hover:text-primary"
                    }`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </Button>
                );
              })}
            </div>
          </aside>

          <div className="mt-4 min-w-0 lg:mt-0">
            <div className="relative">
              <Label htmlFor="menu-search" className="sr-only">
                Search menu items
              </Label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="menu-search"
                name="menuSearch"
                type="search"
                placeholder="Search the menu…"
                className="bg-background pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search menu items"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="py-14 text-center text-muted-foreground">
                No menu items match your search.
              </p>
            ) : (
              <div
                key={category}
                className="mt-4 grid animate-in fade-in-0 slide-in-from-bottom-2 grid-cols-1 gap-4 duration-300 md:grid-cols-2 xl:grid-cols-3"
              >
                {filtered.map((item) => (
                  <MenuCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
