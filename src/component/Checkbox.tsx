import { Checkbox as MuiCheckbox, type CheckboxProps } from "@mui/material";
import { useEffect, useRef } from "react";
import useDragging from "../effect/dragging/useDragging";

export default function Checkbox(props: CheckboxProps) {

  const context = useDragging();
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const { addIgnoreDragTarget } = context;

    const cleanup = addIgnoreDragTarget(ref.current);
    return cleanup;

  }, [context])
  return (
    <MuiCheckbox
      ref={ref}
      {...props}
    />
  )
}
