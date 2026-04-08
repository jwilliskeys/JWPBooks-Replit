import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, LogOut, Piano, KeyRound } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/new" component={CustomerForm} />
      <Route path="/customers/:id" component={CustomerDetail} />
      <Route path="/appointments" component={AppointmentsPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/slc-schedule" component={SlcSchedule} />
      <Route path="/invoices/new" component={InvoiceDetailPage} />
      <Route path="/invoices/:id" component={InvoiceDetailPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function LandingPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Incorrect passcode");
        setPasscode("");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary/5 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Piano className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">PianoTech</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-serif font-bold leading-tight">
            Your piano service business, organized.
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Manage clients, track tunings, schedule appointments, and plan service trips — all in one place.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">PianoTech Customer Manager</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Piano className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">PianoTech</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-2">
                <KeyRound className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Enter passcode</h2>
            <p className="text-muted-foreground text-sm">
              JWP Books — enter your passcode to continue.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              autoFocus
              autoComplete="current-password"
              data-testid="input-passcode"
              className="text-center text-lg tracking-widest"
            />
            {error && (
              <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || !passcode}
              data-testid="button-login"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 p-2 border-b h-12">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.profileImageUrl ?? undefined} alt={user.firstName ?? "User"} />
                    <AvatarFallback className="text-[10px]">
                      {user.firstName?.[0]}{user.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                    onClick={() => logout()}
                    data-testid="button-logout"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LandingPage />;
  return <AuthenticatedApp />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
