import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";
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
  return (
    <Routes>
      {/* Auth routes — no persistent layout */}
      <Route path="/login" element={<LoginRedirect />} />
      <Route path="/auth/callback/:provider" element={<OAuthCallback />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* App routes — DashboardLayout persists, transitions handled inside layout */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Navigate to="/settings/sessions" replace />} />
        <Route path="/settings/sessions" element={<SessionsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/new" element={<AgentCreatePage />} />
        <Route path="/agents/:id/run" element={<AgentRunPage />} />
        <Route path="/agents/:id" element={<AgentEditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
