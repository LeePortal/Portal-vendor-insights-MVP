import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { DEALERS, REGIONS } from "./data.service";
import { AuthService } from "./auth.service";
import { DATA_MODE, API_BASE_URL } from "./app-config";

export interface AFilter {
  brand: string; // viewed brand name, or "admin"
  parents: string[];
  subs: string[];
  buyingGroups: string[];
  suppliers?: string[]; // distributor/supplier filter; unmapped in live mode (fact table has supplierid only, no names)
  states: string[];
  statuses?: string[]; // proposal statuses (live mode only); empty = all
  normalize: boolean;
  agg: string;
  horizon: string;   // "MTD" | "QTD" | "YTD" | "Custom"
  from?: string;     // ISO yyyy-mm-dd, used when horizon === "Custom"
  to?: string;       // ISO yyyy-mm-dd, used when horizon === "Custom"
}
export interface BrandShareRow { brand: string; sales: number; sharePct: number; units: number; unitSharePct: number; avgSell: number; skus: number; }
export interface ItemRow { brand: string; model: string; desc: string; sales: number; sharePct: number; units: number; unitSharePct: number; avgSell: number; }
export interface SubcatRow { subcat: string; sales: number; pctOfCat: number; units: number; unitPctOfCat: number; avgSell: number; }
export interface DualPoint { label: string; category: number; brand: number; }
export interface ShareSeries { labels: string[]; rows: BrandShareRow[]; series: Record<string, number[]>; }
export interface WonRow { model: string; desc: string; brand: string; units: number; sales: number; competitorsBeaten: number; }
export interface Displacer { brand: string; model: string; units: number; }
export interface LostRow { model: string; subcat: string; lostUnits: number; lostSales: number; displacers: Displacer[]; }
export interface BrandKpis { revenue: number; units: number; proposals: number; dealers: number; revenueYoY: number; unitsYoY: number; proposalsYoY: number; dealersYoY: number; }
export type Measure = "sales" | "units" | "skus" | "avgSell" | "brands";
export type Dim = "brand" | "parent" | "subcat";
export interface MeasureMeta { id: Measure; label: string; money: boolean; additive: boolean; }
export const MEASURES: MeasureMeta[] = [
  { id: "sales", label: "Sales $", money: true, additive: true },
  { id: "units", label: "Units", money: false, additive: true },
  { id: "skus", label: "# SKUs", money: false, additive: true },
  { id: "avgSell", label: "Avg Unit $", money: true, additive: false },
  { id: "brands", label: "# Brands", money: false, additive: false },
];
export const DIMS: { id: Dim; label: string }[] = [
  { id: "brand", label: "Brand" }, { id: "parent", label: "Parent Category" }, { id: "subcat", label: "Sub-Category" },
];

export const BUYING_GROUPS = ["Azione", "HTSN", "Oasys", "ProSource"];

/** All 50 U.S. states (the source files mix in provinces/intl; the dropdown uses the canonical 50). */
export const STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

/** Parent categories scraped from the full production export (Portal taxonomy), alphabetized. */
export const PARENT_CATS: string[] = [
  "A/V Sources & Media Players",
  "Access Control",
  "Acoustic Treatment",
  "Amplifiers",
  "Central Vac",
  "Computers",
  "Connectors & Adapters",
  "Control Systems",
  "Digital Signage",
  "Doorbells & Intercom",
  "EV Charging Equipment",
  "Electrical Boxes, Conduit & Fittings",
  "Electrical Distribution",
  "Electrical Wire & Cable",
  "Equipment Racks",
  "Fire & Life Safety",
  "Furniture & Stands",
  "General Uncategorized",
  "Generators",
  "HVAC",
  "Headphones",
  "Installation Supplies",
  "Installation Tools",
  "Interconnect Cables",
  "Intrusion Detection",
  "Lighting",
  "Lighting Controls",
  "Lighting Fixtures",
  "Live Sound Equipment",
  "Low Voltage Wire & Cable",
  "Mechanical Locks, Keys & Safes",
  "Microphones",
  "Misc Items",
  "Mobile Car Electronics",
  "Mounting Brackets",
  "Multi-Room Audio",
  "Networking",
  "Office Supplies",
  "Plumbing",
  "Power Management",
  "Power Walls & Battery",
  "Printers & Scanners",
  "Pro Speakers",
  "Projectors & Screens",
  "Receivers & Amplifiers",
  "Receptacles & Outlets",
  "Recording",
  "Satellite & Cable",
  "Signal Distribution",
  "Signal Processing",
  "Solar Equipment",
  "Speakers",
  "Structured Cabling",
  "Studio Equipment",
  "Surveillance",
  "TVs",
  "Telephone Systems",
  "Thermal Management",
  "Video Conference",
  "Wall Trim Plates",
  "Warranties & Service Plans",
  "Window Treatments",
];

