import { useEffect, useState } from "react";

function makePref(key: string, def: string) {
  const read = () => localStorage.getItem(key) ?? def;
  const set = (v: string) => { localStorage.setItem(key, v); window.dispatchEvent(new Event(key)); };
  const use = () => {
    const [v, setV] = useState(read);
    useEffect(() => { const h = () => setV(read()); window.addEventListener(key, h); return () => window.removeEventListener(key, h); }, []);
    return v;
  };
  return { read, set, use };
}

export const rightPanelPref = makePref("routenet_right_panel_v2", "open");
export const cardStylePref = makePref("routenet_card_style", "spotify");

export function applyCardStyle(v = cardStylePref.read()) {
  document.documentElement.dataset.cards = v;
}
