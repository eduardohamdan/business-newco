"use client";
import { useState } from "react";

interface Q {
  code: string;
  dimension: string;
  text: string;
  help?: string;
  options: { value: string; label: string }[];
  show_if?: { question: string; in: string[] };
}

/** Questionário com perguntas condicionais (show_if) avaliadas no navegador; o servidor revalida. */
export function Questionnaire({ questions, dimensions, initial }: { questions: Q[]; dimensions: { code: string; name: string }[]; initial: Record<string, string> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const visible = (q: Q) => !q.show_if || q.show_if.in.includes(answers[q.show_if.question] ?? "");
  return (
    <div className="space-y-6">
      {dimensions.map((d) => (
        <fieldset key={d.code} className="rounded-2xl border border-pauta bg-white p-5">
          <legend className="px-1 text-sm font-semibold text-tinta">{d.name}</legend>
          <div className="space-y-5">
            {questions.filter((q) => q.dimension === d.code && visible(q)).map((q) => (
              <div key={q.code}>
                <p className="text-sm font-medium text-grafite">{q.text}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${answers[q.code] === o.value ? "border-tinta bg-tinta-clara" : "border-pauta"}`}>
                      <input type="radio" name={`q_${q.code}`} value={o.value} checked={answers[q.code] === o.value} onChange={() => setAnswers({ ...answers, [q.code]: o.value })} required={!q.show_if} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
