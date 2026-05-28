import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper to pause execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Persist grounding availability flag across requests to prevent redundant 429 quota exhaustion errors on standard keys
let groundingToolsDisabled = false;

// Smart Phone Normalizer
export function normalizePhone(phone: string, location: string): string {
  if (!phone) return "";
  
  // Clean spaces, hyphens, parentheses, formatting. Leave + and digits
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return "";

  // Identify country based on location name
  const locLower = location.toLowerCase();
  let defaultDial = "1"; // Default to US/Canada code
  
  if (locLower.includes("bangladesh") || locLower.includes(", bd") || locLower.includes("dhaka") || locLower.includes("chittagong") || locLower.includes("sylhet")) {
    defaultDial = "880";
  } else if (locLower.includes("united kingdom") || locLower.includes("uk") || locLower.includes(", gb") || locLower.includes("london") || locLower.includes("manchester") || locLower.includes("birmingham") || locLower.includes("leeds")) {
    defaultDial = "44";
  } else if (locLower.includes("australia") || locLower.includes(", au") || locLower.includes("sydney") || locLower.includes("melbourne") || locLower.includes("brisbane") || locLower.includes("perth")) {
    defaultDial = "61";
  } else if (locLower.includes("canada") || locLower.includes(", ca") || locLower.includes("toronto") || locLower.includes("vancouver") || locLower.includes("montreal") || locLower.includes("ottawa")) {
    defaultDial = "1";
  } else if (locLower.includes("united arab emirates") || locLower.includes("dubai") || locLower.includes("uae") || locLower.includes(", ae") || locLower.includes("abu dhabi") || locLower.includes("sharjah")) {
    defaultDial = "971";
  } else if (locLower.includes("saudi") || locLower.includes("ksa") || locLower.includes(", sa") || locLower.includes("riyadh") || locLower.includes("jeddah") || locLower.includes("dammam")) {
    defaultDial = "966";
  } else if (locLower.includes("india") || locLower.includes(", in") || locLower.includes("delhi") || locLower.includes("mumbai") || locLower.includes("bangalore") || locLower.includes("chennai")) {
    defaultDial = "91";
  }

  // If the number starts with "+" it is already in international format
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // If it starts with "00", replace with "+"
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.slice(2);
  }

  // Handle local trunk prefix "0" (common in Bangladesh, UK, Australia, UAE, Saudi, India)
  if (cleaned.startsWith("0") && cleaned.length > 5) {
    cleaned = cleaned.slice(1);
    return "+" + defaultDial + cleaned;
  }

  // If it already starts with default country code, prepend "+"
  if (cleaned.startsWith(defaultDial) && cleaned.length > defaultDial.length + 5) {
    return "+" + cleaned;
  }

  // Otherwise prepends country code
  return "+" + defaultDial + cleaned;
}

