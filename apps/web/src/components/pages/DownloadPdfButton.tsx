import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { Download } from "lucide-react";
import { downloadBytes, downloadFilename } from "../../lib/file-download";

/**
 * Saves the open page as an HTML file. Print-to-PDF never reached the sandboxed page
 * document, and workbench WebViews have no print dialog.
 */
export function DownloadPdfButton({
  className,
  iconClassName = "size-4",
  labelClassName,
  title,
  document: html,
}: {
  className: string;
  iconClassName?: string;
  labelClassName?: string;
  title: string;
  document: string;
}) {
  const { t } = useLingui();
  return (
    <Button
      variant="ghost"
      className={className}
      title={t`Download`}
      onClick={() => {
        downloadBytes(
          downloadFilename(title, "html"),
          "text/html;charset=utf-8",
          new TextEncoder().encode(html),
        );
      }}
    >
      <Download className={iconClassName} strokeWidth={1.5} />
      <span className={labelClassName}>
        <Trans>Download</Trans>
      </span>
    </Button>
  );
}
