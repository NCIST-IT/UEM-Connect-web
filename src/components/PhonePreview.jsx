import { useState } from "react";
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const screenshots = [
  {
    id: "map",
    src: "/images/campus-map.webp",
    title: "校园地图",
    description: "校园地点标记与位置查看",
    className: "phone-home",
  },
  {
    id: "schedule",
    src: "/images/schedule.webp",
    title: "每周课表",
    description: "一周课程、时间与教室一目了然",
    className: "phone-schedule",
  },
];

export default function PhonePreview() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="phone-scene" aria-label="应大通实机截图">
        <div className="phone-orbit orbit-one" aria-hidden="true" />
        <div className="phone-orbit orbit-two" aria-hidden="true" />
        {screenshots.map((shot) => (
          <button
            key={shot.id}
            className={`phone phone-real ${shot.className}`}
            onClick={() => setSelected(shot)}
            aria-label={`放大查看${shot.title}截图`}
          >
            <img
              src={shot.src}
              alt={`应大通${shot.title}实机截图`}
              width={shot.id === "map" ? 298 : 800}
              height={shot.id === "map" ? 647 : 1737}
              decoding="async"
            />
            <span className="screenshot-expand">
              <ArrowsOutSimpleIcon />
              {shot.title}
            </span>
          </button>
        ))}
        <div className="preview-note">
          你的校园日常，井井有条
          <span className="preview-disclaimer">实机截图 · 点击查看大图</span>
        </div>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="screenshot-dialog max-h-[94dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          {selected && (
            <img
              src={selected.src}
              alt={`${selected.title}完整截图`}
              className="mx-auto max-h-[74dvh] w-auto rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
