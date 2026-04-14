import { Tooltip as ShadTooltip, TooltipContent } from "@/components/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

export default function Tooltip({ text, children, style, side, sideOffset, delay }) {
  if (!text) return children;

  return (
    <ShadTooltip delay={delay}>
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        render={<span className="inline-flex" style={style} />}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipContent side={side} sideOffset={sideOffset}>{text}</TooltipContent>
    </ShadTooltip>
  );
}
