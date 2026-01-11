import { useContext } from "react";
import DraggingContext from "./DraggingContext";

export default function useDragging() {
  const context = useContext(DraggingContext)
  if (!context) {
    throw new Error("useDragging must be used within a DraggingProvider");
  }

  return context;
}
