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
      browser: ["Chrome (Linux)", "", ""], // Critical prefix for pairing code to prevent 400 bad request / stream error 515
    });

    // If a phone is provided and the app is not already authenticated, request a pairing code
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
            console.log(`Pairing code generated successfully: ${code}`);
          }
        } catch (err: any) {
          console.error("Failed to request pairing code:", err);
          lastWpError = `Failed to generate code: ${err.message || String(err)}`;
          connectionStatus = "DISCONNECTED";
        }
      }, 5000); // 5000ms delay to ensure connection transport has stabilized
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
          console.log(`Connection closed (code: ${errorStatusCode}), attempting reconnect in 3s...`);
          connectionStatus = activePhone ? "PAIRING_READY" : "CONNECTING";
          lastWpError = "Connection temporarily interrupted. Reconnecting...";
          setTimeout(() => connectToWhatsApp(activePhone || undefined), 3000);
        } else {
          console.log("Logged out from WhatsApp. Purging session folder...");
          connectionStatus = "DISCONNECTED";
          pairingCode = null;
          lastPhoneToMatch = null;
          lastWpError = "Logged out from WhatsApp successfully.";
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
        console.log("WhatsApp Web Client successfully handshaked and connected!");
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

// Automatically try to resume connection if session exists
try {
  if (fs.existsSync(authFolder) && fs.readdirSync(authFolder).length > 2) {
    console.log("Found existing WhatsApp session files. Resuming connection...");
    connectToWhatsApp().catch(err => console.error("Auto connection resumption failed:", err));
  }
} catch (e) {
  console.warn("No prior session folder detected or unable to read it.");
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

  // To guarantee a flawless and clean connection attempt, close the existing socket 
  // and delete any stale/partially initialized session folder files first.
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
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {}
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }
    
    connectionStatus = "DISCONNECTED";
    qrCodeImage = null;
    qrText = null;

    try {
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Failed to remove auth info folder on logout route", e);
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

router.post("/check", async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: "Phone number is required" });
  }

  if (!sock || connectionStatus !== "CONNECTED") {
    return res.status(400).json({ success: false, error: "WhatsApp is not connected to any device. Please scan the QR code." });
  }

  try {
    const cleanPhone = phone.replace(/[^\d]/g, "");
    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: "Invalid phone number format." });
    }

    const resList = await sock.onWhatsApp(cleanPhone);
    if (resList && resList.length > 0) {
      const match = resList[0];
      return res.json({
        success: true,
        exists: match.exists,
        jid: match.jid,
      });
    }

    return res.json({
      success: true,
      exists: false,
      reason: "No WhatsApp profile registered for this number"
    });
  } catch (err: any) {
    console.error(`onWhatsApp failed for phone: ${phone}:`, err);
    return res.json({
      success: true,
      exists: false,
      error: err.message || String(err),
      reason: "Verification failed or timed out"
    });
  }
});

export default router;
