import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
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
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between gap-1 p-2 border-b h-14 sm:h-12 shrink-0">
                  <SidebarTrigger className="h-10 w-10 sm:h-8 sm:w-8" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
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
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
