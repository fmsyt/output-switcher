import { useContext } from "react";
import SessionControlContext from "./SessionControlContext";

export default function useSessionControlContext() {
  const context = useContext(SessionControlContext);

  if (!context) {
    throw new Error("useSessionControlContext must be used within a SessionControlProvider");
  }

  return context;
}
