import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
};

type AuthStore = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (accessToken: string, refreshToken: string, user: User) => void;
  updateAccessToken: (accessToken: string) => void;
  logout: () => void;
  // Legacy support - will be removed
  token: string | null;
  // Hydration tracking — prevents redirect before localStorage loads
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      token: null, // Legacy
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setAuth: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user, token: accessToken }), // Legacy support
      updateAccessToken: (accessToken) =>
        set({ accessToken, token: accessToken }), // Legacy support
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null, token: null }),
    }),
    {
      name: "property-investment-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        token: state.token,
      }),
      onRehydrateStorage: () => () => {
        useAuthStore.getState().setHasHydrated(true);
      },
    },
  ),
);
