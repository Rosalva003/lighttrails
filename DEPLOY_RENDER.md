# Deploying LightTrails to Render

## Prerequisites

1. A [Render.com](https://render.com) account (free tier available)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Step-by-Step Deployment

### 1. Push Your Code to Git

If you haven't already, initialize git and push to a repository:

```bash
git init
git add .
git commit -m "Initial commit - LightTrails WebSocket app"
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Create a New Web Service on Render

1. **Log in to Render**: Go to [dashboard.render.com](https://dashboard.render.com)
2. **Click "New +"** → Select **"Web Service"**
3. **Connect your repository** (GitHub/GitLab/Bitbucket)
4. **Select your repository** containing the LightTrails project

### 3. Configure the Service

**Basic Settings:**
- **Name**: `lighttrails` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: Leave empty (or `./` if needed)

**Build & Deploy:**
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Advanced Settings (Optional):**
- **Auto-Deploy**: `Yes` (deploys on every push)
- **Health Check Path**: `/` (or leave empty)

### 4. Environment Variables

No environment variables are required for basic setup. Render will automatically:
- Set `PORT` environment variable
- Set `NODE_ENV=production`

### 5. Deploy

Click **"Create Web Service"** and Render will:
1. Clone your repository
2. Run `npm install`
3. Start your server with `npm start`
4. Provide a public URL (e.g., `https://lighttrails.onrender.com`)

## Important Notes for WebSocket

✅ **Render supports WebSocket!** Your app will work automatically.

The server is already configured to:
- Use `process.env.PORT` (Render sets this automatically)
- Handle both HTTP and WebSocket connections
- Support both `ws://` and `wss://` protocols

## Testing Your Deployment

1. **Wait for deployment** (usually 2-5 minutes)
2. **Visit your Render URL**: `https://your-app.onrender.com`
3. **Open multiple browser tabs** to test real-time collaboration
4. **Check the console** for WebSocket connection messages

## Troubleshooting

### WebSocket Connection Issues

If WebSocket doesn't work:
1. Make sure you're using `wss://` (secure WebSocket) on HTTPS
2. Check Render logs: Dashboard → Your Service → Logs
3. Verify the server is running: Check the "Events" tab

### Build Failures

- Check that `package.json` has all dependencies
- Verify Node.js version (Render uses Node 18+ by default)
- Check build logs in Render dashboard

### Port Issues

The server already uses `process.env.PORT || 3000`, which works with Render automatically.

## Free Tier Limitations

- **Spins down after 15 minutes of inactivity**
- **Takes ~30 seconds to wake up** when accessed
- **512MB RAM limit**
- **100GB bandwidth/month**

For production, consider upgrading to a paid plan for:
- Always-on service
- Better performance
- More resources

## Custom Domain (Optional)

1. Go to your service settings
2. Click "Custom Domains"
3. Add your domain
4. Update DNS records as instructed

## Monitoring

- **Logs**: View real-time logs in Render dashboard
- **Metrics**: Monitor CPU, memory, and network usage
- **Alerts**: Set up email alerts for service issues

## Quick Deploy Checklist

- [ ] Code pushed to Git repository
- [ ] Render account created
- [ ] Web service created and connected to repo
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Service deployed successfully
- [ ] WebSocket connection tested
- [ ] Multiple clients tested

Your app should be live at: `https://your-app-name.onrender.com`

