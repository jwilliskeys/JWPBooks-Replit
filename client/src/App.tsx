import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, LogOut, Piano } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import CustomerForm from "@/pages/customer-form";
import SyncPage from "@/pages/sync";
import CalendarPage from "@/pages/calendar";
import SlcSchedule from "@/pages/slc-schedule";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/new" component={CustomerForm} />
      <Route path="/customers/:id" component={CustomerDetail} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/slc-schedule" component={SlcSchedule} />
      <Route path="/sync" component={SyncPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function LandingPage() {
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
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground text-sm">
              Sign in to access your customer records and schedule.
            </p>
          </div>
          <a href="/api/login">
            <Button size="lg" className="w-full" data-testid="button-login">
              Log in with Replit
            </Button>
          </a>
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
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => logout()}
                    data-testid="button-logout"
                  >
                    <LogOut className="h-3.5 w-3.5" />
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
