import { createServerFn } from "@tanstack/react-start";

export const startSarahCall = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const token = typeof input === "object" && input && "token" in input ? String((input as { token?: unknown }).token || "") : "";
    if (token.length < 16) throw new Error("Sign in first. I can only work on the account that is signed in.");
    return { token: token.slice(0, 80) };
  })
  .handler(async ({ data }) => {
    const { mintSarahCall } = await import("./livekit-call.server");
    return mintSarahCall(data.token);
  });