/** Sub-categories, each tied to its parent (a name may repeat under different parents). */
export const SUBCATS: { name: string; parent: string }[] = [
  { name: "A/V Sources & Docks Accessories", parent: "A/V Sources & Media Players" },
  { name: "AM/FM & HD Radio", parent: "A/V Sources & Media Players" },
  { name: "Blu-Ray Players", parent: "A/V Sources & Media Players" },
  { name: "CD Players", parent: "A/V Sources & Media Players" },
  { name: "DVD Players", parent: "A/V Sources & Media Players" },
  { name: "Docking Stations", parent: "A/V Sources & Media Players" },
  { name: "Gaming Systems", parent: "A/V Sources & Media Players" },
  { name: "Media Players & Streamers", parent: "A/V Sources & Media Players" },
  { name: "Mobile Devices", parent: "A/V Sources & Media Players" },
  { name: "Satellite Radio", parent: "A/V Sources & Media Players" },
  { name: "Turntables", parent: "A/V Sources & Media Players" },
  { name: "Access Control Accessories", parent: "Access Control" },
  { name: "Access Control Kits & Bundles", parent: "Access Control" },
  { name: "Access Control Power Supplies", parent: "Access Control" },
  { name: "Access Control Software & Licenses", parent: "Access Control" },
  { name: "Biometric Readers", parent: "Access Control" },
  { name: "Controllers & Panels", parent: "Access Control" },
  { name: "Credential Cards & Fobs", parent: "Access Control" },
  { name: "Door Hardware", parent: "Access Control" },
  { name: "Electronic Locks", parent: "Access Control" },
  { name: "Keypads", parent: "Access Control" },
  { name: "Prox Card Readers", parent: "Access Control" },
  { name: "Reader Mounting & Enclosures", parent: "Access Control" },
  { name: "Request to Exit/Egress", parent: "Access Control" },
  { name: "Residential Garage Door", parent: "Access Control" },
  { name: "Residential Smart Locks", parent: "Access Control" },
  { name: "Turnstiles & Gates", parent: "Access Control" },
  { name: "Sound Panels", parent: "Acoustic Treatment" },
  { name: "Sound Proofing", parent: "Acoustic Treatment" },
  { name: "Commercial Amplifiers", parent: "Amplifiers" },
  { name: "Headphone Amplifiers", parent: "Amplifiers" },
  { name: "Integrated Amplifiers", parent: "Amplifiers" },
  { name: "Power Amplifiers", parent: "Amplifiers" },
  { name: "Attachments", parent: "Central Vac" },
  { name: "Cental Vac Installation Parts & Supplies", parent: "Central Vac" },
  { name: "Central Vac Accessories", parent: "Central Vac" },
  { name: "Cleaning Kits", parent: "Central Vac" },
  { name: "Hoses", parent: "Central Vac" },
  { name: "Inlets", parent: "Central Vac" },
  { name: "Packages", parent: "Central Vac" },
  { name: "Power Brushes", parent: "Central Vac" },
  { name: "Power Units", parent: "Central Vac" },
  { name: "Components", parent: "Computers" },
  { name: "Computer Accessories", parent: "Computers" },
  { name: "Desktops", parent: "Computers" },
  { name: "Hard Drives, Storage, HDD, SSD", parent: "Computers" },
  { name: "Laptops", parent: "Computers" },
  { name: "Memory", parent: "Computers" },
  { name: "Monitors", parent: "Computers" },
  { name: "Servers", parent: "Computers" },
  { name: "Software", parent: "Computers" },
  { name: "Uncategorized Computers", parent: "Computers" },
  { name: "1/4\" & 1/8\" Audio", parent: "Connectors & Adapters" },
  { name: "Adapters", parent: "Connectors & Adapters" },
  { name: "BNC Connectors", parent: "Connectors & Adapters" },
  { name: "Color Ring & Boots", parent: "Connectors & Adapters" },
  { name: "DB", parent: "Connectors & Adapters" },
  { name: "F Connectors", parent: "Connectors & Adapters" },
  { name: "Fiber, Media Converters, Transceivers", parent: "Connectors & Adapters" },
  { name: "HDMI", parent: "Connectors & Adapters" },
  { name: "Phoenix", parent: "Connectors & Adapters" },
  { name: "RCA Connectors", parent: "Connectors & Adapters" },
  { name: "RJ11 & RJ45 Connectors", parent: "Connectors & Adapters" },
  { name: "Speaker Connectors", parent: "Connectors & Adapters" },
  { name: "XLR & Speakon", parent: "Connectors & Adapters" },
  { name: "Base Stations, Hubs, Repeaters, Gateways", parent: "Control Systems" },
  { name: "Contacts, Relays & Sensors", parent: "Control Systems" },
  { name: "Control Accessories", parent: "Control Systems" },
  { name: "Control Kits & Bundles", parent: "Control Systems" },
  { name: "Control Software & Licenses", parent: "Control Systems" },
  { name: "Controllers", parent: "Control Systems" },
  { name: "Handheld Remotes", parent: "Control Systems" },
  { name: "IR Parts", parent: "Control Systems" },
  { name: "Keypad Buttons", parent: "Control Systems" },
  { name: "Keypads", parent: "Control Systems" },
  { name: "Thermostats", parent: "Control Systems" },
  { name: "Touchscreens", parent: "Control Systems" },
  { name: "Digital Signage Accessories", parent: "Digital Signage" },
  { name: "Digital Signage Software", parent: "Digital Signage" },
  { name: "Displays", parent: "Digital Signage" },
  { name: "Players", parent: "Digital Signage" },
  { name: "Servers", parent: "Digital Signage" },
  { name: "Door Stations", parent: "Doorbells & Intercom" },
  { name: "Doorbells and Chimes", parent: "Doorbells & Intercom" },
  { name: "Intercom & Entry Accessories", parent: "Doorbells & Intercom" },
  { name: "Intercom Software & Licenses", parent: "Doorbells & Intercom" },
  { name: "Intercom Systems", parent: "Doorbells & Intercom" },
  { name: "Room Stations", parent: "Doorbells & Intercom" },
  { name: "Billing & Payment Systems", parent: "EV Charging Equipment" },
  { name: "Charging Accessories", parent: "EV Charging Equipment" },
  { name: "EV Charging Stations", parent: "EV Charging Equipment" },
  { name: "Mounting & Installation Hardware", parent: "EV Charging Equipment" },
  { name: "Power Distribution Units", parent: "EV Charging Equipment" },
  { name: "Boxes & Brackets", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Boxes, Conduit & Fittings Accessories", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Cable Support Systems", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Cable Tray", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Conduit (PVC, EMT, Flexible)", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Conduit Fittings", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Covers", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Raceway", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Wireway", parent: "Electrical Boxes, Conduit & Fittings" },
  { name: "Circuit Breakers, Fuses", parent: "Electrical Distribution" },
  { name: "Electrical Enclosures", parent: "Electrical Distribution" },
  { name: "Load Centers & Subpanels", parent: "Electrical Distribution" },
  { name: "Meter Sockets", parent: "Electrical Distribution" },
  { name: "Panelboards", parent: "Electrical Distribution" },
  { name: "Switchgear", parent: "Electrical Distribution" },
  { name: "Transfer Switches", parent: "Electrical Distribution" },
  { name: "Transformers", parent: "Electrical Distribution" },
  { name: "Uncategorized Electrical Supplies", parent: "Electrical Distribution" },
  { name: "BX/MC Armored Cable", parent: "Electrical Wire & Cable" },
  { name: "Bare Copper Wire", parent: "Electrical Wire & Cable" },
  { name: "Hook-up Wire", parent: "Electrical Wire & Cable" },
  { name: "NM Wire (Non-Metallic / Romex)", parent: "Electrical Wire & Cable" },
  { name: "Portable Cord", parent: "Electrical Wire & Cable" },
  { name: "TFFN Wire", parent: "Electrical Wire & Cable" },
  { name: "THHN/THWN Wire", parent: "Electrical Wire & Cable" },
  { name: "Tray Cable", parent: "Electrical Wire & Cable" },
  { name: "USE-2/RHH/RHW-2 Wire", parent: "Electrical Wire & Cable" },
  { name: "XHHW Wire", parent: "Electrical Wire & Cable" },
  { name: "Custom Rack Shelves & Ears", parent: "Equipment Racks" },
  { name: "Equipment Rack Accessories", parent: "Equipment Racks" },
  { name: "Floor Standing Racks", parent: "Equipment Racks" },
  { name: "Rack Cable Management", parent: "Equipment Racks" },
  { name: "Rack Cooling & Vents", parent: "Equipment Racks" },
  { name: "Rack Doors", parent: "Equipment Racks" },
  { name: "Rack Drawers", parent: "Equipment Racks" },
  { name: "Rack Kits & Bundles", parent: "Equipment Racks" },
  { name: "Rack Panels", parent: "Equipment Racks" },
  { name: "Slide Out Cabinet Racks", parent: "Equipment Racks" },
  { name: "Specialty Racks", parent: "Equipment Racks" },
  { name: "Universal Rack Shelves", parent: "Equipment Racks" },
  { name: "Wall Mount Racks", parent: "Equipment Racks" },
  { name: "Control Panels", parent: "Fire & Life Safety" },
  { name: "Exit & Emergency Lighting", parent: "Fire & Life Safety" },
  { name: "Fire Alarm Systems & Kits", parent: "Fire & Life Safety" },
  { name: "Fire Extinguishers", parent: "Fire & Life Safety" },
  { name: "Fire PPE", parent: "Fire & Life Safety" },
  { name: "Fire Pull Stations", parent: "Fire & Life Safety" },
  { name: "Fire Safety Accessories", parent: "Fire & Life Safety" },
  { name: "Monitoring & Annunciators", parent: "Fire & Life Safety" },
  { name: "Safety Signage", parent: "Fire & Life Safety" },
  { name: "Sensors & Detectors", parent: "Fire & Life Safety" },
  { name: "Sirens, Bells & Strobes", parent: "Fire & Life Safety" },
  { name: "Sprinkler & Suppression Systems", parent: "Fire & Life Safety" },
  { name: "Voice Evacuation Systems", parent: "Fire & Life Safety" },
  { name: "Component Shelves & Stands", parent: "Furniture & Stands" },
  { name: "Furniture & Stand Accessories", parent: "Furniture & Stands" },
  { name: "Seating", parent: "Furniture & Stands" },
  { name: "Speaker Stands", parent: "Furniture & Stands" },
  { name: "TV Stands", parent: "Furniture & Stands" },
  { name: "Wall Units & Lifts", parent: "Furniture & Stands" },
  { name: "General Uncategorized", parent: "General Uncategorized" },
  { name: "General Uncategorized 2", parent: "General Uncategorized" },
  { name: "Commercial Generators", parent: "Generators" },
  { name: "Generator Accessories", parent: "Generators" },
  { name: "Residential Generators", parent: "Generators" },
  { name: "Transfer Switches", parent: "Generators" },
  { name: "Ducting & Vents", parent: "HVAC" },
  { name: "Ductless Mini Split", parent: "HVAC" },
  { name: "Fans & Fan Controls", parent: "HVAC" },
  { name: "HVAC Accessories", parent: "HVAC" },
  { name: "Headphone Accessories", parent: "Headphones" },
  { name: "Headphone Amps", parent: "Headphones" },
  { name: "Headsets", parent: "Headphones" },
  { name: "In Ear Headphones", parent: "Headphones" },
  { name: "On Ear Headphones", parent: "Headphones" },
  { name: "Over Ear Headphones", parent: "Headphones" },
  { name: "Adhesives & Sealants", parent: "Installation Supplies" },
  { name: "Anchors", parent: "Installation Supplies" },
  { name: "Cable Installation & Support", parent: "Installation Supplies" },
  { name: "Cable Ties", parent: "Installation Supplies" },
  { name: "Cleaning Supplies", parent: "Installation Supplies" },
  { name: "Connectors, Crimps, & Termination", parent: "Installation Supplies" },
  { name: "Coveralls & Shoe Covers", parent: "Installation Supplies" },
  { name: "Fasteners", parent: "Installation Supplies" },
  { name: "Heat Shrink", parent: "Installation Supplies" },
  { name: "Labels", parent: "Installation Supplies" },
  { name: "Splice Connectors", parent: "Installation Supplies" },
  { name: "Standard Batteries", parent: "Installation Supplies" },
  { name: "Staples", parent: "Installation Supplies" },
  { name: "Tape", parent: "Installation Supplies" },
  { name: "Wire Concealment & Organization", parent: "Installation Supplies" },
  { name: "Cable Routing, Pulling, Fish Tape", parent: "Installation Tools" },
  { name: "Cable Strippers", parent: "Installation Tools" },
  { name: "Compression & Crimp Tools", parent: "Installation Tools" },
  { name: "Drill Bits & Hole Saws", parent: "Installation Tools" },
  { name: "Flashlights", parent: "Installation Tools" },
  { name: "Hand Tools", parent: "Installation Tools" },
  { name: "Knives & Blades", parent: "Installation Tools" },
  { name: "Label Makers", parent: "Installation Tools" },
  { name: "Power Tools", parent: "Installation Tools" },
  { name: "Punchdown Tools", parent: "Installation Tools" },
  { name: "Safety Gear & PPE", parent: "Installation Tools" },
  { name: "Screw & Nut Drivers", parent: "Installation Tools" },
  { name: "Staplers", parent: "Installation Tools" },
  { name: "Test Equipment", parent: "Installation Tools" },
  { name: "Tone Generators & Cable Tracers", parent: "Installation Tools" },
  { name: "Tool Bags & Boxes", parent: "Installation Tools" },
  { name: "Tool Kits", parent: "Installation Tools" },
  { name: "Wire Cutters", parent: "Installation Tools" },
  { name: "Audio Cables", parent: "Interconnect Cables" },
  { name: "Ethernet Cables", parent: "Interconnect Cables" },
  { name: "Fiber Interconnects", parent: "Interconnect Cables" },
  { name: "HDMI Cables", parent: "Interconnect Cables" },
  { name: "Interconnect Cables Accessories", parent: "Interconnect Cables" },
  { name: "Phone Cords", parent: "Interconnect Cables" },
  { name: "Power Cables", parent: "Interconnect Cables" },
  { name: "USB & Data Cables", parent: "Interconnect Cables" },
  { name: "Video Cables", parent: "Interconnect Cables" },
  { name: "Alarm Systems, Kits & Bundles", parent: "Intrusion Detection" },
  { name: "Communication Radios", parent: "Intrusion Detection" },
  { name: "Contacts", parent: "Intrusion Detection" },
  { name: "Control Panels & Keypads", parent: "Intrusion Detection" },
  { name: "Enclosures & Mounting", parent: "Intrusion Detection" },
  { name: "Expansion Modules", parent: "Intrusion Detection" },
  { name: "Intrusion Detection Accessories", parent: "Intrusion Detection" },
  { name: "Power Supplies", parent: "Intrusion Detection" },
  { name: "Sensors & Detectors", parent: "Intrusion Detection" },
  { name: "Sirens, Sounders & Strobes", parent: "Intrusion Detection" },
  { name: "Software & Licenses", parent: "Intrusion Detection" },
  { name: "Stage Lighting", parent: "Lighting" },
  { name: "Stage Lighting Control", parent: "Lighting" },
  { name: "Color Change Kits", parent: "Lighting Controls" },
  { name: "Dimmers", parent: "Lighting Controls" },
  { name: "Keypads", parent: "Lighting Controls" },
  { name: "Lighting Control Accessories", parent: "Lighting Controls" },
  { name: "Lighting Kits & Bundles", parent: "Lighting Controls" },
  { name: "Lighting Processors & Hubs", parent: "Lighting Controls" },
  { name: "Panelized Lighting Control", parent: "Lighting Controls" },
  { name: "Switches", parent: "Lighting Controls" },
  { name: "Ballasts & Drivers", parent: "Lighting Fixtures" },
  { name: "Bulbs & Lamps", parent: "Lighting Fixtures" },
  { name: "Ceiling Fans", parent: "Lighting Fixtures" },
  { name: "Indoor Light Fixtures", parent: "Lighting Fixtures" },
  { name: "LED Lighting & Strips", parent: "Lighting Fixtures" },
  { name: "Lighting Fixture Accessories", parent: "Lighting Fixtures" },
  { name: "Outdoor Landscape Lighting", parent: "Lighting Fixtures" },
  { name: "Cables & Accessories", parent: "Live Sound Equipment" },
  { name: "Cases", parent: "Live Sound Equipment" },
  { name: "Lighting Equipment", parent: "Live Sound Equipment" },
  { name: "Musical Instrument Accessories", parent: "Live Sound Equipment" },
  { name: "Musical Instruments", parent: "Live Sound Equipment" },
  { name: "Special Effects Equipment", parent: "Live Sound Equipment" },
  { name: "Stage & Studio Equipment Accessories", parent: "Live Sound Equipment" },
  { name: "Stage Boxes", parent: "Live Sound Equipment" },
  { name: "Stage Snakes", parent: "Live Sound Equipment" },
  { name: "Trusses, Rigging & Support", parent: "Live Sound Equipment" },
  { name: "Uncategorized Live Stage & Studio Equipment", parent: "Live Sound Equipment" },
  { name: "Bundled Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Category Ethernet Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Coaxial Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Control Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Fiber Optic Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Security Alarm & Fire Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Speaker Cable", parent: "Low Voltage Wire & Cable" },
  { name: "Deadbolts", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Keys", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Lever Handle Locks", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Locking Accessories", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Locksmith Tools & Supplies", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Mortise Locks", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Padlocks", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Rim Locks", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Safes & Vaults", parent: "Mechanical Locks, Keys & Safes" },
  { name: "Boundary/Omni Mics", parent: "Microphones" },
  { name: "Gooseneck Mics", parent: "Microphones" },
  { name: "Handheld Mics", parent: "Microphones" },
  { name: "Headset Mics", parent: "Microphones" },
  { name: "Instrument Mics", parent: "Microphones" },
  { name: "Lavalier Mics", parent: "Microphones" },
  { name: "Mic Cables", parent: "Microphones" },
  { name: "Mic Stands & Mounts", parent: "Microphones" },
  { name: "Microphone Accessories", parent: "Microphones" },
  { name: "Microphone Kits", parent: "Microphones" },
  { name: "Wireless Receivers", parent: "Microphones" },
  { name: "Wireless Transmitters", parent: "Microphones" },
  { name: "Appliances", parent: "Misc Items" },
  { name: "Cameras, Camcorders, & Accessories", parent: "Misc Items" },
  { name: "Drone", parent: "Misc Items" },
  { name: "Marketing, Demo, Promotional Materials", parent: "Misc Items" },
  { name: "Mobile Phone Accessories", parent: "Misc Items" },
  { name: "Open Box", parent: "Misc Items" },
  { name: "Walkie Talkies", parent: "Misc Items" },
  { name: "Car Amplifiers", parent: "Mobile Car Electronics" },
  { name: "Car Automotive Electronic Accessories", parent: "Mobile Car Electronics" },
  { name: "Car Head Unit", parent: "Mobile Car Electronics" },
  { name: "Car Lighting", parent: "Mobile Car Electronics" },
  { name: "Car Speaker Boxes", parent: "Mobile Car Electronics" },
  { name: "Car Speakers", parent: "Mobile Car Electronics" },
  { name: "Car Subwoofers", parent: "Mobile Car Electronics" },
  { name: "Car Video", parent: "Mobile Car Electronics" },
  { name: "Marine", parent: "Mobile Car Electronics" },
  { name: "Remote Start, Security, & Keyless Entry", parent: "Mobile Car Electronics" },
  { name: "Satellite Radio Tuners", parent: "Mobile Car Electronics" },
  { name: "Wiring & Install Parts", parent: "Mobile Car Electronics" },
  { name: "Motorized Projector Lifts", parent: "Mounting Brackets" },
  { name: "Motorized TV Lifts & Mounts", parent: "Mounting Brackets" },
  { name: "Mounting Bracket Accessories", parent: "Mounting Brackets" },
  { name: "Projector Brackets", parent: "Mounting Brackets" },
  { name: "Speaker Mounts", parent: "Mounting Brackets" },
  { name: "TV Mounts & Brackets", parent: "Mounting Brackets" },
  { name: "Tablet Brackets", parent: "Mounting Brackets" },
  { name: "Uncategorized Mounting Brackets", parent: "Mounting Brackets" },
  { name: "Controllers", parent: "Multi-Room Audio" },
  { name: "Keypads & Components", parent: "Multi-Room Audio" },
  { name: "Multi-Room Audio Accessories", parent: "Multi-Room Audio" },
  { name: "Packages", parent: "Multi-Room Audio" },
  { name: "Software & Licenses", parent: "Multi-Room Audio" },
  { name: "Speaker Switchers", parent: "Multi-Room Audio" },
  { name: "Volume Controls", parent: "Multi-Room Audio" },
  { name: "Cellular Boosters", parent: "Networking" },
  { name: "Firewalls", parent: "Networking" },
  { name: "Gateways", parent: "Networking" },
  { name: "Licenses & Software", parent: "Networking" },
  { name: "Modems", parent: "Networking" },
  { name: "Network Accessories", parent: "Networking" },
  { name: "Network Attached Storage (NAS)", parent: "Networking" },
  { name: "Networking Kits & Bundles", parent: "Networking" },
  { name: "PoE Injectors/Splitters", parent: "Networking" },
  { name: "Routers", parent: "Networking" },
  { name: "Switches", parent: "Networking" },
  { name: "Wireless Access Points", parent: "Networking" },
  { name: "Blank Media", parent: "Office Supplies" },
  { name: "Paper", parent: "Office Supplies" },
  { name: "Irrigation", parent: "Plumbing" },
  { name: "Leak Detectors", parent: "Plumbing" },
  { name: "Pipe & Tubing", parent: "Plumbing" },
  { name: "Pipe Fittings", parent: "Plumbing" },
  { name: "Plumbing Valves", parent: "Plumbing" },
  { name: "A/V Signal Protection", parent: "Power Management" },
  { name: "Power Conditioners", parent: "Power Management" },
  { name: "Power Distribution Units (PDU)", parent: "Power Management" },
  { name: "Power Management Accessories", parent: "Power Management" },
  { name: "Power Strips", parent: "Power Management" },
  { name: "Surge Protectors", parent: "Power Management" },
  { name: "Uninterruptible Power Supplies (UPS)", parent: "Power Management" },
  { name: "Voltage Regulators", parent: "Power Management" },
  { name: "Battery Accessories", parent: "Power Walls & Battery" },
  { name: "Battery Management Systems (BMS)", parent: "Power Walls & Battery" },
  { name: "Energy Management Systems", parent: "Power Walls & Battery" },
  { name: "Home Battery Systems", parent: "Power Walls & Battery" },
  { name: "Inverters", parent: "Power Walls & Battery" },
  { name: "Powerwalls", parent: "Power Walls & Battery" },
  { name: "Ink & Toner", parent: "Printers & Scanners" },
  { name: "Inkjet Printers", parent: "Printers & Scanners" },
  { name: "Laser Printers", parent: "Printers & Scanners" },
  { name: "MFT / All-in-One Printers", parent: "Printers & Scanners" },
  { name: "Printer Accessories", parent: "Printers & Scanners" },
  { name: "Scanners", parent: "Printers & Scanners" },
  { name: "In-Ceiling Speakers", parent: "Pro Speakers" },
  { name: "Line Array Speakers", parent: "Pro Speakers" },
  { name: "Outdoor Speakers", parent: "Pro Speakers" },
  { name: "PA Speakers", parent: "Pro Speakers" },
  { name: "Pendant Speakers", parent: "Pro Speakers" },
  { name: "Speaker Accessories", parent: "Pro Speakers" },
  { name: "Studio Monitors", parent: "Pro Speakers" },
  { name: "Subwoofers", parent: "Pro Speakers" },
  { name: "Projector Accessories", parent: "Projectors & Screens" },
  { name: "Projector Lamps", parent: "Projectors & Screens" },
  { name: "Projector Lenses", parent: "Projectors & Screens" },
  { name: "Projector Screens", parent: "Projectors & Screens" },
  { name: "Projectors", parent: "Projectors & Screens" },
  { name: "Screen Accessories", parent: "Projectors & Screens" },
  { name: "Uncategorized Projectors & Screens", parent: "Projectors & Screens" },
  { name: "Amplifiers", parent: "Receivers & Amplifiers" },
  { name: "Commercial Amplifiers", parent: "Receivers & Amplifiers" },
  { name: "Preamps & Processors", parent: "Receivers & Amplifiers" },
  { name: "Receiver & Amp Accessories", parent: "Receivers & Amplifiers" },
  { name: "Receivers", parent: "Receivers & Amplifiers" },
  { name: "Plugs & Connectors", parent: "Receptacles & Outlets" },
  { name: "Receptacles", parent: "Receptacles & Outlets" },
  { name: "Analog Recorders", parent: "Recording" },
  { name: "Audio Interfaces", parent: "Recording" },
  { name: "Digital Recorders", parent: "Recording" },
  { name: "Recording Accessories", parent: "Recording" },
  { name: "Amplifiers & Signal Boosters", parent: "Satellite & Cable" },
  { name: "Antennas", parent: "Satellite & Cable" },
  { name: "Cable Receivers & Set Top Boxes", parent: "Satellite & Cable" },
  { name: "Mounting Hardware", parent: "Satellite & Cable" },
  { name: "Multiplexers & Switchers", parent: "Satellite & Cable" },
  { name: "Satellite & Cable Accessories", parent: "Satellite & Cable" },
  { name: "Satellite & Cable Grounding", parent: "Satellite & Cable" },
  { name: "Satellite Dishes", parent: "Satellite & Cable" },
  { name: "Satellite LNBs", parent: "Satellite & Cable" },
  { name: "Satellite Receivers", parent: "Satellite & Cable" },
  { name: "AVoIP", parent: "Signal Distribution" },
  { name: "Baluns & Extenders", parent: "Signal Distribution" },
  { name: "Encoders & Decoders", parent: "Signal Distribution" },
  { name: "Matrix Input & Output Cards", parent: "Signal Distribution" },
  { name: "Modulators", parent: "Signal Distribution" },
  { name: "Scalers", parent: "Signal Distribution" },
  { name: "Signal Converters", parent: "Signal Distribution" },
  { name: "Signal Distribution Accessories", parent: "Signal Distribution" },
  { name: "Splitters & Dist Amps", parent: "Signal Distribution" },
  { name: "Switchers and Matrices", parent: "Signal Distribution" },
  { name: "Uncategorized Signal Distribution", parent: "Signal Distribution" },
  { name: "Wireless Signal Distribution", parent: "Signal Distribution" },
  { name: "Compressors and Limiters", parent: "Signal Processing" },
  { name: "Digital Signal Processors (DSPs)", parent: "Signal Processing" },
  { name: "Equalizers", parent: "Signal Processing" },
  { name: "Mixers", parent: "Signal Processing" },
  { name: "Multi-Effects Processors", parent: "Signal Processing" },
  { name: "Reverb and Delay Units", parent: "Signal Processing" },
  { name: "Solar Accessories", parent: "Solar Equipment" },
  { name: "Solar Batteries & Storage", parent: "Solar Equipment" },
  { name: "Solar Inverters", parent: "Solar Equipment" },
  { name: "Solar Kits & Bundles", parent: "Solar Equipment" },
  { name: "Solar Monitoring & Management", parent: "Solar Equipment" },
  { name: "Solar Mounting Systems", parent: "Solar Equipment" },
  { name: "Solar Panels", parent: "Solar Equipment" },
  { name: "Back Boxes & Enclosures", parent: "Speakers" },
  { name: "Bookshelf & On-Wall Speakers", parent: "Speakers" },
  { name: "Commercial Speakers", parent: "Speakers" },
  { name: "Floorstanding Speakers", parent: "Speakers" },
  { name: "In-Ceiling Speakers", parent: "Speakers" },
  { name: "In-Wall Speakers", parent: "Speakers" },
  { name: "Invisible Speakers", parent: "Speakers" },
  { name: "Outdoor Speakers", parent: "Speakers" },
  { name: "Packages & HTIB", parent: "Speakers" },
  { name: "Pre-Construction Brackets", parent: "Speakers" },
  { name: "Soundbars & Bases", parent: "Speakers" },
  { name: "Speaker Accessories", parent: "Speakers" },
  { name: "Stereo Shelf Systems", parent: "Speakers" },
  { name: "Subwoofers", parent: "Speakers" },
  { name: "Uncategorized Speakers", parent: "Speakers" },
  { name: "Wireless Speakers", parent: "Speakers" },
  { name: "Cable Entry Plates", parent: "Structured Cabling" },
  { name: "Keystone Insert Jacks", parent: "Structured Cabling" },
  { name: "Keystone Wallplates & Insert Straps", parent: "Structured Cabling" },
  { name: "Panel Termination Modules", parent: "Structured Cabling" },
  { name: "Patch Panels", parent: "Structured Cabling" },
  { name: "Pre-Configured Wallplates", parent: "Structured Cabling" },
  { name: "Recessed TV Wall Boxes", parent: "Structured Cabling" },
  { name: "Structured Cabling Accessories", parent: "Structured Cabling" },
  { name: "TV Power & Inlet Kits", parent: "Structured Cabling" },
  { name: "Wallplate Mounting Brackets", parent: "Structured Cabling" },
  { name: "Wiring Panels & Enclosures", parent: "Structured Cabling" },
  { name: "Studio Furniture", parent: "Studio Equipment" },
  { name: "Camera Lenses", parent: "Surveillance" },
  { name: "Camera Mounting & Housing", parent: "Surveillance" },
  { name: "Cameras", parent: "Surveillance" },
  { name: "DVRs & NVRs", parent: "Surveillance" },
  { name: "Monitors & Displays", parent: "Surveillance" },
  { name: "Recording Storage", parent: "Surveillance" },
  { name: "Surveillance Accessories, Power Supplies", parent: "Surveillance" },
  { name: "Surveillance Kits & Bundles", parent: "Surveillance" },
  { name: "Surveillance Software & Licenses", parent: "Surveillance" },
  { name: "Uncategorized Surveillance", parent: "Surveillance" },
  { name: "All-Weather TVs", parent: "TVs" },
  { name: "TV Accessories", parent: "TVs" },
  { name: "TV Enclosures", parent: "TVs" },
  { name: "TV Frames", parent: "TVs" },
  { name: "TVs", parent: "TVs" },
  { name: "Conferencing Equipment", parent: "Telephone Systems" },
  { name: "Corded & Cordless Phones", parent: "Telephone Systems" },
  { name: "Key Systems (KSU)", parent: "Telephone Systems" },
  { name: "PBX Systems", parent: "Telephone Systems" },
  { name: "Phone System Packages", parent: "Telephone Systems" },
  { name: "Telephone Headsets", parent: "Telephone Systems" },
  { name: "Telephone Software & Licenses", parent: "Telephone Systems" },
  { name: "Telephone System Accessories", parent: "Telephone Systems" },
  { name: "Unified Communications", parent: "Telephone Systems" },
  { name: "Voicemail System", parent: "Telephone Systems" },
  { name: "Thermal Management Accessories", parent: "Thermal Management" },
  { name: "Conference Cameras", parent: "Video Conference" },
  { name: "Conference Microphones", parent: "Video Conference" },
  { name: "Controllers", parent: "Video Conference" },
  { name: "Installation Services", parent: "Video Conference" },
  { name: "Maintenance Services", parent: "Video Conference" },
  { name: "Video Conference Accessories", parent: "Video Conference" },
  { name: "Video Conference Software & Licenses", parent: "Video Conference" },
  { name: "Video Conference Systems", parent: "Video Conference" },
  { name: "Blank Plates", parent: "Wall Trim Plates" },
  { name: "Decora Trim Plates", parent: "Wall Trim Plates" },
  { name: "Specialty Trim Plates", parent: "Wall Trim Plates" },
  { name: "Toggle Trim Plates", parent: "Wall Trim Plates" },
  { name: "Trim Plate Accessories", parent: "Wall Trim Plates" },
  { name: "Warranties & Service Plans", parent: "Warranties & Service Plans" },
  { name: "Blinds", parent: "Window Treatments" },
  { name: "Brackets & Mounts", parent: "Window Treatments" },
  { name: "Drapes", parent: "Window Treatments" },
  { name: "Motors", parent: "Window Treatments" },
  { name: "Power Supplies", parent: "Window Treatments" },
  { name: "Shades", parent: "Window Treatments" },
  { name: "Window Treatment Accessories", parent: "Window Treatments" },
];

