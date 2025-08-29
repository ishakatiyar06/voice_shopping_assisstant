// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

dotenv.config();
const HF_KEY = process.env.HUGGINGFACE_API_KEY || null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Local catalog
const CATALOG = [
  { name: "milk", category: "Dairy", price: 58, seasonal: [] },
  { name: "almond milk", category: "Dairy", price: 120, seasonal: [] },
  { name: "bread", category: "Bakery", price: 45, seasonal: [] },
  { name: "eggs", category: "Dairy", price: 70, seasonal: [] },
  { name: "banana", category: "Produce", price: 60, seasonal: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] },
  { name: "mango", category: "Produce", price: 120, seasonal: ["Apr","May","Jun","Jul"] },
  { name: "apple", category: "Produce", price: 160, seasonal: ["Sep","Oct","Nov","Dec","Jan"] },
  { name: "rice", category: "Grocery", price: 60, seasonal: [] },
  { name: "atta", category: "Grocery", price: 50, seasonal: [] },
  { name: "toothpaste", category: "Personal Care", price: 95, seasonal: [] }
];

const SUBS = {
  milk: ["almond milk"],
  bread: ["atta"],
  eggs: ["paneer"]
};

const numberMap = {
  ek: "1", do: "2", teen: "3", char: "4", chaar: "4", panch: "5",
  six: "6", sat: "7", aath: "8", nau: "9", das: "10",
  one: "1", two: "2", three: "3", four: "4", five: "5"
};

const hindiMap = {
  doodh: "milk", dudh: "milk",
  seb: "apple", aam: "mango",
  anda: "eggs", roti: "bread"
};

// ✅ Normalize input (numbers, Hindi, plurals)
function normalizeInput(input) {
  let words = input.toLowerCase().split(/\s+/);

  words = words.map(w => numberMap[w] ? numberMap[w] : w);
  words = words.map(w => hindiMap[w] ? hindiMap[w] : w);
  words = words.map(w => w === "kilo" ? "1" : w);
  words = words.map(w => w.endsWith("s") ? w.slice(0, -1) : w); // plural → singular

  return words.join(" ");
}

// Fallback suggestion engine
function localSuggest(historyStr = "") {
  const have = historyStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const suggestions = [];

  have.forEach(h => {
    if (SUBS[h]) SUBS[h].forEach(s => { if (!suggestions.includes(s)) suggestions.push(s); });
  });

  const month = new Date().toLocaleString('en-US', { month: 'short' });
  const seasonal = CATALOG.filter(c => c.seasonal && c.seasonal.includes(month)).map(c=>c.name);
  seasonal.forEach(s => { if(!suggestions.includes(s)) suggestions.push(s); });

  CATALOG.forEach(c => {
    if (!have.includes(c.name) && suggestions.length < 8) suggestions.push(c.name);
  });

  return suggestions.slice(0, 8);
}

// ✅ Get price from catalog or AI
async function getPriceForItem(itemName) {
  const found = CATALOG.find(c => c.name.toLowerCase() === itemName.toLowerCase());
  if (found) return found.price;

  if (!HF_KEY) return Math.floor(Math.random() * 80) + 20;

  try {
    const prompt = `Assign a realistic price in INR (just a number, no text) for this grocery item: "${itemName}"`;
    const hfResp = await fetch(`https://api-inference.huggingface.co/models/google/flan-t5-small`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    const json = await hfResp.json();
    let raw = null;
    if (Array.isArray(json) && json[0]?.generated_text) {
      raw = json[0].generated_text;
    } else if (typeof json === "string") {
      raw = json;
    }

    const price = parseInt((raw || "").replace(/[^\d]/g, ""));
    if (!isNaN(price) && price > 5) return price;
  } catch (err) {
    console.error("HF pricing error:", err.message);
  }

  return Math.floor(Math.random() * 80) + 20;
}

// Suggest endpoint
app.post("/suggest", async (req, res) => {
  const input = (req.body.input || "").toString();
  console.log("[/suggest] input:", input);

  if (!HF_KEY) {
    return res.json({ suggestions: localSuggest(input), info: "local suggestions" });
  }

  try {
    const prompt = `Suggest up to 8 grocery items (comma separated, lowercase) based on this shopping history: ${input}`;
    const model = "google/flan-t5-small";
    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    const json = await hfResp.json();
    let suggestions = [];

    if (Array.isArray(json) && json[0]?.generated_text) {
      suggestions = json[0].generated_text.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
    } else if (typeof json === "string") {
      suggestions = json.split(/[,\n;]+/).map(s=>s.trim()).filter(Boolean);
    } else {
      suggestions = localSuggest(input);
    }

    return res.json({ suggestions: suggestions.slice(0, 8) });
  } catch (err) {
    console.error("HF call failed:", err?.message || err);
    return res.json({ suggestions: localSuggest(input), error: "HF failed - local suggestions" });
  }
});

// ✅ Price endpoint (handles Hindi + plurals + AI)
app.post("/price", async (req, res) => {
  const raw = (req.body.item || "").toString();
  const norm = normalizeInput(raw);

  const price = await getPriceForItem(norm);
  res.json({ item: norm, price });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));