# 🛒 Supermarket Together Tool

A comprehensive decision-support lab & toolkit for the co-op game **Supermarket Together**. Upload your in-game save file and instantly get a full dashboard of analytics — pricing strategy, restock optimization, profit simulation, skill-tree planning, employee roster, achievement tracking, and more.

Built with **Next.js 16 · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma · Zustand**.

---

## ✨ Features

### 📊 Save File Analytics (18 tools)
| Tool | What it does |
|------|-------------|
| **Dashboard** | KPI overview — day, cash, net worth, reputation, expansion status |
| **Upload** | Drag-and-drop save parser (supports new structured `.json` + legacy ES3 format) |
| **Wiki** | 339 products, 55 tiers, 19 groups, 42 containers — searchable encyclopedia |
| **Profit** | Product profitability ranking & margin analysis |
| **Pricing** | 339-product pricing table with demand elasticity |
| **Salt** | Customer-type analysis (58 types) & demand patterns |
| **Simulator** | Multi-tab scenario simulator (heatmap simplified to 3 tabs) |
| **Restock** | Restock priority optimizer |
| **Store Layout** | 57-prop store layout visualizer (Classic / Plaza) |
| **Containers** | 42-container capacity planner |
| **Skills** | 44-skill tree with unlock paths & perk mapping |
| **Employees** | Employee roster & pipe-string assignment manager |
| **Manufacturing** | 30 manufacturing recipes & unlocked recipes tracker |
| **Seasons** | Seasonal product availability & best-seller ranking |
| **Achievements** | 51 Steam achievements with real player-facing names (EN + 繁中) |
| **Exploits** | Known game mechanics & edge cases |
| **Raw Data** | Full decoded save dump (211 ES3 fields) |
| **Room** | Multiplayer sync (being migrated to backend service) |

### 🌐 i18n — Trilingual Support
- **繁體中文** (default) · **English** · **雙語顯示** (both side-by-side)
- All game data uses in-game Chinese names (matches what you see while playing)
- Language preference persisted in `localStorage`
- Instant switching via TopBar dropdown — no page reload

### 🎮 Save File Support
- **New format** (`save.json`): Pre-extracted structured save (extractor v1.0, 11 sections)
- **Legacy format**: Raw ES3 regex parser with 4-pattern inline-value repair
- **Three-stage parsing**: structured → clean snapshot → raw ES3 fallback
- Auto-detects format and adapts all 18 tools accordingly

### 🏆 Achievement Database
- All **51 Steam achievements** with real player-facing names
- Bilingual names + descriptions (EN / 繁中)
- Global unlock percentage, collective/layout tags
- Steam deep-link integration

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/) runtime
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/vvvjb18-lab/Supermarket-Together-Tool.git
cd Supermarket-Together-Tool

# Install dependencies
bun install

# Set up environment
cp .env.example .env

# Initialize database
bun run db:push

# Start dev server
bun run dev
```

The app runs on `http://localhost:3000`.

### Uploading Your Save

1. Launch **Supermarket Together** in Steam
2. Locate your save file (use the in-game export or a save extractor)
3. Drag & drop the `.json` file onto the **Upload** tab
4. All 18 tools instantly populate with your live game data

> A demo save is bundled — click **"Load Demo Save"** on the Upload page to explore without your own file.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 (strict) |
| **Styling** | Tailwind CSS 4 |
| **UI Components** | shadcn/ui (New York) + Lucide icons |
| **State** | Zustand (client) + TanStack Query (server) |
| **Database** | Prisma ORM + SQLite |
| **Real-time** | Socket.io (room-service mini-service, port 3003) |
| **Auth** | NextAuth.js v4 (available) |
| **Charts** | Recharts |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Single-page app (all 18 tabs)
│   ├── layout.tsx            # Root layout + providers
│   ├── globals.css           # Tailwind + theme variables
│   └── api/                  # API routes (sample-save, etc.)
├── components/
│   ├── lab/                  # 18 tool components
│   │   ├── dashboard.tsx
│   │   ├── upload.tsx
│   │   ├── wiki.tsx
│   │   ├── profit.tsx
│   │   ├── pricing.tsx
│   │   ├── simulator.tsx
│   │   ├── skills.tsx
│   │   ├── skill-tree.tsx
│   │   ├── achievements.tsx
│   │   └── ... (18 total)
│   ├── shared/               # LanguageSwitcher, primitives, layout
│   └── ui/                   # shadcn/ui components
├── lib/
│   ├── i18n.ts               # i18n core (18 entity resolvers + hooks)
│   ├── es3-parser.ts         # Save file parser (3-stage)
│   ├── store.ts              # Zustand UI store
│   ├── db.ts                 # Prisma client
│   ├── types.ts              # TypeScript types
│   └── data/                 # Static game data
│       ├── encyclopedia.json # 51 achievements + game data
│       ├── skill-graph.json  # Skill tree topology
│       └── demo-save.json    # Bundled demo save
mini-services/
└── room-service/             # Socket.io multiplayer service (:3003)
prisma/
└── schema.prisma             # Database schema
```

---

## 📜 Scripts

| Command | Description |
|---------|------------|
| `bun run dev` | Start dev server (port 3000) |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push Prisma schema to SQLite |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Create & apply migration |
| `bun run build` | Production build |

---

## 🎯 Data Coverage

| Dataset | Count |
|---------|-------|
| Products | 339 |
| Tiers | 55 |
| Product Groups | 19 |
| Containers | 42 |
| Customer Types | 58 |
| Skills / Perks | 44 |
| Manufacturing Recipes | 30 |
| Steam Achievements | 51 |
| Buildable Props | 43 |
| Necessities | 11 |
| Premium Products | 7 |
| Decoded ES3 Fields | 211 |

---

## 🔒 Privacy

- Your save file is parsed **entirely in your browser** — no data is sent to any server
- The only network request is fetching the optional demo save from the bundled API
- No analytics, no tracking, no telemetry

---

## 🗺 Roadmap

- [ ] **Backend sync service** — Room-based save sharing with password authentication (host uploads, guests read)
- [ ] **Complete game atlas** — Full visual graph of game mechanics & dependencies
- [ ] **44-skill TSV table** — Exportable skill/perk reference table
- [ ] **Strategy tools** — Deeper decision tools leveraging save data

---

## 📄 License

This project is a fan-made tool for the game **Supermarket Together**. All game data, product names, and achievement names belong to their respective owners. This tool is not affiliated with or endorsed by the game developers.

---

## 🤝 Contributing

This is a personal lab project. Feel free to fork and adapt for your own use. Pull requests welcome for:
- Data corrections (product stats, achievement info)
- New tool ideas
- i18n improvements (additional languages)
- Bug fixes

---

<p align="center">Made with care for fellow supermarket managers 🏪</p>
