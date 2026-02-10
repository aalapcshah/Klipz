import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { NotificationPrompt } from "./components/NotificationPrompt";
import { NotificationListener } from "./components/NotificationListener";
import { Footer } from "./components/Footer";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import About from "./pages/About";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import Upgrade from "./pages/Upgrade";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfService } from "./pages/TermsOfService";
import { PaymentSuccess } from "./pages/PaymentSuccess";
import ActivityDashboard from "./pages/ActivityDashboard";
import { Admin } from "./pages/Admin";
import { AdminScheduledReports } from "./pages/AdminScheduledReports";
import { AdminAlerts } from "./pages/AdminAlerts";
import { AdminCohorts } from "./pages/AdminCohorts";
import { AdminAlertHistory } from "./pages/AdminAlertHistory";
import AdminReports from "./pages/AdminReports";
import AdminShareAnalytics from "./pages/AdminShareAnalytics";
import AdminSystemOverview from "./pages/AdminSystemOverview";
import AdminControlPanel from "./pages/AdminControlPanel";
import ShareView from "./pages/ShareView";
import VideoDetail from "./pages/VideoDetail";
import Share from "./pages/Share";
import MyShares from "./pages/MyShares";
import Pricing from "./pages/Pricing";
import { trpc } from "./lib/trpc";
import { useState, useEffect } from "react";
import { CookieConsent } from "./components/CookieConsent";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { useCallback } from "react";
import { BannerQueueProvider } from "./contexts/BannerQueueContext";
// SearchWithSaved is now rendered inside Dashboard

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/videos" component={Dashboard} />
      <Route path="/videos/:id" component={VideoDetail} />
      <Route path="/collections" component={Dashboard} />
      <Route path="/analytics" component={Dashboard} />
      <Route path="/enrichment-queue" component={Dashboard} />
      <Route path="/scheduled-exports" component={Dashboard} />
      <Route path="/settings" component={Dashboard} />
      <Route path="/upload-history" component={Dashboard} />
      <Route path="/knowledge-graph" component={Dashboard} />
      <Route path="/caption-search" component={Dashboard} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/faq" component={FAQ} />
      <Route path="/contact" component={Contact} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/activity" component={ActivityDashboard} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/scheduled" component={AdminScheduledReports} />
      <Route path="/admin/alerts" component={AdminAlerts} />
      <Route path="/admin/cohorts" component={AdminCohorts} />
      <Route path="/admin/alert-history" component={AdminAlertHistory} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/shares" component={AdminShareAnalytics} />
      <Route path="/admin/system" component={AdminSystemOverview} />
      <Route path="/admin/control" component={AdminControlPanel} />
      <Route path="/my-shares" component={MyShares} />
      <Route path="/share/:token" component={ShareView} />
      <Route path="/share" component={Share} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const { data: user } = trpc.auth.me.useQuery();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // Global keyboard shortcut for Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (user && !user.profileCompleted) {
      setShowOnboarding(true);
    }
  }, [user]);

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <TooltipProvider>
          <div className="flex flex-col min-h-screen">
            <Toaster />
            <div className="flex-1">
              <Router />
            </div>
            <Footer />
            <OnboardingWizard
              open={showOnboarding}
              onComplete={() => setShowOnboarding(false)}
            />
            <BannerQueueProvider>
              <CookieConsent />
              <PWAInstallBanner />
              <NotificationPrompt />
            </BannerQueueProvider>
            <OnboardingTutorial />
            <NotificationListener />
            <GlobalSearchModal
              open={showGlobalSearch}
              onOpenChange={setShowGlobalSearch}
            />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
