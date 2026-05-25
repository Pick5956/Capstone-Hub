# Restaurant Hub Mobile

Expo mobile app for staff and owner workflows. It is intentionally isolated from `frontend/` and talks to the existing Go backend through the same REST API.

## Local API through Cloudflare Tunnel

1. Start the backend from the repo root:

   ```powershell
   cd backend
   go run main.go
   ```

2. In another terminal, expose the backend. For normal mobile testing use the named tunnel:

   ```powershell
   cloudflared tunnel run --token <restaurant-hub-api-dev-token>
   ```

   Current stable development API URL:

   ```env
   EXPO_PUBLIC_API_URL=https://api.dishy.pro
   ```

   If you need a throwaway quick tunnel instead:

   ```powershell
   npm run tunnel:backend
   ```

3. Put the API URL into `mobile/.env.local`:

   ```env
   EXPO_PUBLIC_API_URL=https://api.dishy.pro
   ```

4. Start Expo:

   ```powershell
   cd mobile
   npm run start
   ```

Scan the QR with Expo Go on iOS or Android. The app will login through `/api/login`, store the JWT in SecureStore, and send `X-Restaurant-ID` after restaurant selection.

The tunnel script intentionally passes an empty Cloudflare config file so any existing named tunnel config in `~/.cloudflared` does not override the quick tunnel.

## Notes

- Do not connect the app directly to PostgreSQL.
- Keep the backend terminal and tunnel terminal running while testing on mobile.
- Use a deployed backend URL later by changing only `EXPO_PUBLIC_API_URL`.
