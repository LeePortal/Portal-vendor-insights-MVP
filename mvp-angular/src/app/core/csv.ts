// Builds a line-item proposal CSV in Portal's real export column format
// (matches the sample-file structure). Synthetic rows for the prototype.
const HEADER =
  "dealerid,name,proposalid,brand,model,quantity,cost,sellprice,total_sell,supplierid,zip,state,submitted_date,accepteddate,proposal_created,part_added,suppliername,totalproposalcost,subcat,parentcat,status";

const DEALERS: [string, string][] = [
  ["6944", "All Sound Designs"], ["8359", "Premier A/V & Integration"], ["1075", "Pure Sound & Vision"],
  ["9756", "Ideal Sound & Vision"], ["4421", "Galaxy Custom AV"], ["3310", "Summit Integration"],
  ["7782", "Coastal Control"], ["5096", "Apex Automation"],
];
const SUPPLIERS: [string, string][] = [
  ["7967", "Chief"], ["137", "Volutone Distributing"], ["40", "Snap One"], ["1078", "ADI"], ["622", "Jasco"],
];
const LOC: [string, string][] = [
  ["81503", "Colorado"], ["92253", "California"], ["53045", "Wisconsin"], ["16415", "Pennsylvania"],
  ["30303", "Georgia"], ["75201", "Texas"], ["10001", "New York"], ["33101", "Florida"],
];
const CATS: [string, string][] = [
  ["Power Conditioners", "Power Management"], ["TV Mounts & Brackets", "Mounting Brackets"],
  ["Speaker Stands", "Furniture & Stands"], ["Receiver & Amp Accessories", "Receivers & Amplifiers"],
  ["Network Switches", "Networking"], ["Surveillance Cameras", "Surveillance"],
  ["In-Ceiling Speakers", "Speakers"], ["Streaming Media Players", "A/V Sources & Media Players"],
];
const STATUSES = ["Submitted", "Accepted", "Completed", "Opened", "Draft", "Expired"];

function rng(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export function buildLineItemCsv(brand: string, rowCount = 150): string {
  const rows: string[] = [HEADER];
  for (let i = 0; i < rowCount; i++) {
    const r = (k: string) => rng(brand + "_" + i + "_" + k);
    const [did, dname] = DEALERS[Math.floor(r("d") * DEALERS.length)];
    const [sid, sname] = SUPPLIERS[Math.floor(r("s") * SUPPLIERS.length)];
    const [zip, state] = LOC[Math.floor(r("l") * LOC.length)];
    const [subcat, parentcat] = CATS[Math.floor(r("c") * CATS.length)];
    const status = STATUSES[Math.floor(r("st") * STATUSES.length)];
    const qty = 1 + Math.floor(r("q") * 4);
    const cost = 20 + r("co") * 900;
    const sell = cost * (1.4 + r("m") * 0.8);
    const proposalid = 150000 + Math.floor(r("p") * 250000);
    const model = brand.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() + "-" + (100 + Math.floor(r("mo") * 8900));
    const created = "20" + (18 + Math.floor(r("cr") * 7)) + "-" + ("0" + (1 + Math.floor(r("cm") * 9))).slice(-2) + "-" + ("0" + (10 + Math.floor(r("cd") * 18))).slice(-2);
    const submitted = status === "Draft" ? "" : "2025-" + ("0" + (1 + Math.floor(r("sm") * 9))).slice(-2) + "-" + ("0" + (10 + Math.floor(r("sd") * 18))).slice(-2);
    const accepted = status === "Accepted" || status === "Completed" ? submitted : "";
    const totalprop = 800 + r("tp") * 40000;
    rows.push([did, dname, proposalid, brand, model, qty + ".0000", cost.toFixed(4), sell.toFixed(4), (sell * qty).toFixed(8), sid, zip, state, submitted, accepted, created, created, sname, totalprop.toFixed(4), subcat, parentcat, status].join(","));
  }
  return rows.join("\n");
}
