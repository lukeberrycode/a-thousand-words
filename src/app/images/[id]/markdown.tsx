import ReactMarkdown from "react-markdown";

// Renders untrusted annotation text. See docs/adr/0008 and 0022.
// - Raw HTML is never rendered (react-markdown's default); it shows as text.
// - Images are dropped, so annotations can't load third-party content into the page.
// - Links, autolinks included, render as their text only, so an annotation can't send readers to a
//   harmful page. The URL isn't shown.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown disallowedElements={["img", "a"]} unwrapDisallowed>
        {children}
      </ReactMarkdown>
    </div>
  );
}
