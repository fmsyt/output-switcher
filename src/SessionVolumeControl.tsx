import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import MaskedIcon from './component/MaskedIcon';
import Slider from "./component/Slider";
import type { AudioSessionInfo } from "./contexts/audio/types";
import useSessionControlContext from './contexts/session/useSessionControlContext';

const volumeStep = 0.01;

export default function SessionVolumeControl() {

  const { sessions, invokeChangeMute, invokeChangeVolume } = useSessionControlContext();

  return (
    <Stack spacing={1.5}>
      {sessions.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          実行中のソフトウェアがありません
        </Typography>
      )}
      {sessions.map((session) => (
        <Box key={session.session_id}>
          <SessionControl
            audioSession={session}
            invokeChangeMute={invokeChangeMute}
            invokeChangeVolume={invokeChangeVolume}
          />
        </Box>
      ))}
    </Stack>
  );
}

type SessionControlProps = {
  audioSession: AudioSessionInfo;
  invokeChangeMute: (sessionId: string, muted: boolean) => Promise<void>;
  invokeChangeVolume: (sessionId: string, volume: number) => Promise<void>;
}

function SessionControl(props: SessionControlProps) {

  const { audioSession: session, invokeChangeMute, invokeChangeVolume } = props;

  const abortControllerRef = useRef<AbortController | null>(null);

  const [volume, setVolume] = useState(props.audioSession.volume);
  const [muted, setMuted] = useState(props.audioSession.muted);
  useEffect(() => {
    const { volume, muted } = session;
    setVolume(volume);
    setMuted(muted);
  }, [session])

  const displaySoftwareName = useCallback((session: AudioSessionInfo) => {
    if (session.process_id === 0) {
      return "システム音量";
    }

    if (session.display_name) {
      return session.display_name;
    }

    if (session.process_name) {
      const splitted = session.process_name.split(".");
      if (splitted.length > 1) {
        splitted.pop();
      }
      return splitted.join(".");
    }

    return `不明なソフトウェア (PID: ${session.process_id})`;
  }, []);

  const debouncedInvokeChangeVolume = useCallback((volume: number) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        invokeChangeVolume(session.session_id, volume);
      }
    }, 10);

    signal.addEventListener('abort', () => clearTimeout(timeoutId));
  }, [invokeChangeVolume, session.session_id]);

  const handleVolumeChange = useCallback(
    () => (_event: Event, newValue: number | number[]) => {
      const volumeValue = newValue as number;
      debouncedInvokeChangeVolume(volumeValue);
      setVolume(volumeValue);
    },
    [debouncedInvokeChangeVolume]
  );

  const handleMuteChange = useCallback(() => {
    const newMuted = !muted;
    console.log("Changing mute state for session", session.session_id, "to", newMuted);
    invokeChangeMute(session.session_id, newMuted);
    setMuted(newMuted);
  }, [invokeChangeMute, session.session_id, muted])

  const handleWheel = useCallback((event: WheelEvent) => {

    if (muted) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setVolume((volume) => {

      const delta = event.deltaY || event.deltaX;

      const direction = volume + (delta > 0 ? -volumeStep : volumeStep);
      const nextVolume = Math.min(1, Math.max(0, direction));

      debouncedInvokeChangeVolume(nextVolume);

      return nextVolume;
    })

  }, [debouncedInvokeChangeVolume, muted]);

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
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "center",
      }}
    >
      <Tooltip
        arrow
        placement="right"
        title={displaySoftwareName(session)}
      >
        <MaskedIcon
          masked={muted}
          onClick={handleMuteChange}
          size="small"
          maskComponent={
            <VolumeOffIcon />
          }
        >
          {session.icon_data ? (
            <img
              src={session.icon_data}
              alt=""
              style={{ width: 24, height: 24 }}
            />
          ) : (
            <span style={{ fontSize: 24 }}>
              {session.process_id === 0 ? "🔔" : "📦"}
            </span>
          )}
        </MaskedIcon>
      </Tooltip>

      <Slider
        ref={scrollAreaRef}
        value={volume}
        onChange={handleVolumeChange()}
        min={0}
        max={1}
        step={0.01}
        disabled={muted}
        size="small"
      />
      <Typography
        variant="body2"
        sx={{
          width: 40,
          textAlign: "center",
        }}
      >
        {Math.round(volume * 100)}
      </Typography>
    </Stack >
  )

}
