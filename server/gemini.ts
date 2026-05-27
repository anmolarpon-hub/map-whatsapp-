import { Router } from "express";
import { GoogleGenAI, Type } from "@google/genai";

const router = Router();

const apiKey = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

function getGenAI(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

// Helper to run content generation with retry
async function generateContentWithRetry(params: any, retries = 5, baseDelay = 4000): Promise<any> {
  const genaiInstance = getGenAI();
  // Deep clone parameters safely to avoid modifying shared references
  let currentParams = JSON.parse(JSON.stringify(params));

  for (let i = 0; i < retries; i++) {
    try {
      return await genaiInstance.models.generateContent(currentParams);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const errStr = JSON.stringify(err) || String(err);
      const isRateLimit = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errStr.includes("quota");
      
      console.warn(`[Gemini Attempt ${i + 1}/${retries}] Failed. Msg: ${errMsg}`);

      if (isRateLimit) {
        // Strip tools (such as googleSearch) and tool-related configs to run purely context-free or with local model capability
        if (currentParams.config && (currentParams.config.tools || currentParams.config.toolConfig)) {
          console.warn(`[RECOVERY] Active search tools detected during rate-limit/quota error. Stripping tools and toolConfig for fallback attempts...`);
          if (currentParams.config.tools) {
            delete currentParams.config.tools;
          }
          if (currentParams.config.toolConfig) {
            delete currentParams.config.toolConfig;
          }
        }
        
        if (i < retries - 1) {
          // Dynamic exponential backoff with 1-4 seconds of random jitter
          const sleepTime = baseDelay * Math.pow(2, i) + Math.floor(Math.random() * 3000);
          console.warn(`Gemini rate limit / quota exceeded. Retrying in ${sleepTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, sleepTime));
          continue;
        }
      }
      throw err;
    }
  }
}

router.post("/discover", async (req, res) => {
  try {
    const { category, locationsStr, selectedCountry } = req.body;
    if (!category || !locationsStr || !selectedCountry) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const prompt = `Find AS MANY businesses AS POSSIBLE (up to 40) in the category "${category}" located in "${locationsStr}" from Trustpilot directory pages, category listings, and search results.
    
    GOAL: Provide a comprehensive and exhaustive list of unique business details. Do not stop at just a few results. Aim for maximum volume per city.

    Only return businesses that have phone numbers.

    CRITICAL PHONE FORMAT REQUIREMENT:
    You MUST normalize all phone numbers to include the correct country calling code in E.164 format with the plus sign (e.g. starting with "+").
    Country being searched: "${selectedCountry}".
    Ensure that the phone number is formatted according to this country pattern:
    - Bangladesh: Starts with "+880" (e.g., +88017XXXXXXXX)
    - United Kingdom: Starts with "+44" (e.g., +447XXXXXXXXX)
    - United States: Starts with "+1" (e.g., +1XXXXXXXXXX)
    - Canada: Starts with "+1" (e.g., +1XXXXXXXXXX)
    - Australia: Starts with "+61" (e.g., +61XXXXXXXXX)
    - United Arab Emirates: Starts with "+971" (e.g., +971XXXXXXXXX)
    - Saudi Arabia: Starts with "+966" (e.g., +966XXXXXXXXX)

    Never leave out the country code prefix. Convert local formats (e.g., local UK "07700 900077" or local Bangladesh "01712-345678") to international E.164 format. Ensure you remove extra spaces and hyphens or local zero prefixes when prepending the country code if required by that country's dialling plan.
    
    Return the data as a JSON array of objects with the following keys:
    name, website, phone, rating, reviewCount.`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        maxOutputTokens: 3072,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              website: { type: Type.STRING },
              phone: { type: Type.STRING },
              rating: { type: Type.NUMBER },
              reviewCount: { type: Type.INTEGER },
            },
            required: ["name", "website", "phone", "rating", "reviewCount"],
          },
        },
      },
    });

    if (!response || !response.text) {
      return res.status(200).json({ text: "[]" });
    }

    res.json({ text: response.text });
  } catch (err: any) {
    console.error("Discover API failed:", err);
    const errMsg = err?.message || String(err);
    const errStr = JSON.stringify(err) || String(err);
    const isQuota = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errStr.includes("quota");
    res.status(isQuota ? 429 : 500).json({
      error: errMsg,
      isQuota,
    });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { chunk, selectedCountry } = req.body;
    if (!chunk || !selectedCountry) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const verifyPrompt = `You are an elite WhatsApp Presence Intelligence Model.
    Your task is to verify with absolute 100% precision if the following business phone numbers are active on WhatsApp.

    Businesses to verify:
    ${chunk.map((b: any, idx: number) => `${idx + 1}. Name: "${b.name}", Phone: "${b.phone}", Website: "${b.website}"`).join('\n')}

    STRICT VERIFICATION CRITERIA FOR COUNTRY "${selectedCountry}":
    1. Mobile Prefix Check (Highly strict):
       - Bangladesh (+880): ONLY numbers starting with +8801 (mobile) should easily be classified as having WhatsApp. If it starts with a landline code (like +8802, etc.), set hasWhatsApp to false unless explicit "wa.me/" links or active chat widgets are identified on their official website.
       - United Kingdom (+44): ONLY numbers starting with +447 (mobile) are highly likely. If it starts with +441, +442, +443, +448, or +4420 (landlines, freephone), set hasWhatsApp to false unless verifiable evidence of a WhatsApp Business line is discovered on their webpage.
       - Australia (+61): ONLY numbers starting with +614 (mobile) are highly likely. Landlines (+612, +613, +617, +618) must be rejected unless there's an explicit "wa.me/" link on their website.
       - UAE (+971): ONLY numbers starting with +9715 (mobile) are likely. Others must be verified on website.
       - Saudi Arabia (+966): ONLY mobile numbers starting with +9665 are likely.
       - US and Canada (+1): Since mobile and landline share area codes, DO NOT assume. Search the website for "wa.me", "api.whatsapp.com", or explicit mention of "WhatsApp us" to set hasWhatsApp to true.

    2. Official Resource Verification: Use Google Search or official website scanning to detect presence of "wa.me/" links, green WhatsApp buttons, "Message us on WhatsApp", or active WhatsApp integration widgets.
    3. If there is ANY doubt, or if no verified WhatsApp link/mobile prefix exists, you MUST mark "hasWhatsApp: false" and set "whatsAppStatus: 'No active WhatsApp detected'".
    4. Return "whatsAppProfileName" (can be the verified display name or business name if verified) and "whatsAppStatus" (explicit explanation, e.g. "Mobile number confirmed on WhatsApp" or "Direct wa.me link found on official website").

    Return a JSON array of objects with keys:
    phone, hasWhatsApp, whatsAppStatus, whatsAppProfileName, whatsAppProfilePic`;

    const verifyResponse = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: verifyPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              phone: { type: Type.STRING },
              hasWhatsApp: { type: Type.BOOLEAN },
              whatsAppStatus: { type: Type.STRING },
              whatsAppProfileName: { type: Type.STRING },
              whatsAppProfilePic: { type: Type.STRING, nullable: true },
            },
            required: ["phone", "hasWhatsApp", "whatsAppStatus", "whatsAppProfileName"],
          },
        },
      },
    });

    if (!verifyResponse || !verifyResponse.text) {
      return res.status(200).json({ text: "[]" });
    }

    res.json({ text: verifyResponse.text });
  } catch (err: any) {
    console.error("Verify API failed:", err);
    const errMsg = err?.message || String(err);
    const errStr = JSON.stringify(err) || String(err);
    const isQuota = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errStr.includes("quota");
    res.status(isQuota ? 429 : 500).json({
      error: errMsg,
      isQuota,
    });
  }
});

export default router;
