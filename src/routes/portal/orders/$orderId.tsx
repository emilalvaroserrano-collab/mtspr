import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams, useRouterState } from "@tanstack/react-router";
import { getCustomerBilling, getShopAccount } from "@/lib/portal/api";
import { day, money, paymentLabel, shopifyDelivery, shopifyFulfillment, shopifyPayment, type ShopTone } from "@/lib/portal/format";
import { useShopToken } from "@/lib/portal/shop-session";

export const Route = createFileRoute("/portal/orders/$orderId")({
  component: OrderDetail,
});

const TONE: Record<ShopTone, string> = {
  neutral: "bg-surface-2 text-ink",
  good: "bg-good-soft text-ink",
  warn: "bg-warn-soft text-ink",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-ink",
  pine: "bg-surface-2 text-ink",
};

function Pill({ label, tone }: { label: string; tone: ShopTone }) {
  return <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${TONE[tone]}`}>{label}</span>;
}

export function OrderDetail() {
  const { orderId = "" } = useParams({ strict: false });
  const token = useShopToken();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const account = useQuery({ queryKey: ["shop-account", token], queryFn: () => getShopAccount({ data: token }), enabled: Boolean(token) });
  const billing = useQuery({ queryKey: ["customer-billing", token], queryFn: () => getCustomerBilling({ data: token }), enabled: Boolean(token) });
  const order = account.data?.orders.find((item) => item.id === Number(orderId));
  if (account.isPending) return <p className="text-sm text-muted">Opening the order…</p>;
  if (!order) return <p className="text-sm text-muted">That order is not on this account.</p>;
  const goods = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const payment = shopifyPayment(order);
  const fulfillment = shopifyFulfillment(order);
  const delivery = shopifyDelivery(order);
  const address = [order.shipAddress, [order.shipCity, order.shipRegion, order.shipPostal].filter(Boolean).join(" "), order.shipCountry].filter(Boolean);
  const shipping = order.shippingMethod === "express" ? "Express" : order.shippingMethod === "standard" ? "Standard" : "Shipping";
  const card = order.cardLast4 ? `${order.cardBrand || "Card"} ···· ${order.cardLast4}` : paymentLabel(order.paymentMethod);
  const unpaid = payment.label !== "Paid" && payment.label !== "Refunded";
  const gateway = billing.data?.selected === "alternative" ? order.paymentUrl || "https://go.alternativepayments.io" : "";
  const billingPath = path.startsWith("/production") ? "/production/user-portal/billing" : "/portal/billing";
  const ordersPath = path.startsWith("/production") ? "/production/user-portal/orders" : "/portal/orders";
  return (
    <div className="grid w-full gap-4">
      <Link to={ordersPath} className="text-sm text-muted">All orders</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{order.number}</h1>
          <p className="text-sm text-muted">Confirmed {day(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill label={payment.label} tone={payment.tone} />
          <Pill label={fulfillment.label} tone={fulfillment.tone} />
          {delivery ? <Pill label={delivery.label} tone={delivery.tone} /> : null}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4">
          <ul className="grid gap-3">
            {order.items.map((item) => (
              <li key={item.sku} className="flex items-center gap-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="size-16 shrink-0 rounded-xl border border-line bg-white object-cover" />
                ) : (
                  <span className="size-16 shrink-0 rounded-xl border border-line bg-surface-2" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted">{item.sku} · Qty {item.quantity}</span>
                </span>
                <span className="text-sm tabular-nums">{money(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 border-t border-line pt-3 text-sm">
            <p className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(goods)}</span></p>
            <p className="flex justify-between"><span className="text-muted">{shipping}</span><span className="tabular-nums">{order.shippingCents ? money(order.shippingCents) : "Free"}</span></p>
            <p className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(order.totalCents)}</span></p>
          </div>
        </section>
        <div className="grid content-start gap-3">
          <section className="grid gap-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Contact</h2>
            <p>{order.shipEmail || account.data?.customer.email || "No email"}</p>
            <p className="text-muted">{order.shipPhone || account.data?.customer.phone || "No phone"}</p>
          </section>
          <section className="grid gap-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Shipping address</h2>
            <p className="font-semibold">{order.shipName || account.data?.customer.name}</p>
            {address.length ? address.map((line) => <p key={line}>{line}</p>) : <p className="text-muted">No shipping address</p>}
            <p className="pt-2 text-muted">{shipping}{order.shippingCents ? ` · ${money(order.shippingCents)}` : ""}</p>
            <p>{order.trackingNumber ? `${order.trackingCarrier || "Tracking"} ${order.trackingNumber}` : "No tracking number yet"}</p>
          </section>
          <section className="grid gap-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Payment</h2>
            <p className="font-semibold">{payment.label}</p>
            <p>{card}</p>
            <p className="tabular-nums">{money(order.totalCents)}</p>
            {unpaid && gateway ? (
              <a href={gateway} target="_blank" rel="noreferrer" className="pt-1 text-sm font-semibold text-accent">Pay now</a>
            ) : null}
            {unpaid && !gateway ? (
              <Link to={billingPath} className="pt-1 text-sm font-semibold text-accent">Pay now</Link>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}