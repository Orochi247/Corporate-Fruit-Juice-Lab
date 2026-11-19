const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const os = require('os');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/kds-stream' });

// --- SINGLE SOURCE OF TRUTH: MASTER INGREDIENTS ---
let MASTER_INGREDIENTS = [
  // Bases (60%)
  { id: "ing_orange", name: "Valencia Orange", category: "Base", caloriesPer100g: 47, sugarPer100g: 9, defaultGrams: 150, available: true },
  { id: "ing_mosambi", name: "Sweet Lime (Mosambi)", category: "Base", caloriesPer100g: 43, sugarPer100g: 8, defaultGrams: 150, available: true },
  { id: "ing_pineapple", name: "Pineapple", category: "Base", caloriesPer100g: 50, sugarPer100g: 10, defaultGrams: 140, available: true },
  { id: "ing_watermelon", name: "Watermelon", category: "Base", caloriesPer100g: 30, sugarPer100g: 6, defaultGrams: 180, available: true },
  { id: "ing_coconut", name: "Tender Coconut Water", category: "Base", caloriesPer100g: 19, sugarPer100g: 3.5, defaultGrams: 180, available: true },

  // Mix-ins (40%)
  { id: "ing_apple", name: "Green/Red Apple", category: "Mix-in", caloriesPer100g: 52, sugarPer100g: 10, defaultGrams: 70, available: true },
  { id: "ing_beetroot", name: "Beetroot", category: "Mix-in", caloriesPer100g: 43, sugarPer100g: 7, defaultGrams: 60, available: true },
  { id: "ing_carrot", name: "Carrot", category: "Mix-in", caloriesPer100g: 41, sugarPer100g: 5, defaultGrams: 70, available: true },
  { id: "ing_cucumber", name: "Cucumber", category: "Mix-in", caloriesPer100g: 15, sugarPer100g: 2, defaultGrams: 80, available: true },
  { id: "ing_pomegranate", name: "Pomegranate", category: "Mix-in", caloriesPer100g: 83, sugarPer100g: 14, defaultGrams: 60, available: true },
  { id: "ing_spinach", name: "Baby Spinach", category: "Mix-in", caloriesPer100g: 23, sugarPer100g: 0.4, defaultGrams: 30, available: true },

  // Boosters (Optional Upsells)
  { id: "ing_chia", name: "Soaked Chia Seeds", category: "Booster", price: 25, caloriesPer100g: 486, sugarPer100g: 0, defaultGrams: 10, available: true },
  { id: "ing_seeds", name: "Flax & Pumpkin Seeds", category: "Booster", price: 25, caloriesPer100g: 540, sugarPer100g: 1, defaultGrams: 15, available: true },
  { id: "ing_turmeric", name: "Raw Turmeric & Pepper", category: "Booster", price: 15, caloriesPer100g: 40, sugarPer100g: 2, defaultGrams: 5, available: true },
  { id: "ing_protein", name: "Plant Protein Scoop", category: "Booster", price: 40, caloriesPer100g: 380, sugarPer100g: 1, defaultGrams: 20, available: true }
];

