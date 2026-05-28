import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import whatsappRouter from "./server/whatsapp.js";
import { collectBusinessesFromWeb } from "./server/gemini.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API: WhatsApp integration
app.use("/api/whatsapp", whatsappRouter);

// API: Search/Collect businesses
app.post("/api/collect", async (req, res) => {
  try {
    const { category, location } = req.body;
    if (!category || !location) {
      return res.status(400).json({ error: "Category and Location are required." });
    }

    console.log(`Starting collection for Category: ${category}, Location: ${location}`);
    const results = await collectBusinessesFromWeb(category, location);
    res.json({ success: true, businesses: results });
  } catch (error: any) {
    console.error("Collection endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to search and collect businesses." });
  }
});

async function start() {
  // Serve frontend assets
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on code-3000 http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
});
