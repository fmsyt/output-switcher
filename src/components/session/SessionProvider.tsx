import { useCallback, useEffect, useRef, useState } from "react";
import { AudioSessionInfo } from "../../types";
import SessionContext from "./SessionContext";
import SessionProviderProps from "./SessionProviderProps";

export default function SessionProvider(props: SessionProviderProps) {

  const { volumeStep } = props;

  const [session, setSession] = useState<AudioSessionInfo>(props.session);
  useEffect(() => setSession(props.session), [props.session]);


  const handleWheel = useCallback((event: WheelEvent) => {

    event.preventDefault();
    event.stopPropagation();

    setSession((prev) => {

      const { volume } = prev;

      const delta = event.deltaY || event.deltaX;

      const direction = volume + (delta > 0 ? -volumeStep : volumeStep);
      const nextVolume = Math.min(1, Math.max(0, direction));

      // invokeChangeVolume(nextVolume);

      return { ...prev, volume: nextVolume }
    })


  }, [volumeStep]);

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollAreaRef.current) {
      return;
    }

    scrollAreaRef.current.addEventListener("wheel", handleWheel);

    return () => {
      scrollAreaRef.current?.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  return (
    <SessionContext.Provider
      value={{
        session,
      }}
    >
      {props.children}
    </SessionContext.Provider>
  )
}
