import { collectNativeCalendar } from "./native-calendar.js";

// Primitive JSON text is explicitly converted into a Dictionary by native actions.
// School credentials and all calendar data stay on the user's device.
(async function () {
  try {
    completion(
      JSON.stringify(await collectNativeCalendar(UEM_SHORTCUT_OPTIONS)),
    );
  } catch (error) {
    completion(
      JSON.stringify({
        version: 10,
        ok: false,
        events: [],
        error:
          error?.message ||
          String(error) ||
          "未收到有效课表，请重新打开学校课表页面。",
      }),
    );
  }
})();
