export interface EscapeLayer {
  dismiss: () => void;
  priority: number;
}

/** One dispatcher prevents independent listeners from closing parent layers. */
export function createEscapeStack() {
  const layers: EscapeLayer[] = [];
  return {
    register(layer: EscapeLayer) {
      layers.push(layer);
      return () => { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); };
    },
    dispatch(event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "isComposing" | "repeat" | "preventDefault" | "stopImmediatePropagation">) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      let top: EscapeLayer | undefined;
      for (const layer of layers) if (!top || layer.priority >= top.priority) top = layer;
      if (!top) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) top.dismiss();
    },
  };
}

const escapeStack = createEscapeStack();
let registrations = 0;
const onKey = (event: KeyboardEvent) => escapeStack.dispatch(event);
export function registerEscapeLayer(layer: EscapeLayer) {
  if (registrations++ === 0) window.addEventListener("keydown", onKey);
  const unregister = escapeStack.register(layer);
  return () => {
    unregister();
    if (--registrations === 0) window.removeEventListener("keydown", onKey);
  };
}
