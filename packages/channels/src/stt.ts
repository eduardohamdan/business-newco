/** Transcrição de áudio (o dono responde o ritual por áudio). */
export interface SpeechToText {
  name: string;
  transcribe(bytes: Uint8Array, mime: string): Promise<string>;
}

export function mockStt(fixed = "fiz sim, deu tudo certo"): SpeechToText {
  return { name: "mock", transcribe: async () => fixed };
}

/** API compatível com OpenAI /v1/audio/transcriptions. */
export function openaiStt(apiKey: string, model = "whisper-1"): SpeechToText {
  return {
    name: "openai",
    async transcribe(bytes, mime) {
      const form = new FormData();
      const ext = mime.includes("ogg") ? "ogg" : mime.includes("mpeg") ? "mp3" : "m4a";
      form.append("file", new Blob([bytes as BlobPart], { type: mime }), `audio.${ext}`);
      form.append("model", model);
      form.append("language", "pt");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`STT ${res.status}: ${j?.error?.message ?? "erro"}`);
      return String(j.text ?? "");
    },
  };
}

export function sttFromEnv(env: NodeJS.ProcessEnv = process.env): SpeechToText {
  if (env.STT_PROVIDER === "openai" && env.OPENAI_API_KEY) return openaiStt(env.OPENAI_API_KEY, env.STT_MODEL);
  return mockStt();
}
