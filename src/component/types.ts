import type { IconButtonProps } from "@mui/material";
import type { ReactNode } from "react";


export type MaskedIconProps = {
  masked?: boolean;
  maskComponent?: ReactNode;
} & IconButtonProps;
