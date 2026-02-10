import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const SPECIALIZATIONS = [
  "Criminal Defense",
  "Family Law",
  "Personal Injury",
  "Immigration",
  "Business & Contract",
  "Real Estate",
  "Estate Planning",
  "Employment Law",
  "Bankruptcy",
  "Intellectual Property",
  "Tax Law",
  "Environmental Law",
  "Civil Rights",
  "Medical Malpractice",
  "DUI/DWI",
];

const FIRST_NAMES = [
  "James", "Maria", "Robert", "Patricia", "Michael", "Jennifer", "David", "Linda",
  "Richard", "Elizabeth", "Joseph", "Barbara", "Thomas", "Susan", "Christopher", "Jessica",
  "Daniel", "Sarah", "Matthew", "Karen", "Anthony", "Lisa", "Mark", "Nancy",
  "Donald", "Betty", "Steven", "Margaret", "Paul", "Sandra", "Andrew", "Ashley",
  "Joshua", "Kimberly", "Kenneth", "Emily", "Kevin", "Donna", "Brian", "Michelle",
  "George", "Carol", "Timothy", "Amanda", "Ronald", "Dorothy", "Edward", "Melissa",
  "Jason", "Deborah",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
  "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
  "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts",
];

const BIOS = [
  "Dedicated attorney with extensive courtroom experience. Passionate about achieving justice for every client.",
  "Highly experienced legal professional focused on delivering exceptional results for individuals and families.",
  "Aggressive litigator with a proven track record of successful outcomes in complex cases.",
  "Client-focused attorney committed to providing personalized legal strategies and compassionate counsel.",
  "Results-driven lawyer with deep expertise in navigating complex legal challenges efficiently.",
  "Award-winning attorney known for meticulous preparation and compelling courtroom advocacy.",
  "Seasoned legal professional with a reputation for integrity, thorough case analysis, and strong negotiation.",
  "Strategic thinker who combines legal expertise with practical business sense to protect client interests.",
  "Passionate advocate who fights tirelessly for clients' rights and strives for the best possible outcomes.",
  "Trusted advisor with years of experience guiding clients through difficult legal situations with confidence.",
];

const LANGUAGES_POOL = [
  ["English"],
  ["English", "Spanish"],
  ["English", "French"],
  ["English", "Mandarin"],
  ["English", "Portuguese"],
  ["English", "Arabic"],
  ["English", "Hindi"],
  ["English", "Korean"],
  ["English", "Vietnamese"],
  ["English", "Spanish", "French"],
];

const COURT_LEVELS_POOL = [
  ["State"],
  ["State", "Federal"],
  ["State", "Federal", "Appellate"],
  ["Federal"],
  ["State", "Supreme Court"],
];

const EDUCATION_POOL = [
  [{ institution: "Harvard Law School", degree: "Juris Doctor", year: 2010 }],
  [{ institution: "Yale Law School", degree: "Juris Doctor", year: 2012 }],
  [{ institution: "Stanford Law School", degree: "Juris Doctor", year: 2014 }],
  [{ institution: "Columbia Law School", degree: "Juris Doctor", year: 2008 }],
  [{ institution: "NYU School of Law", degree: "Juris Doctor", year: 2016 }],
  [{ institution: "Georgetown Law", degree: "Juris Doctor", year: 2011 }],
  [{ institution: "University of Chicago Law School", degree: "Juris Doctor", year: 2015 }],
  [{ institution: "UC Berkeley School of Law", degree: "Juris Doctor", year: 2013 }],
  [{ institution: "Duke University School of Law", degree: "Juris Doctor", year: 2009 }],
  [{ institution: "University of Michigan Law School", degree: "Juris Doctor", year: 2017 }],
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, min, max) {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log("Seeding 50 test lawyers...\n");

  const lawyers = [];

  for (let i = 1; i <= 50; i++) {
    const firstName = FIRST_NAMES[i - 1];
    const lastName = LAST_NAMES[i - 1];
    const state = STATES[i - 1];
    const email = `lawyer.${firstName.toLowerCase()}.${lastName.toLowerCase()}@testlaw.com`;
    const clerkId = `seed_lawyer_${String(i).padStart(3, "0")}`;
    const barNumber = `${state}-${String(100000 + i)}`;
    const yearsExperience = randomInt(2, 30);
    const rating = parseFloat((3.5 + Math.random() * 1.5).toFixed(1)); // 3.5 – 5.0
    const totalReviews = randomInt(5, 200);
    const consultationRate = randomInt(15, 100) * 100; // $15–$100 in cents (1500–10000)
    const specializations = pickN(SPECIALIZATIONS, 1, 3);

    try {
      const user = await prisma.user.create({
        data: {
          clerkId,
          email,
          firstName,
          lastName,
          phone: `+1${String(2000000000 + i)}`,
          role: "LAWYER",
          isVerified: true,
        },
      });

      const profile = await prisma.lawyerProfile.create({
        data: {
          userId: user.id,
          barNumber,
          licenseState: state,
          specializations,
          bio: pick(BIOS),
          professionalSummary: `${firstName} ${lastName} is a ${specializations[0].toLowerCase()} attorney licensed in ${state} with ${yearsExperience} years of experience.`,
          yearsExperience,
          consultationRate,
          languages: pick(LANGUAGES_POOL),
          isAvailable: Math.random() > 0.2, // 80% available
          onlineStatus: pick(["online", "offline", "offline", "busy"]),
          rating,
          totalReviews,
          courtLevels: pick(COURT_LEVELS_POOL),
          education: pick(EDUCATION_POOL),
          verificationStatus: "VERIFIED",
        },
      });

      lawyers.push({ name: `${firstName} ${lastName}`, state, specs: specializations.join(", ") });
      console.log(`  [${i}/50] ${firstName} ${lastName} — ${state} — ${specializations.join(", ")}`);
    } catch (err) {
      console.error(`  [${i}/50] SKIP (already exists or error): ${firstName} ${lastName} — ${err.message}`);
    }
  }

  console.log(`\nDone! Created ${lawyers.length} test lawyers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
