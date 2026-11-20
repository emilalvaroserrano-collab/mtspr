import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Locked } from "@/components/customer-portal";
import { usePortalSession } from "@/lib/portal/use-portal-session";
import { getCustomerBilling, getShopAccount, saveCustomerBilling } from "@/lib/portal/api";
import { money, shopifyPayment } from "@/lib/portal/format";
import { useShopToken } from "@/lib/portal/shop-session";

export const Route = createFileRoute("/portal/billing")({
  component: BillingPage,
});

const fieldClass = "h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-accent";

export function BillingPage() {
  const token = useShopToken();
  const session = usePortalSession();
  const client = useQueryClient();
  const account = useQuery({ queryKey: ["shop-account", token], queryFn: () => getShopAccount({ data: token }), enabled: Boolean(token) });
  const billing = useQuery({ queryKey: ["customer-billing", token], queryFn: () => getCustomerBilling({ data: token }), enabled: Boolean(token) });
  const [method, setMethod] = useState("card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCcv, setCardCcv] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (billing.data?.selected) setMethod(billing.data.selected);
  }, [billing.data?.selected]);

  const save = useMutation({
    mutationFn: () => saveCustomerBilling({ data: { token, method, cardNumber, cardExp, cardCcv } }),
    onSuccess: () => {
      setCardNumber("");
      setCardCcv("");
      setError("");
      setMessage("Billing saved. The full card number and CCV are not stored.");
      void client.invalidateQueries({ queryKey: ["customer-billing", token] });
    },
    onError: (cause) => {
      setMessage("");
      setError(cause instanceof Error ? cause.message : "Could not save billing.");
    },
  });

  if (session.data && !session.data.access.canShop && !session.data.access.canDefer) {
    return <Locked title="No billing on this account" body="Invoices and shop payments are turned on by an admin." />;
  }
  const orders = account.data?.orders ?? [];
  const card = billing.data?.card;
  return (
    <div className="grid w-full gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">Choose how this account pays. A saved card keeps only the last four digits and the expiry.</p>
      </div>
      <form
        className="grid gap-4 lg:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          save.mutate();
        }}
      >
        <section className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Payment gateway</h2>
          {(billing.data?.methods ?? [{ id: "card", label: "Debit or credit card", detail: "Charged when the order is placed." }]).map((item) => (
            <label key={item.id} className={method === item.id ? "grid cursor-pointer gap-1 rounded-xl border border-ink bg-white px-4 py-3" : "grid cursor-pointer gap-1 rounded-xl border border-line bg-white px-4 py-3"}>
              <span className="flex items-center gap-3 text-sm font-semibold">
                <input type="radio" name="gateway" className="size-4" checked={method === item.id} onChange={() => setMethod(item.id)} />
                {item.label}
              </span>
              <span className="pl-7 text-xs text-muted">{item.detail}</span>
            </label>
          ))}
          {billing.data?.payLater ? (
            <label className={method === "pay_later" ? "grid cursor-pointer gap-1 rounded-xl border border-ink bg-[#f7fbfb] px-4 py-3" : "grid cursor-pointer gap-1 rounded-xl border border-line bg-[#f7fbfb] px-4 py-3"}>
              <span className="flex items-center gap-3 text-sm font-semibold">
                <input type="radio" name="gateway" className="size-4" checked={method === "pay_later"} onChange={() => setMethod("pay_later")} />
                Order now, pay later
              </span>
              <span className="pl-7 text-xs text-muted">This account can be invoiced. The order stays unpaid until the invoice is collected.</span>
            </label>
          ) : (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-xs text-muted">Order now, pay later is not turned on for this account.</p>
          )}
        </section>
        <section className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Card</h2>
          {card ? <p className="text-sm text-muted">{card.brand} ···· {card.last4}{card.exp ? ` · ${card.exp}` : ""}. Enter a new card to replace it.</p> : <p className="text-sm text-muted">Add the card this account should use.</p>}
          <label className="grid gap-1 text-sm">
            Card number
            <input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              Expiry
              <input value={cardExp} onChange={(event) => setCardExp(event.target.value)} placeholder="MM/YY" autoComplete="cc-exp" className={fieldClass} />
            </label>
            <label className="grid gap-1 text-sm">
              CCV
              <input value={cardCcv} onChange={(event) => setCardCcv(event.target.value)} inputMode="numeric" autoComplete="cc-csc" placeholder="123" className={fieldClass} />
            </label>
          </div>
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          {message ? <p className="text-sm text-muted">{message}</p> : null}
          <button type="submit" disabled={save.isPending || !token} className="h-12 rounded-xl bg-ink text-sm font-semibold text-white disabled:opacity-50">
            {save.isPending ? "Saving" : "Save billing"}
          </button>
        </section>
      </form>
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Charges</h2>
        {orders.map((order) => {
          const payment = shopifyPayment(order);
          return (
            <article key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span>
                <span className="block font-semibold">{order.number}</span>
                <span className="text-xs text-muted">{payment.label} · {order.status}</span>
              </span>
              <span className="tabular-nums">{money(order.totalCents)}</span>
            </article>
          );
        })}
        {account.data && orders.length === 0 ? <p className="text-sm text-muted">No charges yet.</p> : null}
      </section>
    </div>
  );
}
