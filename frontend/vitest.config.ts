import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/lib/__tests__/ai*.test.{ts,tsx}",
      "src/lib/__tests__/orderItemGroups.test.ts",
      "src/lib/__tests__/homeDashboard.test.ts",
      "src/lib/__tests__/documentTitle.test.ts",
      "src/lib/__tests__/authModalMotion.test.ts",
      "src/lib/__tests__/orderNavigation.test.ts",
      "src/lib/__tests__/orderEvents.test.ts",
      "src/lib/__tests__/posTableNavigation.test.ts",
      "src/lib/__tests__/singleFlight.test.ts",
      "src/app/(dashboard)/orders/ordersPageUtils.test.ts",
      "src/components/shared/RealtimeConnectionNotice.test.tsx",
      "src/components/shared/ThemedSelect.test.tsx",
    ],
  },
});
