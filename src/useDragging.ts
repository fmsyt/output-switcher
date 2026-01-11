import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useRef } from "react";

type CleanupHandler = () => void;

export default function useDragging() {

  throw new Error("useDragging is deprecated. Please use DraggingProvider instead.");

  const ignoreDragTargetsRef = useRef<Map<HTMLElement, CleanupHandler>>(new Map());

  const addIgnoreDragTarget = useCallback((target: HTMLElement) => {
    if (ignoreDragTargetsRef.current.has(target)) {
      return;
    }

    target.style.outline = "red solid 1px"; // For debugging, to see which elements are registered

    const eventHandler = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (ignoreDragTargetsRef.current.has(target)) {
        console.log("ignoreDragTargetsRef", ignoreDragTargetsRef.current);
        // return;
      }

      const mainWindow = getCurrentWebviewWindow();
      mainWindow.startDragging();
    };

    target.addEventListener("mousedown", eventHandler);
    const cleanup = () => {
      target.removeEventListener("mousedown", eventHandler);
    };

    ignoreDragTargetsRef.current.set(target, cleanup);
    console.log("ignoreDragTargetsRef", ignoreDragTargetsRef.current);
  }, []);

  const removeIgnoreDragTarget = useCallback((target: HTMLElement) => {
    if (!ignoreDragTargetsRef.current.has(target)) {
      return;
    }

    const cleanup = ignoreDragTargetsRef.current.get(target);
    cleanup?.();
    ignoreDragTargetsRef.current.delete(target);
  }, []);

  return { addIgnoreDragTarget, removeIgnoreDragTarget };
}
