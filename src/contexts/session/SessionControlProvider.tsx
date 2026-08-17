import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { invokeQuery } from "../../ipc";
import type { AudioStateChangePayload } from "../../ipc/types";
import type { AudioSessionInfo } from "../audio/types";
import SessionControlContext from "./SessionControlContext";
import type { SessionControlProviderProps } from "./types";

async function loadSessions(deviceId: string): Promise<AudioSessionInfo[]> {
  const sessionList = await invoke<AudioSessionInfo[]>("get_audio_sessions", { deviceId });

  // システム音（プロセスID 0）を最初に、その後はプロセス名でソート
  sessionList.sort((a, b) => {
    if (a.process_id === 0) {
      return -1;
    }
    if (b.process_id === 0) {
      return 1;
    }

    return a.process_name.localeCompare(b.process_name);
  });

  return sessionList;
}

export default function SessionControlProvider(props: SessionControlProviderProps) {

  const { deviceId } = props;

  const [sessions, setSessions] = useState<AudioSessionInfo[]>([]);

  const onSessionsChangeRef = useRef(props.onSessionsChange);
  useEffect(() => {
    onSessionsChangeRef.current = props.onSessionsChange;
  }, [props.onSessionsChange]);

  useEffect(() => {

    if (!deviceId) {
      return;
    }

    console.log("Loading audio sessions for device:", deviceId);

    const loader = async () => {
      const sessionList = await loadSessions(deviceId);
      setSessions(sessionList);

      onSessionsChangeRef.current?.(sessionList);
    }

    loader();

    const unlisten = listen<AudioStateChangePayload>("audio_state_change", (event) => {
      const notification = event.payload.notification;
      if (!notification) {
        return;
      }

      if (
        (notification.type === "SessionCreated" || notification.type === "SessionTerminated")
      ) {
        if ('device_id' in notification && notification.device_id === deviceId) {
          console.log("Session change detected:", notification.type);

          loader();
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };

  }, [deviceId])

  const invokeChangeMute = useCallback(async (sessionId: AudioSessionInfo["session_id"], muted: boolean) => {

    if (!deviceId) {
      console.warn("Device ID is null. Cannot change mute state.");
      return;
    }

    await invokeQuery({
      kind: "SessionMuteStateChange",
      id: deviceId,
      sessionId,
      muted,
    });

  }, [deviceId])

  const invokeToggleMute = useCallback(
    async (sessionId: AudioSessionInfo["session_id"]) => {

      const audioSession = sessions.find(s => s.session_id === sessionId);
      if (!audioSession) {
        return;
      }

      const muted = !audioSession.muted;
      invokeChangeMute(sessionId, muted);
    },
    [sessions, invokeChangeMute]
  );

  const handlerRef = useRef<ReturnType<Window["setTimeout"]> | null>(null)
  const invokeChangeVolume = useCallback(async (sessionId: AudioSessionInfo["session_id"], volume: number) => {

    if (!deviceId) {
      console.warn("Device ID is null. Cannot change volume.");
      return;
    }

    const session = sessions.find(s => s.session_id === sessionId);
    if (!session) {
      return;
    }

    if (handlerRef.current !== null) {
      clearTimeout(handlerRef.current);
    }

    handlerRef.current = window.setTimeout(async () => {
      console.log("Invoking volume change:", { sessionId, volume });
      await invokeQuery({
        kind: "SessionVolumeChange",
        id: deviceId,
        sessionId,
        volume,
      });
    }, 10)

  }, [sessions, deviceId])


  return (
    <SessionControlContext.Provider
      value={{
        sessions,
        invokeChangeMute,
        invokeToggleMute,
        invokeChangeVolume,
      }}
    >
      {props.children}
    </SessionControlContext.Provider>
  )

}
