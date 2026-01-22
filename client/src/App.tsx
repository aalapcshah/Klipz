import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import { OnboardingWizard } from "./components/OnboardingWizard";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { trpc } from "./lib/trpc";
import { useState, useEffect } from "react";
// SearchWithSaved is now rendered inside Dashboard

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/search" component={Dashboard} />
      <Route path="/videos" component={Dashboard} />
      <Route path="/collections" component={Dashboard} />
      <Route path="/knowledge-graph" component={Dashboard} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
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
          <Toaster />
          <Router />
          <OnboardingWizard
            open={showOnboarding}
            onComplete={() => setShowOnboarding(false)}
          />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