/** Curated real CI/AV manufacturer brands (top brands from the export), alphabetized. */
const BRANDS = [
  "Alarm.com",
  "Apple",
  "Araknis Networks",
  "Audioquest",
  "AVPro Edge",
  "Binary",
  "Control4",
  "Crestron",
  "Denon",
  "DSC",
  "Eero",
  "Episode",
  "Honeywell",
  "ICE Cable",
  "Klipsch",
  "Legrand",
  "Luma Surveillance",
  "Lutron",
  "On-Q by Legrand",
  "Origin Acoustics",
  "Paradigm",
  "Qolsys",
  "Resideo",
  "Ring",
  "Roku",
  "Samsung VXT",
  "Sanus",
  "Savant",
  "Shure",
  "Sonance",
  "Sonos",
  "Sony Professional",
  "Strong",
  "Triad",
  "Ubiquiti",
  "Vanco",
  "Wattbox",
  "Wirepath",
]

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(s: string): number { return (hash(s) % 100000) / 100000; }
function code(b: string): string { return b.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase(); }
function descFor(sub: string): string { return sub.replace(/s$/, "") + " unit"; }
function sum<T>(rows: T[], f: (r: T) => number): number { let s = 0; for (const r of rows) s += f(r); return s; }

interface Item { brand: string; model: string; desc: string; parent: string; subcat: string; units: number; sell: number; sales: number; }

