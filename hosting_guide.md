# Hosting Guide for ChatHaven (Node.js & Socket.io)

Since ChatHaven is a real-time web application driven by a stateful Node.js server and WebSockets (`Socket.io`), **static web hosts (like GitHub Pages, Netlify, or Vercel's standard tier) cannot host it** because they do not support persistent server processes or open WebSocket connections.

Here are the best ways to deploy and host ChatHaven.

---

## Option 1: Render (Easiest Free Tier)

[Render](https://render.com/) is a cloud platform that supports Web Services with automatic SSL, custom domains, and native WebSocket support.

### Step-by-Step Deployment:
1. **Prepare your code**:
   Ensure your `package.json` has a startup script:
   ```json
   "scripts": {
     "start": "node server.js"
   }
   ```
2. **Push your code to GitHub** (if you haven't already).
3. **Log in to Render** and click **New > Web Service**.
4. **Connect your GitHub repository**.
5. **Configure the Web Service Settings**:
   - **Name**: `chathaven`
   - **Region**: Select the closest region to your users.
   - **Branch**: `main` (or your active branch)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Select **Free** (or Starter).
6. **Configure Environment Variables**:
   Under the **Environment** tab, add:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
7. Click **Deploy Web Service**. Render will build your application and provide a public URL (e.g. `https://chathaven.onrender.com`).

> [!NOTE]
> Free instances on Render spin down after 15 minutes of inactivity. The first connection after spin-down may take 50-60 seconds to load.

---

## Option 2: Railway.app (Fastest Deployment, High Performance)

[Railway](https://railway.app/) is highly recommended for Node.js apps because deployments take under a minute and instances do not sleep.

### Step-by-Step Deployment:
1. Install the Railway CLI (`npm i -g @railway/cli`) or use the Web UI.
2. Sign in to Railway and create a **New Project**.
3. Select **Deploy from GitHub repo** and choose your ChatHaven repo.
4. Railway will automatically detect Node.js, install dependencies, configure the port binding, and deploy the service.
5. In the settings, click **Generate Domain** to get a public URL (e.g. `https://chathaven-production.up.railway.app`).

---

## Option 3: Self-Hosting on a VPS (DigitalOcean, Linode, AWS EC2)

For maximum performance, custom configurations, and no timeouts, you can run the app on a Virtual Private Server (VPS) running Ubuntu.

### 1. Initial VPS Setup
Log into your server via SSH and install Node.js and Nginx:
```bash
sudo apt update
sudo apt install -y nodejs npm nginx
```

### 2. Set Up the Project
Clone your repository, navigate to the folder, and install dependencies:
```bash
cd /var/www
git clone <your-repo-url> chathaven
cd chathaven
npm install
```

### 3. Configure PM2 (Process Manager)
To run your node server continuously in the background and restart it on crash/reboot:
```bash
sudo npm install -g pm2
pm2 start server.js --name "chathaven"
pm2 save
pm2 startup
```

### 4. Configure Nginx as a Reverse Proxy (Enabling WebSockets)
Open Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/chathaven
```
Add the following configuration, which redirects standard web traffic to Node.js and elevates standard HTTP requests to WebSockets:
```nginx
server {
    listen 80;
    server_name yourdomain.com; # Replace with your domain or server IP

    location / {
        proxy_pass http://localhost:3000; # Points to the local Node.js port
        proxy_http_version 1.1;
        
        # Critical headers for WebSockets / Socket.io
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Forward user details
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Link the site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/chathaven /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
5. Install SSL with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
