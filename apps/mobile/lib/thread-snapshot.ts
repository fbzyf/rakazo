import type { MobileGroup, MobileSnapshot } from "./api";

/** A group chat's members in its order, once the chat or its group list has loaded them. */
export function threadGroupMembers(
  groupId: string | undefined,
  snap: Pick<MobileSnapshot, "members"> | null,
  groups: readonly Pick<MobileGroup, "id" | "members">[],
) {
  return groupId
    ? (snap?.members ?? groups.find((group) => group.id === groupId)?.members)
    : undefined;
}
