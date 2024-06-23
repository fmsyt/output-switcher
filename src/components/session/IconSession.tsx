import TerminalIcon from '@mui/icons-material/Terminal';
import { IconButton } from "@mui/material";
import { useContext, useEffect, useRef } from "react";
import AppContext from '../../AppContext';

export default function IconSession() {

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const appContext = useContext(AppContext);
  useEffect(() => {
    const { addIgnoreDragTarget, removeIgnoreDragTarget } = appContext;

    buttonRef.current && addIgnoreDragTarget(buttonRef.current);

    return () => {
      buttonRef.current && removeIgnoreDragTarget(buttonRef.current);
    }

  }, [appContext])

  return (
    <IconButton
      size="small"
      ref={buttonRef}
    >
      <TerminalIcon />
    </IconButton>
  )
}
