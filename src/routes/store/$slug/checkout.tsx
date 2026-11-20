import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRouterState, createFileRoute } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { StoreFrame, SummaryToggle, useStore } from "@/components/storefront";
import { getShopAccount, getShopCheckout, placeStorefrontOrder } from "@/lib/portal/api";
import { money } from "@/lib/portal/format";
import { clearCart, setCartQuantity, useCart } from "@/lib/portal/store-cart";
import { setShopToken, useShopToken } from "@/lib/portal/shop-session";

export const Route = createFileRoute("/store/$slug/checkout")({
  component: CheckoutPage,
});

const STEPS = ["information", "shipping", "payment"] as const;
type Step = (typeof STEPS)[number];

function CheckoutPage() {
  return (
    <StoreFrame>
      <Checkout />
    </StoreFrame>
  );
}

export function Checkout({ onlySku = "" }: { onlySku?: string }) {
  const { slug, query } = useStore();
  const store = query.data;
  const lines = useCart();
  const onPortal = useRouterState({ select: (state) => state.location.pathname.startsWith("/production/user-portal") });
  const token = useShopToken();
  const account = useQuery({
    queryKey: ["shop-account", token],
    queryFn: () => getShopAccount({ data: token }),
    enabled: Boolean(token),
  });
  const checkout = useQuery({ queryKey: ["shop-checkout", token], queryFn: () => getShopCheckout({ data: token }) });
  const [step, setStep] = useState<Step>("information");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [saveAccount, setSaveAccount] = useState(false);
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("United States");
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [notes, setNotes] = useState("");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExp, setCardExp] = useState("12/28");
  const [cardCcv, setCardCcv] = useState("123");
  const [error, setError] = useState("");

  useEffect(() => {
    const customer = account.data?.customer;
    if (!customer) return;
    setEmail(customer.email);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setCity(customer.city);
    setRegion(customer.region);
    setPostal(customer.postal);
    setCountry(customer.country || "United States");
  }, [account.data]);

  const detailed = lines
    .map((line) => ({ ...line, product: store?.products.find((product) => product.sku === line.sku) }))
    .filter((line) => line.product && (!onlySku || line.sku === onlySku));
  const subtotal = detailed.reduce((sum, line) => sum + line.quantity * (line.product?.priceCents ?? 0), 0);
  const shippingCents = shippingMethod === "express" ? 2500 : subtotal >= 50000 ? 0 : 1500;
  const total = subtotal + shippingCents;
  const stepIndex = STEPS.indexOf(step);

  const place = useMutation({
    mutationFn: (method: "card" | "pay_later") =>
      placeStorefrontOrder({
        data: {
          name,
          email,
          phone,
          company,
          address,
          city,
          region,
          postal,
          country,
          shippingMethod,
          paymentMethod: method,
          notes,
          password: saveAccount ? password : "",
          token,
          mockCard: method === "card",
          cardLast4: method === "card" ? cardNumber.replace(/\D/g, "").slice(-4) : "",
          cardExp: method === "card" ? cardExp : "",
          items: detailed.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        },
      }),
    onSuccess: (result) => {
      if (result.token) setShopToken(result.token);
      if (onlySku) setCartQuantity(onlySku, 0);
      else clearCart();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not place the order."),
  });

  if (!store) return null;
  if (detailed.length === 0 && !place.data) {
    return (
      <main className="mx-auto grid max-w-lg justify-items-center gap-4 px-4 py-16 text-center">
        <p className="text-lg font-semibold">{onlySku ? "That item is no longer in the cart" : "Your cart is empty"}</p>
        {onPortal && onlySku ? (
          <a href="/production/user-portal/checkout" className="shop-press mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white">Back to cart</a>
        ) : (
          <Link to={onPortal ? "/production/user-portal/shop" : "/store/$slug"} params={onPortal ? {} : { slug: store.slug }} className="shop-press mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white">
            Return to the shop
          </Link>
        )}
      </main>
    );
  }
  if (place.data) {
    return (
      <main className="shop-rise mx-auto grid max-w-lg gap-3 px-4 py-12 sm:py-16">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent"><Check className="size-4" /> Order received</p>
        <h1 className="text-4xl font-semibold tracking-tight">{place.data.number}</h1>
        <p className="text-base leading-7 text-muted">
          {place.data.mockPaid
            ? "Mock payment approved. The test card was accepted and this order is marked paid. No real charge was made."
            : place.data.paymentUrl
            ? "This order is not paid yet. Finish payment on the secure page. It is marked paid only after the provider confirms it."
            : "The order is in your account. An invoice stays unpaid until it is collected."}
        </p>
        <p className="text-sm">Total <span className="font-semibold tabular-nums">{money(place.data.totalCents)}</span></p>
        {place.data.paymentUrl ? (
          <a href={place.data.paymentUrl} target="_blank" rel="noreferrer" className="shop-press mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white">
            Continue to payment
          </a>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          {onPortal ? (
            <a href="/production/user-portal/orders" className="shop-press inline-flex h-12 items-center justify-center rounded-full border border-line px-5 text-sm font-semibold">
              Track this order
            </a>
          ) : (
            <Link to="/store/$slug/account" params={{ slug: store.slug }} className="shop-press inline-flex h-12 items-center justify-center rounded-full border border-line px-5 text-sm font-semibold">
              Track this order
            </Link>
          )}
          {onPortal ? (
            <a href="/production/user-portal/shop" className="inline-flex h-12 items-center justify-center text-sm text-muted">Keep shopping</a>
          ) : (
            <Link to="/store/$slug" params={{ slug: store.slug }} className="inline-flex h-12 items-center justify-center text-sm text-muted">
              Keep shopping
            </Link>
          )}
        </div>
      </main>
    );
  }

  const summary = (
    <div>
      <ul className="grid gap-3">
        {detailed.map((line) => (
          <li key={line.sku} className="flex items-center gap-3">
            <span className="relative">
              {line.product?.imageUrl ? <img src={line.product.imageUrl} alt="" className="size-16 rounded-xl border border-line bg-white object-cover" /> : <span className="block size-16 rounded-xl bg-white" />}
              <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-5 text-white">{line.quantity}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium">{line.product?.name}</span>
            <span className="text-sm tabular-nums">{money(line.quantity * (line.product?.priceCents ?? 0))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
        <p className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></p>
        <p className="flex justify-between"><span className="text-muted">Shipping</span><span className="tabular-nums">{shippingCents === 0 ? "Free" : money(shippingCents)}</span></p>
      </div>
      <p className="mt-3 flex items-end justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="text-xl font-semibold tabular-nums">{money(total)}</span>
      </p>
    </div>
  );

  function go(next: Step) {
    setError("");
    setStep(next);
  }

  return (
    <main className="grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
      <section className="bg-[#f3f6f7] lg:order-2 lg:border-l lg:border-line lg:px-8 lg:py-10">
        <SummaryToggle total={money(total)}>{summary}</SummaryToggle>
        <div className="hidden lg:block">{summary}</div>
      </section>
      <section className="bg-white px-4 py-6 sm:px-10 lg:order-1 lg:py-10">
        <div className="mx-auto grid w-full max-w-xl gap-6">
          {onPortal ? <a href="/production/user-portal/checkout" className="text-sm text-muted">Back to cart</a> : null}
          {onlySku && detailed[0]?.product ? (
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 rounded-2xl bg-[#f3f6f7] p-4">
              {detailed[0].product.imageUrl ? (
                <img src={detailed[0].product.imageUrl} alt="" className="size-[6.5rem] rounded-2xl bg-white object-contain" />
              ) : (
                <span className="size-[6.5rem] rounded-2xl bg-white" />
              )}
              <div className="min-w-0">
                {detailed[0].product.category ? <p className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">{detailed[0].product.category}</p> : null}
                <h1 className="text-xl font-semibold tracking-tight">{detailed[0].product.name}</h1>
                <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted">{detailed[0].product.description}</p>
                <p className="mt-2 text-sm font-semibold tabular-nums">{money(detailed[0].product.priceCents)} each · qty {detailed[0].quantity}</p>
              </div>
            </div>
          ) : null}
          <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Checkout">
            {onPortal ? <a href="/production/user-portal/checkout">Cart</a> : <Link to="/store/$slug/checkout" params={{ slug }}>Cart</Link>}
            {STEPS.map((item, index) => (
              <span key={item} className="flex items-center gap-2">
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  disabled={index > stepIndex}
                  className={step === item ? "font-semibold text-ink" : index < stepIndex ? "text-accent" : "cursor-default"}
                  onClick={() => {
                    if (index < stepIndex) go(item);
                  }}
                >
                  {item === "information" ? "Information" : item === "shipping" ? "Shipping" : "Payment"}
                </button>
              </span>
            ))}
          </nav>

          {step !== "information" ? (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
              <SummaryRow label="Contact" value={email} onChange={() => go("information")} />
              <SummaryRow label="Ship to" value={[address, city, region, postal, country].filter(Boolean).join(", ")} onChange={() => go("information")} />
              {step === "payment" ? (
                <SummaryRow
                  label="Method"
                  value={shippingMethod === "express" ? `Express · ${money(2500)}` : `Standard · ${shippingCents === 0 ? "Free" : money(shippingCents)}`}
                  onChange={() => go("shipping")}
                />
              ) : null}
            </div>
          ) : null}

          {step === "information" ? (
            <form
              className="shop-rise grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                go("shipping");
              }}
            >
              <h1 className="text-lg font-semibold">Contact</h1>
              {account.data ? <p className="text-sm text-muted">Signed in as {account.data.customer.email}</p> : (
                <p className="text-sm text-muted">
                  Already have an account? <Link to="/store/$slug/account" params={{ slug }} className="font-semibold text-accent">Sign in</Link>
                </p>
              )}
              <ShopField label="Email">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className={fieldClass} />
              </ShopField>
              <h2 className="pt-2 text-lg font-semibold">Delivery</h2>
              <ShopField label="Country">
                <input value={country} onChange={(event) => setCountry(event.target.value)} required autoComplete="country-name" className={fieldClass} />
              </ShopField>
              <div className="grid gap-3 sm:grid-cols-2">
                <ShopField label="Full name">
                  <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" className={fieldClass} />
                </ShopField>
                <ShopField label="Company (optional)">
                  <input value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" className={fieldClass} />
                </ShopField>
              </div>
              <ShopField label="Address">
                <input value={address} onChange={(event) => setAddress(event.target.value)} required autoComplete="address-line1" className={fieldClass} />
              </ShopField>
              <div className="grid gap-3 sm:grid-cols-3">
                <ShopField label="City">
                  <input value={city} onChange={(event) => setCity(event.target.value)} required autoComplete="address-level2" className={fieldClass} />
                </ShopField>
                <ShopField label="State">
                  <input value={region} onChange={(event) => setRegion(event.target.value)} autoComplete="address-level1" className={fieldClass} />
                </ShopField>
                <ShopField label="Postal code">
                  <input value={postal} onChange={(event) => setPostal(event.target.value)} required autoComplete="postal-code" className={fieldClass} />
                </ShopField>
              </div>
              <ShopField label="Phone">
                <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" className={fieldClass} />
              </ShopField>
              {account.data ? null : (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5" checked={saveAccount} onChange={(event) => setSaveAccount(event.target.checked)} />
                  Save this information and create an account
                </label>
              )}
              {saveAccount ? (
                <ShopField label="Password" hint="At least 8 characters.">
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" className={fieldClass} />
                </ShopField>
              ) : null}
              <button type="submit" className="shop-press h-12 rounded-xl bg-ink text-sm font-semibold text-white">Continue to shipping</button>
            </form>
          ) : null}

          {step === "shipping" ? (
            <form className="shop-rise grid gap-3" onSubmit={(event) => { event.preventDefault(); go("payment"); }}>
              <h1 className="text-lg font-semibold">Shipping method</h1>
              <label className={choiceClass(shippingMethod === "standard")}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="ship" className="size-5" checked={shippingMethod === "standard"} onChange={() => setShippingMethod("standard")} />
                  <span>
                    <span className="block font-semibold">Standard</span>
                    <span className="text-xs text-muted">5–7 business days</span>
                  </span>
                </span>
                <span className="tabular-nums">{subtotal >= 50000 ? "Free" : money(1500)}</span>
              </label>
              <label className={choiceClass(shippingMethod === "express")}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="ship" className="size-5" checked={shippingMethod === "express"} onChange={() => setShippingMethod("express")} />
                  <span>
                    <span className="block font-semibold">Express</span>
                    <span className="text-xs text-muted">2 business days</span>
                  </span>
                </span>
                <span className="tabular-nums">{money(2500)}</span>
              </label>
              <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className="h-12 text-sm text-accent" onClick={() => go("information")}>Return to information</button>
                <button type="submit" className="shop-press h-12 rounded-xl bg-ink px-6 text-sm font-semibold text-white sm:min-w-52">Continue to payment</button>
              </div>
            </form>
          ) : null}

          {step === "payment" ? (
            <form
              className="shop-rise grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const digits = cardNumber.replace(/\D/g, "");
                if (digits.length < 13 || !/^\d{2}\/\d{2}$/.test(cardExp) || cardCcv.replace(/\D/g, "").length < 3) {
                  setError("Enter the card number, expiry, and CCV.");
                  return;
                }
                setPaymentMethod("card");
                setError("");
                place.mutate("card");
              }}
            >
              <h1 className="flex items-center gap-2 text-lg font-semibold"><Lock className="size-4" /> Payment</h1>
              <div className="grid gap-3 rounded-2xl border border-line bg-[#f7fbfb] p-4">
                <p className="text-sm font-semibold">Mock payment gateway</p>
                <p className="text-xs text-muted">Test card only. Nothing is charged and the full number is not stored.</p>
                <ShopField label="Card number">
                  <input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" autoComplete="cc-number" className={fieldClass} />
                </ShopField>
                <div className="grid grid-cols-2 gap-3">
                  <ShopField label="Expiry">
                    <input value={cardExp} onChange={(event) => setCardExp(event.target.value)} placeholder="MM/YY" autoComplete="cc-exp" className={fieldClass} />
                  </ShopField>
                  <ShopField label="CCV">
                    <input value={cardCcv} onChange={(event) => setCardCcv(event.target.value)} inputMode="numeric" autoComplete="cc-csc" className={fieldClass} />
                  </ShopField>
                </div>
              </div>
              {checkout.data && !checkout.data.signedIn ? (
                <a href="/production/signin" className="flex h-12 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white">Sign in to the customer portal</a>
              ) : null}
              {checkout.data?.signedIn && !checkout.data.canPurchase ? (
                <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">This account cannot purchase products.</p>
              ) : null}
              <ShopField label="Order notes (optional)">
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${fieldClass} h-24 py-3`} />
              </ShopField>
              {error ? <p className="text-sm text-bad">{error}</p> : null}
              <div className="mt-2 grid gap-3">
                {(checkout.data?.signedIn && checkout.data.canPurchase) ? (
                <button type="submit" disabled={place.isPending} className="shop-press h-12 rounded-xl bg-ink text-sm font-semibold text-white disabled:opacity-50">
                  {place.isPending && paymentMethod === "card" ? "Checking the test card" : `Pay now · ${money(total)}`}
                </button>
                ) : checkout.data?.signedIn ? <p className="text-center text-xs text-muted">This account cannot purchase products.</p> : null}
                {checkout.data?.payLater ? (
                  <button
                    type="button"
                    disabled={place.isPending}
                    onClick={() => {
                      setPaymentMethod("pay_later");
                      setError("");
                      place.mutate("pay_later");
                    }}
                    className="shop-press h-12 rounded-xl border border-ink text-sm font-semibold disabled:opacity-50"
                  >
                    Order now, pay later
                  </button>
                ) : (
                  <p className="text-center text-xs text-muted">This account pays before the order is placed.</p>
                )}
                <button type="button" className="h-12 text-sm text-accent" onClick={() => go("shipping")}>Return to shipping</button>
              </div>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const fieldClass = "h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-accent";

function choiceClass(selected: boolean) {
  return `flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition ${selected ? "border-ink bg-accent-soft" : "border-line bg-white"}`;
}

function ShopField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function SummaryRow({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-2 bg-[#f7fafb] px-3 py-3">
      <span className="text-muted">{label}</span>
      <span className="truncate">{value || "—"}</span>
      <button type="button" className="text-accent" onClick={onChange}>Change</button>
    </div>
  );
}
