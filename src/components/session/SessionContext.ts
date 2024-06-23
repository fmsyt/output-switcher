import { createContext } from "react";
import SessionContextProps from "./SessionContextProps";

const SessionContext = createContext<SessionContextProps>({
  session: {
    id: "",
    volume: 0,
    muted: false,
    icon: "",
    name: "",
  }
});

export default SessionContext;
