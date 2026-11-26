import { PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mintLiveToken, runLiveTool } from "@/lib/portal/mts-agent";

const CALL_PROMPT = `You are the phone agent for Manage Tech Service. The person on the line is already signed in. You act on that account.

Speak like a real support agent on a phone call. Short, calm, and clear. No sighs, no laughter, and no stage directions. One or two sentences, then wait.

Do not invent ticket numbers, order numbers, prices, or stock. Call a function first, then say only what it returned.

You can open and check their tickets, reply on their tickets, look up their orders, search the catalog, and place a product order. Staff can also update the desk. If a function says it is not allowed, say the limit and do the next thing this account can do.

The customer-facing name is Manage Tech Service. Never say Northline.`;

const CALL_TOOLS = [
  { googleSearch: {} },
  {
    functionDeclarations: [
      { name: "search_web", description: "Search the public internet. Returns titles, links, and snippets.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "browse_page", description: "Open one public http or https page and read its text.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
      { name: "my_tickets", description: "List tickets this signed-in account can open.", parameters: { type: "object", properties: { query: { type: "string" }, mine: { type: "boolean" } } } },
      { name: "my_ticket", description: "Read one ticket, including updates.", parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
      { name: "create_ticket", description: "Open a support ticket for this account.", parameters: { type: "object", properties: { subject: { type: "string" }, detail: { type: "string" }, priority: { type: "string" } }, required: ["subject"] } },
      { name: "reply_ticket", description: "Post a public reply on one of this account's tickets.", parameters: { type: "object", properties: { id: { type: "number" }, body: { type: "string" } }, required: ["id", "body"] } },
      { name: "update_ticket", description: "Change status, priority, or assignee on a ticket this account can update.", parameters: { type: "object", properties: { id: { type: "number" }, status: { type: "string" }, priority: { type: "string" }, assignee: { type: "string" } }, required: ["id"] } },
      { name: "search_orders", description: "Find orders this account can open.", parameters: { type: "object", properties: { query: { type: "string" } } } },
      { name: "search_catalog", description: "Find catalog products by name or SKU.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "order_product", description: "Place a catalog product on an order for this account.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "my_desk", description: "Read the signed-in staff profile and assigned work. Staff only.", parameters: { type: "object", properties: {} } },
      { name: "desk_counts", description: "Read live desk totals. Staff only.", parameters: { type: "object", properties: {} } },
    ],
  },
];

/** Only declare the tools the server says this caller may run (the server re-checks every call). */
function callTools(allowed: string[]) {
  const names = new Set(allowed);
  const declared = (CALL_TOOLS[1] as { functionDeclarations: { name: string }[] }).functionDeclarations.filter((tool) => names.has(tool.name));
  const tools: Record<string, unknown>[] = [];
  if (names.has("search_web")) tools.push({ googleSearch: {} });
  if (declared.length) tools.push({ functionDeclarations: declared });
  return tools;
}

type LivePart = { inlineData?: { mimeType?: string; data?: string }; text?: string };
type LiveMessage = {
  setupComplete?: unknown;
  serverContent?: { modelTurn?: { parts?: LivePart[] }; interrupted?: boolean; turnComplete?: boolean };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
};

function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let sample = start; sample < end; sample += 1) {
      sum += input[sample] || 0;
      count += 1;
    }
    out[index] = count ? sum / count : 0;
  }
  return out;
}

function pcmBase64(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] || 0));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function sampleRateOf(mime: string) {
  const rate = /rate=(\d+)/.exec(mime || "")?.[1];
  return rate ? Number(rate) : 24000;
}

export function openZendeskVoice() {
  window.dispatchEvent(new Event("mts-voice-start"));
}

