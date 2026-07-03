import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioDeviceInfo } from "./contexts/audio/types";
import { invokeQuery } from "./ipc";
import type { AudioStateChangePayload, AudioState } from "./ipc/types";

const useWindowsAudioState = () => {

  const [initializing, setInitializing] = useState(true);
  const [audioState, setAudioState] = useState<AudioState | undefined>();

  const initializeAsyncFn = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (initializeAsyncFn.current !== null) {
      return;
    }

    initializeAsyncFn.current = async () => {
      await listen<AudioStateChangePayload>("audio_state_change", (event) => {
        const payload = event.payload;
        // Prefer the new platform-agnostic field, fall back to legacy windows field.
        const newState = (payload as any).audioState ?? (payload as any).windowsAudioState ?? (payload as any).pipewireAudioState;
        if (newState) {
          setAudioState(newState);
        }
      });

      const results = await Promise.allSettled([
        invokeQuery({ kind: "AudioDict" }),
        invokeQuery({ kind: "Channels" }),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Failed to initialize audio state", result.reason);
        }
      }
    };

    initializeAsyncFn.current().finally(() => {
      setInitializing(false);
    })
  }, []);

  const audioDeviceList = useMemo(() => audioState?.audioDeviceList ?? [], [audioState?.audioDeviceList]);

  const defaultDevice = useMemo<AudioDeviceInfo | null>(() => {
    if (!audioState?.default) {
      return null;
    }

    const device = audioDeviceList.find(device => device.id === audioState.default);
    return device ?? null;
  }, [audioState?.default, audioDeviceList]);

  return {
    defaultDevice,
    audioDeviceList,
    initializing,
  };
}

export default useWindowsAudioState;
