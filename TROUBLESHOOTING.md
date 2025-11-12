# Troubleshooting Guide

## "Service Unavailable" or Connection Errors

If you're getting connection errors, follow these steps:

### Step 1: Verify Backend Server is Running

1. **Check if the server is running:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Look for these messages:**
   ```
   ✅ Database connection established
   🚀 Server is running on port 5000
   ```

3. **If you see database errors:**
   - Check your `.env` file has `DATABASE_URL` set correctly
   - Make sure PostgreSQL is running
   - Verify the database exists

4. **Test the server locally:**
   ```bash
   curl http://localhost:5000/health
   ```
   Should return: `{"status":"ok"}`

### Step 2: Verify Tunnel is Running (if using localtunnel)

1. **Start the tunnel:**
   ```bash
   cd backend
   npm run tunnel
   ```

2. **Look for the tunnel URL:**
   ```
   ✅ Tunnel created successfully!
   🔗 Public URL: https://civicfixapp.loca.lt
   ```

3. **Test the tunnel URL in browser:**
   ```
   https://civicfixapp.loca.lt/health
   ```
   Should return: `{"status":"ok"}`

4. **If tunnel fails:**
   - Try a different subdomain in `.env`: `TUNNEL_SUBDOMAIN=your-unique-name`
   - Or remove `TUNNEL_SUBDOMAIN` to get a random subdomain

### Step 3: Verify Mobile App Configuration

1. **Check the API URL in `mobile/src/utils/api.js`:**
   ```javascript
   export const API_BASE_URL =
     process.env.EXPO_PUBLIC_API_URL || "https://civicfixapp.loca.lt";
   ```

2. **Make sure the URL matches your tunnel URL exactly** (no trailing slash)

3. **If using environment variable:**
   ```bash
   cd mobile
   EXPO_PUBLIC_API_URL=https://your-tunnel-url.loca.lt npx expo start
   ```

### Step 4: Common Issues

#### Database Connection Failed
**Error:** `❌ Unable to connect to the database`

**Solutions:**
- Check PostgreSQL is running: `pg_isready` or check services
- Verify `.env` has correct `DATABASE_URL`
- Format: `postgres://username:password@localhost:5432/database_name`
- Test connection: `psql -d your_database_name`

#### Server Won't Start
**Error:** `Failed to start server`

**Solutions:**
- Check if port 5000 is already in use: `netstat -an | findstr :5000` (Windows) or `lsof -i :5000` (Mac/Linux)
- Change port in `.env`: `PORT=5001`
- Update tunnel script to use new port

#### Tunnel Connection Failed
**Error:** `Failed to create tunnel` or `subdomain taken`

**Solutions:**
- Use a different subdomain in `.env`: `TUNNEL_SUBDOMAIN=your-unique-name-123`
- Or remove `TUNNEL_SUBDOMAIN` to get a random subdomain
- Check your internet connection
- Try again after a few minutes

#### Mobile App Can't Connect
**Error:** `Cannot connect to server` or `Network Error`

**Solutions:**
1. Verify backend server is running (Step 1)
2. Verify tunnel is running (Step 2)
3. Test tunnel URL in browser first
4. Check API URL matches tunnel URL exactly
5. Restart Expo: `npx expo start --clear`
6. Check device has internet connection

### Step 5: Quick Health Check

Run this to verify everything is working:

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start tunnel
cd backend
npm run tunnel

# Terminal 3: Test connection
curl https://your-tunnel-url.loca.lt/health
```

All should work without errors.

### Step 6: Check Backend Logs

Look at the backend server console for errors:
- Database connection issues
- Validation errors
- Missing environment variables
- Port conflicts

### Need More Help?

1. Check backend server logs for specific error messages
2. Verify all environment variables are set in `.env`
3. Test the `/health` endpoint in your browser
4. Verify the tunnel URL is accessible
5. Check that both server and tunnel processes are running

## Quick Fix Checklist

- [ ] Backend server is running (`npm run dev`)
- [ ] Database is connected (see ✅ message)
- [ ] Server shows "🚀 Server is running on port 5000"
- [ ] Tunnel is running (`npm run tunnel`)
- [ ] Tunnel shows public URL
- [ ] `/health` endpoint works in browser
- [ ] Mobile app API URL matches tunnel URL
- [ ] Expo app is restarted after URL change
- [ ] Device has internet connection

