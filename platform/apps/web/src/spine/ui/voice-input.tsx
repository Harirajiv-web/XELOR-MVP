"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

interface Recognition { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void }
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

/** Dictation only fills an editable field. The caller still confirms and submits the text. */
export function VoiceInput({ onText }: { onText: (text: string) => void }): React.JSX.Element | null {
  const [supported, setSupported] = useState(false); const [listening, setListening] = useState(false); const [error, setError] = useState(false); const recognition = useRef<Recognition | null>(null);
  useEffect(() => { const browser = window as VoiceWindow; setSupported(Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition)); return () => recognition.current?.abort(); }, []);
  if (!supported) return null;
  function toggle(): void {
    if (listening) { recognition.current?.stop(); return; }
    const browser = window as VoiceWindow; const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition; if (!Constructor) return;
    const instance = new Constructor(); recognition.current = instance; instance.lang = "en-IN"; instance.interimResults = false; instance.continuous = false;
    instance.onresult = (event) => { const words = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim(); if (words) onText(words); };
    instance.onerror = () => { setError(true); setListening(false); }; instance.onend = () => setListening(false);
    setError(false); try { instance.start(); setListening(true); } catch { setError(true); }
  }
  return <span className="inline-flex items-center gap-2"><button type="button" className="btn btn-secondary btn-sm" onClick={toggle} aria-pressed={listening}>{listening ? <Square className="h-3.5 w-3.5" aria-hidden /> : <Mic className="h-3.5 w-3.5" aria-hidden />}{listening ? "Stop listening" : "Dictate"}</button>{error ? <span role="status" className="text-[10px] text-[var(--text-muted)]">Dictation unavailable. Type your question.</span> : null}</span>;
}