/** 2-letter US state/territory code -> full name (for friendly display of raw state codes). */
const STATE_BY_CODE: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private _meta: { parents: string[]; subcats: { name: string; parent: string }[]; states: string[]; brands: string[]; statuses: string[] } | null = null;
  private _loading: Promise<void> | null = null;

  readonly buyingGroups = BUYING_GROUPS;
  get brandList(): string[] { return this._meta && this._meta.brands.length ? this._meta.brands : BRANDS; }
  private items: Item[] = this.build();

  // Filter option lists: live (from /api/meta) when loaded, else the bundled fallback lists.
  get parentCats(): string[] { return this._meta && this._meta.parents.length ? this._meta.parents : PARENT_CATS; }
  get subcats(): { name: string; parent: string }[] { return this._meta && this._meta.subcats.length ? this._meta.subcats : SUBCATS; }
  get states(): string[] { return this._meta && this._meta.states.length ? this._meta.states : STATES; }
  /** Proposal statuses: live (from /api/meta DISTINCT) when loaded, else the bundled fallback list. */
  get statusList(): string[] { return this._meta && this._meta.statuses && this._meta.statuses.length ? this._meta.statuses : ["Completed", "Accepted", "Submitted", "Opened", "Draft", "Changes Required", "Declined", "Expired", "Email Failed"]; }
  /** value -> display label for states: map 2-letter codes to full names; leave full names untouched. */
  private _stateLabels: Record<string, string> | null = null;
  get stateLabels(): Record<string, string> {
    if (!this._stateLabels) {
      const m: Record<string, string> = {};
      for (const s of this.states) { const up = String(s).trim().toUpperCase(); if (up.length === 2 && STATE_BY_CODE[up]) m[s] = STATE_BY_CODE[up]; }
      this._stateLabels = m;
    }
    return this._stateLabels;
  }

  /** Resolves once live filter options are loaded (api mode); immediate otherwise. Safe to call repeatedly. */
  ready(): Promise<void> {
    if (DATA_MODE !== "api" || this._meta) return Promise.resolve();
    if (!this._loading) this._loading = this.loadMeta().then((ok) => { if (!ok) this._loading = null; });
    return this._loading;
  }
  private async loadMeta(): Promise<boolean> {
    const t = this.auth.token();
    if (!t) return false;
    try {
      const d = await firstValueFrom(this.http.get<{ parents: string[]; subcats: { name: string; parent: string }[]; states: string[]; brands: string[]; statuses?: string[] }>(API_BASE_URL + "/api/meta", { headers: { Authorization: "Bearer " + t } }));
      if (d && Array.isArray(d.parents)) { this._meta = { parents: d.parents || [], subcats: d.subcats || [], states: d.states || [], brands: d.brands || [], statuses: d.statuses || [] }; this._stateLabels = null; return true; }
    } catch { /* keep the bundled fallback lists */ }
    return false;
  }

  private build(): Item[] {
    const out: Item[] = [];
    for (const brand of BRANDS) {
      const scale = 0.4 + rng(brand) * 1.2;
      for (const sc of SUBCATS) {
        if (rng(brand + sc.name + sc.parent) < 0.62) continue;
        const skuCount = 1 + Math.floor(rng(brand + sc.name + sc.parent + "n") * 3);
        for (let k = 0; k < skuCount; k++) {
          const seed = brand + sc.name + sc.parent + k;
          const units = Math.round((120 + rng(seed) * 3600) * scale);
          const sell = Math.round((60 + rng(seed + "p") * 3200) * 100) / 100;
          out.push({ brand, model: code(brand) + "-" + (100 + Math.floor(rng(seed + "m") * 8900)), desc: descFor(sc.name), parent: sc.parent, subcat: sc.name, units, sell, sales: Math.round(units * sell * 100) / 100 });
        }
      }
    }
    return out;
  }

  /** Sub-categories available for a set of selected parents (drives the dependent sub-cat dropdown). */
  subsForParents(parents: string[]): string[] {
    const ps = parents && parents.length ? new Set(parents) : null;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of this.subcats) if (!ps || ps.has(s.parent)) { if (!seen.has(s.name)) { seen.add(s.name); out.push(s.name); } }
    return out.sort((a, b) => a.localeCompare(b));
  }

  /** Parent categories a brand/user is allowed to see (admin -> all). */
  visibleParentsFor(brand: string, restrict?: string[], liveAll = false): string[] {
    const all = this.parentCats;
    if (restrict && restrict.length) return all.filter((p) => restrict.includes(p));
    // liveAll: in api mode show every category (real data); the per-brand subset below is a
    // synthetic-demo affectation only and must not clip the live category list.
    if (liveAll || brand === "admin" || !brand) return all;
    return all.filter((p, i) => i < 10 || rng(brand + "vis" + p) > 0.45);
  }

  private filtered(f: AFilter): Item[] {
    const ps = f.parents.length ? new Set(f.parents) : null;
    const ss = f.subs.length ? new Set(f.subs) : null;
    let rows = this.items.filter((it) => (!ps || ps.has(it.parent)) && (!ss || ss.has(it.subcat)));
    const bgF = f.buyingGroups.length ? f.buyingGroups.length / BUYING_GROUPS.length : 1;
    const stF = f.states.length ? Math.min(1, 0.25 + (f.states.length / STATES.length) * 0.75) : 1;
    const factor = bgF * stF * (f.normalize ? 0.92 : 1);
    if (factor !== 1) rows = rows.map((it) => ({ ...it, units: Math.round(it.units * factor), sales: Math.round(it.sales * factor) }));
    return rows;
  }

  brandShare(f: AFilter): BrandShareRow[] {
    const rows = this.filtered(f);
    const ts = sum(rows, (r) => r.sales) || 1, tu = sum(rows, (r) => r.units) || 1;
    const m = new Map<string, { sales: number; units: number; skus: number }>();
    for (const it of rows) { const e = m.get(it.brand) || { sales: 0, units: 0, skus: 0 }; e.sales += it.sales; e.units += it.units; e.skus += 1; m.set(it.brand, e); }
    return [...m.entries()].map(([brand, e]) => ({ brand, sales: e.sales, sharePct: (e.sales / ts) * 100, units: e.units, unitSharePct: (e.units / tu) * 100, avgSell: e.sales / Math.max(1, e.units), skus: e.skus })).sort((a, b) => b.sales - a.sales);
  }
  itemShare(f: AFilter): ItemRow[] {
    const rows = this.filtered(f);
    const ts = sum(rows, (r) => r.sales) || 1, tu = sum(rows, (r) => r.units) || 1;
    return rows.map((it) => ({ brand: it.brand, model: it.model, desc: it.desc, sales: it.sales, sharePct: (it.sales / ts) * 100, units: it.units, unitSharePct: (it.units / tu) * 100, avgSell: it.sell })).sort((a, b) => b.sales - a.sales);
  }
  subcatBreakdown(f: AFilter): SubcatRow[] {
    const rows = this.filtered(f);
    const ts = sum(rows, (r) => r.sales) || 1, tu = sum(rows, (r) => r.units) || 1;
    const m = new Map<string, { sales: number; units: number }>();
    for (const it of rows) { const e = m.get(it.subcat) || { sales: 0, units: 0 }; e.sales += it.sales; e.units += it.units; m.set(it.subcat, e); }
    return [...m.entries()].map(([subcat, e]) => ({ subcat, sales: e.sales, pctOfCat: (e.sales / ts) * 100, units: e.units, unitPctOfCat: (e.units / tu) * 100, avgSell: e.sales / Math.max(1, e.units) })).sort((a, b) => b.sales - a.sales);
  }

  private nFor(agg: string): number { return agg === "daily" ? 90 : agg === "weekly" ? 26 : agg === "quarterly" ? 8 : 12; }
  private labels(n: number, agg: string): string[] {
    if (agg === "monthly" || agg === "quarterly") {
      const mn = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
      return Array.from({ length: n }, (_, i) => agg === "quarterly" ? "Q" + (i + 1) : mn[i % 12]);
    }
    const p = agg === "daily" ? "D" : "W";
    return Array.from({ length: n }, (_, i) => p + (i + 1));
  }

  /** Brand share-of-category over time, for the Competitive Index (one series per brand). */
  shareSeries(f: AFilter): ShareSeries {
    const rows = this.brandShare(f);
    const n = this.nFor(f.agg), labs = this.labels(n, f.agg);
    const series: Record<string, number[]> = {};
    for (const r of rows) {
      const base = r.sharePct;
      const drift = (rng(r.brand + "drift") - 0.5) * 0.5;
      series[r.brand] = labs.map((l, i) => {
        const t = i / (n - 1 || 1);
        const v = base * (1 + drift * t) + (rng(r.brand + l) - 0.5) * Math.min(3, base * 0.25);
        return Math.max(0, Math.round(v * 100) / 100);
      });
    }
    return { labels: labs, rows, series };
  }

  private brandSharePct(f: AFilter): number {
    if (f.brand === "admin") return 0;
    return (this.brandShare(f).find((r) => r.brand === f.brand)?.sharePct || 0) / 100;
  }

  /** Headline KPIs for the viewed brand (or whole category for admin), with synthetic YoY. */
  brandKpis(f: AFilter): BrandKpis {
    const rows = this.filtered(f);
    const mine = f.brand === "admin" ? rows : rows.filter((it) => it.brand === f.brand);
    const revenue = sum(mine, (r) => r.sales);
    const units = sum(mine, (r) => r.units);
    const key = f.brand === "admin" ? "category" : f.brand;
    const proposals = Math.max(1, Math.round(units / (4 + rng(key + "pp") * 6)));
    const dealers = 25 + Math.floor(rng(key + "dl") * 320);
    const yoy = (k: string) => Math.round((rng(key + k) * 60 - 14) * 10) / 10;
    return { revenue, units, proposals, dealers, revenueYoY: yoy("rev"), unitsYoY: yoy("un"), proposalsYoY: yoy("pr"), dealersYoY: yoy("de") };
  }

  proposalSeries(f: AFilter, kind: "value" | "count" | "pct" | "avg", status: "submitted" | "accepted"): { points: DualPoint[]; total: number; yoy: number; hasBrand: boolean } {
    const catSales = sum(this.filtered(f), (r) => r.sales);
    const statusF = status === "accepted" ? 0.42 : 1;
    const n = this.nFor(f.agg), labs = this.labels(n, f.agg);
    const bShare = this.brandSharePct(f);
    const baseValue = (catSales * statusF) * 8 / n;
    const points: DualPoint[] = labs.map((l, i) => {
      const g = 0.78 + 0.55 * (i / (n - 1 || 1)) + (rng(l + kind) - 0.5) * 0.05;
      let cat: number;
      if (kind === "count") cat = Math.round((baseValue / 14000) * g);
      else if (kind === "pct") cat = Math.round((83 + (rng(l) - 0.5) * 3) * 10) / 10;
      else if (kind === "avg") cat = Math.round(11500 + Math.sin(i) * 1300 + g * 600);
      else cat = Math.round(baseValue * g);
      const brand = kind === "pct" ? Math.round((78 + bShare * 30 + (rng(l + f.brand) - 0.5) * 4) * 10) / 10 : Math.round(cat * bShare);
      return { label: l, category: cat, brand };
    });
    const total = kind === "pct" ? points[points.length - 1].category : kind === "avg" ? Math.round(points.reduce((s, p) => s + p.category, 0) / points.length) : sum(points, (p) => p.category);
    const yoy = 18 + Math.round(rng(f.brand + kind + status) * 70);
    return { points, total, yoy, hasBrand: f.brand !== "admin" };
  }

  /** SKUs where the viewed brand WON the line item (displaced a competitor). */
  displacementWon(f: AFilter): WonRow[] {
    const own = f.brand !== "admin" ? this.filtered(f).filter((it) => it.brand === f.brand) : this.filtered(f);
    return own
      .map((it) => ({ model: it.model, desc: it.subcat, brand: it.brand, units: Math.max(1, Math.round(it.units * (0.3 + rng(it.model + "won") * 0.5))), sales: Math.round(it.sales * (0.3 + rng(it.model + "won") * 0.5)), competitorsBeaten: 1 + Math.floor(rng(it.model + "cb") * 4) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 12);
  }

  /** SKUs where the viewed brand was DISPLACED; each drills into the SKUs that beat it, ranked by units. */
  displacementLost(f: AFilter): LostRow[] {
    const all = this.filtered(f);
    const own = f.brand !== "admin" ? all.filter((it) => it.brand === f.brand) : all.slice(0, 40);
    const others = all.filter((it) => it.brand !== f.brand);
    return own
      .map((it) => {
        const lostUnits = Math.max(1, Math.round(it.units * (0.15 + rng(it.model + "lost") * 0.4)));
        const sameCat = others.filter((o) => o.subcat === it.subcat);
        const displacers: Displacer[] = sameCat
          .map((o) => ({ brand: o.brand, model: o.model, units: Math.max(1, Math.round(lostUnits * (0.2 + rng(o.model + it.model) * 0.8))) }))
          .sort((a, b) => b.units - a.units)
          .slice(0, 6);
        return { model: it.model, subcat: it.subcat, lostUnits, lostSales: Math.round(lostUnits * it.sell), displacers };
      })
      .filter((r) => r.displacers.length > 0)
      .sort((a, b) => b.lostUnits - a.lostUnits)
      .slice(0, 12);
  }

  /* ---- Builder semantic layer: measures x dimensions x filters over Market Insights data ---- */
  private dimVal(it: Item, d: Dim): string { return d === "brand" ? it.brand : d === "parent" ? it.parent : it.subcat; }
  private measureOf(items: Item[], m: Measure): number {
    if (m === "skus") return items.length;
    if (m === "brands") return new Set(items.map((i) => i.brand)).size;
    const s = sum(items, (i) => i.sales), u = sum(items, (i) => i.units);
    if (m === "sales") return s;
    if (m === "units") return u;
    return u ? s / u : 0;
  }
  private groupItems(rows: Item[], d: Dim): Map<string, Item[]> {
    const map = new Map<string, Item[]>();
    for (const it of rows) { const k = this.dimVal(it, d); let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(it); }
    return map;
  }
  measureMeta(m: Measure): MeasureMeta { return MEASURES.find((x) => x.id === m) || MEASURES[0]; }
  measureKpi(m: Measure, f: AFilter): number { return this.measureOf(this.filtered(f), m); }
  measureGroup(m: Measure, d: Dim, f: AFilter, limit = 12): { label: string; value: number }[] {
    const map = this.groupItems(this.filtered(f), d);
    return [...map.entries()].map(([label, items]) => ({ label, value: Math.round(this.measureOf(items, m)) })).sort((a, b) => b.value - a.value).slice(0, limit);
  }
  measureTable(measures: Measure[], d: Dim, f: AFilter): { columns: string[]; rows: (string | number)[][] } {
    const map = this.groupItems(this.filtered(f), d);
    const dimLabel = (DIMS.find((x) => x.id === d) || DIMS[0]).label;
    const ms = measures.map((m) => this.measureMeta(m));
    const sortM = measures[0];
    const entries = [...map.entries()].sort((a, b) => this.measureOf(b[1], sortM) - this.measureOf(a[1], sortM)).slice(0, 200);
    const fmt = (v: number, meta: MeasureMeta) => meta.money ? "$" + Math.round(v).toLocaleString("en-US") : Math.round(v).toLocaleString("en-US");
    return { columns: [dimLabel, ...ms.map((m) => m.label)], rows: entries.map(([label, items]) => [label, ...ms.map((m) => fmt(this.measureOf(items, m.id), m))]) };
  }
  measureSeries(m: Measure, d: Dim | null, f: AFilter): { axis: string[]; series: { label: string; values: number[] }[] } {
    const n = 12, labs = this.labels(n, "monthly");
    const meta = this.measureMeta(m);
    const spread = (total: number, seed: string): number[] => labs.map((l, i) => {
      const t = i / (n - 1);
      if (meta.additive) return Math.max(0, Math.round((total / n) * (0.7 + 0.6 * t) * (0.9 + 0.2 * rng(seed + l))));
      return Math.max(0, Math.round(total * (0.9 + 0.2 * t) * (0.92 + 0.16 * rng(seed + l))));
    });
    if (!d) return { axis: labs, series: [{ label: meta.label, values: spread(this.measureOf(this.filtered(f), m), m) }] };
    const groups = this.measureGroup(m, d, f, 5);
    const rows = this.filtered(f);
    return { axis: labs, series: groups.map((g) => ({ label: g.label, values: spread(this.measureOf(rows.filter((it) => this.dimVal(it, d) === g.label), m), m + g.label) })) };
  }

  /* ---- Competitive activity (synthetic, brand-aware) ---- */
  competitiveBrand(f: AFilter): string { return f.brand && f.brand !== "admin" ? f.brand : this.brandList[0]; }

  /** Synthetic "new dealers (30d)" count for offline mode (api mode uses /api/new-dealers). */
  dealersSpeccingSynthetic(brand: string): { count: number; newCount: number; dealers: { name: string; city: string; state: string; isNew: boolean }[] } {
    const LOCS = [["Austin", "TX"], ["Denver", "CO"], ["Seattle", "WA"], ["Miami", "FL"], ["Chicago", "IL"], ["Boston", "MA"], ["Atlanta", "GA"], ["Phoenix", "AZ"], ["Portland", "OR"], ["Nashville", "TN"]];
    const total = Math.min(DEALERS.length, 8 + Math.round(rng((brand || "b") + "spec") * 8));
    const start = Math.floor(rng((brand || "b") + "specs") * Math.max(1, DEALERS.length - total));
    const picked = DEALERS.slice(start, start + total);
    const newN = Math.min(picked.length, 2 + Math.round(rng((brand || "b") + "new") * 4));
    const dealers = picked.map((name, i) => ({ name, city: LOCS[(i + start) % LOCS.length][0], state: LOCS[(i + start) % LOCS.length][1], isNew: i < newN }));
    return { count: picked.length, newCount: newN, dealers };
  }

  /** Synthetic revenue-by-period for the Home trend (api mode returns the live revByPeriod instead). */
  revByPeriod(f: AFilter): { labels: string[]; values: number[]; prior: number[] } {
    const labels = this.shareSeries(f).labels;
    const total = this.brandKpis(f).revenue;
    const w = labels.map((_, i) => 0.7 + rng((f.brand || "all") + "rev" + i) * 0.6);
    const wsum = w.reduce((a, b) => a + b, 0) || 1;
    const values = w.map((x) => Math.round((total * x) / wsum));
    const pw = labels.map((_, i) => 0.6 + rng((f.brand || "all") + "prev" + i) * 0.55);
    const pwsum = pw.reduce((a, b) => a + b, 0) || 1;
    const priorTotal = total / (1.1 + rng((f.brand || "all") + "yoy") * 0.4);
    const prior = pw.map((x) => Math.round((priorTotal * x) / pwsum));
    return { labels, values, prior };
  }
  newDealers(f: AFilter): { count: number; columns: string[]; rows: (string | number)[][] } {
    const brand = this.competitiveBrand(f);
    const rows = DEALERS.filter((d) => rng(brand + d + "new") > 0.5).slice(0, 10).map((d) => {
      const region = REGIONS[hash(d) % REGIONS.length];
      const days = 2 + Math.floor(rng(brand + d + "dt") * 28);
      const date = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const opp = 4000 + Math.floor(rng(brand + d + "opp") * 46000);
      return [d, region, date, "$" + opp.toLocaleString("en-US")];
    });
    return { count: 16 + Math.floor(rng(brand + "newc") * 44), columns: ["Dealer", "Region", "First Spec Date", "Est. Opportunity"], rows };
  }
  lostDealers(f: AFilter): { count: number; columns: string[]; rows: (string | number)[][] } {
    const brand = this.competitiveBrand(f);
    const rows = DEALERS.filter((d) => rng(brand + d + "lost") > 0.62).slice(0, 10).map((d) => {
      const region = REGIONS[hash(d) % REGIONS.length];
      const months = 6 + Math.floor(rng(brand + d + "mo") * 9);
      const date = new Date(Date.now() - months * 30 * 86400000).toISOString().slice(0, 10);
      const prior = 8000 + Math.floor(rng(brand + d + "pr") * 70000);
      return [d, region, date, months + " mo", "$" + prior.toLocaleString("en-US")];
    });
    return { count: 9 + Math.floor(rng(brand + "lostc") * 30), columns: ["Dealer", "Region", "Last Sale", "Inactive", "Prior 12-mo $"], rows };
  }
  proposalFunnel(f: AFilter): { stages: { stage: string; brand: number; category: number }[] } {
    const brand = this.competitiveBrand(f);
    const catSales = sum(this.filtered(f), (r) => r.sales) || 1;
    const catTotal = Math.max(400, Math.round(catSales / 7000));
    const frac = [1, 0.62, 0.34, 0.27];
    const bShare = 0.1 + rng(brand + "fsh") * 0.28;
    const names = ["Proposed", "Submitted", "Accepted", "Completed"];
    return { stages: names.map((stage, i) => ({ stage, category: Math.round(catTotal * frac[i]), brand: Math.max(1, Math.round(catTotal * frac[i] * bShare)) })) };
  }
  salesByState(f: AFilter): { label: string; value: number }[] {
    const brand = this.competitiveBrand(f);
    const total = sum(this.filtered(f), (r) => r.sales) || 1;
    const weights = STATES.map((st) => 0.15 + rng(brand + st));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    return STATES.map((st, i) => ({ label: st, value: Math.round((total * weights[i]) / wsum) }));
  }
}
