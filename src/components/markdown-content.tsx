"use client";

import { Children, isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Checkbox } from "@/components/ui/checkbox";
import { prepareMarkdownTaskListsForRender } from "@/lib/markdown-checkboxes";
import { cn } from "@/lib/utils";

function isCheckboxNode(node: ReactNode): boolean {
  return isValidElement(node) && (node.type === Checkbox || (node.props as { type?: string }).type === "checkbox");
}

export function MarkdownContent({
  content,
  className,
  onToggleCheckbox,
}: {
  content: string;
  className?: string;
  /** When set, task-list checkboxes are interactive and call back with their index. */
  onToggleCheckbox?: (index: number, checked: boolean) => void;
}) {
  let checkboxIndex = 0;
  const rendered = prepareMarkdownTaskListsForRender(content);

  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    ul: ({ className: listClassName, children }) => (
      <ul
        className={cn(
          listClassName,
          listClassName?.includes("contains-task-list") && "list-none space-y-1.5 pl-0",
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ className: listClassName, children }) => (
      <ol
        className={cn(
          listClassName,
          listClassName?.includes("contains-task-list") && "list-none space-y-1.5 pl-0",
        )}
      >
        {children}
      </ol>
    ),
    li: ({ className: itemClassName, children }) => {
      const isTask = itemClassName?.includes("task-list-item");
      if (!isTask) {
        return <li className={itemClassName}>{children}</li>;
      }

      // Flex on the <li> turns every text/`code` sibling into its own flex item and
      // scatters the line. Keep the checkbox as the only flex sibling of a text wrap.
      const nodes = Children.toArray(children);
      const checkbox = nodes.find(isCheckboxNode);
      const rest = nodes.filter((node) => !isCheckboxNode(node));

      return (
        <li className={cn(itemClassName, "flex list-none items-start gap-2.5 pl-0 marker:content-none")}>
          {checkbox}
          <div className="min-w-0 flex-1 [&>p]:my-0">{rest}</div>
        </li>
      );
    },
    input: ({ type, checked, disabled, ...props }) => {
      if (type !== "checkbox") {
        return <input type={type} checked={checked} disabled={disabled} {...props} />;
      }
      const index = checkboxIndex++;
      const isChecked = Boolean(checked);
      const interactive = Boolean(onToggleCheckbox);

      return (
        <Checkbox
          checked={isChecked}
          disabled={!interactive}
          aria-label={isChecked ? "Completed subtask" : "Open subtask"}
          className="mt-0.5 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          onCheckedChange={(value) => {
            if (!interactive) return;
            onToggleCheckbox?.(index, value === true);
          }}
        />
      );
    },
  };

  return (
    <div
      className={cn(
        "markdown-body text-sm leading-relaxed text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_p]:my-2.5 [&_p]:whitespace-pre-wrap",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:leading-relaxed",
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight",
        "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight",
        "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-secondary [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted",
        "[&_hr]:my-4 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {rendered}
      </ReactMarkdown>
    </div>
  );
}
