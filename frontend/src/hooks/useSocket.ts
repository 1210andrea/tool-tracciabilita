import { useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

export type SocketPayload = unknown;
export type SocketEventHandler = (event: string, payload: SocketPayload) => void;

export function useSocket(onEvent: SocketEventHandler) {
  const socket = useMemo<Socket>(() => {
    return io('/socket.io', {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      auth: {
        token: localStorage.getItem('token') || undefined
      }
    });
  }, []);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.debug('Socket connected', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.debug('Socket disconnected', reason);
    });

    socket.on('case-updated', (payload) => {
      onEvent('case-updated', payload);
    });

    return () => {
      socket.off('case-updated');
      socket.disconnect();
    };
  }, [socket, onEvent]);
}
