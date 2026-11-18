const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const os = require('os');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serves kds.html and order.html

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/kds-stream' });

// In-Memory Active State
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

let outOfStockIds = new Set();

// Prioritize actual Wi-Fi IPv4 over virtual adapters (WSL/Docker/VirtualBox)
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

// Broadcast a message to all connected KDS tablets
function broadcastToKds(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// --- WebSocket Event Lifecycle ---
wss.on('connection', (ws, req) => {
  console.log(`[WS] KDS Screen Connected from: ${req.socket.remoteAddress}`);

  // Send current active queue on connection
  ws.send(JSON.stringify({
    type: "INIT_QUEUE",
    orders: activeOrders.filter(o => o.status !== "COLLECTED")
  }));

  // Handle status & stock updates from KDS
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "UPDATE_STATUS") {
        const order = activeOrders.find(o => o.id === data.orderId);
        if (order) {
          order.status = data.status;
          console.log(`[WS] Order #${order.orderNumber} -> ${data.status}`);
          broadcastToKds({ type: "ORDER_UPDATED", order });
        }
      }

      if (data.type === "TOGGLE_STOCK") {
        if (data.available) {
          outOfStockIds.delete(data.ingredientId);
        } else {
          outOfStockIds.add(data.ingredientId);
        }
        console.log(`[WS] Stock toggled: ${data.ingredientId} -> ${data.available}`);
        broadcastToKds({
          type: "STOCK_CHANGED",
          ingredientId: data.ingredientId,
          available: data.available
        });
      }
    } catch (err) {
      console.error("[WS] Error parsing client message:", err);
    }
  });

  ws.on('close', () => {
    console.log("[WS] KDS Terminal disconnected.");
  });
});

// --- REST API: Desk Customer Submits Order ---
app.post('/api/orders', (req, res) => {
  const { customerName, pickupType, targetTitle, recipe, calories } = req.body;

  if (!customerName || !recipe) {
    return res.status(400).json({ error: "Missing required order fields" });
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

  broadcastToKds({
    type: "ORDER_CREATED",
    order: newOrder
  });

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