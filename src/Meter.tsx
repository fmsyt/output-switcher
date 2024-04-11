import { window as tauriWindow } from "@tauri-apps/api";

import { Grid, IconButton, Slider, Stack, Typography } from "@mui/material";
import { MeterProps } from "./types";

import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useCallback, useEffect, useRef, useState } from "react";

import { invokeQuery } from "./ipc";

export default function Meter(props: MeterProps) {

  const { device } = props;

  const dragAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!dragAreaRef.current) {
      return;
    }

    const handler = async () => {
      await tauriWindow.appWindow.startDragging();
    }

    dragAreaRef.current.addEventListener("mousedown", handler);
    return () => {
      dragAreaRef.current?.removeEventListener("mousedown", handler);
    }

  }, [])

  const handlerIdRef = useRef<number | null>(null);

  const displayVolume = useCallback((v: number) => Math.round(v * 100), []);

  const [volume, setVolume] = useState(device.volume || 0);
  const [muted, setMuted] = useState(device.muted);

  const handleChangeVolume = useCallback((event: Event, volume: number | number[]) => {

    if (!device) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (handlerIdRef.current !== null) {
      clearTimeout(handlerIdRef.current);
    }

    setVolume(volume as number);

    handlerIdRef.current = window.setTimeout(async () => {
      await invokeQuery({
        kind: "QVolumeChange",
        id: device.id,
        volume: volume as number,
      });
    }, 50);
  }, [device])

  const handleToggleMute = useCallback(async () => {

    if (!device) {
      return;
    }

    setMuted(!muted);

    await invokeQuery({
      kind: "QMuteStateChange",
      id: device.id,
      muted: !muted,
    });

  }, [device, muted]);

  useEffect(() => setVolume(device.volume || 0), [device.volume]);
  useEffect(() => setMuted(device.muted), [device.muted]);


  return (
    <Grid
      container
      display="grid"
      gridTemplateColumns={"max-content 1fr"}
      gridTemplateRows={"repeat(2, auto)"}
      alignItems="center"
    >
      <IconButton onClick={handleToggleMute}>
        {muted ? <VolumeOffIcon /> : volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
      </IconButton>

      <Typography
        ref={dragAreaRef}
        variant="h6"
        component="div"
        width="100%"
      >
        {device.name}
      </Typography>

      <div></div>

      <Stack direction="row" alignItems="center" spacing={2}>
        <Slider
          value={volume}
          onChange={handleChangeVolume}
          min={0}
          max={1}
          step={0.01}
          disabled={muted}
        />
        <Typography variant="h6">
          {displayVolume(volume)}
        </Typography>
      </Stack>

    </Grid>
  )
}
