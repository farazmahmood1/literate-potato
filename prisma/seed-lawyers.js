import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── 50 detailed lawyer profiles — one per US state, all OFFLINE ──

const LAWYERS = [
  {
    state: "AL",
    firstName: "James",
    lastName: "Whitfield",
    title: "Senior Trial Attorney",
    specializations: ["Criminal Defense", "DUI/DWI", "Civil Rights"],
    bio: "James Whitfield is a seasoned trial attorney with over 18 years of experience defending clients across Alabama. Known for his commanding courtroom presence and meticulous case preparation, he has successfully handled over 500 criminal defense cases ranging from misdemeanors to capital offenses. James is a fierce advocate for constitutional rights and has been recognized by the Alabama State Bar for his pro bono work with indigent defendants.",
    professionalSummary: "Senior trial attorney licensed in Alabama specializing in criminal defense, DUI/DWI, and civil rights. 18 years of courtroom experience with a proven track record of favorable verdicts and negotiated plea agreements.",
    yearsExperience: 18,
    consultationRate: 7500,
    languages: ["English"],
    education: [
      { institution: "University of Alabama School of Law", degree: "Juris Doctor", year: 2007 },
      { institution: "Auburn University", degree: "Bachelor of Arts in Political Science", year: 2004 }
    ],
    previousFirms: [
      { name: "Whitfield & Associates", role: "Founding Partner", years: "2015-Present" },
      { name: "Birmingham Public Defender's Office", role: "Assistant Public Defender", years: "2008-2015" }
    ],
    certifications: [
      { name: "Board Certified Criminal Trial Advocate", issuer: "National Board of Trial Advocacy", year: 2013 },
      { name: "DUI Defense Specialist", issuer: "National College for DUI Defense", year: 2011 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.7,
    totalReviews: 142,
  },
  {
    state: "AK",
    firstName: "Elena",
    lastName: "Sorokin",
    title: "Environmental & Natural Resources Attorney",
    specializations: ["Environmental Law", "Real Estate", "Business & Contract"],
    bio: "Elena Sorokin has dedicated her 12-year career to environmental and natural resources law in Alaska. She represents landowners, tribal communities, and businesses navigating the complex regulatory landscape of the Last Frontier. Her expertise spans oil and gas leasing disputes, federal land management issues, and environmental impact litigation. Elena is passionate about balancing economic development with the preservation of Alaska's unique ecosystems.",
    professionalSummary: "Environmental and natural resources attorney based in Anchorage, Alaska. Specializes in federal land use, oil and gas regulatory compliance, and environmental impact litigation with 12 years of dedicated practice.",
    yearsExperience: 12,
    consultationRate: 8500,
    languages: ["English", "Russian"],
    education: [
      { institution: "Georgetown Law", degree: "Juris Doctor, Environmental Law Concentration", year: 2013 },
      { institution: "University of Alaska Fairbanks", degree: "Bachelor of Science in Environmental Studies", year: 2010 }
    ],
    previousFirms: [
      { name: "Northern Law Group", role: "Partner", years: "2019-Present" },
      { name: "Stoel Rives LLP", role: "Associate", years: "2013-2019" }
    ],
    certifications: [
      { name: "LEED Accredited Professional", issuer: "U.S. Green Building Council", year: 2016 },
      { name: "Certified Environmental Law Specialist", issuer: "Alaska Bar Association", year: 2018 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 78,
  },
  {
    state: "AZ",
    firstName: "Carlos",
    lastName: "Mendoza",
    title: "Immigration & Family Law Attorney",
    specializations: ["Immigration", "Family Law", "Civil Rights"],
    bio: "Carlos Mendoza is a bilingual attorney who has spent 15 years advocating for immigrant families and individuals in Arizona. Raised in a family of immigrants himself, Carlos brings deep personal understanding to his practice. He has handled thousands of immigration cases including asylum claims, DACA renewals, deportation defense, and family-based petitions. His family law practice focuses on cross-border custody disputes and international divorce proceedings.",
    professionalSummary: "Bilingual immigration and family law attorney in Phoenix, Arizona with 15 years of experience. Handles asylum, deportation defense, family petitions, and cross-border custody disputes. Fluent in English and Spanish.",
    yearsExperience: 15,
    consultationRate: 6500,
    languages: ["English", "Spanish"],
    education: [
      { institution: "Arizona State University Sandra Day O'Connor College of Law", degree: "Juris Doctor", year: 2010 },
      { institution: "University of Arizona", degree: "Bachelor of Arts in Latin American Studies", year: 2007 }
    ],
    previousFirms: [
      { name: "Mendoza Immigration Law", role: "Founding Attorney", years: "2016-Present" },
      { name: "Florence Immigrant & Refugee Rights Project", role: "Staff Attorney", years: "2011-2016" }
    ],
    certifications: [
      { name: "Board Certified Immigration Lawyer", issuer: "American Immigration Lawyers Association", year: 2015 },
      { name: "Family Law Mediation Certificate", issuer: "Arizona Dispute Resolution Association", year: 2018 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.9,
    totalReviews: 203,
  },
  {
    state: "AR",
    firstName: "Rebecca",
    lastName: "Thornton",
    title: "Estate Planning & Elder Law Attorney",
    specializations: ["Estate Planning", "Real Estate", "Tax Law"],
    bio: "Rebecca Thornton has built a trusted estate planning practice in Little Rock over the past 20 years. She guides families through wills, trusts, probate, and Medicaid planning with compassion and precision. Rebecca is known for making complex estate matters understandable and has helped over 2,000 Arkansas families protect their assets and plan for the future. She also handles agricultural land transfers and farm succession planning.",
    professionalSummary: "Experienced estate planning and elder law attorney in Arkansas with 20 years of practice. Expert in wills, trusts, probate, Medicaid planning, and agricultural land succession. Over 2,000 families served.",
    yearsExperience: 20,
    consultationRate: 5500,
    languages: ["English"],
    education: [
      { institution: "University of Arkansas School of Law", degree: "Juris Doctor", year: 2005 },
      { institution: "Hendrix College", degree: "Bachelor of Arts in Economics", year: 2002 }
    ],
    previousFirms: [
      { name: "Thornton Estate Law", role: "Principal", years: "2012-Present" },
      { name: "Friday Eldredge & Clark LLP", role: "Associate", years: "2005-2012" }
    ],
    certifications: [
      { name: "Accredited Estate Planner", issuer: "National Association of Estate Planners & Councils", year: 2010 },
      { name: "Certified Elder Law Attorney", issuer: "National Elder Law Foundation", year: 2014 }
    ],
    courtLevels: ["State"],
    rating: 4.8,
    totalReviews: 167,
  },
  {
    state: "CA",
    firstName: "David",
    lastName: "Chen",
    title: "Intellectual Property & Technology Attorney",
    specializations: ["Intellectual Property", "Business & Contract", "Employment Law"],
    bio: "David Chen is a leading intellectual property attorney in Silicon Valley with 16 years of experience representing tech startups, Fortune 500 companies, and independent inventors. He specializes in patent prosecution, trade secret litigation, and technology licensing agreements. David has successfully litigated IP disputes worth over $500 million in combined value and regularly advises companies on protecting their innovations in an increasingly competitive global market.",
    professionalSummary: "Silicon Valley IP and technology attorney with 16 years of experience. Specializes in patent prosecution, trade secret litigation, and technology licensing. Has handled disputes exceeding $500M in combined value.",
    yearsExperience: 16,
    consultationRate: 10000,
    languages: ["English", "Mandarin"],
    education: [
      { institution: "Stanford Law School", degree: "Juris Doctor", year: 2009 },
      { institution: "MIT", degree: "Bachelor of Science in Computer Science", year: 2006 }
    ],
    previousFirms: [
      { name: "Chen IP Law Group", role: "Managing Partner", years: "2017-Present" },
      { name: "Morrison & Foerster LLP", role: "Senior Associate", years: "2009-2017" }
    ],
    certifications: [
      { name: "Registered Patent Attorney", issuer: "United States Patent and Trademark Office", year: 2009 },
      { name: "Certified Information Privacy Professional", issuer: "International Association of Privacy Professionals", year: 2018 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.9,
    totalReviews: 189,
  },
  {
    state: "CO",
    firstName: "Sarah",
    lastName: "Blackwood",
    title: "Cannabis & Business Law Attorney",
    specializations: ["Business & Contract", "Real Estate", "Tax Law"],
    bio: "Sarah Blackwood is a pioneering business law attorney in Denver who has been at the forefront of Colorado's cannabis industry legal landscape since legalization. With 10 years of experience, she advises dispensaries, cultivators, and ancillary businesses on licensing, compliance, real estate transactions, and corporate structuring. Beyond cannabis law, Sarah handles general business formations, commercial leases, and tax planning for small to mid-size enterprises.",
    professionalSummary: "Denver-based business and cannabis law attorney with 10 years of experience. Specializes in regulatory compliance, business formation, commercial real estate, and tax planning for emerging industries.",
    yearsExperience: 10,
    consultationRate: 7000,
    languages: ["English", "Spanish"],
    education: [
      { institution: "University of Colorado Law School", degree: "Juris Doctor", year: 2015 },
      { institution: "Colorado State University", degree: "Bachelor of Science in Business Administration", year: 2012 }
    ],
    previousFirms: [
      { name: "Blackwood Legal Counsel", role: "Founding Partner", years: "2019-Present" },
      { name: "Vicente Sederberg LLP", role: "Associate", years: "2015-2019" }
    ],
    certifications: [
      { name: "Cannabis Law Certificate", issuer: "University of Denver Sturm College of Law", year: 2016 },
      { name: "Certified Business Counselor", issuer: "Colorado Bar Association", year: 2020 }
    ],
    courtLevels: ["State"],
    rating: 4.6,
    totalReviews: 94,
  },
  {
    state: "CT",
    firstName: "William",
    lastName: "Harrington",
    title: "Medical Malpractice & Personal Injury Attorney",
    specializations: ["Medical Malpractice", "Personal Injury", "Civil Rights"],
    bio: "William Harrington is a formidable medical malpractice attorney based in Hartford with 22 years of trial experience. He has recovered over $150 million in verdicts and settlements for victims of medical negligence, surgical errors, and misdiagnosis. William works with top medical experts to build compelling cases and is known for his willingness to take complex cases to trial. His personal injury practice also covers catastrophic accidents and wrongful death claims.",
    professionalSummary: "Hartford-based medical malpractice and personal injury attorney with 22 years of experience. Over $150M recovered in verdicts and settlements. Known for taking complex medical negligence cases to trial.",
    yearsExperience: 22,
    consultationRate: 9500,
    languages: ["English"],
    education: [
      { institution: "Yale Law School", degree: "Juris Doctor", year: 2003 },
      { institution: "University of Connecticut", degree: "Bachelor of Science in Biology", year: 2000 }
    ],
    previousFirms: [
      { name: "Harrington Trial Lawyers", role: "Senior Partner", years: "2010-Present" },
      { name: "Koskoff Koskoff & Bieder PC", role: "Associate then Partner", years: "2003-2010" }
    ],
    certifications: [
      { name: "Board Certified Civil Trial Advocate", issuer: "National Board of Trial Advocacy", year: 2009 },
      { name: "Medical Malpractice Specialization", issuer: "Connecticut Bar Association", year: 2012 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.9,
    totalReviews: 176,
  },
  {
    state: "DE",
    firstName: "Priya",
    lastName: "Kapoor",
    title: "Corporate & Securities Attorney",
    specializations: ["Business & Contract", "Intellectual Property", "Tax Law"],
    bio: "Priya Kapoor is a distinguished corporate attorney in Wilmington, Delaware — the incorporation capital of America. With 14 years of experience, she advises public and private companies on mergers and acquisitions, corporate governance, securities compliance, and complex transactional matters. Priya has handled over $2 billion in M&A transactions and regularly counsels boards of directors on fiduciary duties under Delaware corporate law.",
    professionalSummary: "Wilmington-based corporate and securities attorney with 14 years of experience in M&A, corporate governance, and securities compliance. Over $2B in completed transactions. Deep expertise in Delaware corporate law.",
    yearsExperience: 14,
    consultationRate: 9000,
    languages: ["English", "Hindi"],
    education: [
      { institution: "University of Pennsylvania Carey Law School", degree: "Juris Doctor", year: 2011 },
      { institution: "University of Delaware", degree: "Bachelor of Arts in Finance", year: 2008 }
    ],
    previousFirms: [
      { name: "Kapoor Corporate Law", role: "Managing Attorney", years: "2020-Present" },
      { name: "Skadden Arps Slate Meagher & Flom LLP", role: "Associate then Counsel", years: "2011-2020" }
    ],
    certifications: [
      { name: "Securities Law Specialist", issuer: "Delaware State Bar Association", year: 2016 },
      { name: "Certified M&A Advisor", issuer: "AM&AA", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 63,
  },
  {
    state: "FL",
    firstName: "Marcus",
    lastName: "Rivera",
    title: "Personal Injury & Maritime Law Attorney",
    specializations: ["Personal Injury", "Medical Malpractice", "Employment Law"],
    bio: "Marcus Rivera is a top-rated personal injury attorney in Miami with 17 years of experience fighting for accident victims across Florida. He handles complex personal injury cases including maritime injuries, cruise ship accidents, and catastrophic auto collisions. Marcus has recovered over $200 million for his clients and has been named a Florida Super Lawyer for eight consecutive years. His firm operates on a contingency basis, ensuring access to justice for all.",
    professionalSummary: "Miami personal injury and maritime law attorney with 17 years of experience. Over $200M recovered for clients. Specializes in catastrophic injuries, maritime accidents, and medical malpractice claims.",
    yearsExperience: 17,
    consultationRate: 8000,
    languages: ["English", "Spanish", "Portuguese"],
    education: [
      { institution: "University of Miami School of Law", degree: "Juris Doctor, Maritime Law Concentration", year: 2008 },
      { institution: "Florida International University", degree: "Bachelor of Arts in Criminal Justice", year: 2005 }
    ],
    previousFirms: [
      { name: "Rivera Injury Law", role: "Founding Partner", years: "2014-Present" },
      { name: "Morgan & Morgan PA", role: "Trial Attorney", years: "2008-2014" }
    ],
    certifications: [
      { name: "Board Certified Civil Trial Lawyer", issuer: "The Florida Bar", year: 2014 },
      { name: "Proctor in Admiralty", issuer: "Maritime Law Association of the United States", year: 2016 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.8,
    totalReviews: 231,
  },
  {
    state: "GA",
    firstName: "Angela",
    lastName: "Washington",
    title: "Civil Rights & Employment Attorney",
    specializations: ["Civil Rights", "Employment Law", "Criminal Defense"],
    bio: "Angela Washington is a passionate civil rights and employment attorney in Atlanta with 13 years of experience. She represents employees and individuals facing discrimination, wrongful termination, police misconduct, and First Amendment violations. Angela has argued before the Eleventh Circuit Court of Appeals and has been instrumental in landmark employment discrimination cases in Georgia. She is deeply committed to social justice and serves on the board of the Georgia ACLU.",
    professionalSummary: "Atlanta civil rights and employment attorney with 13 years of experience. Handles discrimination, wrongful termination, police misconduct, and constitutional rights cases. Active Georgia ACLU board member.",
    yearsExperience: 13,
    consultationRate: 7000,
    languages: ["English", "French"],
    education: [
      { institution: "Emory University School of Law", degree: "Juris Doctor", year: 2012 },
      { institution: "Spelman College", degree: "Bachelor of Arts in Sociology", year: 2009 }
    ],
    previousFirms: [
      { name: "Washington Civil Rights Law", role: "Principal Attorney", years: "2018-Present" },
      { name: "Southern Poverty Law Center", role: "Staff Attorney", years: "2012-2018" }
    ],
    certifications: [
      { name: "Employment Law Specialist", issuer: "Georgia Bar Association", year: 2017 },
      { name: "Civil Rights Litigation Certificate", issuer: "National Employment Law Project", year: 2015 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.7,
    totalReviews: 118,
  },
  {
    state: "HI",
    firstName: "Kenji",
    lastName: "Tanaka",
    title: "Real Estate & Land Use Attorney",
    specializations: ["Real Estate", "Environmental Law", "Business & Contract"],
    bio: "Kenji Tanaka is a respected real estate and land use attorney in Honolulu with 11 years of experience navigating Hawaii's unique property laws. He advises developers, homeowners, and commercial investors on zoning matters, conservation district use applications, and shoreline setback regulations. Kenji has deep expertise in Native Hawaiian land rights and is frequently consulted on issues involving the Hawaiian Homes Commission Act and ceded lands.",
    professionalSummary: "Honolulu real estate and land use attorney with 11 years of experience. Expert in Hawaii property law, zoning, conservation districts, and Native Hawaiian land rights. Advises developers and homeowners alike.",
    yearsExperience: 11,
    consultationRate: 7500,
    languages: ["English", "Japanese"],
    education: [
      { institution: "William S. Richardson School of Law, University of Hawaii", degree: "Juris Doctor", year: 2014 },
      { institution: "University of Hawaii at Manoa", degree: "Bachelor of Arts in Hawaiian Studies", year: 2011 }
    ],
    previousFirms: [
      { name: "Tanaka Land Law", role: "Founding Partner", years: "2020-Present" },
      { name: "Cades Schutte LLP", role: "Associate", years: "2014-2020" }
    ],
    certifications: [
      { name: "Real Property Law Specialist", issuer: "Hawaii State Bar Association", year: 2019 },
      { name: "LEED Green Associate", issuer: "U.S. Green Building Council", year: 2017 }
    ],
    courtLevels: ["State"],
    rating: 4.6,
    totalReviews: 72,
  },
  {
    state: "ID",
    firstName: "Laura",
    lastName: "Bergstrom",
    title: "Family Law & Mediation Attorney",
    specializations: ["Family Law", "Estate Planning", "Real Estate"],
    bio: "Laura Bergstrom is a compassionate family law attorney in Boise with 9 years of experience helping Idaho families through life's most difficult transitions. She handles divorce, child custody, adoption, and domestic violence protection orders with a focus on mediation and collaborative resolution. Laura believes in minimizing conflict and prioritizing children's wellbeing. Her practice also encompasses prenuptial agreements and estate planning for blended families.",
    professionalSummary: "Boise family law and mediation attorney with 9 years of experience. Specializes in divorce, custody, adoption, and domestic violence matters. Certified mediator focused on collaborative family resolution.",
    yearsExperience: 9,
    consultationRate: 5000,
    languages: ["English"],
    education: [
      { institution: "University of Idaho College of Law", degree: "Juris Doctor", year: 2016 },
      { institution: "Boise State University", degree: "Bachelor of Arts in Psychology", year: 2013 }
    ],
    previousFirms: [
      { name: "Bergstrom Family Law", role: "Owner", years: "2021-Present" },
      { name: "Idaho Legal Aid Services", role: "Staff Attorney", years: "2016-2021" }
    ],
    certifications: [
      { name: "Certified Family Law Mediator", issuer: "Idaho Mediation Association", year: 2019 },
      { name: "Collaborative Divorce Practitioner", issuer: "International Academy of Collaborative Professionals", year: 2020 }
    ],
    courtLevels: ["State"],
    rating: 4.7,
    totalReviews: 89,
  },
  {
    state: "IL",
    firstName: "Robert",
    lastName: "O'Brien",
    title: "Criminal Defense & Federal Litigation Attorney",
    specializations: ["Criminal Defense", "Civil Rights", "DUI/DWI"],
    bio: "Robert O'Brien is a hard-hitting criminal defense attorney in Chicago with 25 years of trial experience. A former Cook County prosecutor, he switched to the defense side and has since represented over 3,000 clients facing charges from misdemeanors to federal conspiracy. Robert is known for his aggressive cross-examinations and deep understanding of prosecutorial strategy. He has successfully tried over 200 jury trials and has been named one of Chicago's top defense lawyers by multiple legal publications.",
    professionalSummary: "Chicago criminal defense attorney with 25 years of experience and 200+ jury trials. Former Cook County prosecutor. Handles federal and state criminal matters including white-collar crime, drug offenses, and civil rights violations.",
    yearsExperience: 25,
    consultationRate: 9000,
    languages: ["English"],
    education: [
      { institution: "Northwestern Pritzker School of Law", degree: "Juris Doctor", year: 2000 },
      { institution: "University of Illinois at Urbana-Champaign", degree: "Bachelor of Arts in Political Science", year: 1997 }
    ],
    previousFirms: [
      { name: "O'Brien Defense Group", role: "Senior Partner", years: "2008-Present" },
      { name: "Cook County State's Attorney's Office", role: "Assistant State's Attorney", years: "2000-2008" }
    ],
    certifications: [
      { name: "Board Certified Criminal Trial Advocate", issuer: "National Board of Trial Advocacy", year: 2010 },
      { name: "Federal Criminal Defense Specialist", issuer: "Federal Defenders of Northern Illinois", year: 2012 }
    ],
    courtLevels: ["State", "Federal", "Appellate", "Supreme Court"],
    rating: 4.9,
    totalReviews: 287,
  },
  {
    state: "IN",
    firstName: "Michelle",
    lastName: "Foster",
    title: "Bankruptcy & Debt Relief Attorney",
    specializations: ["Bankruptcy", "Business & Contract", "Real Estate"],
    bio: "Michelle Foster is a dedicated bankruptcy attorney in Indianapolis with 14 years of experience helping individuals and small businesses achieve financial fresh starts. She handles Chapter 7, Chapter 13, and Chapter 11 filings, as well as creditor negotiations, foreclosure defense, and debt settlement. Michelle takes a holistic approach to financial recovery, working closely with financial advisors to help clients rebuild their credit and financial stability after bankruptcy.",
    professionalSummary: "Indianapolis bankruptcy and debt relief attorney with 14 years of experience. Handles Chapter 7, 11, and 13 filings, foreclosure defense, and creditor negotiations. Holistic approach to financial recovery.",
    yearsExperience: 14,
    consultationRate: 5500,
    languages: ["English"],
    education: [
      { institution: "Indiana University Maurer School of Law", degree: "Juris Doctor", year: 2011 },
      { institution: "Purdue University", degree: "Bachelor of Science in Accounting", year: 2008 }
    ],
    previousFirms: [
      { name: "Foster Bankruptcy Solutions", role: "Managing Partner", years: "2017-Present" },
      { name: "Ice Miller LLP", role: "Associate", years: "2011-2017" }
    ],
    certifications: [
      { name: "Certified Bankruptcy Specialist", issuer: "American Board of Certification", year: 2016 },
      { name: "CPA (Inactive)", issuer: "Indiana Board of Accountancy", year: 2008 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.6,
    totalReviews: 134,
  },
  {
    state: "IA",
    firstName: "Thomas",
    lastName: "Larsen",
    title: "Agricultural & Business Law Attorney",
    specializations: ["Business & Contract", "Real Estate", "Tax Law"],
    bio: "Thomas Larsen is a respected agricultural and business law attorney in Des Moines with 19 years of experience serving Iowa's farming and business communities. He handles farm succession planning, agricultural contracts, water rights disputes, and USDA regulatory compliance. Thomas grew up on a family farm and brings firsthand understanding of the challenges facing modern agricultural operations. He also advises rural businesses on formation, contracts, and commercial transactions.",
    professionalSummary: "Des Moines agricultural and business law attorney with 19 years of experience. Specializes in farm succession, agricultural contracts, water rights, and USDA compliance. Raised on a family farm in Iowa.",
    yearsExperience: 19,
    consultationRate: 5000,
    languages: ["English"],
    education: [
      { institution: "University of Iowa College of Law", degree: "Juris Doctor, Agricultural Law Certificate", year: 2006 },
      { institution: "Iowa State University", degree: "Bachelor of Science in Agricultural Business", year: 2003 }
    ],
    previousFirms: [
      { name: "Larsen Agricultural Law", role: "Owner", years: "2013-Present" },
      { name: "Dickinson Mackaman Tyler & Hagen PC", role: "Associate", years: "2006-2013" }
    ],
    certifications: [
      { name: "Agricultural Law Specialist", issuer: "Iowa State Bar Association", year: 2012 },
      { name: "Certified Crop Insurance Consultant", issuer: "National Crop Insurance Services", year: 2015 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.5,
    totalReviews: 91,
  },
  {
    state: "KS",
    firstName: "Patricia",
    lastName: "Hawkins",
    title: "Employment & Workers' Compensation Attorney",
    specializations: ["Employment Law", "Personal Injury", "Civil Rights"],
    bio: "Patricia Hawkins is a tenacious employment law attorney in Wichita with 11 years of experience protecting workers' rights. She represents employees in wrongful termination, workplace discrimination, sexual harassment, and wage theft cases. Patricia also handles complex workers' compensation claims for injured workers across Kansas. Her client-centered approach and fierce advocacy have earned her recognition as a rising star in Kansas employment law.",
    professionalSummary: "Wichita employment and workers' compensation attorney with 11 years of experience. Handles wrongful termination, discrimination, harassment, wage claims, and workplace injury cases across Kansas.",
    yearsExperience: 11,
    consultationRate: 5500,
    languages: ["English"],
    education: [
      { institution: "Washburn University School of Law", degree: "Juris Doctor", year: 2014 },
      { institution: "Kansas State University", degree: "Bachelor of Arts in Human Resources", year: 2011 }
    ],
    previousFirms: [
      { name: "Hawkins Employment Law", role: "Principal", years: "2020-Present" },
      { name: "Foulston Siefkin LLP", role: "Associate", years: "2014-2020" }
    ],
    certifications: [
      { name: "Employment Law Specialist", issuer: "Kansas Bar Association", year: 2019 },
      { name: "Workers' Compensation Certified Specialist", issuer: "Kansas Department of Labor", year: 2018 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.7,
    totalReviews: 103,
  },
  {
    state: "KY",
    firstName: "Daniel",
    lastName: "McAllister",
    title: "Personal Injury & Medical Malpractice Attorney",
    specializations: ["Personal Injury", "Medical Malpractice", "DUI/DWI"],
    bio: "Daniel McAllister is a trusted personal injury attorney in Louisville with 16 years of trial experience. He represents victims of car accidents, truck collisions, medical negligence, and premises liability throughout Kentucky. Daniel has recovered over $75 million in combined verdicts and settlements. Known for his thorough investigation process and empathetic client relations, he treats every case as if it were going to trial, ensuring maximum preparedness and leverage in negotiations.",
    professionalSummary: "Louisville personal injury and medical malpractice attorney with 16 years of experience. Over $75M recovered for clients. Thorough trial preparation approach with strong negotiation outcomes.",
    yearsExperience: 16,
    consultationRate: 7000,
    languages: ["English"],
    education: [
      { institution: "University of Kentucky College of Law", degree: "Juris Doctor", year: 2009 },
      { institution: "University of Louisville", degree: "Bachelor of Science in Biology", year: 2006 }
    ],
    previousFirms: [
      { name: "McAllister Injury Law", role: "Founding Partner", years: "2015-Present" },
      { name: "Dolt Thompson Shepherd & Conway PSC", role: "Associate", years: "2009-2015" }
    ],
    certifications: [
      { name: "Board Certified Civil Trial Advocate", issuer: "National Board of Trial Advocacy", year: 2015 },
      { name: "Kentucky Trial Lawyers Association, Board Member", issuer: "KTLA", year: 2018 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 156,
  },
  {
    state: "LA",
    firstName: "Antoine",
    lastName: "Dupree",
    title: "Criminal Defense & Entertainment Law Attorney",
    specializations: ["Criminal Defense", "Business & Contract", "Intellectual Property"],
    bio: "Antoine Dupree is a dynamic criminal defense and entertainment law attorney in New Orleans with 13 years of experience. His criminal defense practice focuses on drug offenses, violent crimes, and white-collar fraud in both Louisiana state courts and the Eastern District of Louisiana federal court. Antoine's entertainment law practice serves the vibrant New Orleans music and arts community, handling contracts, licensing, and IP protection for artists, producers, and venues.",
    professionalSummary: "New Orleans criminal defense and entertainment law attorney with 13 years of experience. Handles felony defense in state and federal courts. Entertainment practice serves musicians, artists, and production companies.",
    yearsExperience: 13,
    consultationRate: 7500,
    languages: ["English", "French"],
    education: [
      { institution: "Tulane University Law School", degree: "Juris Doctor", year: 2012 },
      { institution: "Louisiana State University", degree: "Bachelor of Arts in Music Business", year: 2009 }
    ],
    previousFirms: [
      { name: "Dupree Legal Group", role: "Founding Partner", years: "2018-Present" },
      { name: "Orleans Public Defenders", role: "Trial Attorney", years: "2012-2018" }
    ],
    certifications: [
      { name: "Criminal Law Specialist", issuer: "Louisiana State Bar Association", year: 2017 },
      { name: "Entertainment Law Certificate", issuer: "Volunteer Lawyers for the Arts", year: 2016 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.6,
    totalReviews: 108,
  },
  {
    state: "ME",
    firstName: "Elizabeth",
    lastName: "Barrett",
    title: "Environmental & Land Conservation Attorney",
    specializations: ["Environmental Law", "Real Estate", "Estate Planning"],
    bio: "Elizabeth Barrett is a dedicated environmental and land conservation attorney in Portland, Maine with 10 years of experience. She represents land trusts, conservation organizations, and private landowners in conservation easements, timber rights, and coastal access disputes. Elizabeth is passionate about protecting Maine's natural heritage and has facilitated the permanent conservation of over 15,000 acres. Her practice also covers estate planning with a focus on land preservation.",
    professionalSummary: "Portland, Maine environmental and land conservation attorney with 10 years of experience. Expert in conservation easements, timber rights, and coastal access law. Has helped conserve 15,000+ acres of Maine land.",
    yearsExperience: 10,
    consultationRate: 6000,
    languages: ["English"],
    education: [
      { institution: "Vermont Law School", degree: "Juris Doctor, Environmental Law Concentration", year: 2015 },
      { institution: "Bowdoin College", degree: "Bachelor of Arts in Environmental Studies", year: 2012 }
    ],
    previousFirms: [
      { name: "Barrett Conservation Law", role: "Owner", years: "2021-Present" },
      { name: "Maine Coast Heritage Trust", role: "Staff Counsel", years: "2015-2021" }
    ],
    certifications: [
      { name: "Conservation Easement Specialist", issuer: "Land Trust Alliance", year: 2018 },
      { name: "Environmental Law Certificate", issuer: "Vermont Law School", year: 2015 }
    ],
    courtLevels: ["State"],
    rating: 4.7,
    totalReviews: 56,
  },
  {
    state: "MD",
    firstName: "Kevin",
    lastName: "Okafor",
    title: "Immigration & International Law Attorney",
    specializations: ["Immigration", "Business & Contract", "Civil Rights"],
    bio: "Kevin Okafor is a distinguished immigration attorney in Baltimore with 15 years of experience serving the diverse communities of Maryland and the greater DC metropolitan area. Born in Nigeria and educated in both the UK and US, Kevin brings a unique international perspective to his practice. He handles complex immigration cases including EB-5 investor visas, H-1B petitions, asylum claims, and removal proceedings. His business immigration practice serves tech companies, universities, and healthcare systems.",
    professionalSummary: "Baltimore immigration and international law attorney with 15 years of experience. Specializes in business immigration (EB-5, H-1B, L-1), asylum, and removal defense. Serves the DC-Baltimore corridor.",
    yearsExperience: 15,
    consultationRate: 7500,
    languages: ["English", "Igbo", "French"],
    education: [
      { institution: "University of Maryland Francis King Carey School of Law", degree: "Juris Doctor", year: 2010 },
      { institution: "University of Lagos", degree: "Bachelor of Laws (LLB)", year: 2006 }
    ],
    previousFirms: [
      { name: "Okafor Immigration Partners", role: "Managing Partner", years: "2016-Present" },
      { name: "Fragomen Del Rey Bernsen & Loewy LLP", role: "Associate", years: "2010-2016" }
    ],
    certifications: [
      { name: "Board Certified Immigration Lawyer", issuer: "American Immigration Lawyers Association", year: 2015 },
      { name: "International Law Certificate", issuer: "University of Maryland Law", year: 2010 }
    ],
    courtLevels: ["Federal", "Appellate"],
    rating: 4.8,
    totalReviews: 145,
  },
  {
    state: "MA",
    firstName: "Catherine",
    lastName: "Sullivan",
    title: "Healthcare & Biotech Law Attorney",
    specializations: ["Business & Contract", "Intellectual Property", "Employment Law"],
    bio: "Catherine Sullivan is a leading healthcare and biotech law attorney in Boston with 18 years of experience. She advises pharmaceutical companies, biotech startups, hospitals, and medical device manufacturers on FDA regulatory compliance, clinical trial agreements, healthcare M&A, and HIPAA compliance. Catherine has guided over 50 biotech companies through funding rounds and regulatory milestones. Her deep industry knowledge makes her a trusted advisor in Boston's thriving life sciences ecosystem.",
    professionalSummary: "Boston healthcare and biotech attorney with 18 years of experience. Advises on FDA compliance, clinical trials, healthcare M&A, and HIPAA. Has guided 50+ biotech companies through regulatory milestones.",
    yearsExperience: 18,
    consultationRate: 9500,
    languages: ["English"],
    education: [
      { institution: "Harvard Law School", degree: "Juris Doctor", year: 2007 },
      { institution: "Boston University", degree: "Bachelor of Science in Biomedical Engineering", year: 2004 }
    ],
    previousFirms: [
      { name: "Sullivan Health Law Group", role: "Managing Partner", years: "2015-Present" },
      { name: "Ropes & Gray LLP", role: "Senior Associate", years: "2007-2015" }
    ],
    certifications: [
      { name: "Health Law Specialist", issuer: "Massachusetts Bar Association", year: 2013 },
      { name: "Certified Healthcare Compliance Professional", issuer: "HCCA", year: 2016 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.9,
    totalReviews: 97,
  },
  {
    state: "MI",
    firstName: "Jason",
    lastName: "Kowalski",
    title: "Auto Industry & Product Liability Attorney",
    specializations: ["Personal Injury", "Business & Contract", "Employment Law"],
    bio: "Jason Kowalski is a product liability and auto industry attorney in Detroit with 20 years of experience. He represents individuals injured by defective vehicles and auto parts, as well as auto industry suppliers in commercial disputes. Jason has deep expertise in automotive recalls, NHTSA regulations, and Lemon Law claims. His dual background serving both plaintiffs and industry clients gives him unique insight into how manufacturers approach safety and liability issues.",
    professionalSummary: "Detroit product liability and auto industry attorney with 20 years of experience. Specializes in vehicle defect litigation, automotive recalls, Lemon Law claims, and auto supplier disputes.",
    yearsExperience: 20,
    consultationRate: 8000,
    languages: ["English", "Polish"],
    education: [
      { institution: "University of Michigan Law School", degree: "Juris Doctor", year: 2005 },
      { institution: "Michigan State University", degree: "Bachelor of Science in Mechanical Engineering", year: 2002 }
    ],
    previousFirms: [
      { name: "Kowalski Product Liability Law", role: "Senior Partner", years: "2013-Present" },
      { name: "Dykema Gossett PLLC", role: "Associate then Of Counsel", years: "2005-2013" }
    ],
    certifications: [
      { name: "Product Liability Trial Specialist", issuer: "Michigan State Bar", year: 2012 },
      { name: "Certified Automotive Safety Expert", issuer: "National Safety Council", year: 2014 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.7,
    totalReviews: 128,
  },
  {
    state: "MN",
    firstName: "Anna",
    lastName: "Lindgren",
    title: "Tax & Estate Planning Attorney",
    specializations: ["Tax Law", "Estate Planning", "Business & Contract"],
    bio: "Anna Lindgren is a meticulous tax and estate planning attorney in Minneapolis with 13 years of experience. She advises high-net-worth individuals, family businesses, and nonprofit organizations on tax-efficient wealth transfer, trust administration, and business succession planning. Anna holds both a JD and an LLM in Taxation, giving her exceptional depth in complex tax matters. She has structured over $500 million in estate plans and charitable giving strategies.",
    professionalSummary: "Minneapolis tax and estate planning attorney with 13 years of experience and an LLM in Taxation. Advises on wealth transfer, trust administration, and business succession. Over $500M in structured estate plans.",
    yearsExperience: 13,
    consultationRate: 8000,
    languages: ["English", "Swedish"],
    education: [
      { institution: "NYU School of Law", degree: "LLM in Taxation", year: 2013 },
      { institution: "University of Minnesota Law School", degree: "Juris Doctor", year: 2012 },
      { institution: "St. Olaf College", degree: "Bachelor of Arts in Economics", year: 2009 }
    ],
    previousFirms: [
      { name: "Lindgren Tax & Estate Law", role: "Founding Partner", years: "2019-Present" },
      { name: "Dorsey & Whitney LLP", role: "Tax Associate", years: "2013-2019" }
    ],
    certifications: [
      { name: "Certified Tax Law Specialist", issuer: "Minnesota State Bar Association", year: 2017 },
      { name: "Accredited Estate Planner", issuer: "National Association of Estate Planners & Councils", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 82,
  },
  {
    state: "MS",
    firstName: "Terrence",
    lastName: "Banks",
    title: "Personal Injury & Wrongful Death Attorney",
    specializations: ["Personal Injury", "Medical Malpractice", "Criminal Defense"],
    bio: "Terrence Banks is a passionate personal injury attorney in Jackson, Mississippi with 12 years of experience standing up for victims of negligence. He handles catastrophic injury cases, wrongful death claims, trucking accidents, and nursing home abuse. Terrence is a powerful trial advocate who has won several multi-million dollar verdicts in Mississippi courts. He is committed to holding corporations and institutions accountable when their negligence causes harm to everyday people.",
    professionalSummary: "Jackson, MS personal injury and wrongful death attorney with 12 years of experience. Specializes in catastrophic injuries, trucking accidents, and nursing home abuse. Multiple multi-million dollar verdicts.",
    yearsExperience: 12,
    consultationRate: 6000,
    languages: ["English"],
    education: [
      { institution: "Mississippi College School of Law", degree: "Juris Doctor", year: 2013 },
      { institution: "Jackson State University", degree: "Bachelor of Arts in Pre-Law", year: 2010 }
    ],
    previousFirms: [
      { name: "Banks Injury Attorneys", role: "Founding Partner", years: "2019-Present" },
      { name: "Pittman Germany Roberts & Welsh LLP", role: "Associate", years: "2013-2019" }
    ],
    certifications: [
      { name: "Civil Trial Specialist", issuer: "Mississippi Bar Association", year: 2018 },
      { name: "Trucking Litigation Specialist", issuer: "Academy of Truck Accident Attorneys", year: 2020 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.6,
    totalReviews: 97,
  },
  {
    state: "MO",
    firstName: "Jennifer",
    lastName: "Crawford",
    title: "Family Law & Juvenile Defense Attorney",
    specializations: ["Family Law", "Criminal Defense", "Civil Rights"],
    bio: "Jennifer Crawford is a compassionate family law attorney in Kansas City with 15 years of experience. She handles complex custody disputes, high-asset divorces, domestic violence cases, and adoption proceedings. Jennifer also represents juveniles in the Missouri juvenile justice system, advocating for rehabilitation over incarceration. She is a trained collaborative law practitioner and mediator who believes in resolving family disputes with dignity whenever possible.",
    professionalSummary: "Kansas City family law and juvenile defense attorney with 15 years of experience. Handles custody, divorce, domestic violence, adoption, and juvenile defense. Certified mediator and collaborative law practitioner.",
    yearsExperience: 15,
    consultationRate: 6000,
    languages: ["English", "Spanish"],
    education: [
      { institution: "University of Missouri-Kansas City School of Law", degree: "Juris Doctor", year: 2010 },
      { institution: "University of Missouri", degree: "Bachelor of Arts in Sociology", year: 2007 }
    ],
    previousFirms: [
      { name: "Crawford Family Law", role: "Managing Partner", years: "2016-Present" },
      { name: "Legal Aid of Western Missouri", role: "Staff Attorney", years: "2010-2016" }
    ],
    certifications: [
      { name: "Family Law Specialist", issuer: "Missouri Bar Association", year: 2015 },
      { name: "Certified Family Mediator", issuer: "Missouri Association of Mediators", year: 2014 }
    ],
    courtLevels: ["State"],
    rating: 4.7,
    totalReviews: 141,
  },
  {
    state: "MT",
    firstName: "Garrett",
    lastName: "Blackhawk",
    title: "Tribal & Natural Resources Attorney",
    specializations: ["Environmental Law", "Real Estate", "Civil Rights"],
    bio: "Garrett Blackhawk is a tribal and natural resources attorney in Billings, Montana with 8 years of experience. He represents tribal governments, Native American individuals, and ranchers on issues of tribal sovereignty, water rights, mineral rights, and federal land management. As a member of the Crow Nation, Garrett brings cultural knowledge and personal commitment to his advocacy for indigenous rights. He also handles general real estate and environmental matters across Montana.",
    professionalSummary: "Billings tribal and natural resources attorney with 8 years of experience. Specializes in tribal sovereignty, water rights, mineral rights, and federal land issues. Crow Nation member advocating for indigenous rights.",
    yearsExperience: 8,
    consultationRate: 5500,
    languages: ["English", "Crow"],
    education: [
      { institution: "University of Montana Alexander Blewett III School of Law", degree: "Juris Doctor, Indian Law Certificate", year: 2017 },
      { institution: "Montana State University", degree: "Bachelor of Science in Natural Resources", year: 2014 }
    ],
    previousFirms: [
      { name: "Blackhawk Law PLLC", role: "Founder", years: "2021-Present" },
      { name: "Native American Rights Fund", role: "Staff Attorney", years: "2017-2021" }
    ],
    certifications: [
      { name: "Federal Indian Law Certificate", issuer: "University of Montana", year: 2017 },
      { name: "Water Rights Specialist", issuer: "Montana Bar Association", year: 2020 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.5,
    totalReviews: 48,
  },
  {
    state: "NE",
    firstName: "Christine",
    lastName: "Mueller",
    title: "Immigration & Agricultural Labor Attorney",
    specializations: ["Immigration", "Employment Law", "Business & Contract"],
    bio: "Christine Mueller is a dedicated immigration attorney in Omaha with 12 years of experience serving Nebraska's immigrant communities and agricultural employers. She handles work visas (H-2A, H-2B), family petitions, DACA renewals, and removal defense. Christine also advises agricultural operations and meatpacking companies on I-9 compliance and labor law. Her bilingual practice bridges the gap between Nebraska's agricultural economy and its growing immigrant workforce.",
    professionalSummary: "Omaha immigration and agricultural labor attorney with 12 years of experience. Specializes in work visas, family petitions, removal defense, and agricultural labor compliance. Fluent in English and Spanish.",
    yearsExperience: 12,
    consultationRate: 5000,
    languages: ["English", "Spanish"],
    education: [
      { institution: "Creighton University School of Law", degree: "Juris Doctor", year: 2013 },
      { institution: "University of Nebraska-Lincoln", degree: "Bachelor of Arts in International Studies", year: 2010 }
    ],
    previousFirms: [
      { name: "Mueller Immigration Law", role: "Founder", years: "2019-Present" },
      { name: "Justice For Our Neighbors Nebraska", role: "Managing Attorney", years: "2013-2019" }
    ],
    certifications: [
      { name: "Board Certified Immigration Lawyer", issuer: "American Immigration Lawyers Association", year: 2018 },
      { name: "Agricultural Employment Law Certificate", issuer: "Nebraska State Bar", year: 2017 }
    ],
    courtLevels: ["Federal"],
    rating: 4.7,
    totalReviews: 112,
  },
  {
    state: "NV",
    firstName: "Victor",
    lastName: "Reyes",
    title: "Entertainment & Gaming Law Attorney",
    specializations: ["Business & Contract", "Real Estate", "Criminal Defense"],
    bio: "Victor Reyes is a Las Vegas entertainment and gaming law attorney with 16 years of experience in Nevada's unique legal landscape. He advises casinos, hospitality companies, entertainers, and nightlife venues on gaming license applications, entertainment contracts, liquor licensing, and regulatory compliance. Victor also handles criminal defense matters related to the hospitality industry. His deep connections in the Las Vegas business community make him a go-to attorney for entertainment ventures.",
    professionalSummary: "Las Vegas entertainment and gaming law attorney with 16 years of experience. Advises on gaming licenses, entertainment contracts, hospitality compliance, and regulatory matters. Deep Las Vegas business connections.",
    yearsExperience: 16,
    consultationRate: 8500,
    languages: ["English", "Spanish"],
    education: [
      { institution: "UNLV William S. Boyd School of Law", degree: "Juris Doctor, Gaming Law Concentration", year: 2009 },
      { institution: "University of Nevada, Reno", degree: "Bachelor of Science in Hotel Administration", year: 2006 }
    ],
    previousFirms: [
      { name: "Reyes Gaming & Entertainment Law", role: "Managing Partner", years: "2016-Present" },
      { name: "Lionel Sawyer & Collins", role: "Associate", years: "2009-2016" }
    ],
    certifications: [
      { name: "Gaming Law Specialist", issuer: "Nevada State Bar", year: 2014 },
      { name: "Entertainment Law Certificate", issuer: "UNLV Boyd School of Law", year: 2009 }
    ],
    courtLevels: ["State"],
    rating: 4.6,
    totalReviews: 86,
  },
  {
    state: "NH",
    firstName: "Margaret",
    lastName: "Whitmore",
    title: "Elder Law & Estate Planning Attorney",
    specializations: ["Estate Planning", "Real Estate", "Tax Law"],
    bio: "Margaret Whitmore is a caring elder law attorney in Concord, New Hampshire with 17 years of experience. She helps seniors and their families navigate Medicaid planning, long-term care planning, guardianship proceedings, and asset protection. Margaret is a certified elder law attorney who also handles wills, trusts, probate administration, and powers of attorney. Her warm, patient approach has earned her deep trust within New Hampshire's aging community.",
    professionalSummary: "Concord, NH elder law and estate planning attorney with 17 years of experience. Certified Elder Law Attorney specializing in Medicaid planning, guardianship, long-term care planning, and trust administration.",
    yearsExperience: 17,
    consultationRate: 6000,
    languages: ["English"],
    education: [
      { institution: "Franklin Pierce Law Center (now UNH Franklin Pierce School of Law)", degree: "Juris Doctor", year: 2008 },
      { institution: "Dartmouth College", degree: "Bachelor of Arts in English", year: 2005 }
    ],
    previousFirms: [
      { name: "Whitmore Elder Law", role: "Principal", years: "2014-Present" },
      { name: "Orr & Reno PA", role: "Associate", years: "2008-2014" }
    ],
    certifications: [
      { name: "Certified Elder Law Attorney", issuer: "National Elder Law Foundation", year: 2013 },
      { name: "Accredited Estate Planner", issuer: "National Association of Estate Planners & Councils", year: 2016 }
    ],
    courtLevels: ["State"],
    rating: 4.8,
    totalReviews: 73,
  },
  {
    state: "NJ",
    firstName: "Anthony",
    lastName: "Moretti",
    title: "Construction & Real Estate Litigation Attorney",
    specializations: ["Real Estate", "Business & Contract", "Employment Law"],
    bio: "Anthony Moretti is an aggressive construction and real estate litigation attorney in Newark with 21 years of experience. He represents contractors, developers, homeowners, and municipalities in construction defect claims, mechanic's lien disputes, zoning challenges, and commercial lease disagreements. Anthony has tried over 100 construction-related cases and is a sought-after arbitrator for the American Arbitration Association's Construction Industry Panel.",
    professionalSummary: "Newark construction and real estate litigation attorney with 21 years of experience. Handles construction defects, mechanic's liens, zoning, and commercial lease disputes. AAA Construction Panel arbitrator.",
    yearsExperience: 21,
    consultationRate: 8000,
    languages: ["English", "Italian"],
    education: [
      { institution: "Seton Hall University School of Law", degree: "Juris Doctor", year: 2004 },
      { institution: "Rutgers University", degree: "Bachelor of Science in Civil Engineering", year: 2001 }
    ],
    previousFirms: [
      { name: "Moretti Construction Law Group", role: "Senior Partner", years: "2012-Present" },
      { name: "Greenbaum Rowe Smith & Davis LLP", role: "Associate then Partner", years: "2004-2012" }
    ],
    certifications: [
      { name: "Construction Law Specialist", issuer: "New Jersey State Bar", year: 2011 },
      { name: "AAA Panel Arbitrator", issuer: "American Arbitration Association", year: 2014 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.7,
    totalReviews: 154,
  },
  {
    state: "NM",
    firstName: "Sofia",
    lastName: "Gallegos",
    title: "Indian Law & Water Rights Attorney",
    specializations: ["Environmental Law", "Civil Rights", "Real Estate"],
    bio: "Sofia Gallegos is an Indian law and water rights attorney in Albuquerque with 10 years of experience. She represents tribal nations, pueblos, and individuals in water rights adjudications, tribal governance matters, and cultural resource protection. Sofia is of Pueblo descent and is deeply committed to advancing tribal sovereignty and protecting sacred sites. Her environmental practice also covers mining reclamation, acequia water rights, and endangered species issues unique to New Mexico.",
    professionalSummary: "Albuquerque Indian law and water rights attorney with 10 years of experience. Represents tribal nations in water adjudications, sovereignty issues, and cultural resource protection. Pueblo descent, deeply rooted in NM communities.",
    yearsExperience: 10,
    consultationRate: 6500,
    languages: ["English", "Spanish"],
    education: [
      { institution: "University of New Mexico School of Law", degree: "Juris Doctor, Indian Law Certificate", year: 2015 },
      { institution: "University of New Mexico", degree: "Bachelor of Arts in Native American Studies", year: 2012 }
    ],
    previousFirms: [
      { name: "Gallegos & Associates", role: "Managing Attorney", years: "2021-Present" },
      { name: "Nordhaus Law Firm", role: "Associate", years: "2015-2021" }
    ],
    certifications: [
      { name: "Indian Law Certificate", issuer: "UNM School of Law", year: 2015 },
      { name: "Water Rights Specialist", issuer: "New Mexico State Bar", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.6,
    totalReviews: 61,
  },
  {
    state: "NY",
    firstName: "Rachel",
    lastName: "Goldstein",
    title: "Securities & White-Collar Defense Attorney",
    specializations: ["Criminal Defense", "Business & Contract", "Tax Law"],
    bio: "Rachel Goldstein is an elite securities and white-collar defense attorney in Manhattan with 19 years of experience. A former SEC enforcement attorney, she now represents executives, financial institutions, and hedge funds in securities fraud investigations, insider trading cases, FCPA enforcement actions, and complex financial litigation. Rachel has successfully defended clients in cases involving billions of dollars in alleged losses and has appeared before the Southern District of New York more than 150 times.",
    professionalSummary: "Manhattan securities and white-collar defense attorney with 19 years of experience. Former SEC enforcement attorney. Defends executives in securities fraud, insider trading, and FCPA actions. 150+ SDNY appearances.",
    yearsExperience: 19,
    consultationRate: 10000,
    languages: ["English", "Hebrew"],
    education: [
      { institution: "Columbia Law School", degree: "Juris Doctor", year: 2006 },
      { institution: "NYU Stern School of Business", degree: "Bachelor of Science in Finance", year: 2003 }
    ],
    previousFirms: [
      { name: "Goldstein White Collar Defense", role: "Named Partner", years: "2015-Present" },
      { name: "U.S. Securities and Exchange Commission", role: "Senior Counsel, Enforcement Division", years: "2006-2015" }
    ],
    certifications: [
      { name: "Securities Litigation Specialist", issuer: "New York State Bar Association", year: 2016 },
      { name: "Certified Fraud Examiner", issuer: "Association of Certified Fraud Examiners", year: 2012 }
    ],
    courtLevels: ["State", "Federal", "Appellate", "Supreme Court"],
    rating: 4.9,
    totalReviews: 124,
  },
  {
    state: "NC",
    firstName: "Marcus",
    lastName: "Patel",
    title: "Technology & Startup Law Attorney",
    specializations: ["Business & Contract", "Intellectual Property", "Employment Law"],
    bio: "Marcus Patel is a technology and startup attorney in Raleigh's Research Triangle with 11 years of experience. He advises tech startups and growth-stage companies on formation, venture capital financing, equity compensation, and intellectual property strategy. Marcus has helped over 200 startups close seed and Series A rounds totaling over $300 million. He also counsels established technology companies on SaaS agreements, data privacy compliance, and employee stock option plans.",
    professionalSummary: "Raleigh technology and startup attorney with 11 years of experience in Research Triangle. Advises on VC financing, IP strategy, SaaS agreements, and equity compensation. 200+ startups served, $300M+ in funding rounds.",
    yearsExperience: 11,
    consultationRate: 7500,
    languages: ["English", "Gujarati"],
    education: [
      { institution: "Duke University School of Law", degree: "Juris Doctor, Law and Entrepreneurship Certificate", year: 2014 },
      { institution: "NC State University", degree: "Bachelor of Science in Computer Science", year: 2011 }
    ],
    previousFirms: [
      { name: "Patel Tech Law", role: "Founding Partner", years: "2020-Present" },
      { name: "Hutchison PLLC", role: "Associate", years: "2014-2020" }
    ],
    certifications: [
      { name: "Technology Law Specialist", issuer: "North Carolina State Bar", year: 2019 },
      { name: "Certified Information Privacy Professional (CIPP/US)", issuer: "IAPP", year: 2021 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 93,
  },
  {
    state: "ND",
    firstName: "Karen",
    lastName: "Johanson",
    title: "Oil & Gas / Energy Law Attorney",
    specializations: ["Environmental Law", "Real Estate", "Business & Contract"],
    bio: "Karen Johanson is an oil and gas attorney in Bismarck with 14 years of experience in North Dakota's energy sector. She represents mineral rights owners, oil companies, and landmen in lease negotiations, royalty disputes, surface damage claims, and regulatory compliance with the North Dakota Industrial Commission. Karen has handled over 1,000 mineral title opinions and is considered a leading authority on Bakken Formation oil and gas law.",
    professionalSummary: "Bismarck oil and gas attorney with 14 years of experience in North Dakota's energy sector. Expert in mineral leasing, royalty disputes, surface damage claims, and NDIC regulatory compliance. 1,000+ mineral title opinions.",
    yearsExperience: 14,
    consultationRate: 6500,
    languages: ["English", "Norwegian"],
    education: [
      { institution: "University of North Dakota School of Law", degree: "Juris Doctor, Energy Law Concentration", year: 2011 },
      { institution: "North Dakota State University", degree: "Bachelor of Science in Geology", year: 2008 }
    ],
    previousFirms: [
      { name: "Johanson Energy Law", role: "Principal", years: "2018-Present" },
      { name: "Crowley Fleck PLLP", role: "Associate", years: "2011-2018" }
    ],
    certifications: [
      { name: "Oil & Gas Law Specialist", issuer: "State Bar Association of North Dakota", year: 2016 },
      { name: "Certified Mineral Manager", issuer: "American Association of Professional Landmen", year: 2014 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.5,
    totalReviews: 67,
  },
  {
    state: "OH",
    firstName: "Brian",
    lastName: "Williams",
    title: "Workers' Compensation & Employment Attorney",
    specializations: ["Employment Law", "Personal Injury", "Civil Rights"],
    bio: "Brian Williams is a workers' compensation and employment law attorney in Columbus with 17 years of experience. He represents injured workers in Ohio Bureau of Workers' Compensation claims, workplace discrimination cases, and OSHA violation disputes. Brian has handled over 2,500 workers' compensation claims and is known for his deep understanding of Ohio's unique workers' compensation system. He also represents workers in wrongful termination and wage and hour violations.",
    professionalSummary: "Columbus workers' compensation and employment attorney with 17 years of experience. Over 2,500 BWC claims handled. Expert in Ohio's workers' compensation system, OSHA disputes, and employment discrimination.",
    yearsExperience: 17,
    consultationRate: 5500,
    languages: ["English"],
    education: [
      { institution: "Ohio State University Moritz College of Law", degree: "Juris Doctor", year: 2008 },
      { institution: "Ohio University", degree: "Bachelor of Arts in Labor Relations", year: 2005 }
    ],
    previousFirms: [
      { name: "Williams Workers' Rights Law", role: "Senior Partner", years: "2014-Present" },
      { name: "Mazanec Raskin & Ryder Co. LPA", role: "Associate", years: "2008-2014" }
    ],
    certifications: [
      { name: "Ohio Workers' Compensation Specialist", issuer: "Ohio State Bar Association", year: 2013 },
      { name: "Employment Law Specialist", issuer: "Ohio State Bar Association", year: 2016 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.6,
    totalReviews: 178,
  },
  {
    state: "OK",
    firstName: "Linda",
    lastName: "Redhawk",
    title: "Tribal Law & Energy Attorney",
    specializations: ["Civil Rights", "Environmental Law", "Business & Contract"],
    bio: "Linda Redhawk is a tribal law and energy attorney in Oklahoma City with 13 years of experience. She advises tribal governments, tribal enterprises, and individual tribal members on sovereignty issues, gaming compacts, energy development on tribal lands, and ICWA (Indian Child Welfare Act) matters. As a member of the Choctaw Nation, Linda combines legal expertise with cultural understanding. She also handles environmental compliance for oil and gas operations on tribal and allotted lands.",
    professionalSummary: "Oklahoma City tribal law and energy attorney with 13 years of experience. Advises on tribal sovereignty, gaming compacts, ICWA, and energy development on tribal lands. Choctaw Nation member.",
    yearsExperience: 13,
    consultationRate: 6000,
    languages: ["English", "Choctaw"],
    education: [
      { institution: "University of Oklahoma College of Law", degree: "Juris Doctor", year: 2012 },
      { institution: "Northeastern State University", degree: "Bachelor of Arts in Tribal Administration", year: 2009 }
    ],
    previousFirms: [
      { name: "Redhawk Legal Services", role: "Founder", years: "2018-Present" },
      { name: "Hobbs Straus Dean & Walker LLP", role: "Associate", years: "2012-2018" }
    ],
    certifications: [
      { name: "Indian Law Specialist", issuer: "Oklahoma Bar Association", year: 2017 },
      { name: "Energy Law Certificate", issuer: "University of Oklahoma College of Law", year: 2012 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.7,
    totalReviews: 76,
  },
  {
    state: "OR",
    firstName: "Matthew",
    lastName: "Taniguchi",
    title: "Land Use & Environmental Attorney",
    specializations: ["Environmental Law", "Real Estate", "Business & Contract"],
    bio: "Matthew Taniguchi is a land use and environmental attorney in Portland with 15 years of experience navigating Oregon's unique land use planning system. He represents developers, homeowners, and environmental organizations before local planning commissions, LUBA (Land Use Board of Appeals), and state courts. Matthew has deep expertise in Oregon's Urban Growth Boundary regulations, Measure 37/49 claims, and wetland mitigation banking. He is also experienced in green building law and sustainable development.",
    professionalSummary: "Portland land use and environmental attorney with 15 years of experience. Expert in Oregon's UGB regulations, LUBA appeals, wetland mitigation, and sustainable development law. Represents developers and conservation groups.",
    yearsExperience: 15,
    consultationRate: 7000,
    languages: ["English", "Japanese"],
    education: [
      { institution: "Lewis & Clark Law School", degree: "Juris Doctor, Environmental Law Concentration", year: 2010 },
      { institution: "University of Oregon", degree: "Bachelor of Science in Environmental Science", year: 2007 }
    ],
    previousFirms: [
      { name: "Taniguchi Land Use Law", role: "Managing Partner", years: "2017-Present" },
      { name: "Ball Janik LLP", role: "Associate", years: "2010-2017" }
    ],
    certifications: [
      { name: "Land Use Law Specialist", issuer: "Oregon State Bar", year: 2015 },
      { name: "LEED Accredited Professional", issuer: "U.S. Green Building Council", year: 2013 }
    ],
    courtLevels: ["State"],
    rating: 4.7,
    totalReviews: 88,
  },
  {
    state: "PA",
    firstName: "Maria",
    lastName: "DiStefano",
    title: "Medical Malpractice & Birth Injury Attorney",
    specializations: ["Medical Malpractice", "Personal Injury", "Civil Rights"],
    bio: "Maria DiStefano is a formidable medical malpractice attorney in Philadelphia with 23 years of experience. She focuses on catastrophic medical errors, birth injuries, surgical malpractice, and failure to diagnose cases. Maria has recovered over $250 million for victims of medical negligence and has tried over 75 jury trials to verdict. A former registered nurse, she brings unique medical insight to every case and works with leading medical experts nationwide to build compelling arguments.",
    professionalSummary: "Philadelphia medical malpractice attorney with 23 years of experience. Former registered nurse. Over $250M recovered. Specializes in birth injuries, surgical errors, and diagnostic failures. 75+ jury trials.",
    yearsExperience: 23,
    consultationRate: 9500,
    languages: ["English", "Italian"],
    education: [
      { institution: "Temple University Beasley School of Law", degree: "Juris Doctor", year: 2002 },
      { institution: "University of Pittsburgh", degree: "Bachelor of Science in Nursing", year: 1996 }
    ],
    previousFirms: [
      { name: "DiStefano Medical Malpractice Law", role: "Senior Partner", years: "2010-Present" },
      { name: "Kline & Specter PC", role: "Associate then Partner", years: "2002-2010" }
    ],
    certifications: [
      { name: "Board Certified Civil Trial Advocate", issuer: "National Board of Trial Advocacy", year: 2008 },
      { name: "Registered Nurse (Inactive)", issuer: "Pennsylvania State Board of Nursing", year: 1996 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.9,
    totalReviews: 198,
  },
  {
    state: "RI",
    firstName: "Timothy",
    lastName: "Correia",
    title: "DUI & Criminal Defense Attorney",
    specializations: ["DUI/DWI", "Criminal Defense", "Personal Injury"],
    bio: "Timothy Correia is Rhode Island's leading DUI defense attorney in Providence with 12 years of focused experience. He exclusively handles DUI/DWI cases, including first offenses, felony DUI, refusal cases, and commercial driver violations. Timothy is one of only a handful of attorneys in Rhode Island certified in standardized field sobriety testing and Intoxilyzer operation. His deep technical knowledge of breath testing and blood analysis has resulted in hundreds of successful case dismissals and acquittals.",
    professionalSummary: "Providence DUI and criminal defense attorney with 12 years of exclusive DUI defense experience. Certified in field sobriety testing and Intoxilyzer operation. Hundreds of successful dismissals and acquittals.",
    yearsExperience: 12,
    consultationRate: 6500,
    languages: ["English", "Portuguese"],
    education: [
      { institution: "Roger Williams University School of Law", degree: "Juris Doctor", year: 2013 },
      { institution: "Providence College", degree: "Bachelor of Arts in Criminal Justice", year: 2010 }
    ],
    previousFirms: [
      { name: "Correia DUI Defense", role: "Founding Attorney", years: "2018-Present" },
      { name: "Rhode Island Public Defender's Office", role: "Assistant Public Defender", years: "2013-2018" }
    ],
    certifications: [
      { name: "DUI Defense Specialist", issuer: "National College for DUI Defense", year: 2017 },
      { name: "Standardized Field Sobriety Test Practitioner", issuer: "NHTSA", year: 2015 }
    ],
    courtLevels: ["State"],
    rating: 4.6,
    totalReviews: 165,
  },
  {
    state: "SC",
    firstName: "Jasmine",
    lastName: "Coleman",
    title: "Family & Domestic Violence Attorney",
    specializations: ["Family Law", "Criminal Defense", "Civil Rights"],
    bio: "Jasmine Coleman is a devoted family law attorney in Charleston with 10 years of experience. She handles divorce, custody, child support, and protection orders throughout South Carolina. Jasmine is particularly recognized for her work with domestic violence survivors, helping them navigate protective orders, safety planning, and divorce proceedings simultaneously. She volunteers extensively with the Charleston Legal Access Center and has provided free legal services to over 300 domestic violence survivors.",
    professionalSummary: "Charleston family and domestic violence attorney with 10 years of experience. Specializes in divorce, custody, and domestic violence protection orders. Over 300 DV survivors served through pro bono work.",
    yearsExperience: 10,
    consultationRate: 5000,
    languages: ["English"],
    education: [
      { institution: "Charleston School of Law", degree: "Juris Doctor", year: 2015 },
      { institution: "College of Charleston", degree: "Bachelor of Arts in Women's and Gender Studies", year: 2012 }
    ],
    previousFirms: [
      { name: "Coleman Family Law", role: "Owner", years: "2020-Present" },
      { name: "South Carolina Legal Services", role: "Staff Attorney", years: "2015-2020" }
    ],
    certifications: [
      { name: "Family Court Specialist", issuer: "South Carolina Bar", year: 2019 },
      { name: "Domestic Violence Legal Advocacy Certificate", issuer: "National Network to End Domestic Violence", year: 2017 }
    ],
    courtLevels: ["State"],
    rating: 4.8,
    totalReviews: 104,
  },
  {
    state: "SD",
    firstName: "Andrew",
    lastName: "Jensen",
    title: "Agricultural & Real Property Attorney",
    specializations: ["Real Estate", "Business & Contract", "Estate Planning"],
    bio: "Andrew Jensen is an agricultural and real property attorney in Sioux Falls with 16 years of experience serving South Dakota's farming and ranching communities. He handles farm and ranch transactions, agricultural leases, conservation reserve program contracts, and estate planning for multi-generational family operations. Andrew also advises rural communities on wind energy easements and broadband infrastructure agreements. Growing up on a cattle ranch gives him practical insight into his clients' operations.",
    professionalSummary: "Sioux Falls agricultural and real property attorney with 16 years of experience. Handles farm transactions, agricultural leases, CRP contracts, and multi-generational estate planning. Raised on a SD cattle ranch.",
    yearsExperience: 16,
    consultationRate: 4500,
    languages: ["English"],
    education: [
      { institution: "University of South Dakota Knudson School of Law", degree: "Juris Doctor", year: 2009 },
      { institution: "South Dakota State University", degree: "Bachelor of Science in Agricultural Business", year: 2006 }
    ],
    previousFirms: [
      { name: "Jensen Rural Law", role: "Principal", years: "2015-Present" },
      { name: "Davenport Evans Hurwitz & Smith LLP", role: "Associate", years: "2009-2015" }
    ],
    certifications: [
      { name: "Agricultural Law Specialist", issuer: "South Dakota Bar Association", year: 2014 },
      { name: "Certified Wind Energy Easement Advisor", issuer: "Farmers' Legal Action Group", year: 2018 }
    ],
    courtLevels: ["State"],
    rating: 4.5,
    totalReviews: 58,
  },
  {
    state: "TN",
    firstName: "Denise",
    lastName: "Harper",
    title: "Entertainment & Music Law Attorney",
    specializations: ["Intellectual Property", "Business & Contract", "Employment Law"],
    bio: "Denise Harper is Nashville's go-to entertainment and music law attorney with 14 years of experience in Music City. She represents songwriters, recording artists, producers, music publishers, and record labels on recording contracts, publishing agreements, synchronization licenses, and royalty disputes. Denise has negotiated over $100 million in music industry deals and is a trusted voice in Nashville's creative community. She also handles trademark protection for entertainment brands.",
    professionalSummary: "Nashville entertainment and music law attorney with 14 years of experience. Represents artists, publishers, and labels on recording contracts, publishing deals, and royalty disputes. Over $100M in negotiated deals.",
    yearsExperience: 14,
    consultationRate: 8000,
    languages: ["English"],
    education: [
      { institution: "Vanderbilt University Law School", degree: "Juris Doctor", year: 2011 },
      { institution: "Belmont University", degree: "Bachelor of Business Administration in Music Business", year: 2008 }
    ],
    previousFirms: [
      { name: "Harper Music Law", role: "Managing Partner", years: "2018-Present" },
      { name: "Loeb & Loeb LLP (Nashville)", role: "Associate", years: "2011-2018" }
    ],
    certifications: [
      { name: "Entertainment Law Specialist", issuer: "Tennessee Bar Association", year: 2016 },
      { name: "Certified Licensing Professional", issuer: "Licensing Executives Society", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 109,
  },
  {
    state: "TX",
    firstName: "Samuel",
    lastName: "Guerrero",
    title: "Oil & Gas / Energy Litigation Attorney",
    specializations: ["Environmental Law", "Business & Contract", "Real Estate"],
    bio: "Samuel Guerrero is a powerhouse oil and gas litigation attorney in Houston with 22 years of experience in Texas energy law. He represents energy companies, mineral rights owners, and royalty interest holders in complex disputes involving lease terminations, pooling and unitization, pipeline easements, and environmental contamination. Samuel has handled over $1 billion in energy-related litigation and is frequently called as an expert witness on Texas oil and gas law.",
    professionalSummary: "Houston oil and gas litigation attorney with 22 years of experience. Over $1B in energy disputes handled. Expert in lease termination, pooling, pipeline easements, and environmental contamination claims.",
    yearsExperience: 22,
    consultationRate: 10000,
    languages: ["English", "Spanish"],
    education: [
      { institution: "University of Texas School of Law", degree: "Juris Doctor", year: 2003 },
      { institution: "Texas A&M University", degree: "Bachelor of Science in Petroleum Engineering", year: 2000 }
    ],
    previousFirms: [
      { name: "Guerrero Energy Law", role: "Senior Partner", years: "2012-Present" },
      { name: "Baker Botts LLP", role: "Associate then Counsel", years: "2003-2012" }
    ],
    certifications: [
      { name: "Oil Gas & Mineral Law Specialist", issuer: "Texas Board of Legal Specialization", year: 2010 },
      { name: "Professional Engineer (Inactive)", issuer: "Texas Board of Professional Engineers", year: 2000 }
    ],
    courtLevels: ["State", "Federal", "Appellate"],
    rating: 4.9,
    totalReviews: 167,
  },
  {
    state: "UT",
    firstName: "Megan",
    lastName: "Sorensen",
    title: "Adoption & Family Formation Attorney",
    specializations: ["Family Law", "Immigration", "Estate Planning"],
    bio: "Megan Sorensen is a warm and experienced adoption and family formation attorney in Salt Lake City with 11 years of practice. She handles domestic adoptions, international adoptions, surrogacy agreements, and foster-to-adopt cases across Utah. Megan also assists LGBTQ+ families with second-parent adoptions and legal recognition. Her immigration expertise allows her to navigate complex intercountry adoption procedures. Megan's personal experience as an adoptive mother fuels her dedication to helping families grow.",
    professionalSummary: "Salt Lake City adoption and family formation attorney with 11 years of experience. Handles domestic, international, and foster adoptions, surrogacy agreements, and LGBTQ+ family formation. Adoptive mother herself.",
    yearsExperience: 11,
    consultationRate: 6000,
    languages: ["English", "Korean"],
    education: [
      { institution: "S.J. Quinney College of Law, University of Utah", degree: "Juris Doctor", year: 2014 },
      { institution: "Brigham Young University", degree: "Bachelor of Arts in Social Work", year: 2011 }
    ],
    previousFirms: [
      { name: "Sorensen Adoption Law", role: "Founder", years: "2019-Present" },
      { name: "Kirton McConkie", role: "Associate", years: "2014-2019" }
    ],
    certifications: [
      { name: "Adoption Law Specialist", issuer: "American Academy of Adoption & Assisted Reproduction Attorneys", year: 2018 },
      { name: "Hague Convention Certified", issuer: "U.S. Department of State", year: 2017 }
    ],
    courtLevels: ["State"],
    rating: 4.9,
    totalReviews: 87,
  },
  {
    state: "VT",
    firstName: "Philip",
    lastName: "Carpenter",
    title: "Land Conservation & Nonprofit Attorney",
    specializations: ["Environmental Law", "Real Estate", "Tax Law"],
    bio: "Philip Carpenter is a land conservation and nonprofit attorney in Burlington, Vermont with 13 years of experience. He advises land trusts, conservation organizations, and nonprofit entities on conservation easement drafting, tax-exempt status, and charitable giving. Philip has helped conserve over 20,000 acres of Vermont farmland and forestland. His practice also covers nonprofit formation and governance, foundation compliance, and agricultural preservation programs.",
    professionalSummary: "Burlington land conservation and nonprofit attorney with 13 years of experience. Specializes in conservation easements, nonprofit governance, and charitable tax law. Over 20,000 acres of Vermont land conserved.",
    yearsExperience: 13,
    consultationRate: 5500,
    languages: ["English", "French"],
    education: [
      { institution: "Vermont Law School", degree: "Juris Doctor, Environmental Law Concentration", year: 2012 },
      { institution: "Middlebury College", degree: "Bachelor of Arts in Environmental Studies", year: 2009 }
    ],
    previousFirms: [
      { name: "Carpenter Conservation Law", role: "Owner", years: "2018-Present" },
      { name: "Vermont Land Trust", role: "General Counsel", years: "2012-2018" }
    ],
    certifications: [
      { name: "Conservation Easement Specialist", issuer: "Land Trust Alliance", year: 2015 },
      { name: "Nonprofit Law Certificate", issuer: "Vermont Bar Association", year: 2017 }
    ],
    courtLevels: ["State"],
    rating: 4.6,
    totalReviews: 44,
  },
  {
    state: "VA",
    firstName: "Nadia",
    lastName: "Khoury",
    title: "National Security & Government Contracts Attorney",
    specializations: ["Business & Contract", "Employment Law", "Criminal Defense"],
    bio: "Nadia Khoury is a national security and government contracts attorney in Arlington, Virginia with 16 years of experience. She advises defense contractors, technology companies, and cleared personnel on security clearance adjudications, ITAR/EAR export control compliance, and government contract disputes. Nadia holds an active Top Secret/SCI clearance and has represented hundreds of individuals in security clearance hearings before DOHA. Her practice also covers bid protests and False Claims Act defense.",
    professionalSummary: "Arlington national security and government contracts attorney with 16 years of experience. Expert in security clearances, export controls, government contracts, and bid protests. Active TS/SCI clearance holder.",
    yearsExperience: 16,
    consultationRate: 8500,
    languages: ["English", "Arabic"],
    education: [
      { institution: "George Washington University Law School", degree: "Juris Doctor, Government Contracts Concentration", year: 2009 },
      { institution: "Georgetown University", degree: "Bachelor of Science in Foreign Service", year: 2006 }
    ],
    previousFirms: [
      { name: "Khoury National Security Law", role: "Managing Partner", years: "2017-Present" },
      { name: "Arent Fox LLP", role: "Associate then Senior Associate", years: "2009-2017" }
    ],
    certifications: [
      { name: "Government Contracts Specialist", issuer: "Virginia State Bar", year: 2015 },
      { name: "Certified ITAR Compliance Officer", issuer: "Society for International Affairs", year: 2013 }
    ],
    courtLevels: ["Federal", "Appellate"],
    rating: 4.8,
    totalReviews: 91,
  },
  {
    state: "WA",
    firstName: "Derek",
    lastName: "Nakamura",
    title: "Technology & Privacy Law Attorney",
    specializations: ["Intellectual Property", "Business & Contract", "Employment Law"],
    bio: "Derek Nakamura is a cutting-edge technology and privacy law attorney in Seattle with 12 years of experience. He advises major tech companies, SaaS providers, and AI startups on data privacy compliance (GDPR, CCPA, WPA), software licensing, open source governance, and technology transactions. Derek has negotiated hundreds of enterprise SaaS agreements and led data privacy programs for companies with millions of users. He is a thought leader on AI regulation and emerging technology law.",
    professionalSummary: "Seattle technology and privacy attorney with 12 years of experience. Advises on GDPR/CCPA compliance, SaaS licensing, AI governance, and open source law. Serves major tech companies and AI startups.",
    yearsExperience: 12,
    consultationRate: 9000,
    languages: ["English", "Japanese"],
    education: [
      { institution: "University of Washington School of Law", degree: "Juris Doctor, Technology Law Certificate", year: 2013 },
      { institution: "University of Washington", degree: "Bachelor of Science in Informatics", year: 2010 }
    ],
    previousFirms: [
      { name: "Nakamura Tech Law", role: "Founding Partner", years: "2020-Present" },
      { name: "Perkins Coie LLP", role: "Associate then Of Counsel", years: "2013-2020" }
    ],
    certifications: [
      { name: "Certified Information Privacy Professional (CIPP/US)", issuer: "IAPP", year: 2016 },
      { name: "Certified Information Privacy Manager (CIPM)", issuer: "IAPP", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.8,
    totalReviews: 106,
  },
  {
    state: "WV",
    firstName: "Roger",
    lastName: "Braxton",
    title: "Coal Mining & Workers' Compensation Attorney",
    specializations: ["Employment Law", "Personal Injury", "Environmental Law"],
    bio: "Roger Braxton is a coal mining and workers' compensation attorney in Charleston, West Virginia with 20 years of experience. He represents coal miners and industrial workers suffering from black lung disease, mining injuries, and toxic exposure. Roger has secured millions in benefits for miners through the Federal Black Lung Benefits Program and state workers' compensation claims. A son of a coal miner himself, Roger is deeply committed to protecting the rights of working families in Appalachia.",
    professionalSummary: "Charleston coal mining and workers' comp attorney with 20 years of experience. Expert in black lung benefits, mining injuries, and toxic exposure claims. Son of a coal miner, dedicated to Appalachian workers' rights.",
    yearsExperience: 20,
    consultationRate: 5000,
    languages: ["English"],
    education: [
      { institution: "West Virginia University College of Law", degree: "Juris Doctor", year: 2005 },
      { institution: "Marshall University", degree: "Bachelor of Arts in Political Science", year: 2002 }
    ],
    previousFirms: [
      { name: "Braxton Mining Law", role: "Senior Partner", years: "2012-Present" },
      { name: "Appalachian Citizens' Law Center", role: "Staff Attorney", years: "2005-2012" }
    ],
    certifications: [
      { name: "Federal Black Lung Benefits Specialist", issuer: "Department of Labor", year: 2009 },
      { name: "Mine Safety & Health Law Certificate", issuer: "WVU College of Law", year: 2005 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.7,
    totalReviews: 132,
  },
  {
    state: "WI",
    firstName: "Heather",
    lastName: "Schmidt",
    title: "Insurance & Bad Faith Litigation Attorney",
    specializations: ["Personal Injury", "Business & Contract", "Employment Law"],
    bio: "Heather Schmidt is a tenacious insurance and bad faith litigation attorney in Milwaukee with 14 years of experience. She represents policyholders against insurance companies that wrongfully deny, delay, or undervalue claims. Heather has recovered over $60 million for clients in insurance bad faith cases, first-party property claims, and underinsured motorist disputes. She also handles complex personal injury cases and commercial insurance coverage disputes for small businesses.",
    professionalSummary: "Milwaukee insurance bad faith and personal injury attorney with 14 years of experience. Over $60M recovered against insurance companies. Handles bad faith, property claims, UIM, and commercial coverage disputes.",
    yearsExperience: 14,
    consultationRate: 7000,
    languages: ["English", "German"],
    education: [
      { institution: "University of Wisconsin Law School", degree: "Juris Doctor", year: 2011 },
      { institution: "Marquette University", degree: "Bachelor of Arts in Communication Studies", year: 2008 }
    ],
    previousFirms: [
      { name: "Schmidt Insurance Litigation", role: "Managing Partner", years: "2018-Present" },
      { name: "Quarles & Brady LLP", role: "Associate", years: "2011-2018" }
    ],
    certifications: [
      { name: "Insurance Law Specialist", issuer: "Wisconsin State Bar", year: 2016 },
      { name: "Certified Insurance Coverage Litigator", issuer: "DRI (Defense Research Institute)", year: 2019 }
    ],
    courtLevels: ["State", "Federal"],
    rating: 4.7,
    totalReviews: 113,
  },
  {
    state: "WY",
    firstName: "Tyler",
    lastName: "Bridger",
    title: "Ranch & Western Water Law Attorney",
    specializations: ["Real Estate", "Environmental Law", "Business & Contract"],
    bio: "Tyler Bridger is a ranch and western water law attorney in Cheyenne with 9 years of experience serving Wyoming's ranching and agricultural communities. He handles ranch purchases and sales, grazing permits, water rights transfers, and conservation easements on working ranches. Tyler also advises on mineral rights severance, wind and solar energy leases, and public land access disputes. A lifelong Wyoming resident and avid rancher, Tyler understands the unique legal needs of the West.",
    professionalSummary: "Cheyenne ranch and water law attorney with 9 years of experience. Handles ranch transactions, grazing permits, water rights, mineral rights, and renewable energy leases on agricultural land. Lifelong Wyoming resident.",
    yearsExperience: 9,
    consultationRate: 4500,
    languages: ["English"],
    education: [
      { institution: "University of Wyoming College of Law", degree: "Juris Doctor, Natural Resources Certificate", year: 2016 },
      { institution: "University of Wyoming", degree: "Bachelor of Science in Rangeland Ecology", year: 2013 }
    ],
    previousFirms: [
      { name: "Bridger Ranch Law", role: "Owner", years: "2021-Present" },
      { name: "Hirst Applegate LLP", role: "Associate", years: "2016-2021" }
    ],
    certifications: [
      { name: "Water Law Specialist", issuer: "Wyoming State Bar", year: 2020 },
      { name: "Certified Ranch Real Estate Specialist", issuer: "Realtors Land Institute", year: 2019 }
    ],
    courtLevels: ["State"],
    rating: 4.5,
    totalReviews: 41,
  },
];

// ── Seed function ──

async function main() {
  console.log("Seeding 50 detailed test lawyers (one per state, all OFFLINE)...\n");

  // Delete existing seed lawyers first (by clerkId pattern)
  const existingSeedUsers = await prisma.user.findMany({
    where: { clerkId: { startsWith: "seed_lawyer_" } },
    select: { id: true, clerkId: true },
  });

  if (existingSeedUsers.length > 0) {
    console.log(`  Cleaning up ${existingSeedUsers.length} existing seed lawyers...`);
    // Delete lawyer profiles first (cascade should handle this, but be explicit)
    await prisma.lawyerProfile.deleteMany({
      where: { userId: { in: existingSeedUsers.map((u) => u.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: existingSeedUsers.map((u) => u.id) } },
    });
    console.log("  Cleanup complete.\n");
  }

  const created = [];

  for (let i = 0; i < LAWYERS.length; i++) {
    const l = LAWYERS[i];
    const index = i + 1;
    const paddedIndex = String(index).padStart(3, "0");
    const email = `lawyer.${l.firstName.toLowerCase()}.${l.lastName.toLowerCase()}@testlaw.com`;
    const clerkId = `seed_lawyer_${paddedIndex}`;
    const barNumber = `${l.state}-${String(100000 + index)}`;
    const phone = `+1${String(2000000000 + index)}`;

    try {
      const user = await prisma.user.create({
        data: {
          clerkId,
          email,
          firstName: l.firstName,
          lastName: l.lastName,
          phone,
          role: "LAWYER",
          isVerified: true,
        },
      });

      await prisma.lawyerProfile.create({
        data: {
          userId: user.id,
          barNumber,
          licenseState: l.state,
          title: l.title,
          specializations: l.specializations,
          bio: l.bio,
          professionalSummary: l.professionalSummary,
          yearsExperience: l.yearsExperience,
          consultationRate: l.consultationRate,
          languages: l.languages,
          isAvailable: true,
          onlineStatus: "offline",
          rating: l.rating,
          totalReviews: l.totalReviews,
          courtLevels: l.courtLevels,
          education: l.education,
          previousFirms: l.previousFirms,
          certifications: l.certifications,
          verificationStatus: "VERIFIED",
          linkedInUrl: `https://linkedin.com/in/${l.firstName.toLowerCase()}-${l.lastName.toLowerCase()}-esq`,
        },
      });

      created.push(`${l.firstName} ${l.lastName}`);
      console.log(
        `  [${index}/50] ${l.firstName} ${l.lastName} — ${l.state} — ${l.title} — ${l.specializations.join(", ")}`
      );
    } catch (err) {
      console.error(
        `  [${index}/50] SKIP: ${l.firstName} ${l.lastName} — ${err.message}`
      );
    }
  }

  console.log(`\nDone! Created ${created.length} detailed test lawyers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
