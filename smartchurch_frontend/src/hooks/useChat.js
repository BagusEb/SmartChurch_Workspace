import { useEffect, useRef, useState } from 'react';
import { getChatThread, streamChatResponse } from '../service/apiClient';

const THREAD_ID_STORAGE_KEY = 'smartchurch_ai_thread_id';

const mapBackendMessages = (rawMessages) => {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .filter((msg) => msg && msg.data)
    .filter((msg) => msg.type === 'human' || msg.type === 'ai')
    .map((msg) => ({
      type: msg.type,
      data: msg.data,
      id: msg.id,
      streaming: false,

    }));
};

const createAiMessage = ({ content = '', streamId = null, streaming = true } = {}) => ({
  type: 'ai',
  data: { content },
  streamId,
  streaming,
});

const finalizeStreamingMessages = (messages) => messages.map((msg) => (
  msg.type === 'ai' && msg.streaming
    ? { ...msg, streaming: false }
    : msg
));

const parseSseBlock = (rawBlock) => {
  const lines = rawBlock.split('\n');
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (!dataLines.length) return null;

  const payload = JSON.parse(dataLines.join('\n'));
  const eventType = eventLine ? eventLine.slice(6).trim() : (payload?.type || 'message');
  return { payload, eventType };
};

const consumeSseBuffer = (incomingBuffer, onEvent, flush = false) => {
  let buffer = flush ? `${incomingBuffer}\n\n` : incomingBuffer;
  let boundary = buffer.indexOf('\n\n');

  while (boundary !== -1) {
    const rawBlock = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 2);
    boundary = buffer.indexOf('\n\n');

    if (!rawBlock) continue;

    try {
      const parsed = parseSseBlock(rawBlock);
      if (parsed) onEvent(parsed.payload, parsed.eventType);
    } catch (err) {
      console.error('Bad SSE payload', err);
    }
  }

  return flush ? '' : buffer;
};

export default function useChat(initialThreadId = null) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const hasLoadedHistoryRef = useRef(false);
  const finalMessagesRef = useRef(null);

  useEffect(() => {
    setThreadId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!threadId) {
      sessionStorage.removeItem(THREAD_ID_STORAGE_KEY);
      setMessages([]);
      hasLoadedHistoryRef.current = false;
      finalMessagesRef.current = null;
      return;
    }

    sessionStorage.setItem(THREAD_ID_STORAGE_KEY, threadId);
  }, [threadId]);

  useEffect(() => {
    if (!threadId || hasLoadedHistoryRef.current || messages.length > 0) return;
    hasLoadedHistoryRef.current = true;

    getChatThread(threadId)
      .then((payload) => setMessages(mapBackendMessages(payload.messages)))
      .catch((err) => {
        console.error(err);
        setMessages([]);
      });
  }, [threadId, messages.length]);

  const updateAiMessageByStreamId = (streamId, updater) => {
    setMessages((prev) => {
      const copy = [...prev];
      let targetIndex = -1;

      // 1. Try to find the exact message by its stream ID or backend ID
      if (streamId) {
        targetIndex = copy.findIndex(
          (msg) => msg.type === 'ai' && (msg.streamId === streamId || msg.id === streamId)
        );
      }

      // 2. If not found by ID, check if the VERY LAST message is an active AI stream.
      // We only look at the last message to prevent skipping over new human messages.
      if (targetIndex === -1) {
        const lastMessage = copy[copy.length - 1];
        if (lastMessage?.type === 'ai' && lastMessage.streaming) {
          targetIndex = copy.length - 1;
        }
      }

      // 3. If no active AI message exists to append to, create a new one
      if (targetIndex === -1) {
        const newMsg = updater(createAiMessage({ streamId })) || createAiMessage({ streamId });
        return [...copy, newMsg];
      }

      // 4. Update the existing/found AI message
      const current = copy[targetIndex];
      const newMsg = updater(current) || current;
      copy[targetIndex] = {
        ...current,
        ...newMsg,
        streamId: current.streamId ?? streamId ?? null,
      };
      
      return copy;
    });
  };

  const addMessage = async (userMessage) => {
    const trimmedMessage = (userMessage ?? '').trim();
    if (!trimmedMessage) return;

    setMessages((prev) => [...prev, { type: 'human', data: { content: trimmedMessage } }]);
    setIsStreaming(true);

    let buffer = '';

    const handleEvent = (payload, eventType) => {
      switch (eventType) {
        case 'metadata':
          if (payload?.thread_id) setThreadId(payload.thread_id);
          break;

        case 'messages':
          try {
            const newMessages = mapBackendMessages(payload.messages || []);
            const firstNewMessageId =
              newMessages.length > 0 ? newMessages[0].id : null;

            const currentMessages = finalMessagesRef.current || [];

            const oldMessagePosition = currentMessages.findIndex(
              (msg) => msg.id === firstNewMessageId
            );

            if (oldMessagePosition === -1) {
              finalMessagesRef.current = [
                ...currentMessages,
                ...newMessages,
              ];
              break;
            }

            finalMessagesRef.current = [
              ...currentMessages.slice(0, oldMessagePosition),
              ...newMessages,
            ];
          } catch (err) {
            console.error('Failed to sync messages event:', err);
          }
          break;

        case 'message_chunk': {
          const chunk = payload?.content ?? payload?.text ?? '';
          if (!chunk) break;

          updateAiMessageByStreamId(payload?.id, (prev) => {
            const prevContent = prev?.data?.content || '';
            return {
              ...prev,
              data: { ...(prev?.data || {}), content: prevContent + chunk },
              streamId: prev?.streamId ?? payload?.id ?? null,
              streaming: true,
            };
          });
          break;
        }

        case 'end':
          setMessages((prev) => finalizeStreamingMessages(prev));
          setIsStreaming(false);
          break;

        case 'error':
          setMessages((prev) => [...prev, {
            type: 'ai',
            data: { content: `Maaf, terjadi kesalahan: ${payload?.message || 'Unknown error'}` },
            streaming: false,
          }]);
          setIsStreaming(false);
          break;

        default:
          break;
      }
    };

    try {
      const response = await streamChatResponse({ threadId, message: trimmedMessage });

      if (!response.data) {
        throw new Error('SSE request failed: empty stream response');
      }

      const reader = response.data.pipeThrough(new TextDecoderStream()).getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += value;
        buffer = consumeSseBuffer(buffer, handleEvent);
      }

      consumeSseBuffer(buffer, handleEvent, true);

      if (finalMessagesRef.current) {
        setMessages(finalMessagesRef.current);
        finalMessagesRef.current = null;
      }

      setIsStreaming(false);
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const copy = [...prev];

        for (let index = copy.length - 1; index >= 0; index -= 1) {
          if (copy[index].type === 'ai') {
            copy[index] = {
              ...copy[index],
              data: {
                ...(copy[index].data || {}),
                content: 'Maaf, terjadi kesalahan saat memproses pesan.',
              },
              streaming: false,
            };
            return copy;
          }
        }

        return [...copy, {
          type: 'ai',
          data: { content: 'Maaf, terjadi kesalahan saat memproses pesan.' },
          streaming: false,
        }];
      });
      setIsStreaming(false);
    }
  };

  const resetChat = () => {
    setThreadId(null);
    setMessages([]);
    hasLoadedHistoryRef.current = false;
    finalMessagesRef.current = null;
  };

  return {
    threadId,
    setThreadId,
    messages,
    addMessage,
    resetChat,
    isStreaming,
  };
}