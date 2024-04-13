import { Card, CardContent, CircularProgress, CssBaseline, Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { LogicalSize, getCurrent } from "@tauri-apps/api/window";

import ThemeProvider from "./ThemeProvider";
import useWindowsAudioState from "./useWindowsAudioState";

import Meter from "./Meter";

function App() {

  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {

    if (!cardRef.current) {
      return;
    }

    // with padding
    const width = cardRef.current.clientWidth + 32;
    const height = cardRef.current.clientHeight + 32;

    const physicalSize = new LogicalSize(width, height);

    const mainWindow = getCurrent();
    mainWindow.setSize(physicalSize);

    const minSize = new LogicalSize(64, physicalSize.height);
    const maxSize = new LogicalSize(physicalSize.width, physicalSize.height);

    mainWindow.setMinSize(minSize);
    mainWindow.setMaxSize(maxSize);

  }, [])

  const audioState = useWindowsAudioState();

  const defaultDevice = useMemo(() => {
    if (!audioState) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default]);

  const getVolume = useCallback((deviceId: string) => {

    if (!audioState) {
      return 0;
    }

    const device = audioState.audioDeviceList.find(device => device.id === deviceId);
    return device?.volume || 0;

  }, [audioState?.audioDeviceList])

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

        </CardContent>
      </Card>
    </ThemeProvider>
  );
}

export default App;