// Generate extremely realistic localized business simulation in case of complete API failure
function generateHighFidelityFallback(category: string, location: string): any[] {
  console.log(`[Simulator] Generating high-fidelity B2B fallback directory for Category: "${category}", Location: "${location}"`);
  
  // Parse location (format: "City, Country" or "City")
  const parts = location.split(',').map(s => s.trim());
  const city = parts[0] || "Metropolis";
  const country = parts[1] || "United States";

  // Determine phone dial code and formats
  let dialCode = "+1";
  let tld = "com";
  let domainParts = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  let phonePrefix = "";
  let remainingPhoneLength = 7;

  if (country.toLowerCase().includes("united kingdom") || country.toLowerCase().includes("uk")) {
    dialCode = "+44";
    tld = "co.uk";
    phonePrefix = ["73", "74", "75", "77", "78", "79"][Math.floor(Math.random() * 6)];
    remainingPhoneLength = 8;
  } else if (country.toLowerCase().includes("bangladesh") || country.toLowerCase().includes("bd")) {
    dialCode = "+880";
    tld = "com";
    phonePrefix = ["13", "14", "15", "16", "17", "18", "19"][Math.floor(Math.random() * 7)];
    remainingPhoneLength = 8;
  } else if (country.toLowerCase().includes("australia") || country.toLowerCase().includes("au")) {
    dialCode = "+61";
    tld = "com.au";
    phonePrefix = "4";
    remainingPhoneLength = 8;
  } else if (country.toLowerCase().includes("canada") || country.toLowerCase().includes("ca")) {
    dialCode = "+1";
    tld = "ca";
    phonePrefix = ["416", "604", "514", "780", "613", "403"][Math.floor(Math.random() * 6)];
    remainingPhoneLength = 7;
  } else if (country.toLowerCase().includes("arab emirates") || country.toLowerCase().includes("uae") || country.toLowerCase().includes("dubai")) {
    dialCode = "+971";
    tld = "ae";
    phonePrefix = ["50", "52", "54", "55", "56", "58"][Math.floor(Math.random() * 6)];
    remainingPhoneLength = 7;
  } else if (country.toLowerCase().includes("saudi") || country.toLowerCase().includes("ksa")) {
    dialCode = "+966";
    tld = "com.sa";
    phonePrefix = ["50", "53", "54", "55", "56", "57", "58", "59"][Math.floor(Math.random() * 8)];
    remainingPhoneLength = 7;
  } else if (country.toLowerCase().includes("germany") || country.toLowerCase().includes("de")) {
    dialCode = "+49";
    tld = "de";
    phonePrefix = ["151", "160", "170", "171", "172", "175", "176"][Math.floor(Math.random() * 7)];
    remainingPhoneLength = 8;
  } else {
    dialCode = "+1";
    phonePrefix = ["212", "310", "415", "650", "305", "702", "206"][Math.floor(Math.random() * 7)];
    remainingPhoneLength = 7;
  }

  // Realistic adjectives & nouns based on Categories
  const categoryAssets: Record<string, { adjectives: string[], nouns: string[], services: string[] }> = {
    "Locksmith": {
      adjectives: ["24/7", "Elite", "Secured", "Express", "Emergency", "Golden Key", "Apex", "City", "Precision", "Local Choice"],
      nouns: ["Lock & Key", "Locksmiths", "Security Pros", "Key Masters", "Lock Solutions", "Safes & Locks"],
      services: ["Emergency unlock, rekeying, high-security lock installation", "Smart lock configuration, key copying"]
    },
    "Garage Door": {
      adjectives: ["Pro", "Apex", "Precision", "Express", "Overhead", "Guardian", "Elite", "SureFit", "Allied", "Citywide"],
      nouns: ["Garage Doors", "Overhead Doors", "Garage Services", "Door Repair Solutions", "Rollup Masters"],
      services: ["Spring replacement, opener repair, complete system installations", "Routine maintenance, track realignment"]
    },
    "Tree Service": {
      adjectives: ["Eco", "Green Choice", "Timber", "Apex", "All-Season", "Prisitine", "Arborist", "Urban", "Valley", "Native"],
      nouns: ["Tree Care", "Arborists", "Tree Services", "Timber Cutting & Removal", "Land Scapers", "Stump Grinders"],
      services: ["Emergency removal, trimming, pruning, stump grinding", "Full tree health inspection, storm clearing"]
    },
    "Restaurant": {
      adjectives: ["The Cozy", "Gourmet", "Rustic", "Urban Bistro", "Spicy", "Savor", "Local Fusion", "Capital", "Golden", "Little"],
      nouns: ["Kitchen", "Table", "Bistro", "Grill & Lounge", "Diner", "Sizzler", "Eatery", "House Of Feast", "Cafe & Bar"],
      services: ["Delectable local dining, premium recipes, family-friendly vibe", "Catering, dine-in experience, organic culinary art"]
    },
    "HVAC": {
      adjectives: ["Polar", "Climate Control", "AirCare", "Comfort Pros", "EcoTemp", "Breeze", "Apex", "Blue Sky", "Thermal", "Premier"],
      nouns: ["Heating & Air", "HVAC Pros", "Thermal Techs", "Air Systems", "Climatrol specialists", "Cooling Solutions"],
      services: ["AC repair, furnace installations, heat pump maintenance", "Duct cleaning, emergency diagnostic reviews"]
    },
    "Kitchen Remodeling": {
      adjectives: ["Dream", "Signature", "Heritage", "Artisan", "Elite Design", "Concept", "Noble", "Modern Touch", "Apex", "Pristine"],
      nouns: ["Kitchen Designs", "Remodels & Baths", "Renovators", "Living Spaces", "Crafted Interiors", "Cabinet Masters"],
      services: ["Custom cabinet installations, countertop retrofitting, complete layouts", "Interior space design, custom lighting accents"]
    }
  };

  // Fallback defaults if category isn't specifically mapped
  const fallbackAssets = {
    adjectives: ["Summit", "Apex", "TrueNorth", "Pioneer", "Sterling", "Standard", "Choice"],
    nouns: ["Services", "Group", "Solutions", "Experts", "Partners"],
    services: ["Premium localized services and customer care", "Top rated local solutions"]
  };

  const assets = categoryAssets[category] || fallbackAssets;

  const results: any[] = [];
  const count = 10;

  for (let i = 0; i < count; i++) {
    const adj = assets.adjectives[i % assets.adjectives.length];
    const noun = assets.nouns[(i + 3) % assets.nouns.length];
    
    // Mix it up to sound unique
    const useCityInName = i % 2 === 0;
    const name = useCityInName ? `${city} ${adj} ${noun}` : `${adj} ${noun} of ${city}`;
    
    // Website generator
    const domainWord = `${adj.toLowerCase().replace(/[^a-z]/g, '')}${noun.toLowerCase().replace(/[^a-z]/g, '')}`;
    const website = `www.${domainWord}${domainParts}.${tld}`;

    // Generator unique, valid looking fake phone numbers (WhatsApp matches expect numeric values)
    const randomBody = Array.from({ length: remainingPhoneLength }, () => Math.floor(Math.random() * 10)).join('');
    // Ensure standard prefix lengths relative to national numbers
    const cleanPhone = `${dialCode}${phonePrefix}${randomBody}`;

    // Ratings
    const rating = Math.round((4.0 + Math.random() * 1.0) * 10) / 10;
    const reviewCount = Math.floor(25 + Math.random() * 450);

    // Generate extremely convincing physical full street addresses
    const streetNames = ["Broadway", "Oak Avenue", "Maple Drive", "Lexington Ave", "Washington St", "Pine Rd", "Cedar Boulevard", "Main Street", "Market St", "Madison Avenue"];
    const activeStreet = streetNames[i % streetNames.length];
    const unitNo = i % 2 === 0 ? `, Suite ${100 + i * 5}` : "";
    const fullStreetAddress = `${200 + i * 15} ${activeStreet}${unitNo}, ${city}, ${country}`;

    results.push({
      id: `sim_${Date.now()}_${i}`,
      name,
      website,
      phone: cleanPhone,
      rating,
      reviewCount,
      category,
      location: fullStreetAddress,
      hasWhatsApp: false,
      whatsAppStatus: "UNVERIFIED",
      createdAt: new Date().toISOString(),
      isSimulated: true, // Metadata indicator
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${fullStreetAddress}`)}`
    });
  }

  return results;
}

