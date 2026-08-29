"use client";

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateDeviceFingerprint(): Promise<string> {
  const components: string[] = [];

  components.push(navigator.userAgent);
  components.push(navigator.language);
  components.push(screen.colorDepth.toString());
  components.push(`${screen.width}x${screen.height}`);
  components.push(`${screen.availWidth}x${screen.availHeight}`);
  components.push(new Date().getTimezoneOffset().toString());
  components.push(navigator.hardwareConcurrency?.toString() ?? "0");
  components.push(navigator.maxTouchPoints?.toString() ?? "0");

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("Dokumenku AI", 2, 15);
      components.push(canvas.toDataURL());
    }
  } catch {
    components.push("canvas-blocked");
  }

  try {
    const webgl = document.createElement("canvas").getContext("webgl");
    if (webgl) {
      const debugInfo = webgl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        components.push(webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        components.push(webgl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
      }
    }
  } catch {
    components.push("webgl-blocked");
  }

  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    components.push(audioCtx.sampleRate.toString());
    audioCtx.close();
  } catch {
    components.push("audio-blocked");
  }

  const fingerprint = components.join("|||");
  return hashString(fingerprint);
}
