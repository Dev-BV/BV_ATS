import { createContext, useContext } from "react";
import type { AuthUser, CvExtractResponse } from "./api";

export interface AppCtx {
  user: AuthUser;
  notify: (message: string) => void;
  refresh: () => Promise<void>;                       // reload dashboard numbers + recent uploads
  extraction: { data: CvExtractResponse; file: string } | null;
  setExtraction: (e: AppCtx["extraction"]) => void;
}

export const AppContext = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(AppContext);
