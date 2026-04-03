import useMediaQuery from "./useMediaQuery.js";

export default function useIsMobile() {
  return useMediaQuery("(max-width: 639px)");
}
