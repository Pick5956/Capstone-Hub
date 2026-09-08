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
Go cannot load. Fast Refresh behaves identically in both. **On iOS there is no development build -
see below.**

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

### On iOS, stay on Expo Go

The development build is an **Android APK - iOS devices cannot install it**. Producing an iOS build
that runs on a real device requires a paid Apple Developer Program membership ($99/year), because
iOS will only launch apps signed with a provisioning profile from one.

That costs nothing in practice, because **everything the development build adds on top of Expo Go
is unavailable on iOS anyway or nearly so**:

| Feature | Expo Go | iOS development build |
| --- | --- | --- |
| Bluetooth receipt printing | No | **Still no** - Bluetooth Classic needs MFi |
| Google login | No | Yes |
| Everything else | Yes | Yes |

The print button is hidden on iOS regardless of client, so for an iOS teammate the only difference
a development build would make is Google login. Password login covers the rest.

So: **iOS teammates run Expo Go**, with three things to watch.

- **Expo Go must match the SDK this project is on** (SDK 57 since the upgrade). The store version
  tracks the newest SDK and refuses to open a project once it moves on.
- **The machine serving Metro must be signed in to Expo.** From SDK 57, Expo Go on iOS only opens a
  project whose manifest is signed, and it asks for that signature by sending
  `expo-expect-signature: keyid="expo-root"`. An anonymous Metro answers without one and the phone
  says "You need to be signed in". Android does not ask, so it works either way.

  Sign in with a personal access token rather than the browser flow: `npx expo login --browser`
  crashes on Windows, because `cmd /c start` mis-parses the `&` in the callback URL. Create the
  token at expo.dev under **your own** account (Account settings -> Access tokens - the *organisation*
  token page needs Admin or Owner on the org) and put it in the ignored `mobile/.env`:

  ```env
  EXPO_TOKEN=<your-personal-expo-access-token>
  ```

  Signing in renames the tunnel subdomain from `anonymous` to your account name, so any link you
  shared before that stops working.
- **Start Metro in Expo Go mode**, not development-client mode:

```powershell
npm run start:go:lan
```

Only one Metro mode can hold port 8081, so a machine cannot serve both clients at once.

Every change is verifiable in Expo Go except the two native features above - screens, layout,
navigation, business logic and the receipt design are all plain JavaScript. Bluetooth printing can
only be tested by someone on Android with a printer.

### What Expo Go is still for, on Android

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
- On Android, prefer the development build for all testing; on iOS stay on Expo Go - see "Which client to test on".
