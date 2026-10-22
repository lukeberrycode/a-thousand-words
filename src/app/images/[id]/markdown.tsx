import ReactMarkdown from "react-markdown";

// Renders untrusted annotation text. See docs/adr/0008 and 0022.
// - Raw HTML is never rendered (react-markdown's default); it shows as text.
// - Images are dropped, so annotations can't load third-party content into the page.
// - Links are dropped and keep their text, so annotations can't send readers off the site.
//   This covers [text](url) and <https://…> autolinks; bare URLs are never linked (no remark-gfm).
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown disallowedElements={["a", "img"]} unwrapDisallowed>
        {children}
      </ReactMarkdown>
    </div>
  );
}