// --- SIGNATURE WORKDAY BLENDS (Mapped to Master Ingredient IDs) ---
const SIGNATURE_BLENDS = [
  {
    id: "sig_1",
    timeSlot: "09:00 AM",
    tagline: "Focus & Detox",
    name: "Morning Kickstart (ABC)",
    price: 130,
    calories: 145,
    sugar: 22,
    desc: "Crisp Apple, organic Beetroot, Carrot, cold-pressed Ginger & Lemon.",
    ingredientIds: ["ing_apple", "ing_beetroot", "ing_carrot"],
    recipe: [
      { id: "ing_apple", name: "Apple", grams: 100 },
      { id: "ing_beetroot", name: "Beetroot", grams: 60 },
      { id: "ing_carrot", name: "Carrot", grams: 80 },
      { name: "Fresh Ginger & Lemon", grams: 10 }
    ]
  },
  {
    id: "sig_2",
    timeSlot: "01:30 PM",
    tagline: "Gut & Digestion Reset",
    name: "Post-Lunch Reset",
    price: 120,
    calories: 115,
    sugar: 17,
    desc: "Pineapple, cooling Cucumber, Fresh Mint sprigs, Himalayan Black Salt.",
    ingredientIds: ["ing_pineapple", "ing_cucumber"],
    recipe: [
      { id: "ing_pineapple", name: "Pineapple", grams: 140 },
      { id: "ing_cucumber", name: "Cucumber", grams: 80 },
      { name: "Fresh Mint", grams: 5 },
      { name: "Himalayan Salt", grams: 2 }
    ]
  },
  {
    id: "sig_3",
    timeSlot: "04:00 PM",
    tagline: "Sustained No-Crash Energy",
    name: "Screen-Fatigue Shield",
    price: 140,
    calories: 125,
    sugar: 19,
    desc: "Valencia Orange, Sweet Carrot, Raw Haldi shot, Black Pepper, Chia Seeds.",
    ingredientIds: ["ing_orange", "ing_carrot", "ing_turmeric", "ing_chia"],
    recipe: [
      { id: "ing_orange", name: "Valencia Orange", grams: 150 },
      { id: "ing_carrot", name: "Carrot", grams: 70 },
      { id: "ing_turmeric", name: "Raw Turmeric & Pepper", grams: 5 },
      { id: "ing_chia", name: "Chia Seeds", grams: 10 }
    ]
  },
  {
    id: "sig_4",
    timeSlot: "06:00 PM",
    tagline: "Post-Work Satiety & Recovery",
    name: "Gym & Commute Fuel",
    price: 160,
    calories: 220,
    sugar: 14,
    desc: "Curd / Greek Yogurt, Banana, Roasted Chana protein, Flax & Pumpkin seeds.",
    ingredientIds: ["ing_seeds"],
    recipe: [
      { name: "Curd / Yogurt Base", grams: 150 },
      { name: "Banana", grams: 80 },
      { name: "Roasted Chana Powder", grams: 20 },
      { id: "ing_seeds", name: "Flax & Pumpkin Seeds", grams: 15 }
    ]
  }
];

let activeOrders = [
  {
    id: "ord_101",
    orderNumber: "101",
    customerName: "Rahul Sharma",
    pickupType: "EXPRESS DESK",
    type: "CUSTOM",
    targetTitle: "Digest & Reset Custom",
    status: "QUEUED",
    createdAt: Date.now() - 180000,
    calories: 125,
    recipe: [
      { name: "Pineapple", grams: 140 },
      { name: "Cucumber", grams: 80 },
      { name: "Fresh Mint", grams: 5 },
      { name: "Chia Seeds", grams: 10 }
    ]
  }
];

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    const isVirtual = /vethernet|wsl|docker|virtualbox|vmware|loopback/i.test(name);
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!isVirtual && (/wi-fi|wlan|ethernet/i.test(name) || iface.address.startsWith('192.168.'))) {
          return iface.address;
        }
        fallbackIp = iface.address;
      }
    }
  }
  return fallbackIp;
}

function broadcastToAll(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// --- WebSocket Lifecycle ---
wss.on('connection', (ws, req) => {
  console.log(`[WS] Client Connected: ${req.socket.remoteAddress}`);

  // Send live queue AND live ingredient stock on connect
  ws.send(JSON.stringify({
    type: "INIT_QUEUE",
    orders: activeOrders.filter(o => o.status !== "COLLECTED"),
    ingredients: MASTER_INGREDIENTS
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "UPDATE_STATUS") {
        const order = activeOrders.find(o => o.id === data.orderId);
        if (order) {
          order.status = data.status;
          console.log(`[WS] Order #${order.orderNumber} -> ${data.status}`);
          broadcastToAll({ type: "ORDER_UPDATED", order });
        }
      }

      if (data.type === "TOGGLE_STOCK") {
        const item = MASTER_INGREDIENTS.find(i => i.id === data.ingredientId);
        if (item) {
          item.available = Boolean(data.available);
          console.log(`[STOCK] ${item.name} (${item.id}) -> ${item.available ? "IN STOCK" : "OUT"}`);
          broadcastToAll({
            type: "STOCK_CHANGED",
            ingredientId: item.id,
            available: item.available
          });
        }
      }
    } catch (err) {
      console.error("[WS] Error parsing client message:", err);
    }
  });
});

