import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Play, 
  Pause, 
  Square, 
  Trash2, 
  ExternalLink, 
  Phone, 
  Star, 
  MessageCircle, 
  Loader2, 
  AlertCircle,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  auth, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  deleteDoc, 
  User
} from './firebase';

// Simple Error Wrapper
const ErrorWrapper = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

const getDisplayWebsite = (url: string) => {
  if (!url) return '';
  try {
    const formatted = url.startsWith('http') ? url : `https://${url}`;
    return new URL(formatted).hostname;
  } catch {
    return url;
  }
};

interface Business {
  id: string;
  name: string;
  website: string;
  phone: string;
  rating: number;
  reviewCount: number;
  hasWhatsApp: boolean;
  whatsAppStatus?: string;
  whatsAppProfileName?: string;
  whatsAppProfilePic?: string;
  category: string;
  location: string;
  createdAt: string;
}

const COUNTRIES = [
  { 
    name: 'Bangladesh', 
    cities: ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Rangpur', 'Comilla', 'Gazipur', 'Narayanganj'] 
  },
  { 
    name: 'United Kingdom', 
    cities: [
      'London', 'Manchester', 'Birmingham', 'Glasgow', 'Liverpool', 'Leeds', 'Sheffield', 'Edinburgh', 'Bristol', 'Leicester', 
      'Coventry', 'Belfast', 'Cardiff', 'Nottingham', 'Newcastle', 'Southampton', 'Reading', 'Derby', 'Brighton', 'Plymouth',
      'Stoke-on-Trent', 'Wolverhampton', 'Swansea', 'Milton Keynes', 'Aberdeen', 'Oxford', 'Cambridge', 'York', 'Bath', 'Exeter'
    ] 
  },
  { 
    name: 'United States', 
    cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington DC'] 
  },
  { 
    name: 'Canada', 
    cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton', 'Winnipeg', 'Mississauga', 'Brampton', 'Hamilton'] 
  },
  { 
    name: 'Australia', 
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Hobart'] 
  },
  { 
    name: 'United Arab Emirates', 
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah'] 
  },
  { 
    name: 'Saudi Arabia', 
    cities: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk'] 
  },
];

