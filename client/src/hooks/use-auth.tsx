import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoginInput, PublicUser, Role } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextValue = {
  user: PublicUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
  isLoggingIn: boolean;
  /** Admin implicitly holds every role, mirroring requireRole() on the server. */
  can: (...roles: Role[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<PublicUser | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity, // Cache indefinitely - only refetch on explicit login/logout
    gcTime: Infinity, // Keep in cache forever until cleared
    refetchOnWindowFocus: false, // Don't refetch when user returns to tab
    refetchOnReconnect: false, // Don't refetch on network reconnect
    refetchOnMount: false, // Don't refetch on component remount
  });

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await apiRequest("POST", "/api/login", input);
      return (await res.json()) as PublicUser;
    },
    onSuccess: (loggedIn) => {
      queryClient.setQueryData(["/api/user"], loggedIn);
      toast({ title: `Xush kelibsiz, ${loggedIn.fullName}` });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      // Wipe every cached response — the next user must not see the last one's data.
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
    },
  });

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    isLoggingIn: loginMutation.isPending,
    can: (...roles) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return roles.includes(user.role as Role);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider ichida ishlatilishi kerak");
  return ctx;
}
