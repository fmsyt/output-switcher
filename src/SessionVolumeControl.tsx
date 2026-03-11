import { Box, FormControl, InputLabel, MenuItem, Select, Stack, Typography, } from "@mui/material";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import Checkbox from "./component/Checkbox";
import Slider from "./component/Slider";
import { invokeQuery } from "./ipc";
import type { AudioStateChangePayload } from "./types";

interface AudioSessionInfo {
  session_id: string;
  process_id: number;
  process_name: string;
  volume: number;
  muted: boolean;
  display_name: string;
  icon_path: string;
  exe_path: string;
  icon_data: string;
}

// TODO: セッション単位の操作はpidを介して行うようにする
// TODO: stateの管理はミュート、ボリュームの粒度ではなくてセッション単位で行うようにする

interface SessionVolumeControlProps {
  deviceId: string;
}

export default function SessionVolumeControl(props: SessionVolumeControlProps) {

  const { deviceId } = props;

  const [sessions, setSessions] = useState<AudioSessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<AudioSessionInfo | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const sessionList = await invoke<AudioSessionInfo[]>("get_audio_sessions", { deviceId });

      // システム音（プロセスID 0）を最初に、その後はプロセス名でソート
      const sortedSessions = sessionList.sort((a, b) => {
        if (a.process_id === 0) {
          return -1;
        }
        if (b.process_id === 0) {
          return 1;
        }

        return a.process_name.localeCompare(b.process_name);
      });

      setSessions(sortedSessions);

      // 現在選択中のセッションが存在する場合、最新の情報で更新
      if (selectedSessionIdRef.current) {
        const updated = sortedSessions.find(
          (s) => s.session_id === selectedSessionIdRef.current
        );
        if (updated) {
          setSelectedSession(updated);
        }
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [deviceId]);

  useEffect(() => {
    loadSessions();

    const unlisten = listen<AudioStateChangePayload>("audio_state_change", (event) => {
      const notification = event.payload.notification;
      if (notification &&
        (notification.type === "SessionCreated" || notification.type === "SessionTerminated") &&
        notification.device_id === deviceId) {
        console.log("Session change detected:", notification.type);
        loadSessions();
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [deviceId, loadSessions]);

  const handleSessionChange = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.session_id === sessionId);
      if (session) {
        selectedSessionIdRef.current = session.session_id;
        setSelectedSession(session);
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
      if (!selectedSession) return;

      const volumeValue = newValue as number;
      // UIの即時更新のためにセッション情報を更新
      setSelectedSession({ ...selectedSession, volume: volumeValue });
      invokeChangeVolume(volumeValue);
    },
    [selectedSession, invokeChangeVolume]
  );

  const handleMuteChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedSession) return;

      const newMuted = event.target.checked;
      // UIの即時更新のためにセッション情報を更新
      setSelectedSession({ ...selectedSession, muted: newMuted });

      await invokeQuery({
        kind: "SessionMuteStateChange",
        id: deviceId,
        sessionId: selectedSession.session_id,
        muted: newMuted,
      });
    },
    [deviceId, selectedSession]
  );

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

    return "不明なソフトウェア";

  }, [])

  return (
    <Box sx={{ mt: 2, p: 2, border: "1px solid #ccc", borderRadius: 1 }}>
      <Typography variant="h6" gutterBottom>
        Dead
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
                <Stack direction="row" spacing={1} alignItems="center">
                  {session.icon_data ? (
                    <img src={session.icon_data} alt="" style={{ width: 16, height: 16 }} />
                  ) : (
                    <span>{session.process_id === 0 ? "🔔" : "📦"}</span>
                  )}
                  <span>
                    {displaySoftwareName(session)}
                  </span>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedSession && (
          <>
            <Box sx={{ p: 1, bgcolor: "background.paper", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              {selectedSession.icon_data && (
                <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <img src={selectedSession.icon_data} alt="Application Icon" style={{ width: 32, height: 32 }} />
                  <Typography variant="body2" fontWeight="bold">
                    {displaySoftwareName(selectedSession)}
                  </Typography>
                </Box>
              )}
              <Typography variant="caption" display="block" color="text.secondary">
                プロセスID: {selectedSession.process_id}
              </Typography>
              {selectedSession.exe_path && (
                <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  実行ファイル: {selectedSession.exe_path}
                </Typography>
              )}
              {selectedSession.display_name && (
                <Typography variant="caption" display="block" color="text.secondary">
                  表示名: {selectedSession.display_name}
                </Typography>
              )}
              {selectedSession.icon_path && (
                <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  アイコンパス: {selectedSession.icon_path}
                </Typography>
              )}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                セッションID: {selectedSession.session_id}
              </Typography>
            </Box>

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                音量:
              </Typography>
              <Slider
                value={selectedSession.volume}
                onChange={handleVolumeChange}
                min={0}
                max={1}
                step={0.01}
                disabled={selectedSession.muted}
                size="small"
                sx={{ flexGrow: 1 }}
              />
              <Typography variant="body2" sx={{ minWidth: 40 }}>
                {Math.round(selectedSession.volume * 100)}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 50 }}>
                ミュート:
              </Typography>
              <Checkbox
                checked={selectedSession.muted}
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
