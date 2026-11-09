import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "../services/api";
import { restoreSession } from "../lib/authSession";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    restoreSession({ getMe: authAPI.getMe }).then((session) => {
      if (!active) return;
      setToken(session?.token || null);
      setUser(session?.user || null);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const expireSession = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("alfredo:unauthorized", expireSession);
    return () => window.removeEventListener("alfredo:unauthorized", expireSession);
  }, []);

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    const payload = response.data.data || response.data;
    const newToken = payload.accessToken || payload.token;
    const newUser = payload.user;
    completeLogin({ accessToken: newToken, user: newUser });
  };

  const register = async (name, email, password, returnTo) => {
    const response = await authAPI.register(name, email, password, returnTo);
    return response.data.data || response.data;
  };

  const completeLogin = useCallback(({ accessToken, user: authenticatedUser }) => {
    setToken(accessToken);
    setUser(authenticatedUser);
    localStorage.setItem("token", accessToken);
    localStorage.setItem("user", JSON.stringify(authenticatedUser));
  }, []);

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  const isAdmin = () => user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        completeLogin,
        logout,
        isAdmin,
        isAuthenticated: !!token && !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
