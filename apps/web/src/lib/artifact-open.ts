import { selectedSpaceId, withSpaceHeaders } from "./rpc";

export type ArtifactTarget = { botId: string } | { groupId: string };

/**
 * An artifact used to travel as base64 inside the RPC body. The default RPC timeout is sized
 * for small JSON replies and gives up on a multi-megabyte video, which the UI then reports as
 * "Could not reach the server". Downloads use a binary route and this longer budget instead.
 */
export const ARTIFACT_DOWNLOAD_TIMEOUT_MS = 120_000;

export function artifactContentUrl(
  artifactId: string,
  options?: { download?: boolean; spaceId?: string | null },
): string {
  const params = new URLSearchParams();
  const spaceId = options?.spaceId === undefined ? selectedSpaceId() : options.spaceId;
  if (spaceId) params.set("space", spaceId);
  if (options?.download) params.set("download", "1");
  const query = params.toString();
  return `/api/artifacts/${encodeURIComponent(artifactId)}${query ? `?${query}` : ""}`;
}

export function decodeArtifactBase64(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function fetchArtifactBytes(
  _target: ArtifactTarget,
  artifactId: string,
): Promise<Uint8Array> {
  const response = await fetch(artifactContentUrl(artifactId), {
    credentials: "include",
    headers: withSpaceHeaders(),
    signal: AbortSignal.timeout(ARTIFACT_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw Object.assign(new Error(response.statusText || "Could not load this file."), {
      status: response.status,
    });
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function downloadArtifactBytes(name: string, mimeType: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves the file through a same-origin navigation so WebViews that block blob downloads still get it. */
export function startArtifactDownload(artifactId: string, name: string): void {
  const anchor = document.createElement("a");
  anchor.href = artifactContentUrl(artifactId, { download: true });
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadArtifact(
  _target: ArtifactTarget,
  artifactId: string,
  name: string,
  _mimeType?: string,
): Promise<void> {
  startArtifactDownload(artifactId, name);
}
