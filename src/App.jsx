import SafariShortcut from "./components/SafariShortcut.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-[#faf9f6] font-sans text-foreground">
      <header className="mx-auto max-w-md px-5 pt-8 pb-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">
          应大通课表快捷指令
        </h1>
      </header>
      <main className="mx-auto max-w-md px-5 pb-10 sm:px-8">
        <section aria-label="快捷指令安装与使用">
          <SafariShortcut />
        </section>
      </main>
    </div>
  );
}
