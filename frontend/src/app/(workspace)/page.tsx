import { BackendStatus } from "@/components/layout/backend-status";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function DashboardPage() {
  return (
    <PlaceholderPage title="Dashboard" pageNumber={2} owner="Steve" phase="F1">
      <BackendStatus />
    </PlaceholderPage>
  );
}
