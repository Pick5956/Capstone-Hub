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

## Which client to test on

Once the development build is installed, **use it for everything on Android**. It is a superset of
Expo Go, not an alternative to it: everything Expo Go runs, it runs, plus the native modules Expo
Go cannot load. Fast Refresh behaves identically in both.

```powershell
npm run start:dev-client:local
```

Metro serves one client mode at a time and both modes want port 8081, so a leftover
`npm run start` / `start:go:lan` process (Expo Go mode) will stop the development build from
connecting. Stop it before starting the other.

### When a rebuild is actually needed

| Change | Rebuild? |
| --- | --- |
| UI, business logic, API calls, copy, receipt layout | No - Fast Refresh |
| Adding or removing a **native** dependency | Yes |
| `app.json` / `app.config.js` native config: permissions, package name, icon, splash | Yes |
| Expo SDK upgrade | Yes |
| Google OAuth client ID or iOS URL scheme | Yes |

An installed APK does not expire, and it is not tied to whoever built it - the whole team can
install the same one. Only the EAS *download link* expires. So a rebuild is a rare event, not part
of the edit-test loop.

### What Expo Go is still for

- **iOS.** There is no iOS development build, and making one needs a paid Apple Developer account.
  Expo Go remains the only free way to check iOS layout - but not Google login or Bluetooth
  printing, neither of which runs there (printing does not run on iOS at all; see below).
- **Showing someone the app quickly** without having them install the APK first.

## Bluetooth receipt printing

Closed bills can be printed to a 58 mm Bluetooth thermal printer (developed against an
**Xprinter XP-58IIH**). It needs the development client, works on **Android only**, and the
receipt is sent as a bitmap rather than ESC/POS text so Thai renders correctly.

Full setup, testing steps and troubleshooting (in Thai):
[`bluetoothreceiptprinting.md`](bluetoothreceiptprinting.md)

## Notes

- Do not connect the app directly to PostgreSQL.
- Keep the backend terminal and tunnel terminal running while testing on mobile.
- Use a deployed backend URL later by changing only `EXPO_PUBLIC_API_URL`.
- Expo Go supports the password flow only; use the development client for Google login.
- Bluetooth receipt printing also needs the development client, and works on Android only.
- On Android, prefer the development build for all testing - see "Which client to test on".
