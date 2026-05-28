import { Router } from "express";
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

const router = Router();
const authFolder = path.join(process.cwd(), "baileys_auth_info");

let sock: any = null;
let connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'PAIRING_READY' = 'DISCONNECTED';
let qrText: string | null = null;
let qrCodeImage: string | null = null;
let pairingCode: string | null = null;
let lastPhoneToMatch: string | null = null;
let lastWpError: string | null = null;

const silentLogger: any = {
  level: "silent",
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silentLogger,
};

async function connectToWhatsApp(phoneToMatch?: string) {
  try {
    if (phoneToMatch) {
      lastPhoneToMatch = phoneToMatch;
    }
    
    if (sock) {
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    connectionStatus = "CONNECTING";
    qrCodeImage = null;
    qrText = null;
    pairingCode = null;
    lastWpError = null;

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger,
      browser: ["Ubuntu", "Chrome", "110.0.5563.147"], // Standard modern browser tuple for stability
    });

    const phoneNum = phoneToMatch || lastPhoneToMatch;
    if (phoneNum && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          if (sock && !sock.authState.creds.registered) {
            console.log(`Requesting pairing code for: ${phoneNum}`);
            const code = await sock.requestPairingCode(phoneNum);
            pairingCode = code;
            connectionStatus = "PAIRING_READY";
            lastWpError = null;
            console.log(`Pairing code generated: ${code}`);
          }
        } catch (err: any) {
          console.error("Failed to request pairing code:", err);
          lastWpError = `Failed to generate code: ${err.message || String(err)}`;
          connectionStatus = "DISCONNECTED";
        }
      }, 5000);
    }

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      const activePhone = phoneToMatch || lastPhoneToMatch;
      if (qr && !activePhone) {
        qrText = qr;
        connectionStatus = "QR_READY";
        lastWpError = null;
        try {
          qrCodeImage = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error("Failed to generate QR DataURL:", err);
        }
      }

      if (connection === "close") {
        const errorStatusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = errorStatusCode === DisconnectReason.loggedOut;
        
        qrCodeImage = null;
        qrText = null;
        
        if (!loggedOut) {
          console.log(`Connection closed (code: ${errorStatusCode}), attempting reconnect...`);
          connectionStatus = activePhone ? "PAIRING_READY" : "CONNECTING";
          lastWpError = "Interrupted. Reconnecting...";
          setTimeout(() => connectToWhatsApp(activePhone || undefined), 3000);
        } else {
          console.log("Logged out from WhatsApp. Purging session...");
          connectionStatus = "DISCONNECTED";
          pairingCode = null;
          lastPhoneToMatch = null;
          lastWpError = "Logged out successfully.";
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e) {
            console.error("Failed to clean session folder:", e);
          }
          sock = null;
        }
      } else if (connection === "open") {
        console.log("WhatsApp Web Client successfully connected!");
        connectionStatus = "CONNECTED";
        qrCodeImage = null;
        qrText = null;
        pairingCode = null;
        lastWpError = null;
      }
    });

    sock.ev.on("creds.update", saveCreds);

  } catch (error: any) {
    console.error("Error starting Baileys connection:", error);
    lastWpError = `Initialization error: ${error.message || String(error)}`;
    connectionStatus = "DISCONNECTED";
  }
}

// Automatically resume connection if session exists
try {
  if (fs.existsSync(authFolder) && fs.readdirSync(authFolder).length > 2) {
    console.log("Found existing WhatsApp session files. Resuming...");
    connectToWhatsApp().catch(err => console.error("Auto connection resumption failed:", err));
  }
} catch (e) {
  console.warn("No prior session folder detected.");
}

router.get("/status", (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: qrCodeImage,
    pairingCode: pairingCode,
    error: lastWpError,
  });
});

router.post("/start", async (req, res) => {
  const { phone } = req.body;

  if (connectionStatus === "CONNECTED") {
    return res.json({ success: true, message: "Already connected" });
  }
  
  let cleanPhone = null;
  if (phone) {
    cleanPhone = phone.replace(/[^\d]/g, "");
    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: "Invalid phone number format." });
    }
  }

  if (sock) {
    try {
      sock.end();
    } catch (e) {}
    sock = null;
  }
  
  connectionStatus = "CONNECTING";
  qrCodeImage = null;
  qrText = null;
  pairingCode = null;
  lastPhoneToMatch = cleanPhone;
  lastWpError = null;

  try {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("Failed to delete existing authFolder before fresh start", e);
  }

  connectToWhatsApp(cleanPhone || undefined);
  res.json({ success: true, message: "Connection process initiated" });
});

