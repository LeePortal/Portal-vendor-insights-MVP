/**
 * Server-side seed for the vendor-user store (lib/db.js loads this the first time the tables are
 * empty). Mirrors the front-end demo seed (src/app/core/contacts.ts + data.service VENDORS) so the
 * 10 loginable vendors + Legrand exist server-side with sensible subscription windows and
 * all-categories (unrestricted) defaults. Production replaces this with admin.portal.io / SSO.
 *
 * Restriction fields (parents/subs/states) are EMPTY here = "all categories". Set them per-company
 * (default) or per-user (override) in the admin UI and they flow into the login token.
 */
const PERMISSIONS = ["Brands", "Buying Group", "Parent Category", "Subcategory", "Proposal Status", "Supplier", "Aggregation", "Date Range", "Export CSV", "Pull reports"];
const allPerms = () => Object.fromEntries(PERMISSIONS.map((p) => [p, true]));
const isoOffset = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// id -> display name (== Redshift brand for these 10). Company name is used as the tenant brand.
const VENDORS = [
  { id: "sonos", name: "Sonos" },
  { id: "lutron", name: "Lutron" },
  { id: "sony", name: "Sony Professional" },
  { id: "samsung", name: "Samsung VXT" },
  { id: "denon", name: "Denon" },
  { id: "control4", name: "Control4" },
  { id: "ubiquiti", name: "Ubiquiti" },
  { id: "klipsch", name: "Klipsch" },
  { id: "araknis", name: "Araknis Networks" },
  { id: "luma", name: "Luma Surveillance" },
];

const CONTACTS = {
  sonos: [
    { first: "Casey", last: "Clemens", email: "casey.clemens@sonos.com" },
    { first: "Cathy", last: "Murphy", email: "cathy.murphy@sonos.com" },
    { first: "Justin", last: "Kauffman", email: "justin.kauffman@sonos.com" },
    { first: "Zanis", last: "Mantarakis", email: "zanis.mantarakis@sonos.com" },
    { first: "Ryan", last: "Handrahan", email: "ryan.handrahan@sonos.com" },
  ],
  lutron: [
    { first: "R.", last: "Burnish", email: "rburnish@lutron.com" },
    { first: "S.", last: "Qu", email: "squ@lutron.com" },
  ],
  sony: [
    { first: "Kathleen", last: "Thomas", email: "kathleen.thomas@sony.com" },
    { first: "Thomas", last: "Hall", email: "thomas.hall@sony.com" },
    { first: "Joseph", last: "Sam", email: "joseph.sam@sony.com" },
    { first: "Mitchell", last: "Lum", email: "mitchell.lum@sony.com" },
    { first: "Kelly", last: "Mcdougle", email: "kelly.mcdougle@sony.com" },
  ],
  samsung: [
    { first: "Neal", last: "Grennan", email: "neal.grennan@sea.samsung.com" },
    { first: "J.", last: "Mayo", email: "jmayo@sea.samsung.com" },
  ],
  denon: [
    { first: "Gabriel", last: "Johnson", email: "gabriel.johnson@masimo.com" },
    { first: "Joshua", last: "Sy", email: "joshua.sy@masimo.com" },
  ],
  control4: [{ first: "Jacob", last: "Tzegaegbe", email: "jacob.tzegaegbe@snapone.com" }],
  ubiquiti: [
    { first: "Craig", last: "Wojtala", email: "craig.wojtala@ui.com" },
    { first: "Tom", last: "Hildebrand", email: "tom.hildebrand@ui.com" },
    { first: "Andre", last: "Chen", email: "andre.chen@ui.com" },
  ],
  klipsch: [{ first: "RJ", last: "Snyder", email: "rj.snyder@masimo.com" }],
  araknis: [{ first: "Camdyn", last: "Lee", email: "camdyn.lee@snapone.com" }],
  luma: [{ first: "Wilson", last: "Eng", email: "wilson.eng@snapone.com" }],
};

const LEGRAND_BRANDS = ["Sanus", "On-Q by Legrand", "Pass & Seymour"];
const LEGRAND_CONTACTS = [
  { first: "Alex", last: "Weaver", email: "alex.weaver@legrand.com" },
  { first: "Jennifer", last: "Crotinger", email: "jennifer.crotinger@legrand.com" },
  { first: "Steve", last: "Baker", email: "steve.baker@legrand.com" },
  { first: "Alyssa", last: "Figueiredo", email: "alyssa.figueiredo@legrand.com" },
  { first: "Kirk", last: "Goodwin", email: "kirk.goodwin@legrand.com" },
];

const DEFAULT_SUBS = ["overview"];

function subWindow(id) {
  if (id === "klipsch") return { start: isoOffset(-400), end: isoOffset(-30) };   // expired
  if (id === "luma") return { start: isoOffset(30), end: isoOffset(400) };        // scheduled
  return { start: isoOffset(-180), end: isoOffset(180) };                          // active
}

function mkUser(c, company, brands, i) {
  return {
    email: c.email.toLowerCase(),
    firstName: c.first, lastName: c.last, name: (c.first + " " + c.last).trim(),
    companyName: company, brands: brands.slice(), perms: allPerms(), suspended: false,
    parents: [], subs: [], buyingGroups: [], states: [],
    subscriptions: i === 0 ? DEFAULT_SUBS.slice() : DEFAULT_SUBS.slice(0, 1),
    createdBy: "Portal (seed)", createdAt: Date.now() - (120 + i * 30) * 86400000,
  };
}

/** Returns { companies, users } for first-run seeding. Restriction defaults are empty (= all). */
function buildSeed() {
  const companies = VENDORS.map((v) => {
    const w = subWindow(v.id);
    return { name: v.name, brands: [v.name], perms: allPerms(), parents: [], subs: [], states: [], start: w.start, end: w.end };
  });
  companies.push({ name: "Legrand", brands: LEGRAND_BRANDS.slice(), perms: allPerms(), parents: [], subs: [], states: [], start: isoOffset(-150), end: isoOffset(210) });

  const users = [];
  for (const v of VENDORS) {
    const seeds = CONTACTS[v.id] || [{ first: title(v.name), last: "Team", email: "vendor@" + v.id + ".com" }];
    seeds.forEach((c, i) => users.push(mkUser(c, v.name, [v.name], i)));
  }
  LEGRAND_CONTACTS.forEach((c, i) => users.push(mkUser(c, "Legrand", LEGRAND_BRANDS, i)));
  return { companies, users };
}

module.exports = { buildSeed, PERMISSIONS };
