# TaskFlow Pro - Online Deployment Guide

## Overview

This guide will help you deploy TaskFlow Pro online so multiple users can access it from different devices. The system includes:
- Backend API (Node.js + Express + SQLite)
- Frontend (React in HTML)
- User authentication (JWT)
- Persistent database storage

---

## Option 1: Deploy to Render.com (FREE & EASIEST) ⭐ RECOMMENDED

Render.com offers free hosting with automatic HTTPS.

### Step-by-Step:

1. **Prepare Your Files**
   - Create a folder with these files:
     - `server.js` (backend code)
     - `package.json` (dependencies)
     - `index.html` (frontend) - put in a folder called `public/`

2. **Create GitHub Repository**
   ```bash
   # In your project folder
   git init
   git add .
   git commit -m "Initial commit"
   
   # Create a new repository on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/taskflow-pro.git
   git push -u origin main
   ```

3. **Deploy on Render**
   - Go to https://render.com
   - Sign up (free account)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: taskflow-pro
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Plan**: Free
   - Click "Create Web Service"

4. **Access Your App**
   - Render will provide a URL like: `https://taskflow-pro.onrender.com`
   - Share this URL with your workers and admins!

### ⚠️ Important Notes:
- Free tier sleeps after 15 minutes of inactivity (first load might be slow)
- Database resets when service restarts (see "Persistent Database" below)
- Upgrade to paid tier ($7/month) for always-on service

---

## Option 2: Deploy to Railway.app

Railway is another easy option with free hosting.

1. **Sign up at https://railway.app**
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select repository
4. Railway auto-detects Node.js
5. Add environment variable:
   - `PORT`: 3001
   - `JWT_SECRET`: your-random-secret-key-here
6. Deploy!

Your URL: `https://taskflow-pro.railway.app`

---

## Option 3: Deploy to Heroku

Heroku is reliable but requires credit card (free tier available).

1. **Install Heroku CLI**
   ```bash
   # Windows
   # Download from heroku.com/cli
   
   # Mac
   brew tap heroku/brew && brew install heroku
   
   # Linux
   curl https://cli-assets.heroku.com/install.sh | sh
   ```

2. **Deploy**
   ```bash
   heroku login
   heroku create taskflow-pro
   git push heroku main
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set JWT_SECRET=your-random-secret-key
   ```

Your URL: `https://taskflow-pro.herokuapp.com`

---

## Option 4: Deploy to Your Own VPS (DigitalOcean, AWS, etc.)

For full control and persistent storage.

### Using DigitalOcean ($4-6/month):

1. **Create Droplet**
   - Go to digitalocean.com
   - Create account
   - Create Droplet: Ubuntu 22.04, $4/month plan
   - Note your IP address

2. **SSH into Server**
   ```bash
   ssh root@YOUR_IP_ADDRESS
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo apt-get install -y git
   ```

4. **Clone Your Project**
   ```bash
   git clone https://github.com/YOUR_USERNAME/taskflow-pro.git
   cd taskflow-pro
   npm install
   ```

5. **Install PM2 (keeps app running)**
   ```bash
   sudo npm install -g pm2
   pm2 start server.js
   pm2 startup
   pm2 save
   ```

6. **Setup Nginx (web server)**
   ```bash
   sudo apt-get install -y nginx
   sudo nano /etc/nginx/sites-available/taskflow
   ```
   
   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name YOUR_IP_ADDRESS;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/taskflow /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

7. **Add Domain (Optional)**
   - Buy domain from namecheap.com or similar
   - Point A record to your server IP
   - Update nginx config with your domain

