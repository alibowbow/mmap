"use client";

import { Check, Copy, QrCode, ShieldCheck } from "lucide-react";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  buildShareUrl,
  SHARE_QR_MAX_LEN,
  SHARE_URL_MAX_LEN,
  SHARE_URL_WARN_LEN,
} from "@/lib/share";
import {
  selectActiveDocument,
  useMindMapStore,
} from "@/store/mindMapStore";

// Render the URL to an inline SVG QR. Byte-mode QRs get dense fast, so callers
// gate on length first; we still try/catch in case make() overflows.
function qrSvg(url: string): string | null {
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch {
    return null;
  }
}

export function ShareDialog() {
  const open = useMindMapStore((s) => s.dialog === "share");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const doc = useMindMapStore(selectActiveDocument);
  const addToast = useMindMapStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (!open || !doc) return "";
    return buildShareUrl(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc]);

  const tooLong = url.length > SHARE_URL_MAX_LEN;
  const nearLimit = !tooLong && url.length > SHARE_URL_WARN_LEN;
  const qr = useMemo(
    () =>
      open && url && !tooLong && url.length <= SHARE_QR_MAX_LEN
        ? qrSvg(url)
        : null,
    [open, tooLong, url]
  );

  useEffect(() => {
    if (!open || !tooLong) return;
    addToast(
      `해시 공유 한도(${SHARE_URL_MAX_LEN.toLocaleString()}자)를 초과했습니다. JSON 내보내기를 이용해 주세요.`,
      "error"
    );
  }, [addToast, open, tooLong]);

  const handleCopy = async () => {
    if (tooLong) {
      addToast(
        `링크가 ${url.length.toLocaleString()}자로 너무 깁니다. 해시 공유를 사용할 수 없습니다.`,
        "error"
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      addToast("공유 링크를 복사했습니다", "success");
    } catch {
      addToast("복사에 실패했습니다. 링크를 길게 눌러 복사하세요.", "error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="링크로 공유"
      description="서버 없이, 이 링크 하나에 맵 전체가 담깁니다."
      className="sm:max-w-lg"
      footer={
        <Button
          variant="primary"
          onClick={handleCopy}
          disabled={!url || tooLong}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "복사됨" : "링크 복사"}
        </Button>
      }
    >
      {/* Link + copy */}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={tooLong ? "해시 공유 한도 초과" : url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={handleCopy}
          disabled={!url || tooLong}
          aria-label="링크 복사"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </Button>
      </div>

      {/* Size / node summary */}
      <div className="mt-2 text-[11px] text-ink-faint">
        링크 {url.length.toLocaleString()}자 · 노드 {doc?.nodes.length ?? 0}개
      </div>

      {tooLong && (
        <div className="mt-3 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          안전한 해시 공유 한도 {SHARE_URL_MAX_LEN.toLocaleString()}자를
          초과하여 링크 복사를 막았습니다. 노드를 줄이거나{" "}
          <button
            className="font-semibold underline underline-offset-2"
            onClick={() => setDialog("export")}
          >
            내보내기
          </button>
          를 이용해 주세요.
        </div>
      )}

      {nearLimit && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          링크가 안전 한도에 가깝습니다. 일부 메신저에서는 미리보기 대신
          링크 자체를 전송해 주세요.
        </div>
      )}

      {/* QR for quick phone hand-off */}
      <div className="mt-4 flex flex-col items-center gap-2">
        {qr ? (
          <>
            <div
              className="rounded-2xl bg-white p-3 shadow-soft"
              // Trusted: SVG is generated locally by qrcode-generator, not user HTML.
              dangerouslySetInnerHTML={{ __html: qr }}
              style={{ width: 180, height: 180 }}
            />
            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
              <QrCode size={12} /> 휴대폰 카메라로 스캔해 바로 열기
            </span>
          </>
        ) : (
          <span className="text-[11px] text-ink-faint">
            QR 코드로 담기엔 맵이 큽니다 — 링크를 복사해 공유하세요.
          </span>
        )}
      </div>

      {/* Reassurance / what happens on open */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
        <span>
          데이터는 서버로 전송되지 않고 링크 안에만 들어갑니다. 링크를 연 사람은
          자신의 작업 공간에 <b>사본</b>으로 추가되며, 원본 맵에는 영향을 주지
          않습니다.
        </span>
      </div>
    </Modal>
  );
}
