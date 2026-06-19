// IRS Schedule C categories and constants — shared across Finances page and Trip Budget.
// Keep this in sync with the printed Schedule C form (Form 1040 Schedule C).

export const IRS_MILEAGE_RATE = 0.70;     // 2026 standard mileage rate ($/mi)
export const SE_TAX_RATE = 0.153;         // self-employment tax (Social Security + Medicare)

export interface SchedCCat {
  label: string;
  line: string;       // Schedule C line reference (e.g. "Line 24a")
  deductPct: number;  // % of expense that's deductible (meals = 50)
}

export const SCHEDULE_C_CATEGORIES: SchedCCat[] = [
  { label: "Advertising",           line: "Line 8",   deductPct: 100 },
  { label: "Car & Truck (Actual)",  line: "Line 9",   deductPct: 100 },
  { label: "Commissions & Fees",    line: "Line 10",  deductPct: 100 },
  { label: "Contract Labor",        line: "Line 11",  deductPct: 100 },
  { label: "Insurance",             line: "Line 15",  deductPct: 100 },
  { label: "Legal & Professional",  line: "Line 17",  deductPct: 100 },
  { label: "Office Expenses",       line: "Line 18",  deductPct: 100 },
  { label: "Rent or Lease",         line: "Line 20a", deductPct: 100 },
  { label: "Repairs & Maintenance", line: "Line 21",  deductPct: 100 },
  { label: "Supplies",              line: "Line 22",  deductPct: 100 },
  { label: "Taxes & Licenses",      line: "Line 23",  deductPct: 100 },
  { label: "Travel",                line: "Line 24a", deductPct: 100 },
  { label: "Meals (50%)",           line: "Line 24b", deductPct: 50  },
  { label: "Utilities & Phone",     line: "Line 25",  deductPct: 100 },
  { label: "Professional Dev.",     line: "Line 27a", deductPct: 100 },
  { label: "Parts / COGS",          line: "COGS",     deductPct: 100 },
  { label: "Other",                 line: "Line 27a", deductPct: 100 },
];

export function getCatInfo(cat: string): SchedCCat {
  return SCHEDULE_C_CATEGORIES.find(c => c.label === cat)
    ?? { label: cat, line: "Line 27a", deductPct: 100 };
}

// Categories that typically apply to a trip — used to populate a sensible
// default budget when a user opens Trip Budget for the first time.
export const TRIP_DEFAULT_CATEGORIES: string[] = [
  "Travel",          // flight, hotel, taxis
  "Meals (50%)",     // restaurants on the road
  "Car & Truck (Actual)", // rental car, gas if not using mileage
  "Supplies",
  "Other",
];
