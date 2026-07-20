This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Public Local Tunnel

Use this mode only when the local machine should serve the web app through Cloudflare Tunnel for phones or users on another network.

Keep the backend running first:

```powershell
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1 -Mode public
cd frontend
```

Then run the Cloudflare named tunnel in another terminal:

```powershell
npm run tunnel:public
```

Run the frontend in public mode:

```powershell
npm run build:public
npm run start:public
```

Public routes:

- Web app: [https://dishy.pro](https://dishy.pro)
- API: [https://api.dishy.pro](https://api.dishy.pro)

`npm run dev` stays local, uses `http://localhost:8080` from `.env.local`, and keeps Hot Reload. `build:public` and `start:public` load `.env.public.local` and use the public API while keeping the persistent Node process small. Production public mode has no Hot Reload: rebuild and restart it after every frontend source change before checking the public URL. Use `npm run dev:public` only when a short public editing session explicitly needs Hot Reload; it intentionally runs the much heavier Next compiler.

The managed backend, frontend, and tunnel scripts create new timestamped stdout/stderr files directly under `../logs/<service>/current/`. Existing files are left untouched; archive them manually when needed.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
