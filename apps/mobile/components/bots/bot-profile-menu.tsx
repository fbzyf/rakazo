import { MenuView } from "@expo/ui/community/menu";
import { useLingui } from "@lingui/react/macro";
import type { NativeStackNavigationOptions } from "expo-router";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { errorText } from "../../lib/api/user-error";
import {
  archiveBot,
  confirmClearConversation,
  confirmDeleteBot,
} from "../../lib/bots/bot-lifecycle";
import { notifyArchivedChatsChanged } from "../../lib/inbox/archived/archived-chats";
import { useResolvedAppearance } from "../../lib/native/native";
import { iosAtLeast } from "../../lib/native/native-controls";
import { useConfirmationGuard } from "../../lib/native/use-confirmation-guard";
import { useLeaveDeletedChat } from "../../lib/thread/use-leave-deleted-chat";
import { NativeSymbol } from "../native/native-symbol";
import type { PublishedBotTemplateAudience } from "@rakazo/contracts";
import { rpc } from "../../lib/api/api";

export type BotProfileAction = {
  id: string;
  text: string;
  destructive?: boolean;
  onPress: () => void;
};

/** The bot's less common actions, in its profile's "…" menu. */
export function useBotProfileActions(botId: string, name: string): BotProfileAction[] {
  const { t } = useLingui();
  const router = useRouter();
  const leaveDeletedChat = useLeaveDeletedChat();
  const beginDelete = useConfirmationGuard();
  function leave() {
    router.dismissAll();
    router.replace("/");
  }
  function shareAsTemplate(audience: PublishedBotTemplateAudience) {
    void rpc("botTemplates/publish", { botId, audience }).catch((error) =>
      Alert.alert(t`Could not share template`, errorText(error, t`Try again.`)),
    );
  }
  function chooseTemplateAudience() {
    Alert.alert(
      t`Share as template`,
      `${t`People allowed to see this template can read its name, description, and instructions. Do not include passwords, secrets, or customer data.`}\n\n${t`They get their own copy. Schedules start paused. Chats, memory, and saved sign-ins stay with you.`}`,
      [
        { text: t`Cancel`, style: "cancel" },
        { text: t`Everyone who can log in`, onPress: () => shareAsTemplate("signed_in") },
        { text: t`This workspace`, onPress: () => shareAsTemplate("space") },
      ],
    );
  }
  return [
    {
      id: "share-template",
      text: t`Share as template`,
      onPress: chooseTemplateAudience,
    },
    {
      id: "clear",
      text: t`Clear conversation`,
      destructive: true,
      onPress: () => confirmClearConversation(botId),
    },
    {
      id: "archive",
      text: t`Archive`,
      onPress: () =>
        void archiveBot(botId)
          .then(leave)
          .catch((error) => Alert.alert(t`Could not archive bot`, errorText(error, t`Try again.`))),
    },
    {
      id: "delete",
      text: t`Delete…`,
      destructive: true,
      onPress: () => {
        const confirmation = beginDelete();
        if (!confirmation) return;
        void confirmDeleteBot(
          { id: botId, name },
          (removedGroupIds, recoveryContext) => {
            notifyArchivedChatsChanged();
            void leaveDeletedChat(botId, removedGroupIds, recoveryContext);
          },
          confirmation.current,
          undefined,
          confirmation.finish,
        );
      },
    },
  ];
}

/** The profile's "…" header menu: a native bar menu on iOS, a native popup menu elsewhere. */
export function botProfileMenuOptions(
  actions: readonly BotProfileAction[],
  label: string,
  color: string,
): NativeStackNavigationOptions {
  // Native header items exist from iOS 26; older iOS uses the same menu button as Android.
  if (iosAtLeast(26))
    return {
      unstable_headerRightItems: () => [
        {
          type: "menu" as const,
          label,
          accessibilityLabel: label,
          icon: { type: "sfSymbol" as const, name: "ellipsis" },
          menu: {
            items: actions.map((action) => ({
              type: "action" as const,
              label: action.text,
              destructive: action.destructive,
              onPress: action.onPress,
            })),
          },
        },
      ],
    };
  return {
    headerRight: () => <BotProfileMenu actions={actions} label={label} color={color} />,
  };
}

function BotProfileMenu({
  actions,
  label,
  color,
}: {
  actions: readonly BotProfileAction[];
  label: string;
  color: string;
}) {
  const colorScheme = useResolvedAppearance();
  return (
    <MenuView
      actions={actions.map((action) => ({
        id: action.id,
        title: action.text,
        ...(action.destructive ? { attributes: { destructive: true } } : {}),
      }))}
      colorScheme={colorScheme}
      onPressAction={({ nativeEvent }) =>
        actions.find((action) => action.id === nativeEvent.event)?.onPress()
      }
    >
      {/* A sized trigger: an unsized one can collapse to zero width on some Android builds. */}
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <NativeSymbol ios="ellipsis" android="ellipsis-horizontal" size={21} color={color} />
      </View>
    </MenuView>
  );
}
