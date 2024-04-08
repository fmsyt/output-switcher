import { Box, Card, CardContent, CircularProgress, CssBaseline, IconButton, Slider, Stack, Typography } from "@mui/material";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";

import ThemeProvider from "./ThemeProvider";
import useWindowsAudioState from "./useWindowsAudioState";

import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { invokeQuery } from "./ipc";

function App() {

  const audioState = useWindowsAudioState();

  const handlerIdRef = useRef<number | null>(null);

  const defaultDevice = useMemo(() => {
    if (!audioState) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default]);

  const initialVolume = useMemo(() => defaultDevice?.volume, [defaultDevice]);
  const [muted, setMuted] = useState(defaultDevice?.muted);

  const handleChangeVolume = useCallback((event: Event, volume: number | number[]) => {

    if (!defaultDevice) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    console.log(volume);

    if (handlerIdRef.current !== null) {
      clearTimeout(handlerIdRef.current);
    }

    handlerIdRef.current = window.setTimeout(async () => {
      await invokeQuery({
        kind: "QVolumeChange",
        id: defaultDevice.id,
        volume: volume as number,
      });
    }, 50);
  }, [defaultDevice])

  const handleToggleMute = useCallback(async () => {

    console.log(defaultDevice?.muted);
    if (!defaultDevice) {
      return;
    }

    setMuted(!muted);

    await invokeQuery({
      kind: "QMuteStateChange",
      id: defaultDevice.id,
      muted: !muted,
    });

  }, [defaultDevice, muted]);

  return (
    <ThemeProvider>
      <CssBaseline />
      <Box sx={{ width: "100%", height: "100vh" }}>

        <Card>
          <CardContent>
            <Suspense fallback={<CircularProgress />}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <IconButton onClick={handleToggleMute}>
                  {muted ? <VolumeOffIcon /> : defaultDevice?.volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
                </IconButton>
                <Typography variant="h6">
                  {defaultDevice?.name}
                </Typography>
                <Typography variant="h6">
                  {defaultDevice?.volume}
                </Typography>
              </Stack>

              <Stack direction="row" alignItems="center" spacing={2}>
                <Slider
                  defaultValue={initialVolume}
                  onChange={handleChangeVolume}
                  min={0}
                  max={1}
                  step={0.01}
                />
              </Stack>
            </Suspense>

          </CardContent>
        </Card>

      </Box>
    </ThemeProvider>
  );
}

export default App;