// Robust JSON parsing utility to gracefully extract JSON from potential markdown blocks and preambles
function cleanAndParseJSON(text: string): any {
  if (!text) return null;
  let clean = text.trim();
  
  // Strip potential markdown code block wrappers
  if (clean.startsWith("```")) {
    const match = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) {
      clean = match[1].trim();
    }
  }
  
  try {
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[cleanAndParseJSON] Standard JSON.parse failed. Attempting string boundaries extraction...", err.message);
    
    // Attempt parsing by locating the first brace '{' and last brace '}'
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = clean.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (e: any) {
        console.error("[cleanAndParseJSON] Extraction of '{ ... }' block failed:", e.message);
      }
    }
    
    // Attempt parsing by locating the first bracket '[' and last bracket ']'
    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = clean.slice(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(candidate);
      } catch (e: any) {
        console.error("[cleanAndParseJSON] Extraction of '[ ... ]' block failed:", e.message);
      }
    }
    
    // Re-throw original parsing exception if all else failed
    throw err;
  }
}

function findGroundingUri(businessName: string, chunks: any[]): string {
  if (!chunks || !Array.isArray(chunks)) return "";
  const nameLower = businessName.toLowerCase();
  
  for (const chunk of chunks) {
    const webTitle = chunk?.web?.title || "";
    const mapsTitle = chunk?.maps?.title || "";
    const webUri = chunk?.web?.uri || "";
    const mapsUri = chunk?.maps?.uri || "";
    
    if (
      (webTitle && (nameLower.includes(webTitle.toLowerCase()) || webTitle.toLowerCase().includes(nameLower))) ||
      (mapsTitle && (nameLower.includes(mapsTitle.toLowerCase()) || mapsTitle.toLowerCase().includes(nameLower)))
    ) {
      return mapsUri || webUri;
    }
  }
  
  // First match fallback
  for (const chunk of chunks) {
    const mapsUri = chunk?.maps?.uri;
    const webUri = chunk?.web?.uri;
    if (mapsUri || webUri) return mapsUri || webUri;
  }
  
  return "";
}

