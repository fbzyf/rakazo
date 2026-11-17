import type { BotTemplate } from "@rakazo/contracts";
import { BotTemplateSchema } from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { addToSearchInbox, searchInboxSession } from "../lib/search-inbox";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

function excerpt(instructions: string): string {
  const trimmed = instructions.trim();
  if (trimmed.length <= 180) return trimmed;
  const sliced = trimmed.slice(0, 180);
  const last = sliced.charCodeAt(sliced.length - 1);
  const safe = last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
  return `${safe.trimEnd()}…`;
}

export default function BotTemplates() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const [templates, setTemplates] = useState<BotTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc("botTemplates/list")
      .then((rows) => {
        const parsed = BotTemplateSchema.array().safeParse(rows);
        if (!cancelled) {
          if (parsed.success) setTemplates(parsed.data);
          else setError(t("Try again."));
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(errorText(reason, t("Try again.")));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function copyTemplate(template: BotTemplate) {
    if (pendingId) return;
    setPendingId(template.id);
    setError(null);
    const askedIn = searchInboxSession();
    try {
      const bot = await rpc("botTemplates/use", { templateId: template.id });
      addToSearchInbox({ kind: "bot", bot }, askedIn);
      router.dismissAll();
      router.push({ pathname: "/thread", params: { botId: bot.id, name: bot.name } });
    } catch (reason) {
      setError(errorText(reason, t("Could not use template")));
      setPendingId(null);
    }
  }

  function removeTemplate(template: BotTemplate) {
    if (pendingId) return;
    Alert.alert(t("Remove template"), undefined, [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Remove template"),
        style: "destructive",
        onPress: () => {
          setPendingId(template.id);
          void rpc("botTemplates/remove", { templateId: template.id })
            .then(() => {
              setTemplates((current) => current?.filter((row) => row.id !== template.id) ?? null);
            })
            .catch((reason) => setError(errorText(reason, t("Try again."))))
            .finally(() => setPendingId(null));
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: t("Bot templates") }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        {error ? <Text style={{ color: tokens.destructive }}>{error}</Text> : null}
        {templates && templates.length === 0 ? (
          <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>
            {t("No templates yet")}
          </Text>
        ) : null}
        {templates?.map((template) => (
          <View
            key={template.id}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tokens.border,
              backgroundColor: tokens.card,
              padding: 14,
              gap: 10,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={template.name}
              disabled={pendingId !== null}
              onPress={() => void copyTemplate(template)}
            >
              <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                {template.name}
              </Text>
              {template.description ? (
                <Text style={{ color: tokens.mutedForeground, fontSize: 14, marginTop: 4 }}>
                  {template.description}
                </Text>
              ) : null}
              {template.audience === "signed_in" ? (
                <Text style={{ color: tokens.mutedForeground, fontSize: 13, marginTop: 4 }}>
                  {t("Everyone who can log in")}
                </Text>
              ) : null}
              {excerpt(template.instructions) ? (
                <Text style={{ color: tokens.foreground, fontSize: 14, marginTop: 10 }}>
                  {excerpt(template.instructions)}
                </Text>
              ) : null}
            </Pressable>
            {template.mine ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Remove template")}
                disabled={pendingId !== null}
                onPress={() => removeTemplate(template)}
              >
                <Text style={{ color: tokens.destructive, fontSize: 14 }}>
                  {t("Remove template")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </>
  );
}
