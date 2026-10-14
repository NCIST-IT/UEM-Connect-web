import { CaretRightIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useRef, useState } from "react";

export default function SliderCaptcha({
  challenge,
  disabled,
  onComplete,
  onRefresh,
}) {
  const [move, setMove] = useState(0);
  const drag = useRef(null);
  const clamp = (n) => Math.max(0, Math.min(240, Math.round(n)));
  function begin(e) {
    if (disabled || !e.target.closest('[data-slot="slider-thumb"]')) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    drag.current = {
      y: e.clientY,
      scale: 280 / width,
      at: Date.now(),
      tracks: [{ a: move, b: 0, c: 0 }],
    };
  }
  function sample(value, details, final = false) {
    const d = drag.current;
    // Only record a real pointer drag. A click on the track or keyboard input
    // cannot manufacture the manual trajectory required by the school.
    if (!d || !Number.isFinite(details.event.clientY)) {
      details.cancel?.();
      return;
    }
    const a = clamp(Array.isArray(value) ? value[0] : value);
    const b = Math.round((details.event.clientY - d.y) * d.scale);
    const now = Date.now();
    setMove(a);
    const previous = d.tracks.at(-1);
    if (
      final ||
      (now - d.at >= 20 && Math.hypot(a - previous.a, b - previous.b) >= 2)
    ) {
      d.tracks.push({ a, b, c: Math.max(0, now - d.at) });
      d.at = now;
    }
    if (final) {
      drag.current = null;
      onComplete({ canvasLength: 280, moveLength: a, tracks: d.tracks });
    }
  }
  function cancel() {
    drag.current = null;
    setMove(0);
  }
  return (
    <div className="mx-auto w-full max-w-[280px] space-y-4">
      <div
        className="relative aspect-[280/155] overflow-hidden rounded-md border bg-muted"
        aria-label="学校提供的拼图验证码"
      >
        <img
          className="absolute inset-0 h-full w-full"
          src={`data:image/jpeg;base64,${challenge.bigImage}`}
          alt="拼图背景"
          draggable="false"
        />
        <img
          className="absolute top-0 h-full"
          style={{
            left: `${(move / 280) * 100}%`,
            width: `${((challenge.tagWidth ? (challenge.tagWidth / 590) * 280 - 2 : 44) / 280) * 100}%`,
          }}
          src={`data:image/png;base64,${challenge.smallImage}`}
          alt="拖动的拼图块"
          draggable="false"
        />
      </div>
      <div className="space-y-2">
        <p
          id="captcha-instruction"
          className="text-center text-xs text-muted-foreground"
        >
          向右拖动滑块，填充拼图
        </p>
        <Slider
          value={[move]}
          min={0}
          max={240}
          step={1}
          disabled={disabled}
          aria-label="拖动滑块完成学校验证"
          aria-describedby="captcha-instruction"
          onPointerDownCapture={begin}
          onPointerCancel={cancel}
          onValueChange={(value, details) => sample(value, details)}
          onValueCommitted={(value, details) => sample(value, details, true)}
          thumbLabel="拖动滑块完成学校验证"
          thumbContent={
            <CaretRightIcon className="size-5" aria-hidden="true" />
          }
          className="[&_[data-slot=slider-control]]:h-11 [&_[data-slot=slider-track]]:h-11 [&_[data-slot=slider-track]]:border [&_[data-slot=slider-range]]:bg-primary/15 [&_[data-slot=slider-thumb]]:grid [&_[data-slot=slider-thumb]]:h-11 [&_[data-slot=slider-thumb]]:w-[14.285714%] [&_[data-slot=slider-thumb]]:place-items-center [&_[data-slot=slider-thumb]]:border-border [&_[data-slot=slider-thumb]]:bg-card [&_[data-slot=slider-thumb]]:text-primary"
        />
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" disabled={disabled} onClick={onRefresh}>
          <ArrowClockwiseIcon />
          换一张
        </Button>
      </div>
    </div>
  );
}
