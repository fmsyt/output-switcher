import { Slider as MuiSlider, type SliderProps } from "@mui/material";
import { forwardRef, useEffect, useRef } from "react";
import useDragging from "../effect/dragging/useDragging";

const Slider = forwardRef<HTMLSpanElement, SliderProps>(function Slider(props, forwardedRef) {

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
      ref={forwardedRef}
      slotProps={{
        root: {
          ...props.slotProps?.root,
          ref: ref,
        },

        ...props.slotProps,
      }}
    />
  )
});

export default Slider;
