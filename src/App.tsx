import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  ExternalLink, 
  Phone, 
  Star, 
  MessageCircle, 
  Loader2, 
  AlertCircle,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  Info,
  Check,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Business {
  id: string;
  name: string;
  website: string;
  phone: string;
  rating: number;
  reviewCount: number;
  hasWhatsApp: boolean;
  whatsAppStatus: 'UNVERIFIED' | 'NOT_ON_WHATSAPP' | 'ON_WHATSAPP' | 'VERIFYING';
  category: string;
  location: string;
  createdAt: string;
  isSimulated?: boolean;
  mapsUrl?: string;
}

const CATEGORIES = [
  'Locksmith',
  'Garage Door',
  'Tree Service',
  'Restaurant',
  'HVAC',
  'Kitchen Remodeling'
];

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
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Khor Fakkan', 'Kalba', 'Dibba Al-Fujairah', 'Hatta', 'Jebel Ali', 'Ruwais', 'Zayed City'] 
  },
  { 
    name: 'Germany', 
    cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster', 'Karlsruhe', 'Mannheim', 'Augsburg', 'Wiesbaden', 'Gelsenkirchen'] 
  },
  { 
    name: 'Saudi Arabia', 
    cities: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk'] 
  },
];

export default function App() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0].name);
  const [selectedCities, setSelectedCities] = useState<string[]>([COUNTRIES[0].cities[0]]);
  const [customCity, setCustomCity] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionProgress, setCollectionProgress] = useState<string>('');
  const [businesses, setBusinesses] = useState<Business[]>(() => {
    try {
      const saved = localStorage.getItem('map_data_collected_businesses');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [error, setError] = useState<string | null>(null);
  const [collectionStats, setCollectionStats] = useState({ total: 0, verified: 0 });

  // WhatsApp connection state
  const [wpStatus, setWpStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'PAIRING_READY'>('DISCONNECTED');
  const [wpQr, setWpQr] = useState<string | null>(null);
  const [wpPairingCode, setWpPairingCode] = useState<string | null>(null);
  const [wpError, setWpError] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [linkMethod, setLinkMethod] = useState<'qr' | 'code'>('qr');
  const [wpLoading, setWpLoading] = useState(false);
  const [isVerifyingWA, setIsVerifyingWA] = useState(false);

  // Inline B2B card editing state
  const [editingBizId, setEditingBizId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const startEditing = (biz: Business) => {
    setEditingBizId(biz.id);
    setEditName(biz.name);
    setEditPhone(biz.phone);
    setEditWebsite(biz.website);
    setEditLocation(biz.location);
  };

  const saveEdit = (id: string) => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === id) {
        return {
          ...b,
          name: editName,
          phone: editPhone,
          website: editWebsite,
          location: editLocation,
          whatsAppStatus: 'UNVERIFIED' // Reset status so they can verify again if number updated!
        };
      }
      return b;
    }));
    setEditingBizId(null);
  };

  // Auto-update stats
  useEffect(() => {
    const verifiedCount = businesses.filter(b => b.whatsAppStatus === 'ON_WHATSAPP').length;
    setCollectionStats({
      total: businesses.length,
      verified: verifiedCount
    });
    localStorage.setItem('map_data_collected_businesses', JSON.stringify(businesses));
  }, [businesses]);

  // Sync cities dropdown when country changes
  useEffect(() => {
    const match = COUNTRIES.find(c => c.name === selectedCountry);
    if (match && match.cities.length > 0) {
      setSelectedCities([match.cities[0]]);
    }
  }, [selectedCountry]);

  // Poll WhatsApp server status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/whatsapp/status");
        if (!res.ok) throw new Error("Status API error");
        const data = await res.json();
        setWpStatus(data.status);
        setWpQr(data.qrCode);
        setWpPairingCode(data.pairingCode);
        setWpError(data.error);
      } catch (err) {
        console.warn("Could not retrieve WhatsApp connection status", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleWpStart = async (phoneStr?: string) => {
    setWpLoading(true);
    setWpError(null);
    try {
      const res = await fetch("/api/whatsapp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneStr || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start WhatsApp link.");
      }
    } catch (err: any) {
      setWpError(err.message || "Could not spin up link channel.");
    } finally {
      setWpLoading(false);
    }
  };

  const handleWpLogout = async () => {
    setWpLoading(true);
    try {
      await fetch("/api/whatsapp/logout", { method: "POST" });
      setWpStatus('DISCONNECTED');
      setWpQr(null);
      setWpPairingCode(null);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setWpLoading(false);
    }
  };

  // Launch Gemini-based Business search
  const triggerCollection = async () => {
    if (!customCity && selectedCities.length === 0) {
      setError("Please select at least one city or enter a custom city.");
      return;
    }

    setIsCollecting(true);
    setError(null);

    const locationsToCollect = customCity.trim() 
      ? [`${customCity.trim()}, ${selectedCountry}`] 
      : selectedCities.map(city => `${city}, ${selectedCountry}`);

    try {
      let accumulatedBusinesses: any[] = [];
      
      for (const loc of locationsToCollect) {
        setCollectionProgress(`Searching for ${category} in ${loc}...`);
        
        try {
          const response = await fetch("/api/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category, location: loc })
          });
          
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            const rawText = await response.text();
            throw new Error(`Server returned non-JSON response (Status ${response.status}): ${rawText.slice(0, 150)}...`);
          }

          const data = await response.json();
          if (response.ok && data.businesses && data.businesses.length > 0) {
            accumulatedBusinesses = [...accumulatedBusinesses, ...data.businesses];
          } else {
            console.warn(`No results or error for ${loc}:`, data ? data.error : "Unknown");
          }
        } catch (err) {
          console.error(`Error collecting businesses for ${loc}:`, err);
        }
      }

      if (accumulatedBusinesses.length > 0) {
        // Prevent duplicate phone/name pairs
        setBusinesses(prev => {
          const unique = [...prev];
          accumulatedBusinesses.forEach(item => {
            if (!unique.some(u => u.name.toLowerCase() === item.name.toLowerCase() && u.phone === item.phone)) {
              unique.push(item);
            }
          });
          return unique;
        });
      } else {
        throw new Error("No businesses found for physical location queries. Try entering verified zones.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during search.");
    } finally {
      setIsCollecting(false);
      setCollectionProgress('');
    }
  };

  // Bulk query WhatsApp numbers
  const verifyWhatsAppStatuses = async () => {
    if (wpStatus !== 'CONNECTED') {
      setError("Please link your WhatsApp account using the QR or Pairing code dashboard before verifying.");
      return;
    }

    const unverifiedList = businesses.filter(b => b.whatsAppStatus === 'UNVERIFIED');
    if (unverifiedList.length === 0) {
      return;
    }

    setIsVerifyingWA(true);
    setError(null);

    // Batch process in arrays of 5 to avoid overloading
    const phones = unverifiedList.map(b => b.phone).filter(Boolean);
    
    try {
      // Set statuses to VERIFYING
      setBusinesses(prev => prev.map(b => {
        if (b.whatsAppStatus === 'UNVERIFIED') {
          return { ...b, whatsAppStatus: 'VERIFYING' };
        }
        return b;
      }));

      const res = await fetch("/api/whatsapp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones, country: selectedCountry })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Batch verification failed.");
      }

      const results = data.results || {};
      setBusinesses(prev => prev.map(b => {
        if (results[b.phone]) {
          return {
            ...b,
            hasWhatsApp: results[b.phone].hasWhatsApp,
            whatsAppStatus: results[b.phone].hasWhatsApp ? 'ON_WHATSAPP' : 'NOT_ON_WHATSAPP'
          };
        }
        // Recover if omitted
        if (b.whatsAppStatus === 'VERIFYING') {
          return { ...b, whatsAppStatus: 'UNVERIFIED' };
        }
        return b;
      }));
    } catch (err: any) {
      setError(err.message || "Failed to batch query status. Check connection.");
      // Rollback verifying state
      setBusinesses(prev => prev.map(b => {
        if (b.whatsAppStatus === 'VERIFYING') {
          return { ...b, whatsAppStatus: 'UNVERIFIED' };
        }
        return b;
      }));
    } finally {
      setIsVerifyingWA(false);
    }
  };

  // Clear specific item
  const deleteBusiness = (id: string) => {
    setBusinesses(prev => prev.filter(b => b.id !== id));
  };

  // Export CSV fully formatted for Google Sheets & Microsoft Excel
  const exportToCSV = () => {
    if (businesses.length === 0) return;
    const headers = ['Business Name', 'Category', 'Location', 'Website', 'Phone', 'Rating', 'Review Count', 'WhatsApp Registered'];
    
    // Proper escaping for Google Sheets / Excel import
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      // Force cell formatting in Excel/Google Sheets to treat phone digits/codes as text
      if (str.startsWith('+') || (str.startsWith('0') && str.length > 5)) {
        return `="${str.replace(/"/g, '""')}"`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = businesses.map(b => [
      escapeCSV(b.name),
      escapeCSV(b.category),
      escapeCSV(b.location),
      escapeCSV(b.website),
      escapeCSV(b.phone),
      escapeCSV(b.rating),
      escapeCSV(b.reviewCount),
      escapeCSV(b.whatsAppStatus === 'ON_WHATSAPP' ? 'YES' : b.whatsAppStatus === 'NOT_ON_WHATSAPP' ? 'NO' : 'UNKNOWN')
    ]);

    // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel & Google Sheets display international characters and phones correctly
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GoogleSheets_All_Leads_${category.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export WhatsApp active leads fully formatted for Google Sheets & Microsoft Excel
  const exportWhatsAppActiveToExcel = () => {
    const activeLeads = businesses.filter(b => b.whatsAppStatus === 'ON_WHATSAPP');
    if (activeLeads.length === 0) return;
    
    const headers = ['Business Name', 'Category', 'Location', 'Website', 'WhatsApp Number', 'Rating', 'Review Count', 'WhatsApp Status'];
    
    // Proper escaping for Google Sheets / Excel import
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      if (str.startsWith('+') || (str.startsWith('0') && str.length > 5)) {
        return `="${str.replace(/"/g, '""')}"`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = activeLeads.map(b => [
      escapeCSV(b.name),
      escapeCSV(b.category),
      escapeCSV(b.location),
      escapeCSV(b.website),
      escapeCSV(b.phone),
      escapeCSV(b.rating),
      escapeCSV(b.reviewCount),
      escapeCSV('ACTIVE_ON_WHATSAPP')
    ]);

    // Prepend UTF-8 Byte Order Mark (\uFEFF) for immediate accurate rendering in Excel and Google Sheets
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GoogleSheets_WhatsApp_Leads_${category.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-50 text-slate-800 font-sans leading-relaxed flex flex-col antialiased">
      {/* Upper Brand bar */}
      <header id="header-bar" className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-cyan-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-cyan-100">
              MDC
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-900">Map Data Collect</h1>
              <p className="text-xs text-slate-400 font-medium">B2B Lead Collector & WhatsApp Qualifier</p>
            </div>
          </div>
          
          {/* Real-time Connection Widget */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">WhatsApp Socket:</span>
            <div className={`px-3 py-1.5 rounded-full flex items-center space-x-1.5 text-xs font-bold transition-all duration-300 ${
              wpStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
              wpStatus === 'QR_READY' || wpStatus === 'PAIRING_READY' ? 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse' :
              wpStatus === 'CONNECTING' ? 'bg-blue-50 text-blue-700 border border-blue-100 animate-pulse' :
              'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                wpStatus === 'CONNECTED' ? 'bg-emerald-500' :
                wpStatus === 'QR_READY' || wpStatus === 'PAIRING_READY' ? 'bg-amber-500' :
                wpStatus === 'CONNECTING' ? 'bg-blue-500' : 'bg-slate-400'
              }`} />
              <span>{wpStatus === 'CONNECTED' ? 'CONNECTED' : wpStatus}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Setup & Connection & Filters */}
        <section id="config-panel" className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* Card: Search Input Form */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-600" />
                Query Settings
              </h2>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold uppercase tracking-wider">Target API</span>
            </div>

            <div className="space-y-4">
              <div>
                <label id="category-label" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  1. Business Category
                </label>
                <select 
                  id="category-select"
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all duration-150"
                >
                  {CATEGORIES.map((catString) => (
                    <option key={catString} value={catString}>{catString}</option>
                  ))}
                </select>
              </div>

              <div>
                <label id="country-label" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  2. Select Country
                </label>
                <select 
                  id="country-select"
                  value={selectedCountry} 
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all duration-150"
                >
                  {COUNTRIES.map((ct) => (
                    <option key={ct.name} value={ct.name}>{ct.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label id="city-label" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    3. Select Cities ({selectedCities.length})
                  </label>
                  {!customCity && (
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          const match = COUNTRIES.find(c => c.name === selectedCountry);
                          if (match) setSelectedCities(match.cities);
                        }}
                        className="text-[10px] text-cyan-600 hover:text-cyan-800 font-bold tracking-tight transition-all"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCities([])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 font-bold tracking-tight transition-all"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                
                <div className={`border border-slate-200 rounded-xl bg-slate-50 p-2 max-h-48 overflow-y-auto space-y-0.5 transition-all ${customCity ? 'opacity-50 pointer-events-none' : ''}`}>
                  {COUNTRIES.find(c => c.name === selectedCountry)?.cities.map((cityStr) => {
                    const isChecked = selectedCities.includes(cityStr);
                    return (
                      <label 
                        key={cityStr} 
                        className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                          isChecked ? 'bg-cyan-50 text-cyan-800 border-l-2 border-cyan-500' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!!customCity}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCities(prev => prev.filter(c => c !== cityStr));
                            } else {
                              setSelectedCities(prev => [...prev, cityStr]);
                            }
                          }}
                          className="accent-cyan-600 rounded text-cyan-600 cursor-pointer"
                        />
                        <span className="truncate">{cityStr}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label id="custom-city-label" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Or enter Custom City (Overrides select)
                </label>
                <input 
                  id="custom-city-input"
                  type="text" 
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  placeholder="e.g. San Jose, Newcastle"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all duration-150"
                />
              </div>

              <button
                id="collect-btn"
                onClick={triggerCollection}
                disabled={isCollecting}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-cyan-600/10 active:scale-98 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isCollecting ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    <span>Collecting Businesses & Contacts...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4.5 h-4.5" />
                    <span>Search Trustpilot & Directories</span>
                  </>
                )}
              </button>

              {collectionProgress && (
                <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl text-xs font-semibold text-cyan-800 flex items-center space-x-2 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-600" />
                  <span>{collectionProgress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card: WhatsApp Integration Dashboard */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
            <div className="border-b border-slate-50 pb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                WhatsApp Channel Setup
              </h2>
              {wpStatus === 'CONNECTED' && (
                <button 
                  id="logout-wp-btn"
                  onClick={handleWpLogout} 
                  className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              )}
            </div>

            {wpStatus === 'DISCONNECTED' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-normal">
                  Connect your real WhatsApp account to verify if B2B phones gathered have active profiles.
                </p>

                {/* Tabs to trigger Link Mode */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    id="tab-qr"
                    onClick={() => setLinkMethod('qr')}
                    className={`py-1.5 rounded-md text-xs font-bold transition-all ${linkMethod === 'qr' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Scan QR Code
                  </button>
                  <button
                    id="tab-code"
                    onClick={() => setLinkMethod('code')}
                    className={`py-1.5 rounded-md text-xs font-bold transition-all ${linkMethod === 'code' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Pairing Code
                  </button>
                </div>

                {linkMethod === 'qr' ? (
                  <button
                    id="start-qr-btn"
                    onClick={() => handleWpStart()}
                    disabled={wpLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    {wpLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Generate QR Code</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label id="phone-pair-label" className="block text-xs font-bold text-slate-500 uppercase mb-1">Your WhatsApp Phone Number</label>
                      <input
                        id="phone-pair-input"
                        type="text"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        placeholder="e.g. +14155552671"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                    <button
                      id="start-pairing-btn"
                      onClick={() => handleWpStart(pairingPhone)}
                      disabled={wpLoading || !pairingPhone}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
                    >
                      {wpLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Generate Pairing Code</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {wpStatus === 'CONNECTING' && (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
                <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
                <p className="text-xs font-bold text-slate-700">Connecting WhatsApp Session...</p>
                <p className="text-xs text-slate-400">Usually completes in 10-15 seconds.</p>
              </div>
            )}

            {wpStatus === 'QR_READY' && wpQr && (
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <p className="text-xs text-slate-500 font-semibold text-center leading-normal">
                  Open WhatsApp &gt; Linked Devices &gt; Link a Device. Scan the QR code below:
                </p>
                <div className="p-3 bg-white border border-slate-150 rounded-xl shadow-xs">
                  <img src={wpQr} alt="WhatsApp Connection QR Code" className="w-48 h-48 block" />
                </div>
                <button
                  id="cancel-qr-btn"
                  onClick={handleWpLogout}
                  className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                >
                  Cancel Scan
                </button>
              </div>
            )}

            {wpStatus === 'PAIRING_READY' && wpPairingCode && (
              <div className="flex flex-col items-center justify-center py-4 text-center space-y-4">
                <p className="text-xs text-slate-500 font-semibold leading-normal">
                  Open WhatsApp notification on your phone and enter this code:
                </p>
                <div className="px-5 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                  <span className="text-2xl font-black tracking-widest text-emerald-600 select-all font-mono">
                    {wpPairingCode}
                  </span>
                </div>
                <button
                  id="cancel-pairing-btn"
                  onClick={handleWpLogout}
                  className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                >
                  Cancel Pairing
                </button>
              </div>
            )}

            {wpStatus === 'CONNECTED' && (
              <div className="bg-emerald-50/50 rounded-xl p-3.5 border border-emerald-100/50 flex items-start space-x-3 text-emerald-900">
                <div className="bg-emerald-500 text-white rounded-lg p-1.5">
                  <Check className="w-4 h-4 block" />
                </div>
                <div>
                  <h4 className="text-xs font-bold">Successfully Connected!</h4>
                  <p className="text-xs text-emerald-700/80 mt-0.5 leading-normal">
                    The active session can now execute bulk status validations of all retrieved business phones.
                  </p>
                </div>
              </div>
            )}

            {wpError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{wpError}</span>
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Leads List & Controls */}
        <section id="results-panel" className="lg:col-span-8 flex flex-col space-y-4">
          
          {/* Quick Metrics & Global Controls Row */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-xs px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-6 w-full sm:w-auto">
              <div>
                <span className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Leads</span>
                <span className="text-2xl font-black text-slate-900">{collectionStats.total}</span>
              </div>
              <div className="h-8 w-px bg-slate-100" />
              <div>
                <span className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider">Verified WA</span>
                <span className="text-2xl font-black text-emerald-600">{collectionStats.verified}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              {businesses.length > 0 && (
                <>
                  <button
                    id="verify-wa-btn"
                    onClick={verifyWhatsAppStatuses}
                    disabled={isVerifyingWA || wpStatus !== 'CONNECTED'}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all outline-none ${
                      wpStatus === 'CONNECTED'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-97'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isVerifyingWA ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Verify WA ({businesses.filter(b => b.whatsAppStatus === 'UNVERIFIED').length})</span>
                      </>
                    )}
                  </button>

                  <button
                    id="export-csv-btn"
                    onClick={exportToCSV}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center space-x-1.5 active:scale-97 transition-all border border-slate-200/40 shadow-xs"
                    title="Download fully optimized CSV compatible with immediate Google Sheets import"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Download Google Sheets (All)</span>
                  </button>

                  <button
                    id="export-excel-wa-btn"
                    onClick={exportWhatsAppActiveToExcel}
                    disabled={businesses.filter(b => b.whatsAppStatus === 'ON_WHATSAPP').length === 0}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all outline-none ${
                      businesses.filter(b => b.whatsAppStatus === 'ON_WHATSAPP').length > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-97 shadow-md shadow-emerald-100/45'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50'
                    }`}
                    title="Download only validated active WhatsApp profiles formatted perfectly for Google Sheets import"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Google Sheets (WhatsApp Active)</span>
                  </button>

                  <button
                    id="clear-all-btn"
                    onClick={() => setBusinesses([])}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold p-2 rounded-xl text-xs flex items-center justify-center hover:scale-105 transition-all"
                    title="Clear collection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-900 rounded-xl text-sm flex items-start space-x-3 shadow-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold">Execution Error</h4>
                <p className="text-rose-700 text-xs mt-0.5 leading-normal">{error}</p>
              </div>
            </div>
          )}

          {/* Business Listing Canvas */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs flex-1 flex flex-col min-h-[450px]">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Collected B2B Directories</h3>
              {businesses.length > 0 && (
                <span className="text-xs text-slate-400 font-bold tracking-tight">
                  Displaying {businesses.length} items
                </span>
              )}
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[600px] space-y-3">
              {businesses.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 px-4">
                  <div className="h-16 w-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4 shadow-xs">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-base">Workspace is Empty</h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1 leading-normal">
                    Use the query filters on the left to discover real locksmiths, restaurants, tree services, or other high utility categories in key global zones.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <AnimatePresence>
                    {businesses.map((biz) => {
                      const isEditing = editingBizId === biz.id;
                      return (
                        <motion.div
                          key={biz.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className={`bg-white border rounded-xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 relative group min-h-[175px] ${
                            isEditing ? 'border-cyan-500 ring-2 ring-cyan-500/15' : 'border-slate-150 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-3 w-full">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="text-[10px] bg-cyan-50 text-cyan-700 font-extrabold uppercase px-2 py-0.5 rounded tracking-wide border border-cyan-100">
                                  Editing Lead Details
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">{biz.location}</span>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">Business Name</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">Phone Number (include Country Code)</label>
                                  <input
                                    type="text"
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    placeholder="e.g. +14155552671"
                                    className="w-full bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">Website</label>
                                  <input
                                    type="text"
                                    value={editWebsite}
                                    onChange={(e) => setEditWebsite(e.target.value)}
                                    placeholder="e.g. www.example.com"
                                    className="w-full bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">Full Physical Location / Address</label>
                                  <input
                                    type="text"
                                    value={editLocation}
                                    onChange={(e) => setEditLocation(e.target.value)}
                                    placeholder="e.g. 123 Broadway Main Road, New York, NY 10001"
                                    className="w-full bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-white"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                                <button
                                  onClick={() => saveEdit(biz.id)}
                                  className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer active:scale-95 transition-all shadow-xs"
                                >
                                  Save Lead
                                </button>
                                <button
                                  onClick={() => setEditingBizId(null)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer active:scale-95 transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                      <span className="text-[10px] bg-slate-100 text-slate-600 font-extrabold uppercase px-2 py-0.5 rounded tracking-wide">
                                        {biz.category}
                                      </span>
                                      {biz.isSimulated && (
                                        <span className="text-[10px] bg-amber-50/70 text-amber-700 font-bold uppercase px-2 py-0.5 rounded tracking-wide border border-amber-100">
                                          Simulated Fallback
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="font-extrabold text-slate-900 mt-1.5 text-sm line-clamp-1 leading-tight pr-14">
                                      <a
                                        href={biz.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${biz.name} ${biz.location}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-cyan-600 hover:underline inline-flex items-center gap-1 cursor-pointer transition-all duration-150"
                                        title={`Open "${biz.name}" on Google Maps`}
                                      >
                                        <span>{biz.name}</span>
                                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                                      </a>
                                    </h4>
                                    <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                      {biz.location}
                                    </p>
                                  </div>
                                  
                                  <div className="flex items-center space-x-1 absolute top-3.5 right-3.5 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                      onClick={() => startEditing(biz)}
                                      className="text-slate-500 hover:text-cyan-600 p-1.5 rounded-lg bg-white border border-slate-100 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer transition-all"
                                      title="Edit Details"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => deleteBusiness(biz.id)}
                                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg bg-white border border-slate-100 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer transition-all"
                                      title="Delete Lead"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Ratings info */}
                                <div className="flex items-center space-x-1.5 mt-2.5">
                                  <div className="flex items-center text-amber-500">
                                    <Star className="w-3 h-3 fill-current" />
                                    <span className="text-xs font-black ml-0.5">{biz.rating.toFixed(1)}</span>
                                  </div>
                                  <span className="text-slate-300">|</span>
                                  <span className="text-xs text-slate-400">{biz.reviewCount || 0} reviews</span>
                                  <span className="text-xs bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-100/50 transform scale-90 font-bold">
                                    Trustpilot
                                  </span>
                                </div>
                              </div>

                              {/* Contact details & validation status */}
                              <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                                <div className="space-y-1">
                                  {biz.phone ? (
                                    <div className="flex items-center text-slate-600 font-medium">
                                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
                                      <span className="font-mono">{biz.phone}</span>
                                    </div>
                                  ) : (
                                    <div className="text-slate-300 italic">No Phone Number</div>
                                  )}
                                  
                                  {biz.website && (
                                    <a 
                                      href={biz.website.startsWith('http') ? biz.website : `https://${biz.website}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="flex items-center text-cyan-600 hover:text-cyan-800 font-semibold"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                      <span className="truncate max-w-[140px]">{biz.website.replace(/(^\w+:|^)\/\/(www\.)?/, '')}</span>
                                    </a>
                                  )}
                                </div>

                                {/* Status Badge */}
                                <div>
                                  {biz.whatsAppStatus === 'UNVERIFIED' && (
                                    <span className="bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded-lg text-[10px] tracking-wide border border-slate-200">
                                      UNVERIFIED
                                    </span>
                                  )}
                                  {biz.whatsAppStatus === 'VERIFYING' && (
                                    <span className="bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded-lg text-[10px] tracking-wide border border-blue-100 animate-pulse flex items-center space-x-1">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>CHECKING</span>
                                    </span>
                                  )}
                                  {biz.whatsAppStatus === 'ON_WHATSAPP' && (
                                    <a
                                      href={`https://wa.me/${biz.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${biz.name},`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide border border-emerald-500/30 flex items-center space-x-1 font-sans cursor-pointer transition-all duration-150 shadow-xs"
                                      title="Open WhatsApp Chat"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5 fill-current" />
                                      <span>WA ACTIVE (CHAT)</span>
                                    </a>
                                  )}
                                  {biz.whatsAppStatus === 'NOT_ON_WHATSAPP' && (
                                    <span className="bg-rose-50 text-rose-600 font-bold px-2 py-1 rounded-lg text-[10px] tracking-wide border border-rose-100 flex items-center space-x-1">
                                      <XCircle className="w-3 h-3 text-rose-400" />
                                      <span>NO WA</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
            
            {businesses.length > 0 && wpStatus !== 'CONNECTED' && (
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center space-x-2">
                <Info className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                <span>Hook up your WhatsApp socket on the left panel to execute automatic status verification.</span>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