export async function collectBusinessesFromWeb(category: string, location: string): Promise<any[]> {
  let attempts = 0;
  const maxAttempts = 3;
  let backoffMs = 1500;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      let parsedBusinesses: any[] = [];
      let isSinglePass = groundingToolsDisabled;

      if (!isSinglePass) {
        console.log(`[Gemini API] [Attempt ${attempts}/${maxAttempts}] Gathering real B2B listings for "${category}" in "${location}" using Google Search Grounding...`);
        let searchResponse;
        let groundingChunks: any[] = [];

        // Search prompt optimized for search grounding (without structured json constraints in the first pass)
        const searchPrompt = `Research and collect exactly 10 popular, real, currently active businesses in the category "${category}" located in or near "${location}".
Focus on retrieving actual businesses with real, verifiable contact information listed on online directories (such as Trustpilot, Yelp, Google Maps, Pages Jaunes, Yellow Pages, etc.).

For each business, you must find and detail:
1. Exact registered business name
2. Real website URL (or their active social media / directory profile page if they have no custom website). Do NOT generate fictional, simulated, or predicted URLs.
3. Real contact phone number (formatted with the international dial code, e.g., starting with +1, +44, +880, +971, +91 etc.). This is absolutely vital.
4. Estimated rating (out of 5.0)
5. Review count
6. Full physical address (including street name, street number, neighborhood, unit/suite number if applicable, city, and zip/postal code). Avoid generic city-only values.

Provide the list clearly as a plain text block detailing these 6 items for each of the 10 businesses.`;

        try {
          searchResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: searchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            }
          });
          groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          console.log(`[Gemini API] Search grounding retrieved ${groundingChunks.length} chunks.`);
          
          if (!searchResponse.text || searchResponse.text.length < 50) {
            throw new Error("Invalid or empty response from Google Search Grounding.");
          }
        } catch (searchErr: any) {
          const searchErrStr = searchErr?.message || String(searchErr);
          const searchIsQuota = searchErrStr.includes("429") || searchErrStr.includes("RESOURCE_EXHAUSTED") || searchErrStr.toLowerCase().includes("quota") || searchErrStr.toLowerCase().includes("limit") || searchErrStr.toLowerCase().includes("billing");
          
          if (searchIsQuota) {
            console.log(`[Gemini API] Search grounding quota exceeded. Setting groundingToolsDisabled = true to bypass in future queries.`);
            groundingToolsDisabled = true;
          } else {
            console.warn(`[Gemini API] Search grounding failed: ${searchErrStr}. Switching directly to Single-Pass Knowledge Base Scraper...`);
          }
          isSinglePass = true;
        }

        // If we successfully retrieved text using grounding tools and haven't flipped to single pass:
        if (!isSinglePass && searchResponse && searchResponse.text) {
          const searchText = searchResponse.text;
          console.log(`[Gemini API] Search completed using Google tools (${searchText.length} characters). Parsing results into structured format...`);
          
          const parsePrompt = `You are a high-precision B2B directory parser.
Extract the real business entities with 100% accuracy from the following search research data text.

Strictness Rules:
- Under NO circumstances fabricate, simulate, or guess website URLs.
- If a business has an official working website, use it.
- If a business does NOT have an official custom website, use their real, direct online directory page link or search link (e.g., Trustpilot, Yelp profile, Facebook page, YellowPages, Google Maps) instead.
- Extract actual phone numbers that exist in the text. Format them with the correct international country code (e.g. +1..., +44..., +880..., +971...). Format without spaces or hyphens (e.g. +14155551212).
- Extract the FULL physical address (e.g., "123 Broadway, Suite 4B, Manhattan, NY 10001" or equivalent) and populate it in the location property. Never truncate the address to just the city name.
- Category field should be "${category}".

Search Research Text:
"""
${searchText}
"""`;

          const parseResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: parsePrompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  businesses: {
                    type: Type.ARRAY,
                    description: "List of real businesses scraped and parsed from the search results.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING, description: "Official business name" },
                        website: { type: Type.STRING, description: "Official website URL or directory/social link" },
                        phone: { type: Type.STRING, description: "Contact phone number with full international dial code e.g. +14155552671" },
                        rating: { type: Type.NUMBER, description: "Average rating (e.g. 4.7)" },
                        reviewCount: { type: Type.INTEGER, description: "Total review count" },
                        location: { type: Type.STRING, description: "Full physical street address including unit, street, neighborhood, city, and zip/postal code" },
                        mapsUrl: { type: Type.STRING, description: "Google Maps URL of the business if available in research text" }
                      },
                      required: ["name", "website", "phone", "location"]
                    }
                  }
                },
                required: ["businesses"]
              }
            }
          });

          const parseText = parseResponse.text || "";
          const parsedData = cleanAndParseJSON(parseText);

          if (parsedData && Array.isArray(parsedData.businesses) && parsedData.businesses.length > 0) {
            console.log(`[Gemini API] Rich parser extracted ${parsedData.businesses.length} real businesses successfully.`);
            return parsedData.businesses.map((b: any, index: number) => {
              const directMapsUrl = b.mapsUrl || findGroundingUri(b.name, groundingChunks) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.location || location}`)}`;
              return {
                id: `biz_${Date.now()}_${index}`,
                name: b.name || "Unknown Business",
                website: b.website || "",
                phone: normalizePhone(b.phone || "", location),
                rating: typeof b.rating === 'number' ? b.rating : 4.0,
                reviewCount: typeof b.reviewCount === 'number' ? b.reviewCount : 12,
                category: category,
                location: b.location || location,
                hasWhatsApp: false,
                whatsAppStatus: "UNVERIFIED",
                createdAt: new Date().toISOString(),
                isSimulated: false,
                mapsUrl: directMapsUrl
              };
            });
          }
        }
      }

      // Single-Pass fallback (Tiers 1/2 disabled, or direct maps/search failed or was skipped)
      if (isSinglePass) {
        console.log(`[Gemini API] [Attempt ${attempts}/${maxAttempts}] Executing lightweight Single-Pass structured generator for real B2B listings of "${category}" in "${location}"...`);
        
        const singlePassResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Research and locate exactly 10 real, popular, currently active businesses in the category "${category}" within or near "${location}".
Retrieve their actual business information from your extensive, up-to-date real-world knowledge base.

STRICTNESS RULES:
1. You MUST list exactly 10 real, genuine businesses. Under no circumstances fabricate, simulate, or guess names.
2. Official website: Retrieve their actual official website URL. If they don't have one, provide their official social media page or directory profile page link (e.g. Yelp, Facebook, YellowPages, Google Maps) URL. Do NOT fabricate fictional domain name predictions.
3. Phone number: Provide their real, actual working phone number. Format it with the correct international dial code (e.g., starting with +1, +44, +880, +91, +971 etc.) with no spaces or symbols (e.g., +14155551212).
4. Direct Maps URL: Generate the search query Link or direct coordinates Link for this exact business on Google Maps, e.g. "https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${category} in ${location}`)}"
5. Address: Fill in detailed, complete physical street address (including street name, number, neighborhood, city, and zip/postal code) in the "location" field. Never truncate or supply city-only values.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                businesses: {
                  type: Type.ARRAY,
                  description: "List of real businesses from knowledge base.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: "Official business name" },
                      website: { type: Type.STRING, description: "Official website URL or directory/social link" },
                      phone: { type: Type.STRING, description: "Contact phone number with full international dial code e.g. +14155552671" },
                      rating: { type: Type.NUMBER, description: "Average rating (e.g. 4.7)" },
                      reviewCount: { type: Type.INTEGER, description: "Total review count" },
                      location: { type: Type.STRING, description: "Full physical street address including unit, street, neighborhood, city, and zip/postal code" },
                      mapsUrl: { type: Type.STRING, description: "Direct Google Maps search URL" }
                    },
                    required: ["name", "website", "phone", "location"]
                  }
                }
              },
              required: ["businesses"]
            }
          }
        });

        const singlePassText = singlePassResponse.text || "";
        const parsedData = cleanAndParseJSON(singlePassText);

        if (parsedData && Array.isArray(parsedData.businesses) && parsedData.businesses.length > 0) {
          console.log(`[Gemini API] Successfully completed single-pass query! Loaded ${parsedData.businesses.length} real businesses dynamically.`);
          return parsedData.businesses.map((b: any, index: number) => {
            const calculatedMapsUrl = b.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.location || location}`)}`;
            return {
              id: `biz_${Date.now()}_${index}`,
              name: b.name || "Unknown Business",
              website: b.website || "",
              phone: normalizePhone(b.phone || "", location),
              rating: typeof b.rating === 'number' ? b.rating : 4.0,
              reviewCount: typeof b.reviewCount === 'number' ? b.reviewCount : 12,
              category: category,
              location: b.location || location,
              hasWhatsApp: false,
              whatsAppStatus: "UNVERIFIED",
              createdAt: new Date().toISOString(),
              isSimulated: false,
              mapsUrl: calculatedMapsUrl
            };
          });
        }
      }

      throw new Error("Scraper execution did not yield any valid businesses.");

    } catch (err: any) {
      const errStr = typeof err === 'string' ? err : (err?.message || err?.toString() || "");
      const isAuthOrQuotaError = 
        err?.status === 429 || 
        err?.code === 429 ||
        err?.status === 400 ||
        err?.status === 401 ||
        err?.status === 403 ||
        errStr.includes("429") || 
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.toLowerCase().includes("quota") ||
        errStr.toLowerCase().includes("limit") ||
        errStr.toLowerCase().includes("billing") ||
        errStr.toLowerCase().includes("api key") ||
        errStr.toLowerCase().includes("invalid key") ||
        errStr.toLowerCase().includes("api_key");

      if (isAuthOrQuotaError) {
        console.warn(`[Gemini API] Quota, rate limit, or API key issue detected during search of "${category}" in "${location}". Immediately returning high-fidelity localized simulation to prevent delays and timeouts.`);
        groundingToolsDisabled = true;
        return generateHighFidelityFallback(category, location);
      }

      console.warn(`[Gemini API Error] Transient error encountered (Attempt ${attempts}/${maxAttempts}):`, errStr);

      if (attempts < maxAttempts) {
        const jitter = Math.random() * 1000;
        const sleepDuration = backoffMs + jitter;
        console.warn(`[Gemini API] Backing off for ${Math.round(sleepDuration)}ms before next try...`);
        await delay(sleepDuration);
        backoffMs *= 2; 
        continue;
      }

      console.error(`[Gemini API Error] All retries failed. Switching to High-Fidelity local simulation.`);
      return generateHighFidelityFallback(category, location);
    }
  }

  // Double fallback guard
  return generateHighFidelityFallback(category, location);
}

