import { useEffect } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";

// Import Layout
import { Layout } from "@/components/layout";

// Import Pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import JobDetail from "@/pages/job-detail";
import Tracker from "@/pages/tracker";
import CV from "@/pages/cv";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const queryClient = new QueryClient();

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(0 72.2% 50.6%)",
    colorForeground: "hsl(0 0% 98%)",
    colorMutedForeground: "hsl(0 0% 63.9%)",
    colorDanger: "hsl(0 62.8% 30.6%)",
    colorBackground: "hsl(0 0% 4%)",
    colorInput: "hsl(0 0% 14.9%)",
    colorInputForeground: "hsl(0 0% 98%)",
    colorNeutral: "hsl(0 0% 14.9%)",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-background border border-border rounded-none w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground font-mono text-xs uppercase",
    footerActionLink: "text-primary hover:text-primary/90",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-500",
    alertText: "text-destructive",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-border bg-transparent hover:bg-muted text-foreground rounded-none",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none",
    formFieldInput: "bg-background border-border text-foreground rounded-none",
    footerAction: "bg-background",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border border-destructive",
    otpCodeFieldInput: "border-border text-foreground rounded-none",
    formFieldRow: "mb-4",
    main: "px-8 py-6",
  },
};

function AnimatedBg() {
  return (
    <div className="animated-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      <AnimatedBg />
      <div className="grid-overlay" />
      <div className="noise-overlay" />
      <div className="z-10 w-full max-w-md">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      <AnimatedBg />
      <div className="grid-overlay" />
      <div className="noise-overlay" />
      <div className="z-10 w-full max-w-md">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <AnimatedBg />
      <div className="grid-overlay" />
      <div className="noise-overlay" />
      <div className="z-10 text-center max-w-3xl px-6">
        <img src={`${basePath}/logo.svg`} alt="PK Logo" className="h-16 w-16 mx-auto mb-8" />
        <h1 className="text-5xl md:text-7xl font-serif text-foreground mb-6">
          Intelligence for<br/>your next move.
        </h1>
        <p className="text-xl font-mono text-muted-foreground mb-10 max-w-xl mx-auto">
          A private terminal for Pakistani professionals. Sharp, precise, information-dense.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={`${basePath}/sign-in`} className="bg-primary text-primary-foreground px-8 py-3 uppercase font-mono text-sm tracking-wider hover:bg-primary/90 transition-colors border border-primary">
            Sign In
          </a>
          <a href={`${basePath}/sign-up`} className="bg-transparent text-foreground px-8 py-3 uppercase font-mono text-sm tracking-wider hover:bg-secondary transition-colors border border-border">
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AnimatePresence mode="wait">
            <Switch location={location} key={location}>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              
              <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
              <Route path="/jobs"><ProtectedRoute component={Jobs} /></Route>
              <Route path="/jobs/:id"><ProtectedRoute component={JobDetail} /></Route>
              <Route path="/tracker"><ProtectedRoute component={Tracker} /></Route>
              <Route path="/cv"><ProtectedRoute component={CV} /></Route>
              <Route path="/settings"><ProtectedRoute component={Settings} /></Route>

              <Route><NotFound /></Route>
            </Switch>
          </AnimatePresence>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
      <Toaster />
    </WouterRouter>
  );
}