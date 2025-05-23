import { Card, CardContent, CircularProgress, CssBaseline, Stack } from "@mui/material";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppContext from "./AppContext";
import { invokeQuery } from "./ipc";
import Meter from "./Meter";
import ThemeProvider from "./ThemeProvider";
import useWindowsAudioState from "./useWindowsAudioState";

function App() {

  const ignoreDragTargetsRef = useRef<HTMLElement[]>([]);

  const addIgnoreDragTarget = useCallback((target: HTMLElement) => {
    ignoreDragTargetsRef.current.push(target);
  }, []);

  const removeIgnoreDragTarget = useCallback((target: HTMLElement) => {
    const index = ignoreDragTargetsRef.current.indexOf(target);
    if (index !== -1) {
      ignoreDragTargetsRef.current.splice(index, 1);
    }
  }, []);


  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {

    if (!cardRef.current) {
      return;
    }

    // with padding
    const width = cardRef.current.clientWidth + 32;
    const height = cardRef.current.clientHeight + 32;

    const physicalSize = new LogicalSize(width, height);

    const mainWindow = getCurrentWebviewWindow();
    mainWindow.setSize(physicalSize);

    const minSize = new LogicalSize(64, physicalSize.height);
    const maxSize = new LogicalSize(physicalSize.width, physicalSize.height);

    mainWindow.setMinSize(minSize);
    mainWindow.setMaxSize(maxSize);

    const handler = async (e: MouseEvent) => {

      if (ignoreDragTargetsRef.current.some(target => target.contains(e.target as Node))) {
        return;
      }

      mainWindow.startDragging();
    }

    cardRef.current.addEventListener("mousedown", (handler));

    return () => {
      cardRef.current?.removeEventListener("mousedown", handler);
    }

  }, [])

  const audioState = useWindowsAudioState();


  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const defaultDevice = useMemo(() => {
    if (!audioState) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const getVolume = useCallback((deviceId: string) => {

    if (!audioState) {
      return 0;
    }

    const device = audioState.audioDeviceList.find(device => device.id === deviceId);
    return device?.volume || 0;

  }, [audioState?.audioDeviceList])

  useEffect(() => {
    invokeQuery({
      kind: "AudioSessionDict",
      id: audioState?.default || "",
    }).then((param) => {
      console.log("AudioSessionDict", param);
    }).catch((e) => {
      console.error("AudioSessionDict error", e);
    });
  }, [audioState?.default]);

  // ここから追加
  const [sessionDeviceId, setSessionDeviceId] = useState("");
  const [sessionProcessName, setSessionProcessName] = useState("");
  const [sessionVolume, setSessionVolume] = useState(0.5);
  const [sessionMuted, setSessionMuted] = useState(false);

  const handleSessionVolumeChange = async () => {
    await invokeQuery({
      kind: "SessionVolumeChange",
      id: sessionDeviceId,
      processName: sessionProcessName,
      volume: sessionVolume,
    });
  };

  const handleSessionMuteChange = async () => {
    await invokeQuery({
      kind: "SessionMuteStateChange",
      id: sessionDeviceId,
      processName: sessionProcessName,
      muted: sessionMuted,
    });
  };

  return (
    <ThemeProvider>
      <CssBaseline />
      <AppContext.Provider
        value={{
          addIgnoreDragTarget,
          removeIgnoreDragTarget,
        }}
      >
        <Card ref={cardRef}>
          <CardContent>
            {defaultDevice && (
              <Meter
                device={defaultDevice}
                defaultVolume={getVolume(defaultDevice.id)}
                deviceList={audioState?.audioDeviceList}
              />
            )}

            {!defaultDevice && (
              <Stack spacing={2} alignItems="center">
                <CircularProgress />
              </Stack>
            )}

            {/* ここから追加：audio session操作用フォーム */}
            <Stack spacing={2} mt={4}>
              <div>【試験的 Audio Session 操作】</div>
              <input
                type="text"
                placeholder="デバイスID"
                value={sessionDeviceId}
                onChange={e => setSessionDeviceId(e.target.value)}
              />
              <input
                type="text"
                placeholder="プロセス名 (例: chrome.exe)"
                value={sessionProcessName}
                onChange={e => setSessionProcessName(e.target.value)}
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                placeholder="音量 (0.0-1.0)"
                value={sessionVolume}
                onChange={e => setSessionVolume(Number(e.target.value))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={sessionMuted}
                  onChange={e => setSessionMuted(e.target.checked)}
                />
                ミュート
              </label>
              <Stack direction="row" spacing={2}>
                <button onClick={handleSessionVolumeChange}>音量変更</button>
                <button onClick={handleSessionMuteChange}>ミュート切替</button>
              </Stack>
            </Stack>
            {/* 追加ここまで */}
          </CardContent>
        </Card>
      </AppContext.Provider>
    </ThemeProvider>
  );
}

export default App;
