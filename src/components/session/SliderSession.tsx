import { Slider } from "@mui/material";
import { useContext, useEffect, useRef } from "react";
import AppContext from "../../AppContext";
import SessionContext from "./SessionContext";
import SliderSessionProps from "./SliderSessionProps";

export default function SliderSession(props: SliderSessionProps) {

  const { session } = useContext(SessionContext);

  const sliderRef = useRef<HTMLSpanElement | null>(null);
  const appContext = useContext(AppContext);
  useEffect(() => {
    const { addIgnoreDragTarget, removeIgnoreDragTarget } = appContext;

    sliderRef.current && addIgnoreDragTarget(sliderRef.current);

    return () => {
      sliderRef.current && removeIgnoreDragTarget(sliderRef.current);
    }

  }, [appContext])

  return (
    <Slider
      value={session?.volume}
      min={0}
      max={1}
      size="small"
      disabled={props.deviceMuted === true || session?.muted}
      step={props.volumeStep}
      ref={sliderRef}
    />
  );
}
