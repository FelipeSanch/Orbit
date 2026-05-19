"use client";

import ReactMarkdown from "react-markdown";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-lg bg-black/5 p-3 text-[13px] dark:bg-white/5">
                {children}
              </code>
            );
          }
          return (
            <code className="rounded-md bg-black/5 px-1.5 py-0.5 text-[13px] dark:bg-white/5">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-accent underline underline-offset-2 hover:brightness-110"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        h1: ({ children }) => (
          <p className="mb-2 font-semibold last:mb-0">{children}</p>
        ),
        h2: ({ children }) => (
          <p className="mb-2 font-semibold last:mb-0">{children}</p>
        ),
        h3: ({ children }) => (
          <p className="mb-2 font-semibold last:mb-0">{children}</p>
        ),
        hr: () => <div className="my-2 border-t border-current/10" />,
        blockquote: ({ children }) => (
          <div className="border-l-2 border-current/20 pl-3 italic opacity-80">
            {children}
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
