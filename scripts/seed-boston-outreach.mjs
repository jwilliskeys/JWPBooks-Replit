/**
 * seed-boston-outreach.mjs — one-time seed of researched Boston-area outreach leads
 * (hotels, venues, recording studios, music schools, private schools, senior living, teachers).
 *
 * Idempotent: skips any lead whose name already exists (case-insensitive).
 * Also geocodes any lead missing lat/lng if GOOGLE_MAPS_API_KEY is set.
 *
 * Run: set -a && source .env && set +a && node scripts/seed-boston-outreach.mjs
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Source your .env first.");
  process.exit(1);
}

// Researched July 3, 2026. Notes carry the outreach angle + who to ask for.
const LEADS = [
  // ── Hotels & piano bars (ask for Director of F&B, Chief Engineer, or GM) ──
  { leadType: "hotel_venue", city: "Boston", name: "Fairmont Copley Plaza (OAK Long Bar + Kitchen)", website: "https://www.fairmont.com/en/hotels/boston/fairmont-copley-plaza.html", notes: "Historic 1912 luxury hotel; live piano in the OAK bar. Heavy-use instrument. Ask for Director of F&B or Chief Engineer." },
  { leadType: "hotel_venue", city: "Boston", name: "The Newbury Boston", website: "https://www.thenewburyboston.com", notes: "Former Ritz-Carlton/Taj; 16,000 sq ft event space overlooking Public Garden. Event pianos. Ask for Director of Events." },
  { leadType: "hotel_venue", city: "Boston", name: "Omni Parker House", website: "https://www.omnihotels.com/hotels/boston-parker-house", notes: "Live music in lobby at night; oldest continuously operating hotel in the US. Ask for F&B or Engineering." },
  { leadType: "hotel_venue", city: "Boston", name: "Four Seasons Hotel Boston", website: "https://www.fourseasons.com/boston/", notes: "Luxury hotel with lounge piano tradition (Bristol). Ask for Director of F&B." },
  { leadType: "hotel_venue", city: "Boston", name: "The Lenox Hotel", website: "https://www.lenoxhotel.com", notes: "Independent Back Bay luxury hotel; event spaces. Ask for Events/Engineering." },
  { leadType: "hotel_venue", city: "Boston", name: "The Liberty Hotel", website: "https://www.libertyhotel.com", notes: "90-ft rotunda lobby, frequent events/live music. Ask for Events team." },
  { leadType: "hotel_venue", city: "Cambridge", name: "The Charles Hotel", website: "https://www.charleshotel.com", notes: "Harvard Sq hotel; houses Regattabar jazz club. Event + club pianos. Ask for GM or Regattabar booking." },

  // ── Jazz clubs & live venues (house pianos get hammered — steady work) ──
  { leadType: "hotel_venue", city: "Cambridge", name: "Regattabar Jazz Club", address: "1 Bennett St", website: "https://www.regattabarjazz.com/", notes: "220-seat jazz venue in The Charles Hotel. House piano used by touring acts — needs frequent tuning. Ask for booking/production manager." },
  { leadType: "hotel_venue", city: "Boston", name: "Scullers Jazz Club", address: "400 Soldiers Field Rd", website: "https://scullersjazz.com/", notes: "200-seat jazz club in the DoubleTree Suites. House piano. Ask for production manager." },
  { leadType: "hotel_venue", city: "Boston", name: "Wally's Cafe Jazz Club", website: "https://www.wallyscafe.com", notes: "Legendary jazz club, live music nightly — house piano in constant use." },
  { leadType: "hotel_venue", city: "Cambridge", name: "Club Passim", website: "https://www.passim.org", notes: "Historic Harvard Sq folk club + music school. House piano; nonprofit — friendly, community-minded." },
  { leadType: "hotel_venue", city: "Cambridge", name: "The Lilypad", website: "https://www.lilypadinman.com", notes: "Inman Sq jazz/experimental room with house piano; artist-run, human-to-human pitch will land." },
  { leadType: "hotel_venue", city: "Cambridge", name: "Lizard Lounge", website: "https://lizardloungeclub.com", notes: "Porter Sq basement club, live music nightly, has piano." },
  { leadType: "hotel_venue", city: "Somerville", name: "Crystal Ballroom at Somerville Theatre", address: "55 Davis Square", website: "https://www.crystalballroomboston.com", notes: "Davis Sq event/concert hall. Ask for production manager. You're local — lead with Somerville." },
  { leadType: "hotel_venue", city: "Somerville", name: "Arts at the Armory", address: "191 Highland Ave", website: "https://artsatthearmory.org", notes: "Nonprofit café + performance hall on your street. Walk in — perfect first in-person visit." },
  { leadType: "hotel_venue", city: "Somerville", name: "The Rockwell", address: "255 Elm St", website: "https://www.therockwell.org", notes: "Davis Sq theater/performance venue." },
  { leadType: "hotel_venue", city: "Somerville", name: "Warehouse XI", address: "11 Sanborn Court", website: "https://www.warehousexi.com", notes: "Union Sq wedding/event venue. Event pianos need pre-event touch-ups — pitch a per-event tuning arrangement." },
  { leadType: "hotel_venue", city: "Somerville", name: "The Burren", website: "https://www.burren.com", notes: "Davis Sq Irish pub with nightly live music incl. piano sessions in the Backroom." },

  // ── Recording studios (session pianos need concert-level prep) ──
  { leadType: "recording_studio", city: "Cambridge", name: "Q Division Studios", address: "171 Rindge Ave", website: "https://qdivisionstudios.com", notes: "Famous studio (Pixies, Aimee Mann). Yamaha baby grand in Studio A + upright in Studio B lounge. Session tunings = premium, recurring work." },
  { leadType: "recording_studio", city: "Cambridge", name: "The Bridge Sound and Stage", website: "https://www.thebridgecambridge.com", notes: "North Cambridge recording studio with live room. Ask what piano they keep and who preps it for sessions." },

  // ── Community music schools (many pianos, institutional budgets) ──
  { leadType: "school", city: "Cambridge", name: "Longy School of Music of Bard College", address: "27 Garden St", website: "https://longy.edu", notes: "Conservatory in Harvard Sq, ~1,000 community students. Many pianos. May have staff tech — ask about overflow/summer work; great BU-peer credibility." },
  { leadType: "school", city: "Cambridge", name: "New School of Music", address: "25 Lowell St", website: "https://newschoolofmusic.org", notes: "Community music school; hires piano faculty — multiple studio pianos." },
  { leadType: "school", city: "Belmont", name: "Powers Music School", website: "https://www.powersmusic.org", notes: "Long-running Belmont community music school; teaching pianos across studios." },
  { leadType: "school", city: "Winchester", name: "Winchester Community Music School", website: "https://www.winchestermusic.org", notes: "National Guild community school; piano program. Institutional client potential." },
  { leadType: "school", city: "Brookline", name: "Brookline Music School", website: "https://bmsmusic.org", notes: "Full community school incl. Suzuki + piano programs. Multiple pianos." },
  { leadType: "teaching_studio", city: "Brookline", name: "John Payne Music Center", website: "https://www.jpmc.us", notes: "Since 1979; piano among many instruments. Ask who maintains their pianos." },
  { leadType: "teaching_studio", city: "Somerville", name: "Union Lesson Studios", address: "11 Bow St", website: "https://www.unionlessonstudios.com", notes: "Union Sq lesson studio — your neighborhood. Walk in and introduce yourself; also a referral source for students' home pianos." },
  { leadType: "teaching_studio", city: "Cambridge", name: "Cambridge Music Consortium", website: "https://www.cmclessons.com", notes: "Multi-teacher lesson organization in Cambridge (02139)." },
  { leadType: "teaching_studio", city: "Watertown", name: "School of Rock Watertown", website: "https://www.schoolofrock.com/locations/watertown", notes: "Franchise music school serving Watertown/Belmont/Newton — keyboards + possibly acoustic pianos." },

  // ── Independent teachers (referral network — their students need a tuner) ──
  { leadType: "teaching_studio", city: "Medford", name: "Medford Piano Lessons", website: "https://www.medfordpianolessons.com", notes: "Two studios, each with a grand. Teachers = referral gold: every student household has a piano needing a tuner they trust." },
  { leadType: "teaching_studio", city: "Cambridge", name: "Rasa Vitkauskaite Piano Studio", address: "315 Broadway", website: "https://rasavitkauskaite.com/pianolessons/", notes: "Award-winning MMTA/MTNA teacher near Central Sq. Peer-to-peer intro; ask to be her recommended tech for students." },
  { leadType: "teaching_studio", city: "Cambridge", name: "Cambridge Piano Lessons", website: "https://cambridgepiano.com", notes: "MTNA-member studio serving Cambridge/Somerville/Medford. Referral source." },

  // ── Private schools (music rooms + performance pianos) ──
  { leadType: "school", city: "Cambridge", name: "Shady Hill School", address: "178 Coolidge Hill", website: "https://www.shadyhill.org", notes: "PK-8 private school with dedicated music center. Ask for music department head or facilities." },
  { leadType: "school", city: "Cambridge", name: "Buckingham Browne & Nichols School", address: "80 Gerrys Landing Rd", website: "https://www.bbns.org", notes: "1,400-student K-12; active music program incl. jazz. Multiple pianos across campuses." },
  { leadType: "school", city: "Cambridge", name: "Fayerweather Street School", address: "765 Concord Ave", website: "https://www.fayerweather.org", notes: "PK-8 progressive school with music program." },
  { leadType: "school", city: "Somerville", name: "Prospect Hill Academy Charter School", address: "81 Highland Ave", website: "https://www.prospecthillacademy.org", notes: "Somerville charter school — local, walkable." },

  // ── Senior living (activity rooms almost always have a neglected piano) ──
  { leadType: "senior_living", city: "Cambridge", name: "Neville Place Assisted Living", website: "https://www.seniorlivingresidences.com/communities/cambridge-neville-place/", notes: "Assisted living at Fresh Pond. Ask for the Activities/Engagement Director — common-room pianos are used for singalongs and rarely tuned." },
  { leadType: "senior_living", city: "Cambridge", name: "The Cambridge Homes", address: "360 Mount Auburn St", website: "https://www.seniorlivingresidences.com/communities/cambridge-homes/", notes: "Assisted living near Harvard Sq. Same angle: Activities Director, offer a free piano check." },
  { leadType: "senior_living", city: "Arlington", name: "Sunrise of Arlington", website: "https://www.sunriseseniorliving.com/communities/sunrise-of-arlington", notes: "Assisted living + memory care; music programming is a big part of memory care. Warm, mission-driven pitch." },
];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

// The app only shows leads belonging to the owner — every insert must carry user_id.
const ownerEmail = process.env.OWNER_EMAIL;
const { rows: ownerRows } = await client.query("SELECT id FROM users WHERE email = $1", [ownerEmail]);
if (!ownerRows.length) {
  console.error(`No user found for OWNER_EMAIL (${ownerEmail}). Aborting.`);
  process.exit(1);
}
const ownerId = ownerRows[0].id;

const { rows: existing } = await client.query("SELECT LOWER(name) AS name FROM outreach_leads");
const existingNames = new Set(existing.map((r) => r.name));

let inserted = 0, skipped = 0;
for (const l of LEADS) {
  if (existingNames.has(l.name.toLowerCase())) { skipped++; continue; }
  await client.query(
    `INSERT INTO outreach_leads (user_id, lead_type, city, name, phone, email, website, address, status, notes, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Not contacted',$9,'claude')`,
    [ownerId, l.leadType, l.city, l.name, l.phone ?? null, l.email ?? null, l.website ?? null, l.address ?? null, l.notes]
  );
  inserted++;
}
console.log(`Inserted ${inserted}, skipped ${skipped} already-present.`);

// ── Geocode anything missing lat/lng (best effort) ──
const key = process.env.GOOGLE_MAPS_API_KEY;
if (key) {
  const { rows: toGeo } = await client.query(
    "SELECT id, name, address, city FROM outreach_leads WHERE (lat IS NULL OR lat = '') LIMIT 200"
  );
  let geocoded = 0, failed = 0;
  for (const lead of toGeo) {
    const q = [lead.name, lead.address, lead.city, "MA"].filter(Boolean).join(", ");
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", q);
      url.searchParams.set("key", key);
      const resp = await fetch(url);
      const data = await resp.json();
      const loc = data?.results?.[0]?.geometry?.location;
      if (loc) {
        await client.query("UPDATE outreach_leads SET lat=$1, lng=$2 WHERE id=$3", [String(loc.lat), String(loc.lng), lead.id]);
        geocoded++;
      } else failed++;
      await new Promise((r) => setTimeout(r, 60)); // gentle rate limit
    } catch { failed++; }
  }
  console.log(`Geocoded ${geocoded}, failed ${failed}.`);
} else {
  console.log("GOOGLE_MAPS_API_KEY not set — skipped geocoding.");
}

await client.end();
