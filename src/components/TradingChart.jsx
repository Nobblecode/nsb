"use client";
import { useEffect, useRef } from "react";

export default function TradingChart({ interval }) {
  const container = useRef(null);
  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const frame = document.createElement("iframe");
    const tvInterval = interval === "4h" ? "240" : "60";
    frame.title = `TradingView EUR/USD ${interval} chart`;
    frame.src = `https://www.tradingview.com/widgetembed/?frameElementId=tradingview_nsb&symbol=FX%3AEURUSD&interval=${tvInterval}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=%230d1728&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&studies=%5B%5D&locale=en`;
    frame.style.width = "100%"; frame.style.height = "100%"; frame.style.border = "0"; frame.allow = "clipboard-write";
    container.current.appendChild(frame);
    return () => { if (container.current) container.current.innerHTML = ""; };
  }, [interval]);
  return <div ref={container} className="h-[390px] w-full overflow-hidden rounded-xl bg-[#0b1423]" />;
}
