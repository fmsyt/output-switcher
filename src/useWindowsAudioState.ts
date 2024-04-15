import { useEffect, useRef, useState } from "react"
import { AudioStateChangePayload, WindowsAudioState } from "./types"
import { listen } from "@tauri-apps/api/event";
import { invokeQuery } from "./ipc";

const useWindowsAudioState = () => {
  const [audioState, setAudioState] = useState<WindowsAudioState | null>(null);

  const initializeAsyncFn = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (initializeAsyncFn.current !== null) {
      return;
    }

    initializeAsyncFn.current = async () => {
      await listen<AudioStateChangePayload>("audio_state_change", (event) => {
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
