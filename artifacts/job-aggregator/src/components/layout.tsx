import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Briefcase, 
  Trello, 
  FileText, 
  Settings, 
  LogOut,
  Menu,
  Sun,
  Moon,
  DollarSign,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile as useMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/context/theme";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/gigs", label: "Side Income", icon: DollarSign },
  { href: "/tracker", label: "Tracker", icon: Trello },
  { href: "/cv", label: "CV Studio", icon: FileText },
  { href: "/practice", label: "Practice", icon: GraduationCap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const isMobile = useMobile();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = () => {
    signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });
  };

  const NavLinks = () => (
    <>
      <div className="flex-1 py-8 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border ${isActive ? 'bg-primary/10 border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
                <Icon className="w-5 h-5" />
                <span className="font-mono text-sm uppercase tracking-wider">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-border bg-background/50">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center border border-border">
            <span className="font-mono text-xs">{user?.firstName?.charAt(0) || user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.fullName || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start rounded-none font-mono text-xs uppercase text-muted-foreground hover:text-foreground mb-1"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
        <Button variant="ghost" className="w-full justify-start rounded-none font-mono text-xs uppercase text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      <div className="animated-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>
      <div className="grid-overlay" />
      <div className="noise-overlay" />
      
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-64 border-r border-border bg-card/30 backdrop-blur-md flex flex-col z-20 h-screen sticky top-0">
          <div className="h-16 flex items-center px-6 border-b border-border">
            <Link href="/dashboard">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="NexHire Logo" className="w-8 h-8" />
                <span className="font-serif font-bold text-xl tracking-tight">NexHire</span>
              </div>
            </Link>
          </div>
          <NavLinks />
        </aside>
      )}

      {/* Mobile Header & Bottom Nav */}
      {isMobile && (
        <>
          <header className="h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-30">
            <Link href="/dashboard">
              <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="NexHire Logo" className="w-8 h-8" />
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-none">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 p-0 bg-background border-l border-border flex flex-col rounded-none">
                <div className="h-14 flex items-center px-6 border-b border-border">
                  <span className="font-serif font-bold text-xl tracking-tight">MENU</span>
                </div>
                <NavLinks />
              </SheetContent>
            </Sheet>
          </header>
          
          <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-background/90 backdrop-blur-md flex items-center justify-around px-2 z-30 pb-safe">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`flex flex-col items-center justify-center w-16 h-full cursor-pointer ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-mono uppercase">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-14 pb-16' : ''}`}>
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}