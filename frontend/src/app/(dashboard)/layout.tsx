import { SidebarProvider } from "@/src/providers/SidebarProvider";
import Sidebar from "@/src/components/shared/Sidebar";
import MobileTopBar from "@/src/components/shared/MobileTopBar";
import ContentWrapper from "@/src/components/shared/ContentWrapper";
import DashboardRestaurantGuard from "@/src/components/shared/DashboardRestaurantGuard";
import AIOperationsFloatingChatGate from "@/src/components/shared/AIOperationsFloatingChatGate";
import DashboardTopBar from "@/src/components/shared/DashboardTopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardRestaurantGuard>
      <SidebarProvider>
        <Sidebar />
        <ContentWrapper>
          <MobileTopBar />
          <DashboardTopBar />
          <main className="min-w-0 max-w-full overflow-x-clip pt-14 lg:pt-0">{children}</main>
        </ContentWrapper>
        <AIOperationsFloatingChatGate />
      </SidebarProvider>
    </DashboardRestaurantGuard>
  );
}
