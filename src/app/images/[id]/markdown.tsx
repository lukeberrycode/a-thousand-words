import ReactMarkdown from "react-markdown";

// Renders untrusted annotation text. See docs/adr/0008.
// - Raw HTML is never rendered (react-markdown's default); it shows as text.
// - Unsafe link protocols such as javascript: are stripped (react-markdown's default urlTransform).
// - Images are dropped, so annotations can't load third-party content into the page.
// - Links are marked as user content and open in a new tab. A link whose URL was stripped renders as text.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
