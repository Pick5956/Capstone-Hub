import { SidebarProvider } from "@/src/providers/SidebarProvider";
import Sidebar from "@/src/components/shared/Sidebar";
import MobileTopBar from "@/src/components/shared/MobileTopBar";
import ContentWrapper from "@/src/components/shared/ContentWrapper";
import DashboardRestaurantGuard from "@/src/components/shared/DashboardRestaurantGuard";

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
          <main className="min-w-0 max-w-full overflow-x-hidden">{children}</main>
        </ContentWrapper>
      </SidebarProvider>
    </DashboardRestaurantGuard>
  );
}
