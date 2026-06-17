import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Role = 'user' | 'assistant';
type Message = { role: Role; content: string; hostName?: string };

const SUGGESTIONS = [
  'ソープお店用の写メ日記って何を書いたら良いの？',
  '指名が全然取れない…',
  '苦手なお客さんは何人まで出禁にして大丈夫？',
  '指名時間の延長を取るコツ',
  '指名客を増やしたい',
  'お客さんとの会話が続かない',
  '最近仕事がしんどくて…',
  'お客さんからの理不尽なクレーム対応どうしたらいい？',
  '今の店を辞めて別のお店でやるか迷ってる',
  '生理中はどうしたらいい？',
  'プレイ中に無理な事を頼まれたらどうしたらいいの？',
  '常連さんが最近来なくなった…',
  'プライベートな事を聞かれたらどうしたらいい？',
  'ソープお店用の写メ日記が続かない',
  '長時間コースで気まずくならないコツ',
  '体調崩しがちでシフトつらい',
  '同じソープ店で私と売上1位のキャストとの差や違いがわからない',
  '酔ってるお客さんの対応が大変',
  'お客から悪口を言われたらどうしたらいいの？',
  'お客が0人で待期中の時の不安はどうしたらいい？',
  '仕事とプライベートの切り替えが難しい',
  '気分転換できる趣味でおすすめを教えて',
  'ソープ店のキモ客に共通する特徴を教えて',
  'ソープ店の他の子は体型や体調の管理ってみんなどうしてるの？',
  'お客が自然にコスプレや延長のオプションを選んで単価を上げたい',
  'フリー(無予約新規)のお客さんってどう接すれば良いの？',
  'キモ客の出禁ってどうやるの？',
  '店を変えるタイミングがわからない',
  '呑みすぎて辛い',
  '最近やる気が出なくてしんどい',
  '同じソープ店の同僚のキャストとは遊びに行った方がいいの？',
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setInput('');
    setIsStreaming(false);
    setError(null);
  };

  const EMPTY_RESPONSE_MSG = '（ごめん、うまく言葉が出てこなかった。少し待ってからもう一回話しかけてくれ。）';

  async function runAssistantTurn(historyUpToUser: Message[]) {
    if (isStreaming) return;

    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyUpToUser }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `サーバーエラー (${res.status})`);
      }

      // Get the in-character host name chosen by the backend.
      // The value is Base64-encoded on the server to avoid UTF-8 mojibake
      // in HTTP headers (common issue with Japanese strings).
      const rawHost = res.headers.get('X-Host-Name');
      let hostName: string | undefined;
      if (rawHost) {
        try {
          const binary = atob(rawHost);
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          hostName = new TextDecoder().decode(bytes);
        } catch {
          hostName = undefined;
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assistantContent = '';

      // Create the assistant message now that we know which host is replying
      const assistantPlaceholder: Message = { role: 'assistant', content: '', hostName };
      setMessages([...historyUpToUser, assistantPlaceholder]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              const delta = data?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                assistantContent += delta;

                // Update the last assistant message live
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = { ...last, content: assistantContent };
                  }
                  return copy;
                });
              }
            } catch {
              // ignore partial / comment lines
            }
          }
        }
      }

      // Final trim - preserve hostName so the signature can still render under the error notice
      if (assistantContent.trim().length === 0) {
        setMessages((prev) => {
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (copy[lastIdx]?.role === 'assistant') {
            copy[lastIdx] = {
              ...copy[lastIdx],
              content: EMPTY_RESPONSE_MSG,
            };
          }
          return copy;
        });
      }
    } catch (e) {
      // Use unknown shape instead of any (project rule: no any)
      const err = e as { name?: string; message?: string };
      if (err?.name === 'AbortError') {
        // user cleared during stream — do nothing special
      } else {
        const msg = err?.message || '通信エラーが発生しました。';
        setError(msg);

        // Remove the empty assistant placeholder on hard error
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMsg];

    // Show the user message immediately for responsiveness
    setMessages(nextMessages);
    setInput('');

    await runAssistantTurn(nextMessages);
  }

  const regenerateAnswer = () => {
    if (isStreaming) return;

    // Walk backwards to find the most recent user question.
    // Then reset the visible messages to *only* that single question
    // and re-run the assistant turn. This keeps every generation as a
    // clean 1問1答 (avoids history accumulation that the user said hurts accuracy).
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const lastUser: Message = messages[i];
        const singleTurnHistory: Message[] = [lastUser];

        setMessages(singleTurnHistory);
        setError(null);

        runAssistantTurn(singleTurnHistory);
        return;
      }
    }
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const useSuggestion = (text: string) => {
    sendMessage(text);
  };

  // As soon as the user commits a question (via suggestion click or send),
  // we immediately switch the entire bottom form to the "回答を再度生成" button.
  // This is stricter 1問1答: the input disappears the instant the question is asked,
  // not after the answer arrives. The button is disabled while streaming the current answer.
  const hasUserQuestion = messages.some((m) => m.role === 'user');
  const showRegenerate = hasUserQuestion;

  return (
    <div className="chat-container">
      {/* Header - ChatGPT minimal */}
      <div className="chat-header flex items-center justify-between">
        <div className="text-[17px] font-semibold tracking-[-0.2px]">Hostorch</div>
        <button
          onClick={reset}
          className="clear-btn"
          aria-label="新しい相談をする"
        >
          新しい相談
        </button>
      </div>

      {/* Messages */}
      <div className="messages" id="messages">
        {messages.length === 0 && (
          <div className="max-w-[340px] mx-auto pt-8 pb-6 text-center px-2">
            <div className="text-3xl mb-2.5">🕴️</div>
            <div className="text-[21px] font-semibold tracking-tight mb-1.5">ホストーチです。</div>
            <p className="text-[#555] text-[13.5px] leading-relaxed mb-5">
              ソープの仕事で困ってることを、<br />遠慮なく話して。
            </p>

            <div className="suggestions justify-center">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => useSuggestion(s)}
                  className="suggestion"
                  disabled={isStreaming}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages
          // While streaming the first token, the trailing empty assistant placeholder
          // is rendered exclusively via the dedicated loader below (to avoid duplicate
          // "… — ジェミー" + "考え中... — ジェミー").
          .filter((m, idx) => {
            const isLast = idx === messages.length - 1;
            const isEmptyAssistantPlaceholder =
              m.role === 'assistant' && m.content === '' && isStreaming && isLast;
            return !isEmptyAssistantPlaceholder;
          })
          .map((m, idx) => {
            // Content is always present for items that reach this map
            // (the empty assistant placeholder during streaming is filtered out above).
            const content = m.content;
            const isAssistant = m.role === 'assistant';

            return (
              <div key={idx} className={`message ${m.role}`}>
                {isAssistant && content === EMPTY_RESPONSE_MSG ? (
                  <div>{content}</div>
                ) : content ? (
                  isAssistant ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  ) : (
                    content
                  )
                ) : null}

                {/* Subtle in-character host signature (e.g. ジェミー, 久遠, RYOMA).
                    Shown for normal responses and also under the empty-response notice
                    (hostName is preserved in the error replacement). */}
                {isAssistant && m.hostName && (
                  <div className="host-signature">— {m.hostName}</div>
                )}
              </div>
            );
          })}

        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="message assistant">
            <span className="loading">
              あなたの卓についています<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
            </span>
            {messages[messages.length - 1]?.hostName && (
              <div className="host-signature">— {messages[messages.length - 1].hostName}</div>
            )}
          </div>
        )}

      </div>

      {/* Error */}
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* Bottom area: normal input form (only at the very start) or
          the playful "ねぇ、酔いすぎ！ちゃんと答えて！" regenerate button
          (tied to the drunk-host disclaimer) as soon as a question is committed.

          Timing: the switch happens the instant a suggestion is clicked
          or the user submits a message (i.e. the user message is added
          to state). The input form is replaced immediately, before any
          assistant response arrives. The button stays disabled while
          the current answer is streaming. */}
      <div className="composer">
        {/* メッセージ入力欄の上部に表示されていた3件のサジェスト（初期状態のみ）
        {!showRegenerate && messages.length === 0 && (
          <div className="suggestions mb-2.5 px-2">
            {SUGGESTIONS.slice(0, 3).map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => useSuggestion(s)}
                className="suggestion"
                disabled={isStreaming}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        */}

        {showRegenerate ? (
          <div className="regenerate-container">
            <button
              type="button"
              onClick={reset}
              className="new-consult-btn"
            >
              新しい相談
            </button>
            <button
              type="button"
              onClick={regenerateAnswer}
              className="regenerate-btn"
              disabled={isStreaming}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9" />
                <path d="M21 3v6h-6" />
                <path d="M3 12v-1a4 4 0 0 1 4-4" />
              </svg>
              ねぇ、酔いすぎ！ちゃんと答えて！
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="composer-inner">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="あなたのお悩みを入力…"
                className="input"
                disabled={isStreaming}
                rows={1}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="send-btn"
                aria-label="送信"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </form>
        )}

        <div className="disclaimer">
          ホスト達は卓につかなかったり、酔っ払っていることがあります。
        </div>
      </div>
    </div>
  );
}
