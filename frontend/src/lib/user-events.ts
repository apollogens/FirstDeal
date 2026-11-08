import { connectUserSocket, type ChatSocketEvent } from "@/lib/chats";

const listeners = new Set<(event: ChatSocketEvent) => void>();
let socket: WebSocket | undefined;
let connecting: Promise<void> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function connect() {
  if (socket || connecting || listeners.size === 0) return;
  connecting = connectUserSocket((event) => {
    for (const listener of listeners) listener(event);
  }).then((connected) => {
    if (listeners.size === 0) {
      connected.close();
      return;
    }
    socket = connected;
    connected.addEventListener("close", () => {
      if (socket === connected) socket = undefined;
      if (listeners.size > 0) retryTimer = setTimeout(connect, 3000);
    });
  }).catch(() => {
    if (listeners.size > 0) retryTimer = setTimeout(connect, 3000);
  }).finally(() => {
    connecting = undefined;
  });
}

export function subscribeUserEvents(listener: (event: ChatSocketEvent) => void): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      socket?.close();
      socket = undefined;
    }
  };
}