8. **Add HTTPS (Free with Let's Encrypt)**
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

Your URL: `http://YOUR_IP_ADDRESS` or `https://yourdomain.com`

---

## Persistent Database Storage

By default, SQLite database is stored in the app directory. On free hosting platforms that restart frequently, you need persistent storage.

### For Render/Railway/Heroku:

**Option A: Use PostgreSQL** (Recommended for production)
1. Add PostgreSQL addon in your hosting dashboard
2. Update `server.js` to use PostgreSQL instead of SQLite
3. Install: `npm install pg`

**Option B: Mount Persistent Disk**
- Render: Add persistent disk in dashboard ($1/GB)
- Railway: Volumes are automatic
- Heroku: Use S3 for storage

### For VPS:
Database already persists on disk. Just backup regularly:
```bash
# Backup database
cp taskflow.db taskflow-backup-$(date +%Y%m%d).db

# Setup automatic daily backup
crontab -e
# Add: 0 2 * * * cp /path/to/taskflow.db /path/to/backups/taskflow-$(date +\%Y\%m\%d).db
```

---

## Security Best Practices

### 1. Change JWT Secret
Never use default secret in production!
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set as environment variable
export JWT_SECRET=your-generated-secret
```

### 2. Change Default Passwords
After first deployment, login and change all default passwords!

### 3. Enable HTTPS
- Render/Railway/Heroku: Automatic
- VPS: Use Let's Encrypt (shown above)

### 4. Set Up Environment Variables
Create `.env` file (don't commit to Git!):
```
PORT=3001
JWT_SECRET=your-secret-key
NODE_ENV=production
```

Add to `.gitignore`:
```
.env
taskflow.db
node_modules/
```

---

## Managing Users

### Add New Users via API:

```bash
# Using curl (from terminal)
curl -X POST https://your-app-url.com/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "email": "newworker@example.com",
    "password": "worker123",
    "name": "New Worker",
    "role": "worker"
  }'
```

Or use the "Add User" button in admin dashboard!

---

## Monitoring & Maintenance

### Check Logs:
- **Render**: Dashboard → Logs tab
- **Railway**: Dashboard → Deployments → Logs
- **Heroku**: `heroku logs --tail`
- **VPS**: `pm2 logs`

### Restart Service:
- **Render**: Dashboard → Manual Deploy
- **Railway**: Auto-restarts on push
- **Heroku**: `heroku restart`
- **VPS**: `pm2 restart server`

### Database Backup:
```bash
# Download database from server
scp root@YOUR_IP:/path/to/taskflow.db ./backup.db

# Restore from backup
scp ./backup.db root@YOUR_IP:/path/to/taskflow.db
pm2 restart server
```

---

## Troubleshooting

### "Cannot connect to server"
- Check if service is running
- Verify firewall allows port 3001 (or 80/443)
- Check logs for errors

### "Invalid token" errors
- JWT secret might have changed
- Users need to login again
- Check environment variables

### "Database locked" errors
- SQLite doesn't handle high concurrency well
- Upgrade to PostgreSQL for production
- Or use write-ahead logging: `db.run("PRAGMA journal_mode=WAL")`

### App is slow
- Free tiers have limited resources
- Upgrade to paid plan
- Optimize database queries
- Add indexes to database

---

## Scaling for Production

When you have 50+ users:

1. **Upgrade Database**: SQLite → PostgreSQL
2. **Add Redis**: For session management
3. **Use CDN**: CloudFlare for static files
4. **Load Balancer**: Multiple server instances
5. **Monitoring**: New Relic or DataDog
6. **Backups**: Automated daily backups

---

## Cost Breakdown

### Free Options:
- **Render Free**: $0 (with limitations)
- **Railway Free**: $0 (500 hours/month)
- **Heroku Free**: Discontinued, requires credit card

### Paid Options:
- **Render**: $7/month (always-on)
- **Railway**: ~$5-10/month (usage-based)
- **DigitalOcean**: $6/month (full VPS)
- **AWS/GCP**: $10-50/month (varies)

### Recommended for Small Team (5-20 users):
- **Render Starter**: $7/month + persistent disk $1/month = **$8/month total**

### Recommended for Medium Team (20-100 users):
- **DigitalOcean Droplet**: $12/month + PostgreSQL $15/month = **$27/month total**

---

## Getting Help

If you encounter issues:
1. Check the logs first
2. Verify environment variables
3. Test API endpoints with curl
4. Check database file exists and has proper permissions
5. Restart the service

Common fixes:
- Clear browser cache
- Check CORS settings
- Verify API_URL in frontend matches backend
- Ensure JWT_SECRET is consistent

---

## Next Steps

1. Deploy using Option 1 (Render) - easiest
2. Access your app URL
3. Login with default admin credentials
4. Add your team members
5. Change all default passwords
6. Start assigning tasks!

Good luck! 🚀
