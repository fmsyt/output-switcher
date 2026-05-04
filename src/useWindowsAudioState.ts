import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, useMemo } from "react";
import { invokeQuery } from "./ipc";
import type { AudioStateChangePayload, WindowsAudioState } from "./types";

const useWindowsAudioState = () => {

  const [initializing, setInitializing] = useState(true);
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

      const results = await Promise.allSettled([
        invokeQuery({ kind: "AudioDict" }),
        invokeQuery({ kind: "Channels" }),
      ]);

      results.forEach((result) => {
        if (result.status !== "rejected") {
          return;
        }

        console.error("Failed to initialize audio state", result.reason);
      })
    };

    initializeAsyncFn.current().finally(() => {
      setInitializing(false);
    })
  }, []);

  const audioDeviceList = useMemo(() => audioState?.audioDeviceList ?? [], [audioState?.audioDeviceList]);

  const defaultDevice = useMemo(() => {
    if (!audioState?.default) {
      return null;
    }

    return audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default, audioDeviceList]);

  return {
    defaultDevice,
    audioDeviceList,
    initializing,
  };
}

export default useWindowsAudioState;
