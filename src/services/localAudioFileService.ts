import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const SONG_DIRECTORY = "offline-songs";

export function isPhoneStorageAvailable(): boolean {
  return Capacitor.getPlatform() !== "web";
}

function filePath(songId: string): string {
  return `${SONG_DIRECTORY}/${encodeURIComponent(songId)}.audio`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("could not read audio"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("could not encode audio"));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function saveAudioToPhone(songId: string, blob: Blob): Promise<string | undefined> {
  if (!isPhoneStorageAvailable()) return undefined;

  const path = filePath(songId);
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Data,
    recursive: true,
  });

  const result = await Filesystem.getUri({ path, directory: Directory.Data });
  return result.uri;
}

export async function deleteAudioFromPhone(songId: string): Promise<void> {
  if (!isPhoneStorageAvailable()) return;
  try {
    await Filesystem.deleteFile({ path: filePath(songId), directory: Directory.Data });
  } catch {
    // The metadata can outlive the file after an OS cleanup.
  }
}
