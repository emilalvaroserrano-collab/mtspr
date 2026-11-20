import type { Offering, Planned } from "@/lib/portal/sarah-plan";

export type ProcedureId = "equipment" | "service" | "complaint" | "ticket" | "order" | "billing" | "person";

export type Procedure = {
  id: ProcedureId;
  product?: string;
  offering?: Offering;
  site?: string;
  faxEmail?: string;
  drops?: number;
  shipPhone?: boolean;
  subject?: string;
  priority?: string;
  justification?: string;
  orderId?: number;
  field?: "phone" | "company" | "city";
  value?: string;
};

export type ProcedureStep = { procedure: Procedure | null; reply?: string; planned?: Planned };

const OFFERING: { id: Offering; test: RegExp }[] = [
  { id: "voip-ext", test: /\b(extension|ext)\b/ },
  { id: "voip-line", test: /\b(voip|phone line)\b/ },
  { id: "fax-efax", test: /\b(efax|e-fax)\b/ },
  { id: "fax-physical", test: /\bfax\b/ },
  { id: "wiring", test: /\b(wiring|network drop|drops)\b/ },
  { id: "internet-spectrum", test: /\bspectrum\b/ },
  { id: "internet-att", test: /\b(at&t|att fiber)\b/ },
  { id: "internet-frontier", test: /\bfrontier\b/ },
  { id: "internet-fixed", test: /\bfixed wireless\b/ },
  { id: "network", test: /\b(internet|network|new office|connect)\b/ },
];

function offeringIn(text: string): Offering | undefined {
  return OFFERING.find((item) => item.test.test(text))?.id;
}

function emailIn(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? "";
}

function phoneIn(text: string) {
  return text.match(/(\+?[\d][\d\s().-]{6,}\d)/)?.[1]?.trim() ?? "";
}

function dropsIn(text: string) {
  const word = text.match(/\b(\d{1,2})\b/);
  return word ? Math.min(50, Math.max(1, Number(word[1]))) : 0;
}

function priorityIn(text: string) {
  if (/\burgent\b/.test(text)) return "urgent";
  if (/\bhigh\b/.test(text)) return "high";
  if (/\blow\b/.test(text)) return "low";
  if (/\b(normal|medium)\b/.test(text)) return "normal";
  return "";
}

function orderIdIn(text: string) {
  const match = text.match(/\b(?:mt-)?(\d{3,6})\b/i);
  if (!match) return 0;
  const value = Number(match[1]);
  return value > 1000 ? value - 1000 : value;
}

function productIn(text: string) {
  const named = text.match(/\b(laptop|monitor|display|printer|headset|keyboard|mouse|dock|webcam|ssd|desk phone|camera)\b/i);
  return named?.[1]?.toLowerCase() ?? "";
}

function startOf(text: string): Procedure | null {
  const q = text.toLowerCase();
  if (/\b(real person|human|talk to (a |an )?(person|agent|someone))\b/.test(q)) return { id: "person", subject: text };
  if (/\b(where.*order|order status|track(ing)? my)\b/.test(q)) return { id: "order", orderId: orderIdIn(q) || undefined };
  if (/\b(billing|invoice details|company name)\b/.test(q) && /\b(change|update|modify|fix)\b/.test(q)) return { id: "billing" };
  if (/\b(complaint|complain)\b/.test(q)) return { id: "complaint", subject: q.split(/\s+/).length > 4 ? text : "" };
  if (/\b(buy|order|need|add)\b/.test(q) && productIn(q)) return { id: "equipment", product: productIn(q) };
  if (/\b(order|need|want)\b/.test(q) && offeringIn(q)) return { id: "service", offering: offeringIn(q) };
  if (/\b(open|file|submit)\b/.test(q) && /\bticket\b/.test(q)) return { id: "ticket", subject: q.split(/\s+/).length > 5 ? text : "" };
  if (/\b(down|broken|not working|outage)\b/.test(q)) return { id: "ticket", subject: text, priority: priorityIn(q) || "high" };
  return null;
}

function done(planned: Planned): ProcedureStep {
  return { procedure: null, planned };
}

function ask(procedure: Procedure, reply: string): ProcedureStep {
  return { procedure, reply };
}