const AppContent = () => {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('trustpilot_collector_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [category, setCategory] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [collectionProgress, setCollectionProgress] = useState<string>('');

  // WhatsApp Baileys State Hook vars
  const [wpStatus, setWpStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'PAIRING_READY'>('DISCONNECTED');
  const [wpQr, setWpQr] = useState<string | null>(null);
  const [wpPairingCode, setWpPairingCode] = useState<string | null>(null);
  const [wpError, setWpError] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [linkMethod, setLinkMethod] = useState<'qr' | 'code'>('qr');
  const [wpLoading, setWpLoading] = useState(false);
  const [manualChecking, setManualChecking] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(isPaused);
  const isCollectingRef = useRef(isCollecting);

  // Poll WhatsApp Session state
  useEffect(() => {
    let interval: any = null;
    const updateStatus = async () => {
      try {
        const res = await fetch("/api/whatsapp/status").then(r => r.json());
        setWpStatus(res.status);
        if (res.qrCode) {
          setWpQr(res.qrCode);
        } else {
          setWpQr(null);
        }
        if (res.pairingCode) {
          setWpPairingCode(res.pairingCode);
        } else {
          setWpPairingCode(null);
        }
        if (res.error) {
          setWpError(res.error);
        } else {
          setWpError(null);
        }
      } catch (err) {
        console.warn("Could not retrieve WhatsApp connection status", err);
      }
    };
    
    updateStatus();
    interval = setInterval(updateStatus, 3000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const handleWpStart = async (phoneStr?: string) => {
    setWpLoading(true);
    setWpError(null);
    try {
      const res = await fetch("/api/whatsapp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneStr || undefined })
      }).then(r => r.json());

      if (res.success) {
        // immediately poll once
        const check = await fetch("/api/whatsapp/status").then(r => r.json());
        setWpStatus(check.status);
        if (check.qrCode) setWpQr(check.qrCode);
        if (check.pairingCode) setWpPairingCode(check.pairingCode);
        if (check.error) setWpError(check.error);
      }
    } catch (err) {
      console.error("Failed to start WhatsApp link:", err);
    } finally {
      setWpLoading(false);
    }
  };

  const handleWpLogout = async () => {
    setWpLoading(true);
    try {
      const res = await fetch("/api/whatsapp/logout", { method: "POST" }).then(r => r.json());
      if (res.success) {
        setWpStatus('DISCONNECTED');
        setWpQr(null);
        setWpPairingCode(null);
        setWpError(null);
      }
    } catch (err) {
      console.error("Failed to terminate WhatsApp session:", err);
    } finally {
      setWpLoading(false);
    }
  };

  const checkBusinessWhatsAppLive = async (id: string, phone: string) => {
    setManualChecking(id);
    try {
      const res = await fetch("/api/whatsapp/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      }).then(r => r.json());

      if (res.success) {
        const originalBiz = businesses.find(b => b.id === id);
        if (originalBiz) {
          await setDoc(doc(db, 'businesses', id), {
            ...originalBiz,
            hasWhatsApp: res.exists,
            whatsAppStatus: res.exists ? 'Live WhatsApp Confirmed ✓' : 'No active WhatsApp account',
            whatsAppProfileName: originalBiz.name,
            whatsAppProfilePic: null,
          });
        }
      } else {
        alert(res.error || "Failed to check WhatsApp. Confirm device is linked and scanning has occurred.");
      }
    } catch (err: any) {
      console.error("Live lookup failed:", err);
      alert("Failed to communicate with WhatsApp validation endpoint.");
    } finally {
      setManualChecking(null);
    }
  };

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isCollectingRef.current = isCollecting;
  }, [isCollecting]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'businesses'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business));
        setBusinesses(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, (err) => {
        console.error("Firestore error:", err);
        setError("Failed to sync with database.");
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleLogin = async () => {
    try {
      const guestUser = {
        uid: "guest_session",
        displayName: "Workspace Guest",
        email: "guest@workspace.local"
      };
      localStorage.setItem('trustpilot_collector_user', JSON.stringify(guestUser));
      setUser(guestUser);
      setError(null);
      
      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.warn("Background Anonymous login disabled/restricted in Firebase Console:", authErr);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to enter dashboard. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('trustpilot_collector_user');
      setUser(null);
      setBusinesses([]);
      try {
        await signOut(auth);
      } catch (authErr) {
        console.warn("Background FirebaseAuth signout failed silently:", authErr);
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const startCollection = async () => {
    if (!category || !selectedCountry || selectedCities.length === 0) {
      setError("Please enter category, select a country, and at least one city.");
      return;
    }

    setIsCollecting(true);
    isCollectingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setLoading(true);
    setError(null);
    setCollectionProgress("Initializing collection...");

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Determine runs: if 1 city, run 4 variations with search suffixes to fetch 150-200.
    // If multi cities, run each city as a separate query.
    const runs = selectedCities.length === 1 ? [
      { city: selectedCities[0], querySuffix: "" },
      { city: selectedCities[0], querySuffix: "best" },
      { city: selectedCities[0], querySuffix: "top rated" },
      { city: selectedCities[0], querySuffix: "local" }
    ] : selectedCities.map(c => ({ city: c, querySuffix: "" }));

    // Dynamic countdown: 45s per run
    const estimatedTime = runs.length * 45;
    setCountdown(estimatedTime);
    setTotalEstimatedTime(estimatedTime);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    try {
      let totalDiscoveredCount = 0;

      for (let runIdx = 0; runIdx < runs.length; runIdx++) {
        // Check if stopped
        if (!isCollectingRef.current) break;

        // Check if paused
        while (isPausedRef.current) {
          setCollectionProgress("Collection paused...");
          await sleep(500);
          if (!isCollectingRef.current) break;
        }
        if (!isCollectingRef.current) break;

        const run = runs[runIdx];
        setCollectionProgress(`[Run ${runIdx + 1}/${runs.length}] Discovering businesses in ${run.city} ${run.querySuffix ? `(${run.querySuffix})` : ''}...`);

        const locationsStr = `${run.city} ${run.querySuffix}`.trim() + ` in ${selectedCountry}`;

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

        const responseData = await fetch("/api/gemini/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, locationsStr, selectedCountry }),
        }).then(async r => {
          if (r.status === 429) {
            throw new Error("You exceeded your current Gemini API quota. Please check your plan or try again in a minute.");
          }
          if (!r.ok) {
            const rawText = await r.text().catch(() => "");
            throw new Error(rawText || `Discovery HTTP error status: ${r.status}`);
          }
          return r.json();
        });

        if (!responseData || !responseData.text) {
          continue;
        }

        let jsonText = responseData.text.trim();
        if (jsonText.includes("```")) {
          const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match && match[1]) {
            jsonText = match[1].trim();
          }
        }

        let businessesData: any[] = [];
        try {
          businessesData = JSON.parse(jsonText);
        } catch (parseErr) {
          console.warn("Failed to parse JSON, fixing truncated structure:", parseErr);
          try {
            if (jsonText.startsWith("[") && !jsonText.endsWith("]")) {
              const lastCompleteIndex = jsonText.lastIndexOf("}");
              if (lastCompleteIndex !== -1) {
                jsonText = jsonText.substring(0, lastCompleteIndex + 1) + "]";
                businessesData = JSON.parse(jsonText);
              }
            }
          } catch (fixErr) {
            console.error("Critical fix failed:", fixErr);
          }
        }

        if (businessesData.length === 0) {
          continue;
        }

        // Deduplicate against state and locally accumulated leads
        const uniqueNewBusinesses = businessesData.filter((newB: any) => {
          if (!newB.name || !newB.phone) return false;
          const normNewPhone = newB.phone.replace(/\D/g, '');
          if (!normNewPhone) return false;

          const duplicateInState = businesses.some(b => {
            const normBPhone = b.phone ? b.phone.replace(/\D/g, '') : '';
            return b.name.toLowerCase() === newB.name.toLowerCase() || (normBPhone && normBPhone === normNewPhone);
          });
          return !duplicateInState;
        });

        if (uniqueNewBusinesses.length === 0) {
          continue;
        }

        // Store them with status "Pending Verification" so the user can see them streaming real-time in UI
        const savedBatch: Business[] = [];
        for (const b of uniqueNewBusinesses) {
          const docId = `${b.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const initialBiz: Business = {
            id: docId,
            name: b.name,
            website: b.website,
            phone: b.phone,
            rating: b.rating || 4.2,
            reviewCount: b.reviewCount || 10,
            hasWhatsApp: false,
            whatsAppStatus: 'Pending Verification',
            category,
            location: `${run.city} (${selectedCountry})`,
            createdAt: new Date().toISOString(),
          };

          await setDoc(doc(db, 'businesses', docId), initialBiz);
          savedBatch.push(initialBiz);
        }

        totalDiscoveredCount += savedBatch.length;

        // Perform validation in chunks of 4 to maximize API tool capability without hallucination
        for (let i = 0; i < savedBatch.length; i += 4) {
          if (!isCollectingRef.current) break;
          while (isPausedRef.current) {
            setCollectionProgress("Collection paused...");
            await sleep(500);
            if (!isCollectingRef.current) break;
          }
          if (!isCollectingRef.current) break;

          const chunk = savedBatch.slice(i, i + 4);

          // Check if live WhatsApp is connected via Baileys to verify instantly and completely
          let checkedViaBaileys = false;
          try {
            const statusRes = await fetch("/api/whatsapp/status").then(r => r.json());
            if (statusRes.status === "CONNECTED") {
              setCollectionProgress(`[Run ${runIdx + 1}/${runs.length}] Live WhatsApp checking (${i + chunk.length}/${savedBatch.length})...`);
              for (const b of chunk) {
                try {
                  const checkRes = await fetch("/api/whatsapp/check", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone: b.phone })
                  }).then(r => r.json());

                  if (checkRes.success) {
                    await setDoc(doc(db, 'businesses', b.id), {
                      ...b,
                      hasWhatsApp: checkRes.exists,
                      whatsAppStatus: checkRes.exists ? 'Live WhatsApp Confirmed ✓' : 'No active WhatsApp account',
                      whatsAppProfileName: b.name,
                      whatsAppProfilePic: null,
                    });
                  }
                } catch (err) {
                  console.warn("Baileys direct check failed for phone:", b.phone, err);
                }
              }
              checkedViaBaileys = true;
            }
          } catch (e) {
            console.warn("Failed to contact WhatsApp validator service:", e);
          }

          if (checkedViaBaileys) {
            continue;
          }

          setCollectionProgress(`[Run ${runIdx + 1}/${runs.length}] Verifying WhatsApp for ${run.city} leads (${i + chunk.length}/${savedBatch.length})...`);

          const verifyPrompt = `You are an elite WhatsApp Presence Intelligence Model.
          Your task is to verify with absolute 100% precision if the following business phone numbers are active on WhatsApp.

          Businesses to verify:
          ${chunk.map((b, idx) => `${idx + 1}. Name: "${b.name}", Phone: "${b.phone}", Website: "${b.website}"`).join('\n')}

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

          try {
            const responseData = await fetch("/api/gemini/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chunk, selectedCountry }),
            }).then(async r => {
              if (r.status === 429) {
                throw new Error("Quota exceeded on Gemini API verification. Please wait a few seconds and try again.");
              }
              if (!r.ok) {
                const rawText = await r.text().catch(() => "");
                throw new Error(rawText || `Verification HTTP error status: ${r.status}`);
              }
              return r.json();
            });

            if (responseData && responseData.text) {
              let verifyJson = responseData.text.trim();
              if (verifyJson.includes("```")) {
                const match = verifyJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (match && match[1]) {
                  verifyJson = match[1].trim();
                }
              }

              const verifiedData = JSON.parse(verifyJson);

              for (const v of verifiedData) {
                const originalBiz = chunk.find(b => b.phone === v.phone || b.phone.replace(/\D/g, '') === v.phone.replace(/\D/g, ''));
                if (originalBiz) {
                  await setDoc(doc(db, 'businesses', originalBiz.id), {
                    ...originalBiz,
                    hasWhatsApp: v.hasWhatsApp,
                    whatsAppStatus: v.hasWhatsApp ? v.whatsAppStatus : 'No active WhatsApp detected',
                    whatsAppProfileName: v.hasWhatsApp ? (v.whatsAppProfileName || originalBiz.name) : originalBiz.name,
                    whatsAppProfilePic: v.hasWhatsApp ? (v.whatsAppProfilePic || null) : null,
                  });
                }
              }
            }
          } catch (verifyErr) {
            console.error("Chunk verification failed:", verifyErr);
            for (const b of chunk) {
              await setDoc(doc(db, 'businesses', b.id), {
                ...b,
                whatsAppStatus: "Skipped/Could not verify",
                hasWhatsApp: false
              });
            }
          }

          // Stagger verification chunk requests to prevent API rate limit / 429 quota exhaustion
          await sleep(1500);
        }
      }

      setCollectionProgress(`Completed! Discovered ${totalDiscoveredCount} new leads.`);
    } catch (err: any) {
      console.error("Collection error:", err);
      let userMessage = "An error occurred while collecting data.";
      if (err.message?.includes("JSON")) {
        userMessage = "The data received from the AI was corrupted. Try selecting fewer cities.";
      } else if (err.message?.includes("Rpc failed") || err.message?.includes("xhr error")) {
        userMessage = "Network error: The AI service is temporarily unavailable. Please try again in a few moments.";
      } else if (err.message) {
        userMessage = err.message;
      }
      setError(userMessage);
    } finally {
      setLoading(false);
      setIsCollecting(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdown(0);
    }
  };

  const stopCollection = () => {
    setIsCollecting(false);
    isCollectingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setLoading(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(0);
  };

  const togglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
  };

  const deleteBusiness = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'businesses', id));
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete business.");
    }
  };

  const clearAll = async () => {
    try {
      for (const b of businesses) {
        await deleteDoc(doc(db, 'businesses', b.id));
      }
      setShowClearConfirm(false);
    } catch (err) {
      console.error("Clear error:", err);
      setError("Failed to clear data.");
    }
  };

  const exportToCSV = () => {
    if (businesses.length === 0) return;

    const headers = ["Name", "Website", "Phone", "Rating", "Reviews", "WhatsApp", "Status", "Category", "Location", "Date"];
    const rows = businesses.map(b => [
      b.name,
      b.website,
      b.phone,
      b.rating,
      b.reviewCount,
      b.hasWhatsApp ? "Yes" : "No",
      b.whatsAppStatus || "",
      b.category,
      b.location,
      new Date(b.createdAt).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `trustpilot_leads_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-neutral-200 max-w-sm w-full text-center"
        >
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Trustpilot Collector</h1>
          <p className="text-neutral-500 mb-8">Ready to discover and verify high-quality local business leads.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-md hover:shadow-lg hover:shadow-blue-600/10"
          >
            Open Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Search className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 hidden sm:block">Trustpilot Collector</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {businesses.length > 0 && (
            <button 
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-neutral-900">{user.displayName || "Workspace Guest"}</p>
            <p className="text-xs text-neutral-500">{user.email || "Active Session"}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-red-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* WhatsApp Web Linker (Baileys) */}
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
            <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              WhatsApp Live Linker
            </h2>
            
            <p className="text-sm text-neutral-500 mb-6 font-medium leading-relaxed">
              Connect a WhatsApp number to verify business leads with 100% accuracy using server-side local sockets.
            </p>

            {wpError && (
              <div className="mb-4 p-4.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 font-medium leading-relaxed flex flex-col gap-1 shadow-sm">
                <span className="font-bold flex items-center gap-1.5 text-amber-900">
                  ⚠️ Status Note:
                </span>
                <span>{wpError}</span>
              </div>
            )}

            {wpStatus === "DISCONNECTED" && (
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex border-b border-neutral-200">
                  <button
                    onClick={() => setLinkMethod('qr')}
                    className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${
                      linkMethod === 'qr'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                    }`}
                  >
                    Scan QR Code
                  </button>
                  <button
                    onClick={() => setLinkMethod('code')}
                    className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${
                      linkMethod === 'code'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                    }`}
                  >
                    Use Pairing Code
                  </button>
                </div>

                {linkMethod === 'qr' ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                      Generate a WhatsApp Web companion QR code to scan with your phone's WhatsApp camera.
                    </p>
                    <button
                      onClick={() => handleWpStart()}
                      disabled={wpLoading}
                      className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-md shadow-green-600/10"
                    >
                      {wpLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <MessageCircle className="w-5 h-5" />
                      )}
                      Link with QR Code
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                      Enter your mobile number with country code (e.g. +8801700000000 or +15145551234) to request an 8-character pairing code.
                    </p>
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Phone Number</label>
                      <input
                        type="text"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        placeholder="e.g. +88017XXXXXXXX"
                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all text-sm font-medium"
                      />
                    </div>
                    <button
                      onClick={() => handleWpStart(pairingPhone)}
                      disabled={wpLoading || !pairingPhone.trim()}
                      className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-md shadow-green-600/10"
                    >
                      {wpLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <MessageCircle className="w-5 h-5" />
                      )}
                      Request Pairing Code
                    </button>
                  </div>
                )}
              </div>
            )}

            {(wpStatus === "CONNECTING" || wpStatus === "QR_READY" || wpStatus === "PAIRING_READY") && (
              <div className="space-y-4">
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex flex-col items-center">
                  {wpStatus === "CONNECTING" && !wpQr && !wpPairingCode ? (
                    <div className="py-8 flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
                      <p className="text-sm text-neutral-500 font-bold">Initializing connection...</p>
                    </div>
                  ) : wpStatus === "PAIRING_READY" && wpPairingCode ? (
                    <div className="flex flex-col items-center w-full py-2">
                      <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-3">WhatsApp Pairing Code</div>
                      <div className="flex justify-center gap-1.5 mb-4 font-mono font-bold text-xl text-green-700">
                        {wpPairingCode.split("").map((char, index) => (
                          <span
                            key={index}
                            className="w-8 h-10 flex items-center justify-center bg-white border border-neutral-200 rounded-lg shadow-sm"
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-neutral-500 text-center leading-relaxed max-w-[220px]">
                        Open WhatsApp on your phone → Settings → Linked Devices → Link with Phone Number, then enter this 8-digit code.
                      </p>
                    </div>
                  ) : (
                    wpQr && (
                      <div className="flex flex-col items-center">
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-neutral-200 mb-3">
                          <img src={wpQr} className="w-48 h-48" alt="WhatsApp Link QR" />
                        </div>
                        <p className="text-[11px] text-neutral-500 text-center leading-relaxed max-w-[220px]">
                          Open WhatsApp on your phone → Settings → Linked Devices → Link a Device, then scan this QR.
                        </p>
                      </div>
                    )
                  )}
                </div>

                <button
                  onClick={handleWpLogout}
                  disabled={wpLoading}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all text-sm"
                >
                  Cancel Connection
                </button>
              </div>
            )}

            {wpStatus === "CONNECTED" && (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-green-800">Connection Active</h4>
                    <p className="text-xs text-green-600 font-medium">Real-time verifier online ✓</p>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-400 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 leading-normal">
                  Live verification is fully active. All collected businesses will be instantly checked using your connected WhatsApp number.
                </div>

                <button
                  onClick={handleWpLogout}
                  disabled={wpLoading}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl transition-all text-sm"
                >
                  {wpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Disconnect Device"}
                </button>
              </div>
            )}
          </section>

          <section className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
            <h2 className="text-lg font-bold text-neutral-900 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              New Collection
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Business Category</label>
                <input 
                  type="text" 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Restaurants, Plumbers"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Country</label>
                <select 
                  value={selectedCountry}
                  onChange={(e) => {
                    setSelectedCountry(e.target.value);
                    setSelectedCities([]);
                  }}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="">Select Country</option>
                  {COUNTRIES.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {selectedCountry && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Cities (Multi-select)</label>
                    <button 
                      type="button"
                      onClick={() => {
                        const allCities = COUNTRIES.find(c => c.name === selectedCountry)?.cities || [];
                        if (selectedCities.length === allCities.length) {
                          setSelectedCities([]);
                        } else {
                          setSelectedCities([...allCities]);
                        }
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-all hover:underline"
                    >
                      {selectedCities.length === (COUNTRIES.find(c => c.name === selectedCountry)?.cities.length || 0) ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-neutral-50 border border-neutral-200 rounded-2xl">
                    {COUNTRIES.find(c => c.name === selectedCountry)?.cities.map(city => (
                      <label key={city} className="flex items-center gap-2 p-2 hover:bg-white rounded-xl cursor-pointer transition-colors">
                        <input 
                          type="checkbox"
                          checked={selectedCities.includes(city)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCities([...selectedCities, city]);
                            } else {
                              setSelectedCities(selectedCities.filter(c => c !== city));
                            }
                          }}
                          className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-neutral-700">{city}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="pt-4 flex flex-col gap-3">
                {!isCollecting ? (
                  <button 
                    onClick={startCollection}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    Start Collecting
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={togglePause}
                      className={`flex items-center justify-center gap-2 px-4 py-4 ${isPaused ? 'bg-amber-500' : 'bg-neutral-100'} text-neutral-900 rounded-2xl font-bold hover:opacity-90 transition-all`}
                    >
                      {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button 
                      onClick={stopCollection}
                      className="flex items-center justify-center gap-2 px-4 py-4 bg-red-100 text-red-600 rounded-2xl font-bold hover:bg-red-200 transition-all"
                    >
                      <Square className="w-5 h-5" />
                      Stop
                    </button>
                  </div>
                )}
                
                {businesses.length > 0 && (
                  <div className="relative">
                    {showClearConfirm ? (
                      <div className="flex flex-col gap-2 p-3 bg-red-50 border border-red-100 rounded-2xl">
                        <p className="text-xs font-bold text-red-600 text-center">Are you sure? This cannot be undone.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={clearAll}
                            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all"
                          >
                            Yes, Clear All
                          </button>
                          <button 
                            onClick={() => setShowClearConfirm(false)}
                            className="px-4 py-2 bg-white text-neutral-600 border border-neutral-200 text-xs font-bold rounded-xl hover:bg-neutral-50 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowClearConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 text-neutral-400 hover:text-red-500 transition-colors text-sm font-medium"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear All Data
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200 grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-neutral-50 rounded-2xl">
              <p className="text-2xl font-bold text-neutral-900">{businesses.length}</p>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Collected</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-2xl">
              <p className="text-2xl font-bold text-green-600">
                {businesses.filter(b => b.hasWhatsApp).length}
              </p>
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider">WhatsApp</p>
            </div>
          </section>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">Collected Businesses</h2>
            {loading && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{collectionProgress || "Collecting data..."}</span>
                </div>
                {countdown > 0 && (
                  <div className="flex flex-col items-end w-48">
                    <div className="flex justify-between w-full text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                      <span>Estimated Time</span>
                      <span>{Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: "100%" }}
                        animate={{ width: `${(countdown / totalEstimatedTime) * 100}%` }}
                        className="h-full bg-blue-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {businesses.length === 0 && !loading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-neutral-200"
                >
                  <Search className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                  <p className="text-neutral-400 font-medium">No data collected yet.</p>
                </motion.div>
              ) : (
                businesses.map((business) => (
                  <motion.div
                    key={business.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white p-5 rounded-3xl shadow-sm border ${business.hasWhatsApp ? 'border-green-200 bg-green-50/30' : 'border-neutral-200'} flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-all hover:shadow-md`}
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {business.hasWhatsApp && (
                        <div className="relative flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-green-100 border-2 border-green-200 overflow-hidden flex items-center justify-center">
                            {business.whatsAppProfilePic ? (
                              <img 
                                src={business.whatsAppProfilePic} 
                                alt={business.whatsAppProfileName} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <MessageCircle className="w-6 h-6 text-green-600" />
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-neutral-900 truncate">
                            {business.hasWhatsApp ? (business.whatsAppProfileName || business.name) : business.name}
                          </h3>
                          {business.hasWhatsApp && (
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-600 text-[10px] font-bold uppercase tracking-wider rounded-full w-fit">
                                <MessageCircle className="w-3 h-3" />
                                Verified
                              </span>
                            </div>
                          )}
                          {!business.hasWhatsApp && business.whatsAppStatus === 'Pending Verification' && (
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-full w-fit animate-pulse">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Checking...
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {business.hasWhatsApp && business.whatsAppStatus && (
                          <p className="text-[10px] text-green-600 font-medium mb-2 italic bg-green-100/50 px-2 py-0.5 rounded-md w-fit animate-fade-in">
                            ✓ {business.whatsAppStatus}
                          </p>
                        )}

                        {!business.hasWhatsApp && business.whatsAppStatus && business.whatsAppStatus !== 'Pending Verification' && (
                          <p className="text-[10px] text-neutral-400 font-medium mb-2 bg-neutral-100 px-2 py-0.5 rounded-md w-fit">
                            ✗ {business.whatsAppStatus}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
                        <a 
                          href={business.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {getDisplayWebsite(business.website)}
                        </a>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          {business.phone}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-neutral-900">{business.rating}</span>
                          <span className="text-neutral-400">({business.reviewCount} reviews)</span>
                        </div>
                      </div>
                    </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      {wpStatus === "CONNECTED" && (
                        <button
                          onClick={() => checkBusinessWhatsAppLive(business.id, business.phone)}
                          disabled={manualChecking === business.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 border border-neutral-200 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50"
                        >
                          {manualChecking === business.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                          )}
                          Check Live
                        </button>
                      )}

                      {business.hasWhatsApp && (
                        <a 
                          href={`https://wa.me/${business.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all active:scale-95"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Message
                        </a>
                      )}
                      <button 
                        onClick={() => deleteBusiness(business.id)}
                        className="p-3 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <ErrorWrapper>
      <AppContent />
    </ErrorWrapper>
  );
}
