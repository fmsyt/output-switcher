import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { invokeQuery } from "./ipc";
import { AudioSessionInfo, AudioStateChangePayload, WindowsAudioState } from "./types";

const useWindowsAudioState = () => {
  const [audioState, setAudioState] = useState<WindowsAudioState | null>(null);
  const [audioSessoins, setAudioSessions] = useState<AudioSessionInfo[] | null>(null);

  const initializeAsyncFn = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (initializeAsyncFn.current !== null) {
      return;
    }

    initializeAsyncFn.current = async () => {
      await listen<AudioStateChangePayload>("audio_state_change", (event) => {
        console.log("audio_state_change", event.payload)
        setAudioState(event.payload.windowsAudioState);
      });

      await invokeQuery({ kind: "AudioDict" });

      console.log("initialized");
    };
    initializeAsyncFn.current();
  }, []);

  return audioState;
}

export default useWindowsAudioState;
