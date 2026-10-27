"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { NotebookPen, Plus } from "lucide-react";
import { saveWorkspaceNoteAction, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, Label, Textarea } from "@/components/ui/field";

export function QuickActions() {
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-40 flex flex-col items-end gap-3">
      {notepadOpen ? (
        <Notepad
          title={title}
          body={body}
          onTitle={setTitle}
          onBody={setBody}
          onClose={() => setNotepadOpen(false)}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Quick actions"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="pointer-events-auto min-w-[12rem]">
          <DropdownMenuItem
            onSelect={() => setNotepadOpen(true)}
          >
            <NotebookPen className="size-4" aria-hidden="true" />
            Notepad
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Notepad({
  title,
  body,
  onTitle,
  onBody,
  onClose,
}: {
  title: string;
  body: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    const next = await saveWorkspaceNoteAction(previous, formData);
    if (next.noteId) {
      onTitle("");
      onBody("");
    }
    return next;
  }, {});

  return (
    <form
      action={action}
      className="pointer-events-auto flex w-[min(100vw-2.5rem,22rem)] flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg"
      aria-labelledby="quick-notepad-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="quick-notepad-title" className="text-sm font-medium">
            Notepad
          </p>
          <p className="mt-0.5 text-xs text-muted">Save when you want this in Notes. Closing keeps the draft.</p>
        </div>
        <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={onClose}>
          Close
        </button>
      </div>
      <div>
        <Label htmlFor="quick-note-title">Title</Label>
        <Input
          id="quick-note-title"
          name="title"
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder="Optional"
          maxLength={200}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="quick-note-body">Note</Label>
        <Textarea
          id="quick-note-body"
          name="body"
          value={body}
          onChange={(event) => onBody(event.target.value)}
          placeholder="Write something…"
          required
          maxLength={20000}
          className="mt-1 min-h-40"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.noteId ? (
        <p className="text-sm text-foreground">
          Saved.{" "}
          <Link href={`/notes?note=${state.noteId}`} className="underline underline-offset-4">
            Open in Notes
          </Link>
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save to Notes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onTitle("");
            onBody("");
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