router.post("/logout", async (req, res) => {
  if (sock) {
    try {
      sock.logout();
    } catch (e) {}
    try {
      sock.end();
    } catch (e) {}
    sock = null;
  }
  
  connectionStatus = "DISCONNECTED";
  qrCodeImage = null;
  qrText = null;
  pairingCode = null;
  lastPhoneToMatch = null;
  lastWpError = "Logged out successfully.";

  try {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("Failed to purge session folder on logout:", e);
  }
  
  res.json({ success: true, message: "Logged out from WhatsApp." });
});

// Helper to normalize phone number based on expected Country
function normalizeVerifyPhone(phone: string, country: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return "";

  // Map country name to dial code
  const countryLower = country.toLowerCase();
  let dial = "";
  if (countryLower.includes("bangladesh") || countryLower.includes("bd")) {
    dial = "880";
  } else if (countryLower.includes("united kingdom") || countryLower.includes("uk") || countryLower.includes("gb")) {
    dial = "44";
  } else if (countryLower.includes("australia") || countryLower.includes("au")) {
    dial = "61";
  } else if (countryLower.includes("india") || countryLower.includes("in")) {
    dial = "91";
  } else if (countryLower.includes("united arab emirates") || countryLower.includes("dubai") || countryLower.includes("uae") || countryLower.includes("ae")) {
    dial = "971";
  } else if (countryLower.includes("saudi arabia") || countryLower.includes("saudi") || countryLower.includes("ksa") || countryLower.includes("sa")) {
    dial = "966";
  } else if (countryLower.includes("germany") || countryLower.includes("de")) {
    dial = "49";
  } else if (countryLower.includes("canada") || countryLower.includes("ca")) {
    dial = "1";
  } else if (countryLower.includes("united states") || countryLower.includes("usa") || countryLower.includes("us")) {
    dial = "1";
  } else {
    dial = "1"; // Default fallback
  }

  // If phone starts with "+", keep it (but remove "+")
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // If phone starts with "00", replace with empty
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  // If it starts with country dial code followed by "0", strip the "0" (e.g. UK +44074... -> +4474...)
  if (dial && cleaned.startsWith(dial + "0") && cleaned.length > dial.length + 5) {
    cleaned = dial + cleaned.slice(dial.length + 1);
  } else if (cleaned.startsWith("0") && cleaned.length > 5) {
    // Handle local prefix "0" (common in UK, Aus, BD, India)
    cleaned = cleaned.slice(1);
    cleaned = dial + cleaned;
  } else if (dial && !cleaned.startsWith(dial)) {
    // If it lacks country code, prepend it
    cleaned = dial + cleaned;
  }

  return cleaned;
}

// Verify numbers on WhatsApp with concurrent chunk processing and robust normalization
router.post("/verify", async (req, res) => {
  if (connectionStatus !== "CONNECTED" || !sock) {
    return res.status(400).json({ success: false, error: "WhatsApp is not connected. Please hook up your WhatsApp account first." });
  }

  const { phones, country } = req.body;
  if (!Array.isArray(phones)) {
    return res.status(400).json({ success: false, error: "phones must be an array of phone strings." });
  }

  const targetCountry = country || "United States";
  const results: Record<string, { hasWhatsApp: boolean; exists?: boolean; jid?: string; premiumStatus?: string }> = {};

  // Process in chunks of 10 to keep it blazing fast while protecting the socket connection
  const batchSize = 10;
  for (let i = 0; i < phones.length; i += batchSize) {
    const chunk = phones.slice(i, i + batchSize);
    await Promise.all(chunk.map(async (phone) => {
      try {
        const cleanPhone = normalizeVerifyPhone(phone, targetCountry);
        if (!cleanPhone) {
          results[phone] = { hasWhatsApp: false };
          return;
        }

        // 1. Try with explicit JID suffix (Standard Baileys spec)
        const onWa = await sock.onWhatsApp(cleanPhone + "@s.whatsapp.net");
        if (onWa && onWa.length > 0 && onWa[0].exists) {
          results[phone] = {
            hasWhatsApp: true,
            exists: true,
            jid: onWa[0].jid
          };
        } else {
          // 2. Fallback check with digits only
          const onWaBackup = await sock.onWhatsApp(cleanPhone);
          if (onWaBackup && onWaBackup.length > 0 && onWaBackup[0].exists) {
            results[phone] = {
              hasWhatsApp: true,
              exists: true,
              jid: onWaBackup[0].jid
            };
          } else {
            results[phone] = { hasWhatsApp: false };
          }
        }
      } catch (err: any) {
        console.warn(`Error verifying number ${phone}:`, err);
        results[phone] = { hasWhatsApp: false };
      }
    }));
  }

  res.json({ success: true, results });
});

export default router;
