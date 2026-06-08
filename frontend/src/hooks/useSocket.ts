import { useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

export type SocketPayload = unknown;
export type SocketEvent = 'case_created' | 'case-updated' | 'categories_updated' | 'machine_updated';
export type SocketEventHandler = (event: SocketEvent, payload: SocketPayload) => void;

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

    socket.on('case_created', (payload) => onEvent('case_created', payload));
    socket.on('case-updated', (payload) => onEvent('case-updated', payload));
    socket.on('categories_updated', (payload) => onEvent('categories_updated', payload));
    socket.on('machine_updated', (payload) => onEvent('machine_updated', payload));

    return () => {
      socket.off('case_created');
      socket.off('case-updated');
      socket.off('categories_updated');
      socket.off('machine_updated');
      socket.disconnect();
    };
  }, [socket, onEvent]);
}
