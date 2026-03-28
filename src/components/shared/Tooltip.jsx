import { Tooltip as ShadTooltip, TooltipContent } from "@/components/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

export default function Tooltip({ text, children, style }) {
  if (!text) return children;

  return (
    <ShadTooltip>
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        render={<span className="inline-flex" style={style} />}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipContent>{text}</TooltipContent>
    </ShadTooltip>
  );
}
