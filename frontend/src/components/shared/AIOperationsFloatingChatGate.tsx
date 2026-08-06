"use client";

import { usePathname } from "next/navigation";
import AIOperationsFloatingChat from "@/src/components/shared/AIOperationsFloatingChat";
import { shouldMountFloatingAssistant } from "@/src/lib/aiFloatingVisibility";

export default function AIOperationsFloatingChatGate() {
  const pathname = usePathname();
  if (!shouldMountFloatingAssistant(pathname)) return null;
  return <AIOperationsFloatingChat />;
}
