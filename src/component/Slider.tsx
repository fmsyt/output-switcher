import { Slider as MuiSlider, type SliderProps } from "@mui/material";
import { useEffect, useRef } from "react";
import useDragging from "../effect/dragging/useDragging";

export default function Slider(props: SliderProps) {

  const context = useDragging();
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const { addIgnoreDragTarget } = context;

    const cleanup = addIgnoreDragTarget(ref.current);
    return cleanup;

  }, [context])

  return (
    <MuiSlider
      {...props}
      slotProps={{
        root: {
          ...props.slotProps?.root,
          ref: ref,
        },

        ...props.slotProps,
      }}
    />
  )
}
