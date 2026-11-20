import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePortalSession } from "@/lib/portal/use-portal-session";
import { listPortalSessions, revokeOtherPortalSessions, revokePortalSession, saveShopProfile } from "@/lib/portal/api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { setShopToken, useShopToken } from "@/lib/portal/shop-session";
import { DataField, PortalPanel } from "@/components/portal-ui";
import { Field, Input } from "@/components/ui";

export const Route = createFileRoute("/portal/account")({
  component: AccountPage,
});

export function AccountPage() {
  const token = useShopToken();
  const client = useQueryClient();
  const session = usePortalSession();
  const user = useCurrentUser();
  const customer = session.data?.customer;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("United States");
  const [seeded, setSeeded] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!customer || seeded) return;
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setCity(customer.city);
    setRegion(customer.region);
    setPostal(customer.postal);
    setCountry(customer.country || "United States");
    setSeeded(true);
  }, [customer, seeded]);
  const save = useMutation({
    mutationFn: () => saveShopProfile({ data: { token, name, phone, address, city, region, postal, country } }),
    onSuccess: async () => {
      setNotice("Account saved.");
      await client.invalidateQueries({ queryKey: ["portal-session"] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save."),
  });
  if (!token || session.isPending || !seeded) return <p className="text-sm text-muted">Loading account…</p>;
  if (session.isError || !customer) return <p className="text-sm text-bad">This account could not be loaded. Sign in again.</p>;
  return (
    <form className="grid w-full gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Account</h1>
        <p className="text-sm text-muted">Password changes stay with the sign-in provider you used.</p>
      </div>
      <PortalPanel title="Profile">
        <div className="grid gap-3 sm:grid-cols-2">
          <DataField label="Email" value={customer.email || user?.primaryEmail} />
          <DataField label="Company" value={session.data?.organization || session.data?.business || "Not set"} />
          <DataField label="Role" value={session.data?.zendeskRole || session.data?.access.roleLabel} />
          <DataField label="Time zone" value={session.data?.timeZone || "Not set"} />
          <DataField label="Billing terms" value={customer.payLater ? "Order now, pay later" : "Pay at checkout"} />
        </div>
      </PortalPanel>
      <PortalPanel title="Contact and billing">
        <div className="grid gap-3">
          <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required className="h-11 rounded-xl" /></Field>
          <Field label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-11 rounded-xl" /></Field>
          <Field label="Billing address"><Input value={address} onChange={(event) => setAddress(event.target.value)} className="h-11 rounded-xl" /></Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="City"><Input value={city} onChange={(event) => setCity(event.target.value)} className="h-11 rounded-xl" /></Field>
            <Field label="State"><Input value={region} onChange={(event) => setRegion(event.target.value)} className="h-11 rounded-xl" /></Field>
            <Field label="Postal code"><Input value={postal} onChange={(event) => setPostal(event.target.value)} className="h-11 rounded-xl" /></Field>
            <Field label="Country"><Input value={country} onChange={(event) => setCountry(event.target.value)} className="h-11 rounded-xl" /></Field>
          </div>
        </div>
      </PortalPanel>
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      <button type="submit" disabled={save.isPending} className="h-11 rounded-xl bg-ink text-sm font-medium text-white disabled:opacity-50">Save account</button>
      <SessionList token={token} />
    </form>
  );
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SessionList({ token }: { token: string }) {
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: ["portal-sessions", token],
    queryFn: () => listPortalSessions({ data: token }),
  });
  const revoke = useMutation({
    mutationFn: (sessionId: number) => revokePortalSession({ data: { token, sessionId } }),
    onSuccess: async (result) => {
      if (result.current) {
        setShopToken("");
        window.location.assign("/production/signin");
        return;
      }
      await client.invalidateQueries({ queryKey: ["portal-sessions", token] });
    },
  });
  const others = useMutation({
    mutationFn: () => revokeOtherPortalSessions({ data: { token } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["portal-sessions", token] });
    },
  });
  const rows = sessions.data ?? [];
  return (
    <PortalPanel title="Sessions">
      <div className="grid gap-3">
        <p className="text-sm text-muted">Each sign-in stays active for 14 days, or 30 days at most. You can close one device without closing this one.</p>
        {sessions.isPending ? <p className="text-sm text-muted">Loading sessions…</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.label}{row.current ? " · This device" : ""}</p>
              <p className="truncate text-xs text-muted">Last used {when(row.lastSeenAt)}{row.ip ? ` · ${row.ip}` : ""}</p>
            </div>
            <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(row.id)} className="shrink-0 text-xs font-semibold text-[#8e1f0b]">
              Sign out
            </button>
          </div>
        ))}
        {rows.length > 1 ? (
          <button type="button" disabled={others.isPending} onClick={() => others.mutate()} className="justify-self-start text-sm font-semibold text-[#127e86]">
            Sign out other devices
          </button>
        ) : null}
      </div>
    </PortalPanel>
  );
}