/**
 * US State normalization utility.
 * Ensures all state values are stored as 2-letter abbreviations in the database.
 */

const STATE_MAP = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// Reverse map: "california" → "CA", etc.
const STATE_REVERSE = Object.fromEntries(
  Object.entries(STATE_MAP).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

/**
 * Convert any state input (abbreviation or full name) to its 2-letter abbreviation.
 * Returns the input unchanged if it can't be mapped (e.g. null, empty, unknown).
 *
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeStateToAbbr(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();

  // Already an abbreviation
  if (upper.length <= 3 && STATE_MAP[upper]) {
    return upper;
  }

  // Full name → abbreviation
  const abbr = STATE_REVERSE[trimmed.toLowerCase()];
  if (abbr) return abbr;

  // Unknown — return as-is so validation can catch it
  return trimmed;
}

/**
 * Returns both abbreviation and full name for a state input,
 * useful for Prisma queries that need to match either format.
 *
 * @param {string|null|undefined} input
 * @returns {string[]}
 */
export function getStateVariants(input) {
  if (!input) return [];
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  if (upper.length <= 3 && STATE_MAP[upper]) {
    return [upper, STATE_MAP[upper]];
  }

  const abbr = STATE_REVERSE[trimmed.toLowerCase()];
  if (abbr) {
    return [abbr, STATE_MAP[abbr]];
  }

  return [trimmed];
}

/**
 * Build a Prisma where clause that matches a licenseState field
 * against all variants of a state string, case-insensitively.
 */
export function stateMatchesLicenseState(state) {
  if (!state) return {};
  const variants = getStateVariants(state);
  if (variants.length === 0) return {};
  return {
    OR: variants.map((v) => ({
      licenseState: { equals: v, mode: "insensitive" },
    })),
  };
}
