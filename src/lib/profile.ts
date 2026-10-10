import { supabase } from "./supabase";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export function avatarUrl(path: string | null | undefined) {
  return path && supabase
    ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl
    : null;
}
export async function saveAccountProfile(
  fullName: string,
  photoUri: string | null,
  currentPath: string | null,
  removePhoto: boolean
) {
  if (!supabase) throw new Error("Sign in to edit your profile.");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Please sign in again.");
  let path = removePhoto ? null : currentPath;
  let uploaded: string | null = null;
  if (photoUri) {
    const image = ImageManipulator.manipulate(photoUri);
    image.resize({ width: 512 });
    const rendered = await image.renderAsync();
    const photo = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const bytes = await new File(photo.uri).arrayBuffer();
    if (bytes.byteLength > 2097152) throw new Error("Choose a smaller photo (up to 2 MB).");
    uploaded = `${user.id}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(uploaded, bytes, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
    if (error)
      throw new Error(
        "Photo upload failed. Check your connection and ensure the profile SQL is installed."
      );
    path = uploaded;
  }
  const { data, error } = await supabase.rpc("campuspool_save_profile", {
    full_name: fullName,
    photo_path: path,
  });
  if (error) {
    if (uploaded)
      await supabase.storage
        .from("avatars")
        .remove([uploaded])
        .catch(() => {});
    throw new Error(
      error.code === "PGRST202"
        ? "Run the edit_profile SQL in Supabase SQL Editor, then retry."
        : "Could not save your profile. Check your connection and retry."
    );
  }
  if (currentPath && currentPath !== path)
    await supabase.storage
      .from("avatars")
      .remove([currentPath])
      .catch(() => {});
  return data as { name: string; avatarPath: string | null };
}
