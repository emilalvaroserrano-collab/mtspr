import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { QtyStepper } from "@/components/storefront";
import { getStorefront } from "@/lib/portal/api";
import { money } from "@/lib/portal/format";
import { setCartQuantity, useCart } from "@/lib/portal/store-cart";
import { Checkout } from "@/routes/store/$slug/checkout";

export const Route = createFileRoute("/production/user-portal/checkout")({
  component: PortalCheckout,
});

function selectedFlag(search: unknown, searchStr: string, key: string) {
  if (search && typeof search === "object" && key in search) return String((search as Record<string, unknown>)[key] || "");
  return new URLSearchParams(searchStr).get(key) || "";
}

function PortalCheckout() {
  const search = useRouterState({ select: (state) => state.location.search });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const sku = selectedFlag(search, searchStr, "sku");
  const paying = selectedFlag(search, searchStr, "pay") === "1";
  if (sku) return <Checkout onlySku={sku} />;
  if (paying) return <Checkout />;
  return <CartList />;
}

function CartList() {
  const lines = useCart();
  const shop = useQuery({ queryKey: ["storefront"], queryFn: () => getStorefront() });
  const products = shop.data?.products ?? [];
  const detailed = lines
    .map((line) => ({ ...line, product: products.find((product) => product.sku === line.sku) }))
    .filter((line) => line.product);
  const subtotal = detailed.reduce((sum, line) => sum + line.quantity * (line.product?.priceCents ?? 0), 0);

  if (shop.isPending) return <p className="text-sm text-muted">Opening your cart…</p>;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
          <p className="mt-1 text-sm text-muted">{detailed.length === 1 ? "1 item" : `${detailed.length} items`} · checkout covers the whole cart</p>
        </div>
        <Link to="/production/user-portal/shop" className="text-sm font-semibold text-accent">Keep shopping</Link>
      </div>
      <ol className="flex items-center gap-2 text-xs text-muted" aria-label="Checkout steps">
        <li className="font-semibold text-ink">Cart</li>
        <li aria-hidden="true">/</li>
        <li>Information</li>
        <li aria-hidden="true">/</li>
        <li>Shipping</li>
        <li aria-hidden="true">/</li>
        <li>Payment</li>
      </ol>
      {detailed.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-3xl border border-line bg-white px-4 py-16 text-center">
          <p className="text-lg font-semibold">Your cart is empty</p>
          <Link to="/production/user-portal/shop" className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white">Browse equipment</Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {detailed.map((line) => {
            const product = line.product!;
            return (
              <li key={line.sku} className="grid gap-4 rounded-3xl border border-line bg-white p-4 shadow-[0_10px_30px_rgba(0,57,112,0.05)]">
                <a href={`/production/user-portal/product/${encodeURIComponent(line.sku)}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="size-[5.5rem] rounded-2xl bg-[#f3f6f7] object-contain" />
                  ) : (
                    <span className="size-[5.5rem] rounded-2xl bg-[#f3f6f7]" />
                  )}
                  <span className="min-w-0">
                    {product.category ? <span className="block text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">{product.category}</span> : null}
                    <span className="block truncate text-base font-semibold">{product.name}</span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-6 text-muted">{product.description}</span>
                    <span className="mt-2 block text-xs text-muted">SKU {product.sku}</span>
                    <span className="mt-1 block text-sm font-semibold tabular-nums">{money(product.priceCents)}</span>
                  </span>
                </a>
                <div className="flex items-center justify-between gap-3">
                  <QtyStepper value={line.quantity} label={product.name} onChange={(next) => setCartQuantity(line.sku, next)} />
                  <span className="text-sm font-semibold tabular-nums">{money(line.quantity * product.priceCents)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {detailed.length > 0 ? (
        <div className="grid gap-3 rounded-3xl border border-line bg-white p-4 shadow-[0_10px_30px_rgba(0,57,112,0.05)]">
          <p className="flex items-center justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold tabular-nums">{money(subtotal)}</span>
          </p>
          <p className="flex items-center justify-between text-sm">
            <span className="text-muted">Shipping</span>
            <span>Calculated next</span>
          </p>
          <a href="/production/user-portal/checkout?pay=1" className="inline-flex h-12 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
            Checkout
          </a>
        </div>
      ) : null}
    </div>
  );
}
