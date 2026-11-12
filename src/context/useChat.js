// src/context/useChat.js
import { useContext } from 'react';
import { ChatContext } from './chatInstance';

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat debe ser utilizado dentro de un ChatProvider');
  }
  return context;
}
