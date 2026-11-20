export type SarahPage = {
  id: string;
  to: "/portal" | "/portal/tickets" | "/portal/tickets/new" | "/portal/shop" | "/portal/orders" | "/portal/billing" | "/portal/complaints" | "/portal/organization" | "/portal/account" | "/portal/my-services" | "/portal/quotes" | "/portal/notifications";
  guide: string;
  label: string;
  words: string[];
};

export const PAGES: SarahPage[] = [
  { id: "home", to: "/portal", guide: "home", label: "Home", words: ["home", "dashboard", "start"] },
  { id: "tickets", to: "/portal/tickets", guide: "tickets", label: "Tickets", words: ["ticket", "tickets", "support", "help desk"] },
  { id: "new-ticket", to: "/portal/tickets/new", guide: "tickets", label: "New ticket", words: ["new ticket", "open a ticket"] },
  { id: "shop", to: "/portal/shop", guide: "order", label: "Order", words: ["shop", "catalog", "equipment", "laptop", "store"] },
  { id: "orders", to: "/portal/orders", guide: "orders", label: "My orders", words: ["my orders", "shipment", "tracking", "delivery"] },
  { id: "billing", to: "/portal/billing", guide: "billing", label: "Billing", words: ["billing", "invoice", "payment", "pay later"] },
  { id: "complaints", to: "/portal/complaints", guide: "complaints", label: "Complaints", words: ["complaint", "complaints", "feedback"] },
  { id: "organization", to: "/portal/organization", guide: "organization", label: "Organization", words: ["organization", "company"] },
  { id: "account", to: "/portal/account", guide: "account", label: "Account", words: ["account", "profile", "phone number"] },
  { id: "services", to: "/portal/my-services", guide: "services", label: "My services", words: ["my services", "active service", "provision"] },
  { id: "quotes", to: "/portal/quotes", guide: "quotes", label: "Quotes", words: ["quote", "quotes"] },
  { id: "notifications", to: "/portal/notifications", guide: "notifications", label: "Notifications", words: ["notification", "notifications", "alert"] },
];

