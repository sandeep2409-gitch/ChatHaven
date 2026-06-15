# ChatHaven 💬✨

Welcome to **ChatHaven**, a premium real-time messaging application designed with a modern glassmorphic dark interface. This project is built as part of the **Day 23 challenge of the 30-Day Web Development Series**.

ChatHaven connects clients instantly via dynamic socket pairings, featuring clean visual aesthetics, vector SVG indicators, and fluid motion transitions.

---

## 🌟 Key Features

- **Instant Messaging**: Real-time communication powered by bidirectionally synchronized `Socket.io` pipelines.
- **WhatsApp Web Aesthetics**: A sleek dark layout leveraging HSL colors and glassmorphic panel backdrops.
- **Rich CSS Transitions & Animations**:
  - **Discrete Property Transitions**: Used `@starting-style` and `transition-behavior: allow-discrete` to natively transition structural visibility states (`display: none` to `display: flex`) without heavy JS fade libraries.
  - **Directional Chat Bubbles**: Received messages slide and bounce in from the left; sent messages slide and bounce in from the right.
  - **Micro-interactions**: Subtle hover translations on chat lists, rotation on the send action button, and custom modal entry scales.
- **Custom SVG Assets**: Replaced all interface emojis (like status indicators, group icons, welcome panel bubbles) with custom, lightweight inline SVGs styled with modern linear gradients.
- **Dynamic Typing Indicator**: Real-time multi-user typing sync that slides open smoothly.
- **Interactive Emoji Tray**: Fast access to insert emojis directly into the responsive text composer.
- **Synthesized Audio Alerts**: Uses the **Web Audio API** to generate clean, dynamic beep/click tones for incoming and outgoing alerts without requiring external sound file assets.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), CSS3 Variables & Grids, HTML5 Semantic Layouts.
- **Backend**: Node.js, Express.js.
- **Sockets**: Socket.io.

---

## 🚀 Getting Started

Follow these instructions to run the application locally on your machine.

### Prerequisites
Make sure you have Node.js installed:
```bash
node -v # Recommended: Node.js v18.0.0 or newer
```

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   cd "DAY23 --REALTIME CHAT"
   ```
2. Install the node modules:
   ```bash
   npm install
   ```

### Running the App
Start the local development server:
```bash
npm run dev
# or
npm start
```
Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

*Open multiple browser tabs to simulate multiple online users and text between them!*

---

## 🌐 Deployment & Hosting

Because the application relies on open WebSockets (`Socket.io`) and a stateful Node.js backend, **static hosting services (such as GitHub Pages or Netlify) will not work**. 

You can host this application using:
- **Render.com** (Web Service, Free/Starter tiers)
- **Railway.app** (Automated Docker/Node setup)
- **Self-hosted VPS** (Ubuntu server using PM2 process manager and Nginx reverse proxy configured for WebSocket upgrades).

For step-by-step setup details and config files for these hosting services, refer to the [hosting_guide.md](hosting_guide.md) file included in the root directory.
