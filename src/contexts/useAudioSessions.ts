import { invoke } from "@tauri-apps/api/core";
import type { AudioSessionInfo } from "./audio/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { invokeQuery } from "../ipc";
import { AudioStateChangePayload } from "../ipc/types";
import { listen } from "@tauri-apps/api/event";

type Props = {
  deviceId: string;
  onSessionsChange?: (sessions: AudioSessionInfo[]) => void;
}


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

export default function useAudioSessions(props: Props) {
  const { deviceId } = props;

  const [sessions, setSessions] = useState<AudioSessionInfo[]>([]);

  useEffect(() => {

    const loader = async () => {
      const sessionList = await loadSessions(deviceId);
      setSessions(sessionList);

      props.onSessionsChange?.(sessionList);
    }

    loader();

    // const unlisten = listen<AudioStateChangePayload>("audio_state_change", (event) => {
    //   const notification = event.payload.notification;
    //   if (!notification) {
    //     return;
    //   }
    //
    //   if (
    //     (notification.type === "SessionCreated" || notification.type === "SessionTerminated")
    //     && notification.device_id === deviceId
    //   ) {
    //     console.log("Session change detected:", notification.type);
    //
    //     loader();
    //   }
    // });
    //
    // return () => {
    //   unlisten.then(fn => fn());
    // };

  }, [deviceId, props.onSessionsChange])

  const invokeChangeMute = useCallback(async (sessionId: AudioSessionInfo["session_id"], muted: boolean) => {
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


  return {
    sessions,
    invokeChangeMute,
    invokeToggleMute,
    invokeChangeVolume,
  }
}

