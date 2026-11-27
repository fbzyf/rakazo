import { Trans, useLingui } from "@lingui/react/macro";
import type { PublishedBotTemplate, PublishedBotTemplateAudience } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  BotAvatar,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
} from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import type { createSpaceRpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

const EXCERPT_LENGTH = 180;

/** The opening of the instructions, shown on the card instead of a made-up sample. */
export function templateExcerpt(instructions: string): string {
  const trimmed = instructions.trim();
  if (trimmed.length <= EXCERPT_LENGTH) return trimmed;
  const sliced = trimmed.slice(0, EXCERPT_LENGTH);
  const last = sliced.charCodeAt(sliced.length - 1);
  const safe = last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
  return `${safe.trimEnd()}…`;
}

/** Cards for templates the signed-in person can copy. Choosing one copies it. */
export function BotTemplatesDialog({
  rpc,
  onCancel,
  onUse,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  onCancel: () => void;
  onUse: (templateId: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const [templates, setTemplates] = useState<PublishedBotTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc.botTemplates
      .list()
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  async function copyTemplate(templateId: string) {
    if (pendingId) return;
    setPendingId(templateId);
    setError(null);
    try {
      await onUse(templateId);
    } catch (err) {
      setError(errorText(err, t`Could not use template`));
      setPendingId(null);
    }
  }

  async function removeTemplate(templateId: string) {
    if (pendingId) return;
    setPendingId(templateId);
    setError(null);
    try {
      await rpc.botTemplates.remove({ templateId });
      setTemplates((current) => current?.filter((template) => template.id !== templateId) ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pendingId) onCancel();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        data-testid="bot-templates-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            <Trans>Bot templates</Trans>
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {templates && templates.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            <Trans>No templates yet</Trans>
          </p>
        ) : null}
        {templates && templates.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
              >
                <button
                  type="button"
                  data-testid={`bot-template-${template.id}`}
                  disabled={pendingId !== null}
                  onClick={() => void copyTemplate(template.id)}
                  className="flex flex-col gap-3 text-start"
                >
                  <span className="flex items-start gap-3">
                    <BotAvatar
                      avatarSet={template.avatarSet}
                      color={template.color}
                      identity={template.id}
                      size={36}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">
                        {template.name}
                      </span>
                      {template.description ? (
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">
                          {template.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {template.audience === "signed_in" ? (
                    <span className="block text-[12px] text-muted-foreground">
                      <Trans>Everyone who can log in</Trans>
                    </span>
                  ) : null}
                  {templateExcerpt(template.instructions) ? (
                    <span className="block rounded-lg bg-background p-3 text-[13px] leading-5 text-foreground">
                      {templateExcerpt(template.instructions)}
                    </span>
                  ) : null}
                </button>
                {template.mine ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => void removeTemplate(template.id)}
                  >
                    <Trans>Remove template</Trans>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Asks who can see the template, and warns what they can read, before it is saved. */
export function ShareTemplateDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (audience: PublishedBotTemplateAudience) => Promise<void>;
}) {
  const { t } = useLingui();
  const [audience, setAudience] = useState<PublishedBotTemplateAudience>("space");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audienceLabelId = "share-template-audience";

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !sharing) onCancel();
      }}
    >
      <AlertDialogContent data-testid="share-template-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Share as template</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              People allowed to see this template can read its name, description, and instructions.
              Do not include passwords, secrets, or customer data.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          aria-labelledby={audienceLabelId}
          value={audience}
          onValueChange={(value) => setAudience(value === "signed_in" ? "signed_in" : "space")}
        >
          <p id={audienceLabelId} className="text-[13px] text-foreground">
            <Trans>Who can use it</Trans>
          </p>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the wrapped RadioGroupItem is the control. */}
          <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3">
            <RadioGroupItem value="space" className="mt-0.5" data-testid="share-audience-space" />
            <span className="text-[14px] text-foreground">
              <Trans>This workspace</Trans>
            </span>
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the wrapped RadioGroupItem is the control. */}
          <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3">
            <RadioGroupItem
              value="signed_in"
              className="mt-0.5"
              data-testid="share-audience-signed-in"
            />
            <span className="text-[14px] text-foreground">
              <Trans>Everyone who can log in</Trans>
            </span>
          </label>
        </RadioGroup>
        <p className="text-[13px] text-muted-foreground">
          <Trans>
            They get their own copy. Schedules start paused. Chats, memory, and saved sign-ins stay
            with you.
          </Trans>
        </p>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sharing}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={sharing}
            onClick={() => {
              setSharing(true);
              setError(null);
              void onConfirm(audience).catch((err: unknown) => {
                setError(errorText(err, t`Could not share template`));
                setSharing(false);
              });
            }}
          >
            <Trans>Share</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