const ARTICLES: { title: string; keywords: string[]; body: string; page: string }[] = [
  {
    title: "Manage Tech Service",
    keywords: ["manage tech", "mts", "company", "about the company", "desk", "mike", "website", "managetechservice"],
    page: "home",
    body: "We are Manage Tech Service, also called MTS. We are the company speaking. Say we and us, never they, when the subject is MTS. We are based in Los Angeles. Our office is 8240 Beverly Blvd, Suite 12, Los Angeles, CA 90048. Our public site is https://managetechservice.com/. Our line is 818-758-4073. Tagline: Technology that drives business success. We are a managed service provider with more than 25 years of work for small and medium businesses in healthcare, advertising, legal services, construction, and property management. If a detail is not in this knowledge, do not admit a blank record and do not send the person to the website. Say: Let me get back to you on that. I just need to check our system.",
  },
  {
    title: "MTS company knowledge",
    keywords: ["company", "about", "who are you", "what do you do", "services", "managed it", "cloud", "voip", "los angeles", "consultation", "we", "us", "mts", "managetechservice"],
    page: "home",
    body: [
      "We belong to Manage Tech Service. When we talk about the company, we say we and us. We are an asset of MTS and we stay loyal to MTS. We do not badmouth our own work, and we do not send a customer to another IT company as a replacement.",
      "Who we are. At MTS we help clients succeed by matching technology to the business. We show that IT is not just an expense. We introduce more robust, cost-efficient, and secure solutions so the business is more productive. We partner with local businesses so they get ahead instead of falling behind. We focus on efficiency and cutting waste. We plan so a client does not pay for more than they need. We have more than 25 years of experience with small and medium businesses in healthcare, advertising, legal services, construction, and property management. We are a Managed Service Provider in Los Angeles. Our office is 8240 Beverly Blvd, Suite 12, Los Angeles, CA 90048. Our phone is 818-758-4073. When someone asks where we are, answer with that office. Do not say we have no address.",
      "How we work. We start with an initial consult, then an operations and technology assessment, then strategic planning and guidance, then implementation, then support and maintenance. We take projects one at a time, we listen first, and we can do pay-as-you-go support. A consultation is requested at 818-758-4073 or at https://managetechservice.com/contact/. We do not invent a price the website does not publish. A free IT health check is one of our project services. Remote support is booked through contact, and a scheduled remote session uses https://managetechservice.com/remote-support/ with the remote tool at http://techmts.com.",
      "What we promise in our own words. We keep the business secure, compliant, and productive. We remove downtime and inefficient setups. We are proactive instead of reactive. We monitor so we can fix problems before the client notices. Our help desk is staffed by people. We aim for less cost, less overhead, and less stress, with affordable rates. We do not claim a technician is already on site unless a tool says so.",
      "Managed IT, https://managetechservice.com/managed-it/. We take care of the technology so the team can work. We propose hardware, networking, and security improvements and we monitor them. Our managed IT list is Server and Network Management, PC and Mac support, Backup and Recovery, Cybersecurity and Compliance, 24-hour system mentoring and 24-hour support, Vendor Management, Virtual CIO, Help Desk, Business Continuity, and Business Antivirus and Endpoint Security. Backup and recovery covers monitored backups, disaster recovery, continuity planning, and testing, including access from anywhere if the local site is down. Cybersecurity covers policy, access management, SIEM, patching, vulnerability scans, compliance audits, and regular security reports.",
      "Cloud, https://managetechservice.com/cloud-services/. We build and monitor cloud so a business can scale up or down and pay for what it uses. Our cloud list is Application Hosting, Cloud Migration and Management, Desktop as a Service, Infrastructure as a Service, Colocation, Virtual Server Hosting, Virtualization Support, and VoIP. Migration can be private, public, or hybrid. We audit the current setup, design and test the architecture, move operations, data, and email, then keep monitoring security, backups, and access. We say we aim for a move without interruption. We do not promise a date until we have checked the site.",
      "VoIP. We set up cloud phone service with our partner Telexent. It can cover voice, video, fax, text, and email, plus web, desktop, and mobile. We handle readiness, install, and custom workflows. An extra extension on this portal is 18 dollars a month on the Telxent bill and is not placed until the customer confirms. A desk phone is a separate equipment order.",
      "Projects, https://managetechservice.com/it-projects/. We consult, migrate and deploy, design Wi-Fi, support mobility and BYOD, run performance and security audits, offer a free IT health check, do structured cabling, move offices, and set up domain and business email. Wiring on this portal is 175 dollars per drop. We confirm the count and the total before we place it.",
      "Business applications. We support Google Workspace, Microsoft Active Directory, Microsoft 365, SharePoint, Azure, Teams, Intune, and Windows management. We can open a ticket or a service request. We do not reset a password inside Microsoft ourselves.",
      "Remote help. We connect to computers in the office or at home for forgotten portal passwords, Outlook, Outlook on a phone, printers, updates, office Wi-Fi, slow internet, missing files on a drive, and driver installs. We ask them to contact us to set the appointment.",
      "Where we send people. The website is https://managetechservice.com/. Managed IT, cloud, projects, remote support, about, services, and contact are the public pages. Customers of this portal sign in at our portal, not on the Zendesk Help Center. Invite only. New registrations are customers first.",
    ].join(" "),
  },
  {
    title: "Portal map",
    keywords: ["portal", "pages", "menu", "what can you do", "where do i"],
    page: "home",
    body: "The customer portal is /production/user-portal. The tab order starts with Home, then Tickets, Order, Billing, and Account. Orders, Complaints, and Organization follow. Home is the summary. Tickets are support requests. Order has Equipment and Order services. Orders shows status and shipment. Billing shows invoices and whether this account must pay now or may use order now, pay later. Complaints are filed there. Organization is the company. Account holds the profile and phone. Sarah opens these with show_page. The old /portal address is the upgrade page.",
  },
  {
    title: "Managed IT",
    keywords: ["managed it", "help desk", "server", "cyber", "backup", "endpoint", "security"],
    page: "tickets",
    body: "Managed IT services are Help Desk, Server Management, Network Support, Cybersecurity, Backup and Recovery, and Endpoint Security. They are also in the Zendesk service catalog. Sarah can pass the service name to open_ticket or order the matching portal service. She does not claim a technician is already dispatched.",
  },
  {
    title: "Cloud and business apps",
    keywords: ["cloud", "microsoft", "office 365", "outlook", "teams", "sharepoint", "azure", "intune", "google", "active directory", "daas", "migration"],
    page: "tickets",
    body: "Cloud services include hosting, migration, desktop as a service, infrastructure as a service, and virtual servers. Business application support covers Microsoft 365, Outlook, Teams, SharePoint, Azure, Intune, Active Directory, and Google Workspace. Sarah opens a ticket or a service request for these. She does not reset a password inside Microsoft herself.",
  },
  {
    title: "Projects",
    keywords: ["wifi", "wi-fi", "cabling", "consulting", "relocation", "audit", "project"],
    page: "quotes",
    body: "IT projects include Wi-Fi installation, network cabling, IT consulting, office relocation, and security audits. These are quoted. Sarah can note the site and the request. A quote is not an invoice and is not a completed install.",
  },
  {
    title: "Phone, fax, and internet",
    keywords: ["voip", "extension", "telxent", "fax", "efax", "spectrum", "fiber", "frontier", "wireless", "internet", "phone line"],
    page: "shop",
    body: "Phone and internet are ordered with order_service. A VoIP extension is 18 dollars a month extra on the Telxent bill and is not placed until the customer presses Confirm. Telxent still has to confirm the extension. A new extension can add a desk phone if they want a handset shipped. eFax needs the email address that should receive incoming faxes. Internet options are Spectrum cable, AT&T Fiber, Frontier Fiber, and fixed wireless. Sarah records the site address.",
  },
  {
    title: "Wiring",
    keywords: ["wiring", "drop", "cable drop", "175"],
    page: "shop",
    body: "Wiring is billed at 175 dollars per drop. Sarah asks how many drops, repeats the count and the total, and does not place the request until the customer presses Confirm.",
  },
  {
    title: "Tickets and Zendesk",
    keywords: ["ticket", "zendesk", "support", "priority", "justification", "service", "asset", "form"],
    page: "tickets",
    body: "The support form is Subject, Description, Priority, Service, and Asset. Priority is low, normal, high, or urgent. Business justification is required only for high or urgent, and it is left off otherwise. Service and Asset are names from Zendesk, not record ids. Sarah opens that ticket with open_ticket. She can list tickets, read one, refresh it from Zendesk, reply, and close one after Confirm. She never invents a Zendesk number. If Zendesk is not connected, the ticket still exists in the portal. Status values are new, open, pending, hold, solved, and closed. Types are question, incident, problem, and task.",
  },
  {
    title: "Zendesk on any portal or website",
    keywords: ["zendesk", "integrate", "integration", "oauth", "webhook", "help center", "widget", "sunshine", "api token", "subdomain", "custom field", "portal", "website", "sso"],
    page: "tickets",
    body: [
      "Zendesk is a core skill of the MTS Agent, not only an MTS setting. One Zendesk account is the source of truth for people, companies, and tickets. The signed-in person does not own the connection.",
      "A portal integrates Support at https://{subdomain}.zendesk.com/api/v2. This desk uses mts-portal. Auth is either an API token as Basic email/token:apiToken, or a confidential OAuth client with grant_type client_credentials at /oauth/tokens. Scopes read and write cover tickets, users, and organizations. Cache the bearer token and refresh it on 401. Never put the client secret, API token, or webhook secret in the browser.",
      "Invite-only means a person is created in Zendesk first. The portal accepts that email and does not offer open signup. End users sign in on the branded portal, not on the Zendesk Help Center. Do not send customers to the Help Center URL.",
      "Map records both ways. Users need a name and an email. Organizations need a name and can take domain names. Tickets need a subject, a comment body, requester email, priority, and tags. Store the Zendesk ticket id on the portal ticket. Replies from the portal become ticket comments. Replies from Zendesk come back by webhook or by polling the ticket.",
      "Webhooks must be verified. Zendesk sends x-zendesk-webhook-signature and x-zendesk-webhook-signature-timestamp. Check the HMAC with the shared secret, reject stale timestamps, and ignore unsigned bodies. Triggers and the Conversations API are separate credentials. Conversations uses an App ID, a Key ID, and a secret as Basic keyId:secret. Do not treat a webhook secret as an API token.",
      "Ticket fields are global and come from the Zendesk account, not from a hardcoded form. Show a field to a customer only when Zendesk marks it visible and editable. Skip status, assignee, group, and lookup fields on the customer form. A lookup needs a Zendesk record id, not a typed name. High and urgent can require a business justification. Agent-only fields stay off the customer screen.",
      "On any other website the same pattern holds. Put the widget or the portal form on the site, create the ticket server-side, show the customer only their own tickets, and sync status back. Help Center SSO and the Web Widget are optional front doors. Messaging uses the Conversations API. Sell, custom objects, and the service catalog are extra products and stay empty until records exist. Pagination uses cursor or page numbers exactly as that endpoint requires. A 400 usually means a bad field, a short name, or a non-integer id.",
      "The agent can explain these steps, check whether this desk is connected, and open or update tickets for the signed-in role. It does not reveal secrets, invent ticket numbers, or claim Zendesk saved a change unless the tool result says so.",
    ].join(" "),
  },
  {
    title: "Equipment and checkout",
    keywords: ["laptop", "equipment", "catalog", "cart", "checkout", "product", "desk phone"],
    page: "shop",
    body: "Equipment is on the Order page. Sarah uses list_catalog and find_equipment. She places an order with place_order only after Confirm. She never takes a card number. pay_order returns the payment link. Accounts with deferred billing can be invoiced instead.",
  },
  {
    title: "Orders, shipping, and billing",
    keywords: ["shipment", "tracking", "order status", "invoice", "billing", "pay later", "payment", "barcode"],
    page: "orders",
    body: "Orders shows the status, payment state, and shipment for this account. The air waybill barcode is built from the order number. Billing lists invoices. Sarah can read status with list_orders, order_detail, and list_billing. She cannot mark a payment captured unless the payment provider has confirmed it.",
  },
  {
    title: "Account, organization, complaints",
    keywords: ["complaint", "profile", "organization", "update phone", "permissions", "role"],
    page: "account",
    body: "Account shows the name, email, and phone. Sarah can update the phone with update_contact after Confirm, and the company with update_company after Confirm. A complaint opens a ticket. New registrations are customers first. Sarah cannot grant shop, pay-later, or admin access.",
  },
  {
    title: "How Sarah works",
    keywords: ["call", "chat", "tools", "function", "knowledge", "what do you know", "sarah"],
    page: "home",
    body: "Sarah's tools are account, list_tickets, ticket_detail, refresh_ticket, open_ticket, reply_ticket, close_ticket, list_orders, order_detail, list_catalog, find_equipment, place_order, cancel_order, pay_order, list_billing, list_requests, order_service, complaint, update_contact, update_company, list_notices, read_notice, lookup_kb, and show_page. place_order, cancel_order, close_ticket, update_contact, update_company, a VoIP extension, and wiring wait for Confirm. She uses a tool before she claims a ticket, order, or change. She does not take a card number.",
  },
];

export function matchPage(text: string) {
  const q = text.toLowerCase();
  const ranked = PAGES.map((page) => ({ page, score: page.words.reduce((sum, word) => sum + (q.includes(word) ? word.length : 0), 0) }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].page : null;
}

export function pageById(id: string) {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}

export function lookupKnowledge(query: string) {
  const q = query.toLowerCase();
  const ranked = ARTICLES.map((article) => ({
    article,
    score: article.keywords.reduce((sum, word) => sum + (q.includes(word) ? word.length : 0), 0),
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const chosen = ranked.slice(0, 2);
  if (!chosen.length) return null;
  const page = pageById(chosen[0].article.page);
  return {
    summary: chosen.map((item) => item.article.body).join(" "),
    show: { to: page.to, guide: page.guide, label: page.label },
  };
}

export function knowledgeBrief() {
  return ARTICLES.map((article) => `${article.title}: ${article.body}`).join("\n");
}
