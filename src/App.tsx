import { Card, CardContent, CircularProgress, CssBaseline, Stack } from "@mui/material";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Meter from "./Meter";
import ThemeProvider from "./ThemeProvider";
import { invokeQuery } from "./ipc";
import useDragging from "./useDragging";
import useWindowsAudioState from "./useWindowsAudioState";

function App() {

  const cardRef = useRef<HTMLDivElement>(null);
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

  }, [])

  const audioState = useWindowsAudioState();


  const defaultDevice = useMemo(() => {
    if (!audioState?.default) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default, audioState?.audioDeviceList]);


  const getVolume = useCallback((deviceId: string) => {

    if (!audioState?.audioDeviceList) {
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
  const experimentalAreaRef = useRef<HTMLDivElement | null>(null);
  const processNameRef = useRef<HTMLInputElement | null>(null);
  const volumeRef = useRef<HTMLInputElement | null>(null);
  const muteRef = useRef<HTMLInputElement | null>(null);

  const handleSessionVolumeChange = useCallback(async () => {

    if (!defaultDevice) {
      return;
    }

    console.log("handleSessionVolumeChange", defaultDevice.id);

    const sessionProcessName = processNameRef.current?.value || "";
    const sessionVolume = Number(volumeRef.current?.value) || 0;

    await invokeQuery({
      kind: "SessionVolumeChange",
      id: defaultDevice.id,
      processName: sessionProcessName,
      volume: sessionVolume,
    });
  }, [defaultDevice]);

  const handleSessionMuteChange = async () => {

    if (!defaultDevice) {
      return;
    }

    const sessionProcessName = processNameRef.current?.value || "";
    const sessionMuted = muteRef.current?.checked || false;

    await invokeQuery({
      kind: "SessionMuteStateChange",
      id: defaultDevice.id,
      processName: sessionProcessName,
      muted: sessionMuted,
    });
  };

  const { addIgnoreDragTarget, removeIgnoreDragTarget } = useDragging();

  useEffect(() => {
    if (!experimentalAreaRef.current) {
      return;
    }

    addIgnoreDragTarget(experimentalAreaRef.current);

    return () => {
      if (experimentalAreaRef.current) {
        removeIgnoreDragTarget(experimentalAreaRef.current);
      }
    }

  }, [addIgnoreDragTarget, removeIgnoreDragTarget]);

  return (
    <ThemeProvider>
      <CssBaseline />
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
          <Stack
            spacing={2}
            mt={4}
            ref={experimentalAreaRef}
          >
            <div>【試験的 Audio Session 操作】</div>
            <input
              type="text"
              placeholder={defaultDevice?.id}
            />
            <input
              type="text"
              placeholder="プロセス名 (例: chrome.exe)"
              ref={processNameRef}
              defaultValue="Discord.exe"
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder="音量 (0.0-1.0)"
              ref={volumeRef}
              defaultValue={0.5}
            />
            <label>
              <input
                type="checkbox"
                ref={muteRef}
              />
              ミュート
            </label>
            <Stack direction="row" spacing={2}>
              <button type="button" onClick={handleSessionVolumeChange}>音量変更</button>
              <button type="button" onClick={handleSessionMuteChange}>ミュート切替</button>
            </Stack>
          </Stack>
          {/* 追加ここまで */}
        </CardContent>
      </Card>
    </ThemeProvider>
  );
}

export default App;
