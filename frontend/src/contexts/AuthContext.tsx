import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

interface UserInfo {
  id: number;
  username: string;
  full_name: string;
  role: string;
  branch_id: number | null;
  allowed_tabs: string[] | null;
  allowed_brands: number[] | null;
}

interface AuthCtx {
  user: UserInfo | null;
  token: string | null;
  login: (username: string, password: string) => Promise<UserInfo>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null, token: null,
  login: async () => { throw new Error("not ready"); },
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    const u = localStorage.getItem("user");
    if (t && u) {
      setToken(t);
      setUser(JSON.parse(u));
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => (r.ok ? r.json() : null))
        .then((fresh: UserInfo | null) => {
          if (fresh) {
            setUser(fresh);
            localStorage.setItem("user", JSON.stringify(fresh));
          }
        })
        .catch(() => {});
    }
  }, []);

  const login = async (username: string, password: string) => {
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);
    const res = await fetch("/api/auth/login", { method: "POST", body });
    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user as UserInfo;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedBrandId");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
