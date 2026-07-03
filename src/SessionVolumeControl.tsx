import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { Box, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import MaskedIcon from './component/MaskedIcon';
import Slider from "./component/Slider";
import type { AudioSessionInfo } from "./contexts/audio/types";
import useSessionControlContext from './contexts/session/useSessionControlContext';

export default function SessionVolumeControl() {

  const { sessions, invokeChangeMute, invokeChangeVolume } = useSessionControlContext();

  return (
    <Box sx={{ mt: 2, p: 2 }}>
      {sessions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          実行中のソフトウェアがありません
        </Typography>
      ) : (
        <Stack spacing={2}>
          {sessions.map((session) => (
            <Box
              key={session.session_id}
              sx={{
                p: 2,
                bgcolor: "background.paper",
                borderRadius: 1,
                border: "1px solid #e0e0e0",
              }}
            >
              <SessionControl
                audioSession={session}
                invokeChangeMute={invokeChangeMute}
                invokeChangeVolume={invokeChangeVolume}
              />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

type SessionControlProps = {
  audioSession: AudioSessionInfo;
  invokeChangeMute: (sessionId: string, muted: boolean) => Promise<void>;
  invokeChangeVolume: (sessionId: string, volume: number) => Promise<void>;
}

function SessionControl(props: SessionControlProps) {

  const { audioSession: session, invokeChangeMute, invokeChangeVolume } = props;

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

  const handleVolumeChange = useCallback(
    () => (_event: Event, newValue: number | number[]) => {
      const volumeValue = newValue as number;
      invokeChangeVolume(session.session_id, volumeValue);
      setVolume(volumeValue);
    },
    [invokeChangeVolume, session.session_id]
  );

  const handleMuteChange = useCallback(() => {
    const newMuted = !muted;
    console.log("Changing mute state for session", session.session_id, "to", newMuted);
    invokeChangeMute(session.session_id, newMuted);
    setMuted(newMuted);
  }, [invokeChangeMute, session.session_id, muted])

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">

        <MaskedIcon
          masked={muted}
          onClick={handleMuteChange}
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

        <Typography variant="body1" fontWeight="bold">
          {displaySoftwareName(session)}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center">
        <Slider
          value={volume}
          onChange={handleVolumeChange()}
          min={0}
          max={1}
          step={0.01}
          disabled={muted}
          size="small"
          sx={{ flexGrow: 1 }}
        />
        <Typography variant="body2" sx={{ minWidth: 40 }}>
          {Math.round(volume * 100)}
        </Typography>
      </Stack>
    </Stack>
  )

}
