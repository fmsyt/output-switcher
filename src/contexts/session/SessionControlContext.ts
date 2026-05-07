import { createContext } from "react";
import type { SessionControlContextValue } from "./types";

const SessionControlContext = createContext<SessionControlContextValue | null>(null);

export default SessionControlContext;
