import { createContext } from "react";
import type { DraggingContextValues } from "./types";

const DraggingContext = createContext<DraggingContextValues>({
  addIgnoreDragTarget: () => {
    throw new Error("DraggingContext not provided");
  },
  removeIgnoreDragTarget: () => {
    throw new Error("DraggingContext not provided");
  },
})

export default DraggingContext;
