# Dishy Mobile

Expo mobile app for staff and owner workflows. It is intentionally isolated from `frontend/` and talks to the existing Go backend through the same REST API.

## Local API through Cloudflare Tunnel

1. Start the backend from the repo root:

   ```powershell
   cd backend
   go run main.go
   ```

2. In another terminal, expose the backend. For normal mobile testing use the named tunnel:

   ```powershell
   cloudflared tunnel run --token <your-cloudflare-tunnel-token>
   ```

   Put the deployed or tunnel API URL into the ignored local environment file:

   ```env
   EXPO_PUBLIC_API_URL=https://api.example.com
   ```

   If you need a throwaway quick tunnel instead:

   ```powershell
   npm run tunnel:backend
   ```

3. Put the API URL into `mobile/.env.local`.

4. Start Expo Go for password-login development:

   ```powershell
   cd mobile
   npm run start
   ```

Scan the QR with Expo Go on iOS or Android. Password login uses `/api/login`, stores the app JWT in SecureStore, and sends `X-Restaurant-ID` after restaurant selection.

## Google login development build

Google login requires native code and does not run in Expo Go. The app uses package/bundle ID `pro.dishy.restauranthub` and exchanges the provider ID token through the existing `/api/google-login` endpoint.

Add OAuth and EAS project metadata to ignored `mobile/.env.local`:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<your-google-web-client-id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<your-google-ios-client-id>
EXPO_EAS_PROJECT_ID=<your-eas-project-id>
EXPO_EAS_OWNER=<your-expo-account-name>
```

The Web client ID must match the backend Google audience configuration. In Google Cloud, create an Android OAuth client for `pro.dishy.restauranthub` and the SHA-1 of the certificate that signs the development APK. iOS additionally needs an OAuth client for bundle ID `pro.dishy.restauranthub`.

Create an Android development APK with EAS:

```powershell
npx eas-cli login
npm run build:android:development
```

The build wrapper limits EAS packaging to `mobile/`. This repository is not an npm workspace monorepo, and current EAS archiving on Windows can otherwise start at the Git root and include unrelated web/backend build artifacts.

Install the resulting APK, then run Metro for the installed development client:

```powershell
npm run start:dev-client
```

When the phone and computer are on the same private network and the backend is running locally on port 8080, use the LAN-safe helper instead. It derives the current private address for this process and does not overwrite `.env.local`:

```powershell
npm run start:dev-client:local
```

Changing native packages, the OAuth client configuration, or the iOS URL scheme requires rebuilding the development client. Never log or persist the Google ID token; only the Dishy app JWT returned by the backend belongs in SecureStore.

The tunnel script intentionally passes an empty Cloudflare config file so any existing named tunnel config in `~/.cloudflared` does not override the quick tunnel.

## Notes

- Do not connect the app directly to PostgreSQL.
- Keep the backend terminal and tunnel terminal running while testing on mobile.
- Use a deployed backend URL later by changing only `EXPO_PUBLIC_API_URL`.
- Expo Go supports the password flow only; use the development client for Google login.