export function ZendeskVoiceCall() {
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 16 }, () => 0.12));
  const stopRef = useRef<(() => void) | null>(null);
  const openingRef = useRef(false);

  useEffect(() => {
    const onStart = () => {
      void start();
    };
    window.addEventListener("mts-voice-start", onStart);
    return () => window.removeEventListener("mts-voice-start", onStart);
  }, []);

  async function start() {
    if (stopRef.current || openingRef.current) return;
    openingRef.current = true;
    const context = new AudioContext();
    void context.resume();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      void context.close();
      openingRef.current = false;
      return;
    }

    let session: { token: string; model: string; voice: string; tools: string[] };
    try {
      session = await mintLiveToken();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      openingRef.current = false;
      return;
    }

    if (context.state === "suspended") await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    const playback = context.createGain();
    playback.connect(analyser);
    analyser.connect(context.destination);

    const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(session.token)}`);
    let alive = true;
    let ready = false;
    let nextAt = 0;
    const playing = new Set<AudioBufferSourceNode>();
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const paint = () => {
      if (!alive) return;
      frame = requestAnimationFrame(paint);
      analyser.getByteFrequencyData(bins);
      const next = Array.from({ length: 16 }, (_, index) => {
        const startAt = Math.floor((index / 16) * bins.length);
        const endAt = Math.max(startAt + 1, Math.floor(((index + 1) / 16) * bins.length));
        let sum = 0;
        for (let bin = startAt; bin < endAt; bin += 1) sum += bins[bin] || 0;
        return sum / (endAt - startAt) / 255;
      });
      const quiet = next.every((level) => level < 0.04);
      setLevels(quiet ? next.map((_, index) => 0.16 + Math.abs(Math.sin(Date.now() / 320 + index * 0.55)) * 0.22) : next);
    };
    frame = requestAnimationFrame(paint);

    const stopPlayback = () => {
      nextAt = context.currentTime;
      playing.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already ended */
        }
      });
      playing.clear();
    };

    const playPcm = (data: string, mime: string) => {
      const binary = atob(data);
      if (binary.length < 2) return;
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer);
      const count = Math.floor(bytes.length / 2);
      const buffer = context.createBuffer(1, count, sampleRateOf(mime));
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < count; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(playback);
      playing.add(source);
      source.onended = () => playing.delete(source);
      const startAt = Math.max(context.currentTime + 0.02, nextAt);
      source.start(startAt);
      nextAt = startAt + buffer.duration;
    };

    const send = (payload: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };

    const onMessage = async (event: MessageEvent) => {
      if (!alive) return;
      const text = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      let message: LiveMessage;
      try {
        message = JSON.parse(text) as LiveMessage;
      } catch {
        return;
      }
      if (message.setupComplete && !ready) {
        ready = true;
        send({
          clientContent: {
            turns: [{ role: "user", parts: [{ text: "The customer just connected. Greet them in one short sentence and ask how you can help." }] }],
            turnComplete: true,
          },
        });
      }
      if (message.serverContent?.interrupted) stopPlayback();
      for (const part of message.serverContent?.modelTurn?.parts || []) {
        if (part.inlineData?.data) playPcm(part.inlineData.data, part.inlineData.mimeType || "audio/pcm;rate=24000");
      }
      const calls = message.toolCall?.functionCalls || [];
      if (calls.length) {
        const functionResponses = [];
        for (const call of calls) {
          if (!call.name) continue;
          let result = "That tool could not run.";
          try {
            const ran = await runLiveTool({ data: { name: call.name, args: call.args || {} } });
            result = ran.result || result;
          } catch (cause) {
            result = cause instanceof Error ? cause.message : result;
          }
          functionResponses.push({ id: call.id, name: call.name, response: { result } });
        }
        if (functionResponses.length) send({ toolResponse: { functionResponses } });
      }
    };

    const input = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    input.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    processor.onaudioprocess = (event) => {
      if (!alive || !ready || socket.readyState !== WebSocket.OPEN) return;
      const channel = event.inputBuffer.getChannelData(0);
      const audio = pcmBase64(downsample(channel, context.sampleRate, 16000));
      if (!audio) return;
      send({ realtimeInput: { audio: { data: audio, mimeType: "audio/pcm;rate=16000" } } });
    };

    const hangup = () => {
      if (!alive && !openingRef.current) return;
      alive = false;
      cancelAnimationFrame(frame);
      stopPlayback();
      processor.onaudioprocess = null;
      processor.disconnect();
      input.disconnect();
      mute.disconnect();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      stopRef.current = null;
      openingRef.current = false;
      setLive(false);
    };

    socket.onmessage = (event) => {
      void onMessage(event);
    };
    socket.onerror = () => hangup();
    socket.onclose = () => {
      if (alive) hangup();
    };
    socket.onopen = () => {
      send({
        setup: {
          model: session.model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: session.voice } } },
          },
          systemInstruction: { parts: [{ text: CALL_PROMPT }] },
          contextWindowCompression: { triggerTokens: 104857, slidingWindow: { targetTokens: 52428 } },
          tools: callTools(session.tools),
        },
      });
    };

    stopRef.current = hangup;
    setLive(true);
    openingRef.current = false;
  }

  function hangup() {
    stopRef.current?.();
  }

  if (!live) return null;
  return (
    <div
      className="fixed bottom-24 left-4 z-50 flex items-center gap-3 rounded-full bg-ink px-4 py-3 text-white shadow-[0_16px_40px_rgba(0,57,112,0.28)] md:bottom-8"
      role="status"
      aria-label="MTS Agent call"
    >
      <span className="flex h-8 w-40 items-center gap-1" aria-hidden="true">
        {levels.map((level, index) => (
          <span
            key={index}
            className="block w-full flex-1 rounded-full bg-accent"
            style={{ height: `${Math.max(4, Math.round(level * 32))}px` }}
          />
        ))}
      </span>
      <button type="button" className="grid size-9 place-items-center rounded-full bg-[#8e1f0b]" aria-label="End call" onClick={hangup}>
        <PhoneOff className="size-4" />
      </button>
    </div>
  );
}
