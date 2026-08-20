import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioDeviceInfo } from "./contexts/audio/types";
import { invokeQuery } from "./ipc";
import type { AudioStateChangePayload, WindowsAudioState } from "./ipc/types";

const useWindowsAudioState = () => {

  const [initializing, setInitializing] = useState(true);
  const [audioState, setAudioState] = useState<WindowsAudioState>();

  const initializeAsyncFn = useRef<(() => Promise<void>) | null>(null);

  // オーディオ状態の初期化関数
  const initializeAudioState = async () => {
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

  useEffect(() => {
    if (initializeAsyncFn.current !== null) {
      return;
    }

    initializeAsyncFn.current = async () => {
      // オーディオ状態変更のリスナー
      await listen<AudioStateChangePayload>("audio_state_change", (event) => {
        setAudioState(event.payload.windowsAudioState);
      });

      // スリープ復帰のリスナー
      await listen("system-resume", async () => {
        console.log("System resumed from sleep, refreshing audio state...");
        // スリープ復帰時は少し待ってから更新
        setTimeout(() => {
          initializeAudioState();
        }, 1000);
      });

      await initializeAudioState();
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