// --- REST API: Fetch Full Catalog & Stock ---
app.get('/api/catalog', (req, res) => {
  res.json({
    ingredients: MASTER_INGREDIENTS,
    signatureBlends: SIGNATURE_BLENDS
  });
});

// --- REST API: Submit New Desk Order (With Stock Guard) ---
app.post('/api/orders', (req, res) => {
  const { customerName, pickupType, targetTitle, recipe, calories } = req.body;

  if (!customerName || !recipe) {
    return res.status(400).json({ error: "Missing required order fields" });
  }

  // Verify none of the requested ingredients just went out of stock
  const outItem = recipe.find(r => {
    if (!r.id) return false;
    const master = MASTER_INGREDIENTS.find(m => m.id === r.id);
    return master && !master.available;
  });

  if (outItem) {
    return res.status(409).json({
      error: `${outItem.name} just ran out at the counter. Please pick another option.`
    });
  }

  const orderNumber = String(Math.floor(100 + Math.random() * 900));
  const newOrder = {
    id: `ord_${Date.now()}`,
    orderNumber,
    customerName,
    pickupType: pickupType || "EXPRESS DESK",
    type: "CUSTOM",
    targetTitle: targetTitle || "Custom Wellness Blend",
    status: "QUEUED",
    createdAt: Date.now(),
    calories: calories || 120,
    recipe
  };

  activeOrders.push(newOrder);
  broadcastToAll({ type: "ORDER_CREATED", order: newOrder });

  console.log(`[API] New Order #${orderNumber} received for ${customerName}`);
  return res.status(201).json({ success: true, order: newOrder });
});

// --- Printable Desk QR Tent Card ---
const PORT = 4000;
app.get('/qr', (req, res) => {
  const localIp = getLocalIpAddress();
  const orderUrl = `http://${localIp}:${PORT}/order.html`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(orderUrl)}`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>RCP Juice Lab - Desk QR Card</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-neutral-100 flex items-center justify-center min-h-screen p-4">
      <div class="bg-white border-2 border-dashed border-neutral-300 p-8 rounded-3xl max-w-sm text-center shadow-xl">
        <div class="inline-block bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest mb-3">
          Reliance Corporate Park
        </div>
        <h2 class="text-2xl font-black text-neutral-900">Skip the Queue</h2>
        <p class="text-xs text-neutral-500 mt-1 mb-6">Cold-pressed custom blends ready in &lt;60s at the express rack.</p>
        <div class="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 inline-block mb-4 shadow-inner">
          <img src="${qrApiUrl}" alt="Scan to Order" class="w-56 h-56 mx-auto rounded-lg" />
        </div>
        <p class="text-xs font-bold text-neutral-700">Scan with your Phone Camera</p>
        <p class="text-[10px] font-mono text-neutral-400 mt-1">${orderUrl}</p>
        <button onclick="window.print()" class="mt-6 w-full py-2.5 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800">
          Print Tent Card
        </button>
      </div>
    </body>
    </html>
  `);
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  const orderUrl = `http://${localIp}:${PORT}/order.html`;

  console.clear();
  console.log(`==================================================`);
  console.log(`RCP Juice Lab Backend Live`);
  console.log(`KDS Screen : http://localhost:${PORT}/kds.html`);
  console.log(`Order URL  : ${orderUrl}`);
  console.log(`Print QR   : http://localhost:${PORT}/qr`);
  console.log(`==================================================\n`);

  qrcode.generate(orderUrl, { small: true });
  console.log(`\nScan the QR code above with your phone camera.`);
});