function finish(procedure: Procedure, text: string): ProcedureStep {
  if (procedure.id === "person") {
    return done({ tool: "open_ticket", subject: "Customer asked for a person", body: procedure.subject || text, category: "Escalation", priority: "normal" });
  }
  if (procedure.id === "equipment") {
    if (!procedure.product) return ask(procedure, "Which product should I look up?");
    return done({ tool: "find_equipment", query: procedure.product, add: true });
  }
  if (procedure.id === "order") {
    if (!procedure.orderId) return ask(procedure, "What is the order number? It looks like MT-1001.");
    return done({ tool: "order_detail", id: procedure.orderId });
  }
  if (procedure.id === "complaint") {
    if (!procedure.subject) return ask(procedure, "What happened? I'll file it as a complaint on this account.");
    return done({ tool: "complaint", subject: procedure.subject.slice(0, 140), body: procedure.subject });
  }
  if (procedure.id === "billing") {
    if (!procedure.field) return ask(procedure, "What should I change: the company name, the phone, or the city?");
    if (!procedure.value) return ask(procedure, procedure.field === "phone" ? "What number should I put on the account?" : `What should the ${procedure.field} be?`);
    if (procedure.field === "phone") return done({ tool: "update_contact", phone: procedure.value });
    return done({
      tool: "update_company",
      business: procedure.field === "company" ? procedure.value : "",
      phone: "",
      city: procedure.field === "city" ? procedure.value : "",
    });
  }
  if (procedure.id === "ticket") {
    if (!procedure.subject) return ask(procedure, "What should I put on the ticket?");
    const priority = procedure.priority || "normal";
    if ((priority === "high" || priority === "urgent") && !procedure.justification) {
      return ask({ ...procedure, priority }, "That priority needs a short business justification before I send it.");
    }
    return done({
      tool: "open_ticket",
      subject: procedure.subject.slice(0, 140),
      body: procedure.subject,
      category: "Chat",
      priority,
      justification: procedure.justification || "",
    });
  }
  const offering = procedure.offering;
  if (!offering) return ask(procedure, "Is this internet, a phone line, an extension, fax, or wiring?");
  if (offering === "fax-efax" && !procedure.faxEmail) return ask(procedure, "Which email address should receive the incoming faxes?");
  if (offering === "wiring" && !procedure.drops) return ask(procedure, "How many drops? Wiring is $175 each.");
  if (offering !== "voip-ext" && offering !== "fax-efax" && !procedure.site) return ask(procedure, "What is the site address?");
  return done({
    tool: "order_service",
    offering,
    site: procedure.site || "",
    notes: procedure.subject || text,
    recipientEmail: procedure.faxEmail || "",
    drops: procedure.drops || 1,
    shipPhone: Boolean(procedure.shipPhone),
    confirmMonthly: false,
  });
}

function fill(procedure: Procedure, text: string): Procedure {
  const q = text.toLowerCase();
  const next = { ...procedure };
  if (next.id === "equipment" && !next.product) next.product = productIn(q) || text.slice(0, 80);
  if (next.id === "service") {
    next.offering = next.offering || offeringIn(q);
    next.faxEmail = next.faxEmail || emailIn(text);
    next.drops = next.drops || dropsIn(q) || undefined;
    if (/\d/.test(text) && /\b(street|st|ave|road|rd|blvd|drive|dr|suite)\b/i.test(text)) next.site = text.slice(0, 160);
    else if (!next.site && next.offering && next.offering !== "voip-ext" && next.offering !== "fax-efax" && !offeringIn(q)) next.site = text.slice(0, 160);
    if (/\b(desk phone|handset)\b/.test(q)) next.shipPhone = true;
  }
  if (next.id === "complaint" && !next.subject) next.subject = text;
  if (next.id === "ticket") {
    if (!next.subject) next.subject = text;
    next.priority = next.priority || priorityIn(q);
    if ((next.priority === "high" || next.priority === "urgent") && next.subject && text !== next.subject) next.justification = text.slice(0, 500);
  }
  if (next.id === "order" && !next.orderId) next.orderId = orderIdIn(q) || undefined;
  if (next.id === "billing") {
    if (!next.field) {
      if (/\bphone\b/.test(q)) next.field = "phone";
      else if (/\bcity\b/.test(q)) next.field = "city";
      else if (/\b(company|business|name)\b/.test(q)) next.field = "company";
    }
    if (next.field && !next.value) {
      const phone = phoneIn(text);
      if (next.field === "phone" && phone) next.value = phone;
      else if (next.field !== "phone" && !/^(phone|city|company|business|name)$/i.test(text.trim())) next.value = text.slice(0, 160);
    }
  }
  return next;
}

export function procedureTurn(current: Procedure | null | undefined, text: string): ProcedureStep | null {
  const raw = text.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  const started = startOf(q);
  if (/\b(never mind|forget it|start over)\b/.test(q)) return { procedure: null, reply: "Okay. I didn't send that." };
  if (current && !started && /\b(my tickets|my orders|my account|show me)\b/.test(q)) return null;
  const active = started && (!current || started.id !== current.id) ? started : current;
  if (!active) return null;
  const filled = active === current ? fill(active, raw) : fill({ ...active, subject: active.subject }, raw);
  return finish(filled, raw);
}
