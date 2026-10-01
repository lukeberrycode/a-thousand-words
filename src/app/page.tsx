export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">A Thousand Words</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Upload an image, mark a region, and explain what&apos;s there.
      </p>
      <p className="text-sm text-zinc-500">Under construction: milestone 1 (region alignment spike).</p>
    </main>
  );
}
