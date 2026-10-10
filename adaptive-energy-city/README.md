# ⚡ Adaptive Energy City
### Interactive 3D Smart Energy Management Simulator

A fully functional, browser-based simulation where you can explore a virtual smart city, trigger power shortages, watch solar generation drop, and see an intelligent scheduling engine respond in real time.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open in your browser
# http://localhost:5173
```

---

## 🏙️ Features

| Feature | Description |
|---|---|
| **3D City** | Interactive Three.js city — drag, zoom, rotate, click buildings |
| **2D Network View** | Toggle to SVG network diagram with animated energy flow |
| **Live Dashboard** | 8 KPI cards + 4 live Recharts (demand, solar, price, cost) |
| **Scheduling Engine** | Priority-aware greedy scheduler with deadline tracking |
| **Event Controls** | Solar drop, price spike, grid reduction, demand boost |
| **Decision Panel** | Plain-language AI decision explanations |
| **Building Inspector** | Click any building to see energy data, device list, capacity bar |
| **Before/After Comparison** | Scheduling results with cost savings in ₹ |
| **Power Shortage Demo** | One-click demo that creates & resolves a shortage automatically |
| **Welcome Onboarding** | Guided intro for first-time users |

---

## 🏗️ Architecture

```
src/
├── types/
│   └── energy.ts          # All TypeScript types & interfaces
├── data/
│   └── cityData.ts        # Buildings, devices, base time slots
├── engine/
│   └── scheduler.ts       # Scheduling engine + slot computation
├── store/
│   └── simStore.ts        # Zustand state store with recalc logic
└── components/
    ├── App.tsx             # Root layout + simulation ticker
    ├── CityCanvas.tsx      # Three.js / React Three Fiber 3D city
    ├── City2DView.tsx      # SVG 2D network fallback
    ├── Dashboard.tsx       # KPI metrics + 4 Recharts
    ├── ControlPanel.tsx    # Simulation controls + event buttons
    ├── BuildingInspector.tsx  # Per-building energy inspector
    ├── DecisionPanel.tsx   # AI decision explanations
    └── WelcomeScreen.tsx   # Onboarding modal
```

---

## 🤖 Scheduling Engine Logic

The engine runs on every state change:

1. **Calculate** total city demand and solar generation
2. **Detect** which buildings exceed their grid connection limit
3. **Sort** devices by priority: `critical → high → flexible → deferrable`
4. **Never** touch `critical` loads (ICU, safety systems, fire alarms)
5. **Try to reschedule** flexible/deferrable loads to the cheapest feasible future slot
6. **Check** new slot satisfies capacity limit (building-level)
7. **Record** the reason for every rescheduling decision
8. **Update** city status colours, KPIs, and charts
9. **Report** feasibility — never claims success if violations remain

**Cost formula:** `cost = gridImport_kW × 0.25h × tariff_₹/kWh` per 15-min slot

---

## 🏢 Buildings in the Simulation

| Building | Type | Grid Limit | Solar |
|---|---|---|---|
| City Hospital | hospital | 120 kW | 20 kW |
| Smart Factory A | factory | **100 kW** | 30 kW |
| Sunrise Office Tower | office | 90 kW | 25 kW |
| Galaxy Shopping Mall | mall | 150 kW | 40 kW |
| Green Residences | residential | 60 kW | 15 kW |
| Solar Farm | solar_farm | 200 kW | **150 kW** |
| District Substation | substation | 500 kW | — |
| Public EV Hub | ev_station | 80 kW | 10 kW |

### Factory Example Scenario (Illustrative)

| Equipment | Power | Priority |
|---|---|---|
| Essential Systems | 20 kW | Critical |
| Production Machinery | 50 kW | High |
| Water Pumping | 20 kW | Flexible |
| EV Charging Bay | 25 kW | Deferrable |
| **Total** | **115 kW** | **Over 100 kW limit** |

→ Scheduler delays EV charging + water pumping to cheaper evening slots, restoring feasibility.

---

## 🎮 Simulation Controls

| Control | Effect |
|---|---|
| **Start / Pause** | Begin or pause the 24-hour simulation |
| **Reset** | Restore all buildings to initial state |
| **+15 min** | Manually advance one time slot |
| **Time Slider** | Jump to any point in the day |
| **Speed 0.5× – 8×** | Adjust simulation clock speed |
| **☀️ Solar Drop** | Reduce solar generation by 30% per click |
| **💰 Price Spike** | Multiply electricity price by +0.5× per click |
| **🔌 Reduce Grid** | Reduce feeder capacity by 80 kW per click |
| **📈 More Demand** | Add 50 kW of extra city load per click |
| **✅ Restore Normal** | Reset all conditions to baseline |

---

## 🎨 Status Colours

| Colour | Meaning |
|---|---|
| 🟢 Green | Normal operation |
| 🟡 Yellow | High demand / approaching limit |
| 🔴 Red | Overloaded / power shortage |
| 🔵 Blue | Solar generation active |
| ⚫ Grey | Inactive / delayed |

---

## 🛠️ Technology Stack

- **React 19** + **TypeScript** — component framework
- **Vite 8** — build tool with HMR
- **Three.js** + **@react-three/fiber** — 3D rendering
- **@react-three/drei** — OrbitControls, Text, helpers
- **Recharts** — live interactive charts
- **Zustand** — lightweight state management
- **Inter + Orbitron** — Google Fonts (loaded from CDN)

---

## ⚠️ Disclaimer

This is a **planning and educational simulator**. It does not calculate real voltage, current, electrical losses, or protection safety margins. All results are for learning purposes only. Do not use for actual electrical engineering decisions.

---

## 📄 Sample Data

All data is local — no API keys or external services required. Buildings and devices are defined in [`src/data/cityData.ts`](./src/data/cityData.ts).

---

*Built for the IPL Hackathon — Adaptive Energy City Project*
