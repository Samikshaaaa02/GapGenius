import * as React from "react";

export type PersonaRole = "front_desk" | "property_manager" | "portfolio_admin";

export interface Persona {
  role: PersonaRole;
  name: string;
  title: string;
  initials: string;
  permissions: {
    viewHeatmap: boolean;
    applyManualFix: boolean;
    runOptimization: boolean;
    viewPortfolio: boolean;
    viewSettings: boolean;
  };
}

export const PERSONAS: Record<PersonaRole, Persona> = {
  front_desk: {
    role: "front_desk",
    name: "Maya Chen",
    title: "Front Desk · Reservations",
    initials: "MC",
    permissions: {
      viewHeatmap: true,
      applyManualFix: false,
      runOptimization: false,
      viewPortfolio: false,
      viewSettings: false,
    },
  },
  property_manager: {
    role: "property_manager",
    name: "Jordan Rivera",
    title: "Property Manager · Downtown Tower",
    initials: "JR",
    permissions: {
      viewHeatmap: true,
      applyManualFix: true,
      runOptimization: true,
      viewPortfolio: false,
      viewSettings: false,
    },
  },
  portfolio_admin: {
    role: "portfolio_admin",
    name: "Alex Park",
    title: "Portfolio Admin · Corporate",
    initials: "AP",
    permissions: {
      viewHeatmap: true,
      applyManualFix: true,
      runOptimization: true,
      viewPortfolio: true,
      viewSettings: true,
    },
  },
};

interface PersonaState {
  persona: Persona;
  role: PersonaRole;
  setRole: (role: PersonaRole) => void;
  can: (perm: keyof Persona["permissions"]) => boolean;
}

const PersonaContext = React.createContext<PersonaState | null>(null);
const STORAGE_KEY = "revenue-copilot-persona";

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = React.useState<PersonaRole>("property_manager");

  // Hydrate from localStorage after mount (avoids SSR hydration mismatch)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as PersonaRole | null;
      if (stored && stored in PERSONAS) setRoleState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setRole = React.useCallback((next: PersonaRole) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const persona = PERSONAS[role];

  const can = React.useCallback(
    (perm: keyof Persona["permissions"]) => persona.permissions[perm],
    [persona],
  );

  const value: PersonaState = { persona, role, setRole, can };

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona() {
  const ctx = React.useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used within PersonaProvider");
  return ctx;
}
