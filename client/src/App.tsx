import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig, AnimatePresence, motion } from "motion/react";
import { DashboardLayout, ProtectedRoute,
  VerificationBanner
} from "./components/layout";
import { LoginPage, OAuthCallback, VerifyEmailPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/auth";
import { SessionsPage } from "./pages/settings";
import { AgentsPage, AgentCreatePage, AgentRunPage, AgentEditPage } from "./pages/agents";
import {
  AgentCards,
  ActivityChart,
  AgentTree,
  ActivityFeed,
} from "./components/dashboard";
import { useAuth } from "./lib/hooks";

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.18, ease: "easeIn" as const } },
};

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function Dashboard() {
  return (
    <motion.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <VerificationBanner />

      <motion.div variants={itemVariants}>
        <h1 className="font-mono text-2xl font-bold tracking-tight text-[#e0e0e0] text-balance">
          Dashboard
        </h1>
        <p className="mt-1 font-mono text-[10px] text-[rgba(255,255,255,0.35)] uppercase tracking-[0.28em]">
          Monitor your agents and recent activity
        </p>
      </motion.div>

      <motion.div variants={itemVariants}>
        <AgentCards />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <ActivityChart />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AgentTree />
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <ActivityFeed />
      </motion.div>
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/auth/callback/:provider" element={<OAuthCallback />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/settings/sessions"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageTransition><SessionsPage /></PageTransition>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageTransition><AgentsPage /></PageTransition>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/new"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageTransition><AgentCreatePage /></PageTransition>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:id/run"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageTransition><AgentRunPage /></PageTransition>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:id"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageTransition><AgentEditPage /></PageTransition>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function LoginRedirect() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <LoginPage />;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
