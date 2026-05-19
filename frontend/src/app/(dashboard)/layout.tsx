import { Sidebar } from "@/components/layout/sidebar";
import { SplashGate } from "@/components/layout/splash-gate";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SplashGate>
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border">
          {children}
        </main>
      </SplashGate>
    </div>
  );
}
