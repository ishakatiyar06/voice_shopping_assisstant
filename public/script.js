// public/script.js
// Full, merged, production-friendly frontend script for Voice Shopping Assistant
document.addEventListener("DOMContentLoaded", () => {
  // Elements (from your index.html)
  const langSel = document.getElementById("lang");
  const micBtn = document.getElementById("micBtn");
  const stopBtn = document.getElementById("stopBtn");
  const suggestBtn = document.getElementById("suggestBtn");
  const clearBtn = document.getElementById("clearBtn");
  const textInput = document.getElementById("textInput");
  const sendBtn = document.getElementById("sendBtn");
  const recognizedText = document.getElementById("recognizedText");
  const cartList = document.getElementById("cartList");
  const suggestionsBox = document.getElementById("suggestionsBox");
  const statusEl = document.getElementById("status");
  const toastEl = document.getElementById("toast");

  // Add a prominent suggestions element above cart
  const prominentSuggestionsEl = document.createElement("div");
  prominentSuggestionsEl.className = "prominent-suggestions";
  prominentSuggestionsEl.style.display = "none";
  prominentSuggestionsEl.style.padding = "10px";
  prominentSuggestionsEl.style.marginBottom = "12px";
  prominentSuggestionsEl.style.border = "1px solid #e6edf3";
  prominentSuggestionsEl.style.borderRadius = "8px";
  prominentSuggestionsEl.style.background = "#fbfdff";
  if (cartList && cartList.parentElement)
    cartList.parentElement.insertBefore(prominentSuggestionsEl, cartList);

  // Total price element below cart
  let totalPriceEl = document.createElement("div");
  totalPriceEl.id = "cartTotal";
  totalPriceEl.style.marginTop = "10px";
  totalPriceEl.style.fontWeight = "700";
  if (cartList && cartList.parentElement)
    cartList.parentElement.appendChild(totalPriceEl);

  // LocalStorage keys
  const LS_CART = "vsa:cart";
  const LS_HISTORY = "vsa:history";

  // Catalog
  const CATALOG = [
    { name: "milk", price: 58, category: "Dairy" },
    { name: "almond milk", price: 120, category: "Dairy" },
    { name: "bread", price: 45, category: "Bakery" },
    { name: "eggs", price: 70, category: "Dairy" },
    { name: "banana", price: 60, category: "Produce" },
    { name: "mango", price: 120, category: "Produce" },
    { name: "apple", price: 160, category: "Produce" },
    { name: "rice", price: 60, category: "Grocery" },
    { name: "atta", price: 50, category: "Grocery" },
    { name: "toothpaste", price: 95, category: "Personal Care" },
    { name: "biscuits", price: 30, category: "Snacks" },
    { name: "parle-g biscuits", price: 10, category: "Snacks" }
  ];

  const SUBS = { milk: ["almond milk"], bread: ["atta"], eggs: ["paneer"] };
  const FBT = { bread: ["butter", "jam"], milk: ["biscuits"], biscuits: ["milk", "tea"] };

  // State
  let cart = loadCart();
  let history = loadHistory();
  let recognition = null;

  // Helpers
  function saveCart() { localStorage.setItem(LS_CART, JSON.stringify(cart)); }
  function saveHistory() { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); }
  function loadCart() { try { return JSON.parse(localStorage.getItem(LS_CART)) || []; } catch(e) { return []; } }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch(e) { return []; } }
  function capitalize(str) {if (!str) return ""; return str.charAt(0).toUpperCase() + str.slice(1);}
  function toast(msg, t = 1800) { toastEl.textContent = msg; toastEl.classList.remove("hidden"); setTimeout(()=> toastEl.classList.add("hidden"), t); }
  function norm(s) { return (s || "").toString().trim().toLowerCase(); }

  // Numbers
  const NUM_WORDS = {
    one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
    ek:1,do:2,teen:3,char:4,chaar:4,paanch:5,panch:5,chhe:6,che:6,saat:7,aath:8,nau:9,das:10
  };

  // Hindi words
  const HINDI_MAP = {
    dudh: "milk", doodh: "milk", seb: "apple", aam: "mango",
    anda: "eggs", ande: "eggs", chawal: "rice", aata: "atta",
    roti: "bread", biskut: "biscuits", biscuit: "biscuits", paneer: "paneer"
  };

  // --- NLP helpers ---
  function extractPriceCap(text) {
    const m = text.match(/\b(?:under|below|less than|से कम|कम)\s*(?:₹|rs\.?|rupees|\$)?\s*(\d+)\b/i);
    if(m) return parseInt(m[1],10);
    return undefined;
  }
  function extractPriceRange(text) {
    const m = text.match(/\b(?:between|from)\s*(\d+)\s*(?:and|to)\s*(\d+)\b/i);
    if (m) return { min: parseInt(m[1],10), max: parseInt(m[2],10) };
    return undefined;
  }
  function preprocessHindi(input) {
    if(!input) return "";
    let s = input.toLowerCase();
    Object.keys(HINDI_MAP).forEach(k => {
      s = s.replace(new RegExp("\\b"+k+"\\b","ig"), HINDI_MAP[k]);
    });
    return s;
  }
  function removePriceExpressions(text) {
    if(!text) return text;
    text = text.replace(/\b(?:under|below|less than|से कम|कम)\b[^\d₹$]*[₹$]?\s*\d+\b/ig, " ");
    text = text.replace(/\b(?:between|from)\b[^\n]*?\b(?:and|to)\b[^\n]*?\d+\b/ig, " ");
    text = text.replace(/[₹$]\s*\d+\b/ig, " ");
    text = text.replace(/\b\d+\s*(?:rs|rs\.|rupees|inr|dollars|bucks)?\b/ig, " ");
    return text;
  }
  function extractQuantity(text) {
    if(!text) return 1;
    const sanitized = removePriceExpressions(text);
    const m = sanitized.match(/\b(\d+)\b/);
    if(m) return Math.max(1, parseInt(m[1], 10));
    for(const k in NUM_WORDS) {
      if(new RegExp("\\b"+k+"\\b","i").test(sanitized)) return NUM_WORDS[k];
    }
    return 1;
  }

  // ✅ NEW: split into multiple items
  function extractItems(text) {
    if (!text) return [];
    let t = preprocessHindi(text);
    t = removePriceExpressions(t);
    t = t.replace(/\b(i need to buy|i want to buy|i want|i need to|i need|please add|please|add to my list|add to the list|add|buy|buy me|get|put|include|i'll buy|suggest|recommend|recommendation|show|show me|find|search|look for|bring|to)\b/ig, ' ');
    t = t.replace(/\b(remove|delete|drop|remove from my list|delete from my list|हटा|निकालो|डिलीट|हटाओ)\b/ig, ' ');
    t = t.replace(/\b(of|for|my|the|a|an|in|organic|fresh|pack|packet|packets|kg|kgs|kilogram|kilograms|liter|litre|ltr|bottle|bottles|piece|pieces|pcs|dozen|items?)\b/ig, ' ');
    t = t.replace(/\b(\d+(\.\d+)?)\b/g, ' ');
    let parts = t.split(/\band\b|,|&/i).map(p => p.trim()).filter(Boolean);
    return parts;
  }

  function getCatalogItemLocal(name) {
    if(!name) return undefined;
    const q = norm(name);
    let match = CATALOG.find(c => norm(c.name) === q);
    if(match) return match;
    match = CATALOG.find(c => c.name.includes(q) || q.includes(c.name));
    return match;
  }

  function guessCategory(name) {
    const m = getCatalogItemLocal(name);
    if(m) return m.category || "Other";
    if(/\b(milk|paneer|egg|curd|butter|ghee|mayonise|doodh|dudh|dahi)\b/.test(name)) return "Dairy";
    if(/\b(rice|atta|dal|flour|pulses|jam|masala|coffee|tea|sugar|salt|drink|cold drink|soft drink|ice cream|chawal)\b/.test(name)) return "Grocery";
    if(/\b(apple|banana|mango|orange|potato|tomato|onion|strawberry| lemon)\b/.test(name)) return "Produce";
    if(/\b(toothpaste|toothbrush|soap|shampoo | face cream| towel|facewash)\b/.test(name)) return "Personal Care";
    if(/\b(biscuit|biscuits|cookie|cookies|chocolate|chips| kurkure|namkeen|dry fruit| roasted nuts|chocolate spread)\b/.test(name)) return "Snacks";
    return "Other";
  }

  // --- Cart helpers ---
  function addToCart(name, qty=1, price=0) {
    name = norm(name);
    if(!name) { toast("Cannot add empty item"); return; }
    const unit = "";
    const idx = cart.findIndex(i => i.name === name && i.unit === unit);
    const category = guessCategory(name);
    if(idx >= 0) {
      cart[idx].qty = Math.max(1, cart[idx].qty + qty);
      cart[idx].price = cart[idx].price || price;
    } else {
      cart.push({ id: Date.now().toString(36), name, qty: Math.max(1, qty), unit, category, price });
    }
    saveCart();
    history.unshift(name);
    history = Array.from(new Set(history)).slice(0,200);
    saveHistory();
    renderCart();
    toast(`${qty} × ${name} added`);
    const fbt = FBT[name];
    if(fbt && fbt.length) showSuggestions(fbt, `Often bought with ${name}:`);
  }
  function removeFromCartByName(name) {
    name = norm(name);
    const before = cart.length;
    cart = cart.filter(i => !i.name.includes(name));
    saveCart();
    renderCart();
    return before !== cart.length;
  }
  function updateQty(id, newQty) {
    const it = cart.find(x=>x.id===id);
    if(!it) return;
    it.qty = Math.max(1, newQty);
    saveCart();
    renderCart();
  }
  function renderCart() {
    cartList.innerHTML = "";
    if(cart.length === 0) {
      const li = document.createElement("li");
      li.style.color = "#666";
      li.textContent = "Your cart is empty";
      cartList.appendChild(li);
      totalPriceEl.textContent = "";
      return;
    }
    let total = 0;
    cart.forEach(item => {
      const li = document.createElement("li");
      const price = (item.price !== undefined && item.price !== null) ? item.price : (getCatalogItemLocal(item.name)?.price || 0);
      const subtotal = price * item.qty;
      total += subtotal;
      li.innerHTML = `<div>
          <strong>${capitalize(item.name)}</strong> <span style="color:#666">• ${capitalize(item.category)}</span>
</div>`;
      const right = document.createElement("div");
      const minus = document.createElement("button"); minus.className="qty-btn"; minus.textContent="-"; minus.onclick = ()=> updateQty(item.id, item.qty-1);
      const qspan = document.createElement("span"); qspan.textContent = ` ${item.qty} `;
      const plus = document.createElement("button"); plus.className="qty-btn"; plus.textContent="+"; plus.onclick = ()=> updateQty(item.id, item.qty+1);
      const del = document.createElement("button"); del.className="qty-btn"; del.textContent="Remove"; del.onclick = ()=> { cart = cart.filter(c=>c.id!==item.id); saveCart(); renderCart(); };
      right.appendChild(minus); right.appendChild(qspan); right.appendChild(plus); right.appendChild(del);
      li.appendChild(right);
      cartList.appendChild(li);
    });
    totalPriceEl.textContent = `Total: ₹${total}`;
  }

  // --- Price + Suggestions ---
  async function fetchPriceForItem(rawName) {
    try {
      const resp = await fetch("/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: rawName })
      });
      const json = await resp.json();
      if(json && (json.price || json.price === 0)) {
        let returnedName = (json.item || rawName).toString();
        returnedName = returnedName.replace(/^\s*\d+\s+/,"").trim();
        return { name: returnedName, price: Number(json.price || 0) };
      }
    } catch (err) {
      console.warn("Price endpoint failed:", err);
    }
    const local = getCatalogItemLocal(rawName);
    if(local) return { name: local.name, price: local.price };
    return { name: rawName, price: Math.floor(Math.random()*81) + 20 };
  }

  async function showSuggestions(list, info) {
    const normalized = [];
    for(const entry of (list||[]).slice(0,8)) {
      if(!entry) continue;
      if(typeof entry === "string") {
        const local = getCatalogItemLocal(entry);
        if(local) normalized.push({ name: local.name, price: local.price });
        else {
          const p = await fetchPriceForItem(entry);
          normalized.push({ name: p.name, price: p.price });
        }
      } else if (typeof entry === "object") {
        const name = entry.name || entry.item || "";
        const price = entry.price !== undefined ? entry.price : (getCatalogItemLocal(name)?.price || (entry.guessPrice || 0));
        normalized.push({ name, price });
      }
    }
    if (normalized.length) {
      prominentSuggestionsEl.style.display = "block";
      prominentSuggestionsEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-weight:700;color:#0b84ff">${info || "Suggestions"}</div>
        <button class="btn ghost" id="closeProminent">✕</button>
      </div><div style="display:flex;flex-wrap:wrap;gap:8px"></div>`;
      const container = prominentSuggestionsEl.querySelector("div:nth-child(2)");
      normalized.forEach(n => {
        const btn = document.createElement("button");
        btn.className = "chip";
        btn.textContent = `${n.name} • ₹${n.price}`;
        btn.addEventListener("click", () => addToCart(n.name, 1, n.price));
        container.appendChild(btn);
      });
      const closeBtn = document.getElementById("closeProminent");
      if(closeBtn) closeBtn.onclick = () => { prominentSuggestionsEl.style.display = "none"; };
    } else {
      prominentSuggestionsEl.style.display = "none";
      prominentSuggestionsEl.innerHTML = "";
    }
    suggestionsBox.innerHTML = "";
    if(normalized.length) {
      normalized.forEach(n => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = `${n.name} • ₹${n.price}`;
        b.addEventListener("click", () => addToCart(n.name, 1, n.price));
        suggestionsBox.appendChild(b);
      });
      if(info) {
        const p = document.createElement("p"); p.style.color="#666"; p.className="small"; p.textContent = info;
        suggestionsBox.appendChild(p);
      }
    } else {
      const p = document.createElement("p"); p.style.color="#666"; p.className="small"; p.textContent = "No suggestions";
      suggestionsBox.appendChild(p);
    }
  }

  async function fetchSuggestions() {
    suggestionsBox.innerHTML = "<p style='color:#666'>Loading suggestions…</p>";
    try {
      const resp = await fetch("/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: cart.map(i=>i.name).join(", ") })
      });
      const json = await resp.json();
      const list = json.suggestions || [];
      await showSuggestions(list, json.info || json.error || "Suggestions");
    } catch (err) {
      console.error("Suggest error:", err);
      await showSuggestions(localFallback(), "Local fallback suggestions");
    }
  }

  function localFallback() {
    const have = history.slice(0,10);
    const out = [];
    have.forEach(h => { if (SUBS[h]) SUBS[h].forEach(s => { if (!out.includes(s)) out.push(s); }); });
    CATALOG.forEach(c => { if (!have.includes(c.name) && out.length < 8) out.push(c.name); });
    return out;
  }

  // --- Main NLP Handler ---
  async function handleCommand(raw) {
    const rawStr = (raw || "").toString();
    const pre = preprocessHindi(rawStr);
    statusEl.textContent = `Heard: "${rawStr}"`;

    const txt = pre;

    const isAdd = /\b(add|add me| add for me|for myself|for me|i need to|purchase| buy me|i need|i want to buy|to my list |i want|buy|get|put|include|please add|add to my list|खरीदना|जोड़ो|मुझे)\b/i.test(txt);
    const isRemove = /\b(remove|delete|drop|remove from my list|delete from my list|हटा|निकालो|डिलीट)\b/i.test(txt);
    const isFind = /\b(find|search|look for|show me|show|suggest|suggest me| recommend me| recommendation| suggestion|recommend)\b/i.test(txt);
    const isSetQty = /\b(set|change|update|quantity|qty|set to|set)\b/i.test(txt);

    const priceCap = extractPriceCap(txt);
    const priceRange = extractPriceRange(txt);
    const hasPriceFilter = !!(priceCap || priceRange);

    const qty = (isAdd || isSetQty) ? extractQuantity(txt) : 1;
    const items = extractItems(txt);

    const treatAsFind = isFind || (hasPriceFilter && !isAdd && !isRemove && !isSetQty);

    // Price filters + find handled as before ...
    if (treatAsFind && items.length && priceRange) {
      const matches = getCatalogMatches(items[0]).filter(m => m.price >= priceRange.min && m.price <= priceRange.max);
      if(matches.length) await showSuggestions(matches.map(m=> ({ name: m.name, price: m.price })), `Found items between ${priceRange.min} and ${priceRange.max}`);
      else toast("No items in that price range");
      return;
    }
    if (treatAsFind && items.length && priceCap) {
      const matches = getCatalogMatches(items[0]).filter(m => m.price <= priceCap);
      if(matches.length) await showSuggestions(matches.map(m=> ({ name: m.name, price: m.price })), `Found ${items[0]} under ${priceCap}`);
      else toast(`No ${items[0]} under ${priceCap}`);
      return;
    }

    if (isAdd && items.length) {
      for (const it of items) {
        const priceRes = await fetchPriceForItem(it);
        addToCart(priceRes.name, qty, priceRes.price);
      }
      return;
    }
    if (isRemove && items.length) {
      for (const it of items) {
        const removed = removeFromCartByName(it);
        if(removed) toast(`${it} removed`); else toast(`${it} not found`);
      }
      return;
    }
    if (isSetQty && items.length) {
      for (const it of items) {
        const found = cart.find(i => i.name === it);
        if(found) { found.qty = qty; saveCart(); renderCart(); toast(`Updated ${it} to ${qty}`); }
        else toast(`${it} not in cart`);
      }
      return;
    }
    if(items.length) {
      for (const it of items) {
        const priceRes = await fetchPriceForItem(it);
        addToCart(priceRes.name, 1, priceRes.price);
      }
      return;
    }

    toast("Couldn't interpret command. Try: add milk / remove bread / find toothpaste under 100 / show items between 30 and 60");
  }

  function getCatalogMatches(q) {
    q = norm(q);
    if(!q) return [];
    return CATALOG.filter(c => c.name.includes(q) || q.includes(c.name) || c.name.split(" ").some(p => q.includes(p)));
  }

  // --- Events ---
  sendBtn.addEventListener("click", async () => {
    const v = textInput.value.trim();
    if(!v) return;
    await handleCommand(v);
    textInput.value = "";
  });
  textInput.addEventListener("keydown", (e) => { if(e.key === "Enter") sendBtn.click(); });
  micBtn.addEventListener("click", () => startRecognition());
  stopBtn.addEventListener("click", () => stopRecognition());
  suggestBtn.addEventListener("click", () => fetchSuggestions());
  clearBtn.addEventListener("click", () => { if(confirm("Clear cart?")) { cart = []; saveCart(); renderCart(); } });

  function startRecognition() {
    if(!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      alert("SpeechRecognition not supported. Use Chrome/Edge.");
      return;
    }
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = langSel.value || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => { statusEl.textContent = "Listening..."; micBtn.disabled = true; stopBtn.disabled = false; };
    recognition.onend = () => { statusEl.textContent = "Idle"; micBtn.disabled = false; stopBtn.disabled = true; };
    recognition.onerror = (e) => { statusEl.textContent = "Error: "+(e.error || "unknown"); micBtn.disabled=false; stopBtn.disabled=true; console.error("Speech error", e); toast("Voice error"); };

    recognition.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      recognizedText.textContent = text;
      handleCommand(text);
    };

    try { recognition.start(); } catch(e) { console.warn(e); }
  }
  function stopRecognition() {
    if(recognition && recognition.stop) recognition.stop();
  }

  // --- Init ---
  renderCart();
  showSuggestions(localFallback(), "Quick suggestions");

  // Expose
  window.vsa_get_cart = () => cart;
}); 
