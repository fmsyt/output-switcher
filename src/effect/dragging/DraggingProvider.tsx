import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useRef } from "react";
import DraggingContext from "./DraggingContext";
import type { DraggingProviderProps } from "./types";

export default function DraggingProvider(props: DraggingProviderProps) {

  const ignoreDragTargetsRef = useRef<Set<HTMLElement>>(new Set());

  const addIgnoreDragTarget = useCallback((target: HTMLElement) => {
    ignoreDragTargetsRef.current.add(target);
    target.style.outline = "red solid 1px"; // For debugging, to see which elements are registered

    return () => {
      ignoreDragTargetsRef.current.delete(target);
    }

  }, [])

  const removeIgnoreDragTarget = useCallback((target: HTMLElement) => {
    ignoreDragTargetsRef.current.delete(target);
  }, [])


  const rootRef = useRef<HTMLDivElement>(null);
  const handleMouseDown = useCallback((event: React.MouseEvent) => {

    const isIgnored = Array.from(ignoreDragTargetsRef.current).some(target => {
      return target.contains(event.target as Node);
    })

    if (isIgnored) {
      return;
    }

    const mainWindow = getCurrentWebviewWindow();
    mainWindow.startDragging();

  }, [])


  return (
    <DraggingContext.Provider
      value={{
        addIgnoreDragTarget,
        removeIgnoreDragTarget,
      }}
    >
      <div
        ref={rootRef}
        onMouseDown={handleMouseDown}
      >
        {props.children}
      </div>
    </DraggingContext.Provider>
  )

}

