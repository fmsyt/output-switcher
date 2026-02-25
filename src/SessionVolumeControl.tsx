import { Box, FormControl, InputLabel, MenuItem, Select, Stack, Typography, } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import Checkbox from "./component/Checkbox";
import Slider from "./component/Slider";
import { invokeQuery } from "./ipc";

interface AudioSessionInfo {
  session_id: string;
  process_id: number;
  process_name: string;
  volume: number;
  muted: boolean;
}

interface SessionVolumeControlProps {
  deviceId: string;
}

export default function SessionVolumeControl({
  deviceId,
}: SessionVolumeControlProps) {
  const [sessions, setSessions] = useState<AudioSessionInfo[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<AudioSessionInfo | null>(null);
  const [volume, setVolume] = useState(0);
  const [muted, setMuted] = useState(false);

  // セッションリストを取得
  const loadSessions = useCallback(async () => {
    try {
      const sessionList = await invoke<AudioSessionInfo[]>(
        "get_audio_sessions",
        { deviceId }
      );

      // システム音（プロセスID 0）を最初に、その後はプロセス名でソート
      const sortedSessions = sessionList.sort((a, b) => {
        if (a.process_id === 0) return -1;
        if (b.process_id === 0) return 1;
        return a.process_name.localeCompare(b.process_name);
      });

      setSessions(sortedSessions);

      // 現在選択中のセッションが存在する場合、最新の情報で更新
      if (selectedSession) {
        const updated = sortedSessions.find(
          (s) => s.session_id === selectedSession.session_id
        );
        if (updated) {
          setSelectedSession(updated);
          setVolume(updated.volume);
          setMuted(updated.muted);
        }
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [deviceId, selectedSession]);

  useEffect(() => {
    loadSessions();
    // 定期的にセッションリストを更新
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // セッション選択時
  const handleSessionChange = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.session_id === sessionId);
      if (session) {
        setSelectedSession(session);
        setVolume(session.volume);
        setMuted(session.muted);
      }
    },
    [sessions]
  );

  // 音量変更のデバウンス用
  const handlerIdRef = useRef<number | null>(null);
  const invokeChangeVolume = useCallback(
    async (newVolume: number) => {
      if (!selectedSession) return;

      if (handlerIdRef.current !== null) {
        clearTimeout(handlerIdRef.current);
      }

      handlerIdRef.current = window.setTimeout(async () => {
        await invokeQuery({
          kind: "SessionVolumeChange",
          id: deviceId,
          sessionId: selectedSession.session_id,
          volume: newVolume,
        });
      }, 10);
    },
    [deviceId, selectedSession]
  );

  const handleVolumeChange = useCallback(
    (_event: Event, newValue: number | number[]) => {
      const volumeValue = newValue as number;
      setVolume(volumeValue);
      invokeChangeVolume(volumeValue);
    },
    [invokeChangeVolume]
  );

  const handleMuteChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedSession) return;

      const newMuted = event.target.checked;
      setMuted(newMuted);

      await invokeQuery({
        kind: "SessionMuteStateChange",
        id: deviceId,
        sessionId: selectedSession.session_id,
        muted: newMuted,
      });
    },
    [deviceId, selectedSession]
  );

  return (
    <Box sx={{ mt: 2, p: 2, border: "1px solid #ccc", borderRadius: 1 }}>
      <Typography variant="h6" gutterBottom>
        ソフトウェア音量コントロール
      </Typography>

      <Stack spacing={2}>
        <FormControl fullWidth size="small">
          <InputLabel id="session-select-label">ソフトウェア</InputLabel>
          <Select
            labelId="session-select-label"
            id="session-select"
            value={selectedSession?.session_id ?? ""}
            label="ソフトウェア"
            onChange={(e) => handleSessionChange(e.target.value as string)}
          >
            {sessions.length === 0 && (
              <MenuItem value="" disabled>
                実行中のソフトウェアがありません
              </MenuItem>
            )}
            {sessions.map((session) => (
              <MenuItem key={session.session_id} value={session.session_id}>
                {session.process_id === 0 ? "🔔 " : ""}
                {session.process_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedSession && (
          <>
            <Box sx={{ p: 1, bgcolor: "background.paper", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" display="block" color="text.secondary">
                プロセスID: {selectedSession.process_id}
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                セッションID: {selectedSession.session_id}
              </Typography>
            </Box>

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                音量:
              </Typography>
              <Slider
                value={volume}
                onChange={handleVolumeChange}
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

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                ミュート:
              </Typography>
              <Checkbox
                checked={muted}
                onChange={handleMuteChange}
                size="small"
              />
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  );
}
