import React from 'react';
import { Sparkles } from 'lucide-react';
import { useAiAssistant } from '../context/AiAssistantContext';

export function AiAskButton({
  mode = 'search',
  prompt = '',
  pageContext = {},
  autoSend = true,
  resetConversation = false,
  className = '',
  title,
  onAfterOpen,
  children = 'Ask AI',
}) {
  const ai = useAiAssistant();

  if (!ai?.available || !ai.canUseMode(mode)) return null;

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        ai.openAssistant({
          mode,
          prompt,
          pageContext,
          autoSend,
          resetConversation,
        });
        onAfterOpen?.();
      }}
      className={className}
    >
      <Sparkles size={14} strokeWidth={2} />
      {children}
    </button>
  );
}
