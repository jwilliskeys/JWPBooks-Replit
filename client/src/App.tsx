import { useState, useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import CustomerForm from "@/pages/customer-form";
import AppointmentsPage from "@/pages/appointments";
import CalendarPage from "@/pages/calendar";
import SlcSchedule from "@/pages/slc-schedule";
import InvoicesPage from "@/pages/invoices";
import InvoiceDetailPage from "@/pages/invoice-detail";
import SettingsPage from "@/pages/settings";
import PianoDetail from "@/pages/piano-detail";
import PianosPage from "@/pages/pianos";
import FinancesPage from "@/pages/finances";
import InspectionsPage from "@/pages/inspections";
import BookPage from "@/pages/book";
import OutreachPage from "@/pages/outreach";
import InventoryPage from "@/pages/inventory";
import LoginPage from "@/pages/login";
import { useAuth } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/new" component={CustomerForm} />
      <Route path="/customers/:id" component={CustomerDetail} />
      <Route path="/pianos/:id" component={PianoDetail} />
      <Route path="/pianos" component={PianosPage} />
      <Route path="/appointments" component={AppointmentsPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/slc-schedule" component={SlcSchedule} />
      <Route path="/invoices/new" component={InvoiceDetailPage} />
      <Route path="/invoices/:id" component={InvoiceDetailPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/finances" component={FinancesPage} />
      <Route path="/outreach" component={OutreachPage} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/inspections" component={InspectionsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

function AppShell() {
  const [location] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // Remember scroll position per page so going "back" doesn't reset to top.
  useScrollRestoration(mainRef, location);

  // Global Cmd/Ctrl-K shortcut for the search palette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      {/* h-dvh (not h-screen): 100vh on iOS Safari includes the space behind the
          collapsing address bar, which pushed the bottom of the app off-screen. */}
      <div className="flex h-dvh w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b h-14 sm:h-12 shrink-0">
            <SidebarTrigger className="h-10 w-10 sm:h-8 sm:w-8" />
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex flex-1 max-w-sm items-center gap-2 rounded-md border bg-muted/40 px-3 h-9 sm:h-8 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              data-testid="button-global-search"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">Search…</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
          </header>
          {/* overflow-x-hidden: any accidentally-too-wide element used to make the whole
              page scroll sideways on iOS ("things don't fit on the screen"). Vertical
              scrolling only; individual tables/tab bars keep their own overflow-x-auto. */}
          <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Router />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}

function App() {
  const [location] = useLocation();

  // The /book page is public-facing (no auth, no sidebar)
  if (location === "/book") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BookPage />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthGate>
            <AppShell />
          </AuthGate>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
