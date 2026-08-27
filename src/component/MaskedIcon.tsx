import { Box, IconButton } from "@mui/material";
import { useContext, useEffect, useRef } from "react";
import DraggingContext from "../effect/dragging/DraggingContext";
import type { MaskedIconProps } from "./types";

export default function MaskedIcon(props: MaskedIconProps) {

  const { addIgnoreDragTarget, removeIgnoreDragTarget } = useContext(DraggingContext)

  const {
    masked = false,
    maskComponent,
    children,
    ...restProps
  } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    const element = wrapperRef.current;
    if (!element) {
      return;
    }

    addIgnoreDragTarget(element);
    return () => {
      removeIgnoreDragTarget(element);
    }

  }, [addIgnoreDragTarget, removeIgnoreDragTarget])

  return (
    <div ref={wrapperRef}>
      <IconButton
        {...restProps}
      >
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            alignItems: "center",
            justifyItems: "center",
            fontSize: 1,  // 文字サイズ分高さができるのを防ぐ

            "> *": {
              gridArea: "1 / 1",
            }
          }}
        >
          <Box
            sx={{
              zIndex: 0,
              filter: masked ? "brightness(0.75)" : "none",
            }}
          >
            {children}
          </Box>
          {masked && (
            <Box
              sx={{
                zIndex: 1,
              }}
            >
              {maskComponent}
            </Box>
          )}
        </Box>
      </IconButton>
    </div>
  )
}
