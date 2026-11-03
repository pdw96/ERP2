import { z } from "zod";
import { eul, eun } from "./josa";

// 기준정보 입력 검사(품목 · 창고 · 거래처)가 같이 쓰는 칸의 꼴. 서버에서만 쓴다 — 검사 도구(zod)를 브라우저로 보내지 않는다.

// DB 의 char_length 와 같게 글자(코드 포인트)로 센다.
const length = (s: string) => Array.from(s).length;

/** 글 칸 — 앞뒤 빈칸을 지우고 min ~ max 글자. 칸이 아예 오지 않으면 빈 칸과 같은 말로 거절한다. */
export const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${eul(label)} 넣으세요` })
    .trim()
    .check((ctx) => {
      if (length(ctx.value) < min)
        ctx.issues.push({ code: "custom", input: ctx.value, message: `${eul(label)} 넣으세요` });
      else if (length(ctx.value) > max)
        ctx.issues.push({ code: "custom", input: ctx.value, message: `${eun(label)} ${max}자까지입니다` });
    });

/** 켬 · 끔 — 체크 상자는 켜면 "on" 을 보내고 끄면 아무것도 보내지 않는다(부르는 쪽이 "off" 로 채운다). */
export const toggle = z.enum(["on", "off"], { error: "켬 · 끔 가운데 하나여야 합니다" }).transform((v) => v === "on");

/** 사용 여부 — 수정 화면에만 있다. */
export const activeFlag = z.enum(["Y", "N"], { error: "사용 여부를 고르세요" }).transform((v) => v === "Y");

/** 칸마다 첫 거절 까닭 하나. 칸 이름은 issue 의 path 첫 마디다. */
export function firstErrors<K extends string>(error: z.ZodError): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as K;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** 화면이 보낸 칸을 글자 그대로 모은다 — 아는 칸만, 글자가 아닌 값(파일 등)은 버린다. */
export function formValues<K extends string>(form: FormData, fields: readonly K[]): Partial<Record<K, string>> {
  const values: Partial<Record<K, string>> = {};
  for (const field of fields) {
    const v = form.get(field);
    if (typeof v === "string") values[field] = v;
  }
  return values;
}
