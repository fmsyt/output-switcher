import { Box, Card, CardContent, CssBaseline, Stack, Typography } from "@mui/material";

import ThemeProvider from "./ThemeProvider";
import useWindowsAudioState from "./useWindowsAudioState";

import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { useMemo } from "react";

function App() {

  const audioState = useWindowsAudioState();

  const defaultDevice = useMemo(() => {
    if (!audioState) {
      return null;
    }

    return audioState.audioDeviceList.find(device => device.id === audioState.default);
  }, [audioState]);

  return (
    <ThemeProvider>
      <CssBaseline />
      <Box sx={{ width: "100%", height: "100vh" }}>
        <Card>
          <CardContent>

            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="h6">
                {defaultDevice?.name}
              </Typography>
              <Typography variant="h6">
                {defaultDevice?.volume}
              </Typography>
              <Typography variant="h6">
                {defaultDevice?.muted ? "Muted" : "Not Muted"}
              </Typography>
              {defaultDevice?.muted ? <VolumeOffIcon /> : defaultDevice?.volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
            </Stack>


          </CardContent>
        </Card>
        <pre>{JSON.stringify(audioState, null, 2)}</pre>
      </Box>
    </ThemeProvider>
  );
}

export default App;
