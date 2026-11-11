// utils/chennai.js
// Chennai-only restriction for bus routes. A route is allowed only when its
// starting location, destination AND every intermediate stop are within
// Chennai city. Used by both manual entry and Excel/CSV import.
//
// Matching is text-based (bus-route places are free text). A place is accepted
// if it mentions "Chennai" or matches a known Chennai locality/terminus, and is
// rejected outright if it names another city / district / state.

// Clearly-outside places (other TN districts, nearby cities, other states).
const OUTSIDE = [
  "madurai", "coimbatore", "trichy", "tiruchirappalli", "tiruchirapalli", "salem",
  "erode", "vellore", "villupuram", "viluppuram", "pondicherry", "puducherry",
  "tirunelveli", "thanjavur", "tanjore", "dindigul", "kanchipuram", "kanchi",
  "chengalpattu", "chengalpet", "tiruvannamalai", "cuddalore", "namakkal", "karur",
  "tirupur", "nagercoil", "hosur", "krishnagiri", "dharmapuri", "ariyalur",
  "perambalur", "pudukkottai", "sivaganga", "ramanathapuram", "virudhunagar",
  "theni", "nilgiris", "ooty", "udhagamandalam", "kanyakumari", "thoothukudi",
  "tuticorin", "nagapattinam", "tiruvarur", "mayiladuthurai", "kallakurichi",
  "tenkasi", "ranipet", "tirupathur", "tirupattur",
  "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "kerala", "andhra",
  "karnataka", "telangana", "trivandrum", "kochi", "cochin", "mysore", "mysuru",
  "tirupati", "tirupathi", "nellore", "vijayawada", "kalpakkam", "mahabalipuram",
  "mamallapuram", "kovalam", "tindivanam", "gummidipoondi", "arakkonam",
  "sriperumbudur", "mahindra city", "marakkanam", "cheyyar",
];

// Known Chennai localities / neighbourhoods / bus termini.
const CHENNAI_AREAS = [
  "chennai", "madras", "cmbt", "koyambedu", "broadway", "parrys", "parry",
  "central", "egmore", "tambaram", "velachery", "adyar", "guindy", "t nagar",
  "t. nagar", "tnagar", "anna nagar", "mylapore", "vadapalani", "porur",
  "ambattur", "avadi", "perambur", "washermanpet", "triplicane", "saidapet",
  "chromepet", "chrompet", "pallavaram", "perungudi", "thoraipakkam", "taramani",
  "sholinganallur", "navalur", "siruseri", "kelambakkam", "medavakkam",
  "madipakkam", "nanganallur", "ashok nagar", "kodambakkam", "nungambakkam",
  "kilpauk", "purasaiwalkam", "purasawalkam", "royapettah", "mandaveli",
  "besant nagar", "thiruvanmiyur", "kottivakkam", "palavakkam", "neelankarai",
  "injambakkam", "kotturpuram", "teynampet", "alwarpet", "nandanam", "ekkaduthangal",
  "ekkattuthangal", "st thomas mount", "st. thomas mount", "meenambakkam",
  "pallikaranai", "omr", "ecr", "red hills", "madhavaram", "manali", "ennore",
  "tiruvottiyur", "thiruvottiyur", "kathivakkam", "minjur", "poonamallee",
  "maduravoyal", "valasaravakkam", "virugambakkam", "saligramam", "choolaimedu",
  "aminjikarai", "villivakkam", "korattur", "padi", "mogappair", "thirumangalam",
  "ashok pillar", "kasimedu", "high court", "marina", "ice house", "chepauk",
  "wallajah", "royapuram", "tondiarpet", "vyasarpadi", "sembiam", "icf",
  "little mount", "alandur", "pazhavanthangal", "palavanthangal", "tirusulam",
  "pammal", "anakaputhur", "kundrathur", "ramapuram", "mugalivakkam", "manapakkam",
  "nandambakkam", "kathipara", "vandalur", "urapakkam", "guduvanchery", "guduvancheri",
  "potheri", "maraimalai nagar", "singaperumal koil", "perungalathur", "peerkankaranai",
  "mannivakkam", "otteri", "mount road", "anna salai", "spencer", "chetpet",
  "shenoy nagar", "aminjikarai", "arumbakkam", "nerkundram", "thiruverkadu",
  "karapakkam", "thalambur", "semmancheri", "perumbakkam", "nolambur",
  "kolathur", "villivakkam", "moolakadai", "retteri", "puzhal", "sholavaram",
  "thiruninravur", "pattabiram", "hvf", "thirumullaivoyal", "annanur",
  "kattupakkam", "iyyapanthangal", "mangadu", "gerugambakkam", "kovur",
];

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[.\-_/]/g, " ").replace(/\s+/g, " ").trim();
}

// True if a single place is within Chennai.
function isChennaiPlace(name) {
  const s = normalize(name);
  if (!s) return false;
  if (OUTSIDE.some((c) => s.includes(c))) return false;
  return CHENNAI_AREAS.some((a) => s.includes(a));
}

// Returns "" if the whole route is Chennai-only, else a reason naming the first
// place that is outside Chennai.
function chennaiRouteError(route) {
  const r = route || {};
  if (r.from && !isChennaiPlace(r.from)) return `Outside Chennai: "${r.from}" (starting location)`;
  if (r.to && !isChennaiPlace(r.to)) return `Outside Chennai: "${r.to}" (destination)`;
  const stops = Array.isArray(r.stops) ? r.stops : [];
  for (const s of stops) {
    const nm = typeof s === "string" ? s : (s && s.name);
    if (nm && !isChennaiPlace(nm)) return `Outside Chennai: "${nm}" (stop)`;
  }
  return "";
}

module.exports = { isChennaiPlace, chennaiRouteError };
