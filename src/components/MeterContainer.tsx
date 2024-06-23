import { Grid } from "@mui/material";
import { MeterContainerProps } from "./MeterContainerProps";

export default function MeterContainer(props: MeterContainerProps) {

  const { children, innerRef } = props;

  return (
    <Grid
      container
      display="grid"
      gridTemplateColumns={"max-content 1fr 2em"}
      gridTemplateRows={"repeat(2, auto)"}
      gap={1}
      alignItems="center"
      ref={innerRef}
    >
      {children}
    </Grid>
  )
}
