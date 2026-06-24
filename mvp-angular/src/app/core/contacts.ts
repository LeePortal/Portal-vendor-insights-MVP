/** Real contacts pulled from Lee's inbox, mapped to the matching vendor company. */
export interface Contact { first: string; last: string; email: string; }

export const VENDOR_CONTACTS: Record<string, Contact[]> = {
  origin: [{ first: "Natasha", last: "", email: "natasha@originacoustics.com" }],
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
  control4: [
    { first: "Jacob", last: "Tzegaegbe", email: "jacob.tzegaegbe@snapone.com" },
  ],
  ubiquiti: [
    { first: "Craig", last: "Wojtala", email: "craig.wojtala@ui.com" },
    { first: "Tom", last: "Hildebrand", email: "tom.hildebrand@ui.com" },
    { first: "Andre", last: "Chen", email: "andre.chen@ui.com" },
  ],
  klipsch: [
    { first: "RJ", last: "Snyder", email: "rj.snyder@masimo.com" },
  ],
  araknis: [
    { first: "Camdyn", last: "Lee", email: "camdyn.lee@snapone.com" },
  ],
  luma: [
    { first: "Wilson", last: "Eng", email: "wilson.eng@snapone.com" },
  ],
};

// Legrand isn't in VENDORS but is the source file's brand family; added as a real company.
export const LEGRAND_BRANDS = ["Sanus", "On-Q by Legrand", "Pass & Seymour"];
export const LEGRAND_CONTACTS: Contact[] = [
  { first: "Alex", last: "Weaver", email: "alex.weaver@legrand.com" },
  { first: "Jennifer", last: "Crotinger", email: "jennifer.crotinger@legrand.com" },
  { first: "Steve", last: "Baker", email: "steve.baker@legrand.com" },
  { first: "Alyssa", last: "Figueiredo", email: "alyssa.figueiredo@legrand.com" },
  { first: "Kirk", last: "Goodwin", email: "kirk.goodwin@legrand.com" },
];
