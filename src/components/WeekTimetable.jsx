import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import {
  clock,
  dateOrdinal,
  dateString,
  weekBlocks,
} from "../lib/schedule-model.js";

const days = ["一", "二", "三", "四", "五", "六", "日"];
const colors = [
  "border-l-chart-1",
  "border-l-primary/60",
  "border-l-chart-2",
  "border-l-chart-3",
  "border-l-muted-foreground/50",
];
function color(course) {
  let n = 0;
  for (const ch of course.code || course.name)
    n = (n + ch.codePointAt(0)) % colors.length;
  return colors[n];
}
export default function WeekTimetable({ snapshot }) {
  const [week, setWeek] = useState(snapshot.currentWeek);
  const [detail, setDetail] = useState(null);
  const blocks = useMemo(() => weekBlocks(snapshot, week), [snapshot, week]);
  const monday = dateOrdinal(snapshot.semesterStartDate);
  const rowHeight = 78;
  function bounds(e) {
    const matched = snapshot.periods
      .map((p, i) => ({ ...p, i }))
      .filter((p) => e.start < p.end && e.end > p.start);
    if (!matched.length) return null;
    return {
      top: matched[0].i * rowHeight + 2,
      height: (matched.at(-1).i - matched[0].i + 1) * rowHeight - 4,
    };
  }
  const outside = blocks.filter((e) => !bounds(e));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <ButtonGroup>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="上一周"
            disabled={week === 1}
            onClick={() => setWeek(week - 1)}
          >
            <CaretLeftIcon />
          </Button>
          <NativeSelect
            aria-label="教学周"
            className="w-28 [&_select]:h-9 [&_select]:text-sm"
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {Array.from({ length: snapshot.totalWeeks }, (_, i) => (
              <NativeSelectOption key={i} value={i + 1}>
                第 {i + 1} 周
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="下一周"
            disabled={week === snapshot.totalWeeks}
            onClick={() => setWeek(week + 1)}
          >
            <CaretRightIcon />
          </Button>
        </ButtonGroup>
        <Button
          type="button"
          variant="ghost"
          className="h-9 text-xs"
          onClick={() => setWeek(snapshot.currentWeek)}
        >
          默认周
        </Button>
      </div>
      <div
        className="overflow-hidden rounded-md border [&_[data-slot=table-container]]:overflow-hidden"
        data-testid="week-calendar"
        aria-label="完整七天周课表"
      >
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[30px] sm:w-[44px]" />
            {days.map((day) => (
              <col key={day} />
            ))}
          </colgroup>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-0 text-center text-[9px] text-muted-foreground">
                节次
              </TableHead>
              {days.map((name, i) => (
                <TableHead
                  key={name}
                  className="h-14 px-0 text-center"
                  data-weekday={i + 1}
                >
                  <div className="text-[11px] sm:text-sm">
                    <span className="hidden sm:inline">星期</span>
                    {name}
                  </div>
                  <div className="mt-1 text-[9px] font-normal text-muted-foreground sm:text-xs">
                    {monday === null
                      ? "待核实"
                      : dateString(monday + ((week - 1) * 7 + i) * 86400000)
                          .slice(5)
                          .replace("-", "/")}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.periods.map((p, row) => (
              <TableRow
                key={p.number}
                className="hover:bg-transparent"
                style={{ height: rowHeight }}
              >
                <TableCell className="px-0 py-0 text-center">
                  <b className="text-[10px] font-medium sm:text-xs">
                    {p.number}
                  </b>
                  <div className="mt-1 text-[8px] leading-tight text-muted-foreground sm:text-[9px]">
                    {clock(p.start)}
                    <br />
                    {clock(p.end)}
                  </div>
                </TableCell>
                {row === 0 &&
                  days.map((day, i) => (
                    <TableCell
                      key={day}
                      rowSpan={snapshot.periods.length}
                      className="border-l p-0 align-top"
                    >
                      <div
                        className="relative min-w-0"
                        style={{ height: snapshot.periods.length * rowHeight }}
                      >
                        {snapshot.periods.map((period) => (
                          <div
                            key={period.number}
                            className="border-b border-border/60 last:border-0"
                            style={{ height: rowHeight }}
                          />
                        ))}
                        {blocks
                          .filter((e) => e.day === i + 1)
                          .map((e) => {
                            const box = bounds(e);
                            return box ? (
                              <Button
                                type="button"
                                variant="secondary"
                                key={e.id}
                                onClick={() => setDetail(e)}
                                style={{
                                  ...box,
                                  left: `calc(${(e.lane / e.laneCount) * 100}% + 2px)`,
                                  width: `calc(${100 / e.laneCount}% - 4px)`,
                                }}
                                className={`absolute block min-w-0 overflow-hidden rounded-sm border-l-2 p-1 text-left whitespace-normal sm:p-2 ${color(e)}`}
                                title={`${e.name} ${clock(e.start)}–${clock(e.end)}`}
                              >
                                <span className="block break-all text-[10px] leading-[1.5] font-medium sm:text-xs">
                                  {e.name}
                                </span>
                                <span className="mt-2 hidden break-words text-[10px] font-normal text-muted-foreground md:block">
                                  {e.teacher || "教师待定"}
                                </span>
                                <span className="mt-1 hidden break-words text-[10px] leading-tight font-normal text-muted-foreground md:block">
                                  {e.location || "地点待定"}
                                </span>
                              </Button>
                            ) : null;
                          })}
                      </div>
                    </TableCell>
                  ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        点击课程查看教师、地点和时间。导出包含整个所选学期。
      </p>
      {!blocks.length && (
        <Alert>
          <AlertDescription>本周没有学校已安排的课程。</AlertDescription>
        </Alert>
      )}
      {!!outside.length && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">网格外的上课安排</h3>
          {outside.map((e) => (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-7 w-full justify-start py-2 text-left"
              key={e.id}
              onClick={() => setDetail(e)}
            >
              {e.name} · 星期{days[e.day - 1]} {clock(e.start)}–{clock(e.end)}
            </Button>
          ))}
        </div>
      )}
      {!!snapshot.unscheduled.length && (
        <Alert>
          <AlertTitle>未排课 / 信息待补全</AlertTitle>
          <AlertDescription>
            <p>以下课程没有可用上课时间，不生成日历日程。</p>
            <ul className="mt-2 space-y-1">
              {snapshot.unscheduled.map((e, i) => (
                <li key={i}>
                  {e.name} · {e.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-sans text-lg">
                  {detail.name}
                </DialogTitle>
                <DialogDescription>
                  第 {detail.week} 周 · 北京时间
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-4 text-sm">
                {[
                  ["日期", detail.date || "日期待核实"],
                  [
                    "时间",
                    `${clock(detail.start)}–${clock(detail.end)}（北京时间）`,
                  ],
                  ["教师", detail.teacher || "教师待定"],
                  ["地点", detail.location || "地点待定"],
                  ["课程代码", detail.code || "未提供"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  返回课表
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
