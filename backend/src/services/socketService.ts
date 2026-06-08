import type { Server } from 'socket.io';

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function emitEvent(event: string, payload: unknown) {
  if (!io) return;
  io.emit(event, payload);
}
