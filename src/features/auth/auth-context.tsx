import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
function useAuthState() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let revision = 0;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      revision++;
      if (active) {
        setSession(next);
        setLoading(false);
      }
    });
    const initialRevision = revision;
    void client.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!active || revision !== initialRevision) return;
        setSession(data.session);
        setLoading(false);
        if (failure) setError("Could not restore your session. Please sign in again.");
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError("Could not restore your session. Please retry.");
        }
      });
    if (AppState.currentState === "active") client.auth.startAutoRefresh();
    const stateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      stateListener.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);
  async function authenticate(email: string, password: string, signup = false, name = "") {
    if (busy.current) return false;
    if (!supabase) {
      setError("Supabase is not configured. Restart Expo after adding the environment variables.");
      return false;
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !password ||
      (signup && (password.length < 8 || !name.trim()))
    ) {
      setError(
        signup
          ? "Enter your name, a valid email and a password of at least 8 characters."
          : "Enter a valid email and password."
      );
      return false;
    }
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = signup
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { display_name: name.trim().slice(0, 60) } },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setNotice(
          "Account created, but Supabase still requires email confirmation. For direct signup, turn off Confirm email in the project’s Email provider settings."
        );
      return !!result.data.session;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not sign in. Check your connection and retry."
      );
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function signOut() {
    if (!supabase || busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setSession(null);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign out. Please retry.");
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    session,
    loading,
    pending,
    error,
    notice,
    authenticate,
    signOut,
    clearFeedback: () => {
      setError("");
      setNotice("");
    },
  };
}
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is missing.");
  return auth;
}
