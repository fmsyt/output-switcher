import { Card, CardContent, CircularProgress, CssBaseline, Stack, Typography } from "@mui/material";
import { useMemo } from "react";

import ThemeProvider from "./ThemeProvider";
import useWindowsAudioState from "./useWindowsAudioState";

import Meter from "./Meter";

function App() {

  const audioState = useWindowsAudioState();

  const defaultDevice = useMemo(() => {
    if (!audioState) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState?.default]);

  return (
    <ThemeProvider>
      <CssBaseline />
      <Card sx={{ width: "100%", height: "100vh" }}>
        <CardContent>
          {defaultDevice && (
            <Meter device={defaultDevice} />
          )}

          {!defaultDevice && (
            <Stack spacing={2} alignItems="center">
              <CircularProgress />
              <Typography variant="h6">Loading...</Typography>
            </Stack>
          )}

        </CardContent>
      </Card>
    </ThemeProvider>
  );
}

export default App;
